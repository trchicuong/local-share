import { WebSocketServer } from 'ws';
import Peer from './peer.js';
import RoomManager from './room-manager.js';
import { generatePairPin, generateToken, sha256 } from './utils/hasher.js';

export default class LoSWsServer {
  constructor(httpServer, conf) {
    this.conf = conf;
    this.roomManager = new RoomManager();
    this.keepAliveTimers = new Map();
    this.activePeers = new Map();

    this.wss = new WebSocketServer({ server: httpServer });
    this.wss.on('connection', (socket, request) => {
      this._handleConnection(new Peer(socket, request, conf));
    });

    this._startHeartbeatCheck();
  }

  get clients() {
    return this.wss.clients;
  }

  _send(peer, message) {
    if (!peer || !peer.socket || peer.socket.readyState !== 1) return;
    try {
      peer.socket.send(JSON.stringify(message));
    } catch (err) {
      if (this.conf.debugMode) {
        console.error(`[WS Send Error] Failed to send to ${peer.id}:`, err.message);
      }
    }
  }

  _handleConnection(peer) {
    // If an older socket with the same persistent peer.id is still open (e.g. mobile resume after camera), replace it cleanly
    const existingPeer = this.activePeers.get(peer.id);
    if (existingPeer && existingPeer !== peer) {
      this.activePeers.delete(peer.id);
      const oldTimer = this.keepAliveTimers.get(existingPeer);
      if (oldTimer) {
        clearTimeout(oldTimer);
        this.keepAliveTimers.delete(existingPeer);
      }
      try {
        existingPeer.socket.terminate();
      } catch (_) {
        // Ignore terminate errors on stale socket
      }
    }
    this.activePeers.set(peer.id, peer);

    peer.socket.on('message', (data) => this._handleMessage(peer, data));
    peer.socket.on('error', (err) => {
      if (this.conf.debugMode) {
        console.error(`[WS Peer Error] ${peer.id}:`, err.message);
      }
    });
    peer.socket.on('close', () => this._handleDisconnect(peer));

    // Send initial configuration
    this._send(peer, {
      type: 'ws-config',
      rtcConfig: this.conf.rtcConfig,
      wsFallback: this.conf.wsFallback,
      heartbeatInterval: this.conf.heartbeatInterval,
    });

    // Send peer's assigned identity (with hash for persistent reconnection)
    this._send(peer, {
      type: 'display-name',
      peerId: peer.id,
      peerIdHash: peer.peerIdHash,
      displayName: peer.name.displayName,
      deviceName: peer.name.deviceName,
      deviceType: peer.name.deviceType,
      ip: peer.ip,
      rawIp: peer.rawIp,
    });

    // Auto-join IP Room (LAN discovery)
    const { otherPeers } = this.roomManager.joinIpRoom(peer);

    // Notify other peers in LAN that peer joined
    for (const other of otherPeers) {
      this._send(other, {
        type: 'peer-joined',
        peer: peer.getInfo(),
        roomType: 'ip',
      });
    }

    // Send visible peers list to this newly connected peer
    this._sendVisiblePeers(peer);

    this._resetKeepAlive(peer);
  }

  _handleMessage(sender, rawData) {
    // Any incoming traffic from sender confirms connection is alive
    sender.isAlive = true;
    this._resetKeepAlive(sender);

    let message;
    try {
      message = JSON.parse(rawData);
    } catch (e) {
      return;
    }

    if (!message || !message.type) return;

    // Exempt real-time WebRTC signaling, heartbeat, and WebSocket Relay transfer packets from control rate limiting
    const isExemptFromRateLimit =
      message.type === 'pong' ||
      message.type === 'signal' ||
      message.type === 'request' ||
      message.type === 'header' ||
      message.type === 'partition' ||
      message.type === 'partition-received' ||
      message.type === 'progress' ||
      message.type === 'files-transfer-response' ||
      message.type === 'file-transfer-complete' ||
      message.type === 'transfer-cancel' ||
      message.type === 'text' ||
      message.type === 'ws-chunk';

    if (!isExemptFromRateLimit && sender.rateLimitReached()) {
      return;
    }

    switch (message.type) {
      case 'pong':
        break;

      case 'change-name':
        if (typeof message.displayName === 'string' && message.displayName.trim()) {
          sender.name.displayName = message.displayName.trim().substring(0, 40);
          // Acknowledge new display name to sender immediately
          this._send(sender, {
            type: 'display-name',
            displayName: sender.name.displayName,
            peerId: sender.id,
            peerIdHash: sender.peerIdHash,
          });
          // Broadcast update to all other visible peers in real-time
          this._broadcastToVisiblePeers(sender, {
            type: 'peer-updated',
            peer: sender.getInfo(),
          });
        }
        break;

      case 'join-room-secrets':
        if (Array.isArray(message.secrets)) {
          const notifiedPeers = new Set();
          for (const secret of message.secrets) {
            const { otherPeers } = this.roomManager.joinSecretRoom(sender, secret);
            for (const other of otherPeers) {
              notifiedPeers.add(other);
            }
          }
          for (const other of notifiedPeers) {
            this._sendVisiblePeers(other);
          }
          this._sendVisiblePeers(sender);
        }
        break;

      case 'delete-room-secrets':
        if (Array.isArray(message.secrets)) {
          const notifiedPeers = new Set();
          for (const secret of message.secrets) {
            const otherPeers = this.roomManager.leaveSecretRoom(sender, secret);
            for (const other of otherPeers) {
              notifiedPeers.add(other);
              this._send(other, {
                type: 'secret-room-deleted',
                secret: secret,
              });
            }
          }
          for (const other of notifiedPeers) {
            this._sendVisiblePeers(other);
          }
          this._sendVisiblePeers(sender);
        }
        break;

      // --- Device Pairing Flow (6-digit PIN) ---
      case 'pair-initiate': {
        const pin = generatePairPin();
        const pairKey = sha256(pin);
        const secret = generateToken(16);
        this.roomManager.initiatePairing(sender, pairKey, secret);

        this._send(sender, {
          type: 'pair-code',
          pin: pin,
          pairKey: pairKey,
          expiresInSeconds: 300,
        });
        break;
      }

      case 'pair-join': {
        const pin = String(message.pin || '').trim();
        const pairKey = sha256(pin);
        const pairing = this.roomManager.completePairing(pairKey);

        if (!pairing) {
          this._send(sender, {
            type: 'pair-result',
            success: false,
            reason: 'Invalid or expired pair code',
          });
          return;
        }

        const secret = pairing.secret;
        const initiator = pairing.initiator;

        // Join both peers into the secret room
        this.roomManager.joinSecretRoom(initiator, secret);
        this.roomManager.joinSecretRoom(sender, secret);

        // Notify both sides of successful pairing
        this._send(initiator, {
          type: 'pair-success',
          secret: secret,
          pairedWith: sender.getInfo(),
        });
        this._send(sender, {
          type: 'pair-success',
          secret: secret,
          pairedWith: initiator.getInfo(),
        });

        // Notify each other with peer-joined (secret room)
        this._send(initiator, {
          type: 'peer-joined',
          peer: sender.getInfo(),
          roomType: 'secret',
          secret: secret,
        });
        this._send(sender, {
          type: 'peer-joined',
          peer: initiator.getInfo(),
          roomType: 'secret',
          secret: secret,
        });

        // Refresh peers list on both sides
        this._sendVisiblePeers(initiator);
        this._sendVisiblePeers(sender);
        break;
      }

      case 'pair-cancel':
        if (sender.pairKey) {
          this.roomManager.cancelPairing(sender.pairKey);
          sender.pairKey = null;
        }
        break;

      // --- Public Room Flow ---
      case 'join-public-room':
        if (typeof message.roomId === 'string' && message.roomId.trim()) {
          const cleanRoomId = message.roomId.trim().toUpperCase().substring(0, 10);
          const { otherPeers } = this.roomManager.joinPublicRoom(sender, cleanRoomId);
          this._send(sender, {
            type: 'public-room-joined',
            roomId: cleanRoomId,
          });
          for (const other of otherPeers) {
            this._sendVisiblePeers(other);
          }
          this._sendVisiblePeers(sender);
        }
        break;

      case 'leave-public-room':
        if (sender.publicRoomId) {
          const { roomId, otherPeers } = this.roomManager.leavePublicRoom(sender);
          this._send(sender, {
            type: 'public-room-left',
            roomId: roomId,
          });
          for (const other of otherPeers) {
            this._sendVisiblePeers(other);
          }
          this._sendVisiblePeers(sender);
        }
        break;

      // --- WebRTC Signaling (Offer, Answer, ICE Candidate) ---
      case 'signal':
        this._relayMessage(sender, message);
        break;

      // --- WebSocket Fallback Relay ---
      case 'request':
      case 'header':
      case 'partition':
      case 'partition-received':
      case 'progress':
      case 'files-transfer-response':
      case 'file-transfer-complete':
      case 'transfer-cancel':
      case 'text':
      case 'ws-chunk':
        if (this.conf.wsFallback) {
          this._relayMessage(sender, message);
        }
        break;

      default:
        break;
    }
  }

  _relayMessage(sender, message) {
    if (!message.to || !Peer.isValidUuid(message.to)) return;

    const recipient = this.roomManager.findRecipientPeer(sender, message.to);
    if (!recipient) {
      if (this.conf.debugMode) {
        console.warn(`[Relay] Recipient ${message.to} not found for sender ${sender.id}`);
      }
      return;
    }

    message.sender = sender.getInfo();
    this._send(recipient, message);
  }

  _sendVisiblePeers(peer) {
    const visiblePeers = this.roomManager.getVisiblePeers(peer);
    const peersPayload = [];

    for (const [id, entry] of visiblePeers) {
      const roomsArr = Array.from(entry.rooms || []);
      const primaryRoomType = entry.rooms?.has('secret')
        ? 'secret'
        : entry.rooms?.has('public')
        ? 'public'
        : 'ip';

      peersPayload.push({
        ...entry.peer.getInfo(),
        roomType: primaryRoomType,
        rooms: roomsArr,
        secrets: Array.from(entry.secrets || []),
        secret: Array.from(entry.secrets || [])[0] || null,
        publicRoomId: entry.publicRoomId || null,
        roomId: entry.publicRoomId || null,
      });
    }

    this._send(peer, {
      type: 'peers-list',
      peers: peersPayload,
      discoveryScope: {
        lan: peer.ip,
        pairedRoomsCount: peer.roomSecrets.size,
        publicRoom: peer.publicRoomId,
      },
    });
  }

  _broadcastToVisiblePeers(sender, message) {
    const visiblePeers = this.roomManager.getVisiblePeers(sender);
    for (const [id, entry] of visiblePeers) {
      this._send(entry.peer, message);
    }
  }

  _handleDisconnect(peer) {
    const timer = this.keepAliveTimers.get(peer);
    if (timer) {
      clearTimeout(timer);
      this.keepAliveTimers.delete(peer);
    }

    // If a newer connection with the same peer.id has already replaced this peer, do not evict the new peer
    if (this.activePeers.get(peer.id) && this.activePeers.get(peer.id) !== peer) {
      return;
    }
    this.activePeers.delete(peer.id);

    this._broadcastToVisiblePeers(peer, {
      type: 'peer-left',
      peerId: peer.id,
    });

    if (peer.pairKey) {
      this.roomManager.cancelPairing(peer.pairKey);
    }

    this.roomManager.leaveIpRoom(peer);
    this.roomManager.leaveAllSecretRooms(peer);
    this.roomManager.leavePublicRoom(peer);

    if (this.conf.debugMode) {
      console.log(`[Peer Disconnected] ID: ${peer.id}`);
    }
  }

  _resetKeepAlive(peer) {
    const existing = this.keepAliveTimers.get(peer);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(() => {
      if (peer.socket && peer.socket.readyState === 1) {
        if (this.conf.debugMode) {
          console.warn(`[Keepalive Timeout] Closing stale client: ${peer.id}`);
        }
        peer.socket.terminate();
      }
    }, this.conf.connectionTimeout);

    this.keepAliveTimers.set(peer, timer);
  }

  _startHeartbeatCheck() {
    setInterval(() => {
      this.wss.clients.forEach((socket) => {
        if (socket.readyState === 1) {
          try {
            socket.send(JSON.stringify({ type: 'ping' }));
          } catch (e) {
            socket.terminate();
          }
        }
      });
    }, this.conf.heartbeatInterval);
  }
}

