import { events } from './events.js';
import { CONFIG } from './config.js';

export class SignalingClient {
  constructor() {
    this.ws = null;
    this.connected = false;
    this.reconnectAttempts = 0;
    this.reconnectTimer = null;
    this.selfId = null;
    this.selfName = null;
    this.rtcConfig = CONFIG.DEFAULT_RTC_CONFIG;
    this.wsFallbackEnabled = true;
  }

  connect() {
    if (this.ws && (this.ws.readyState === WebSocket.CONNECTING || this.ws.readyState === WebSocket.OPEN)) {
      return;
    }

    let wsUrl = CONFIG.getSignalingUrl();
    const savedPeerId = sessionStorage.getItem('los_peer_id') || localStorage.getItem('los_peer_id');
    const savedPeerIdHash = sessionStorage.getItem('los_peer_id_hash') || localStorage.getItem('los_peer_id_hash');

    if (savedPeerId && savedPeerIdHash) {
      try {
        const url = new URL(wsUrl);
        url.searchParams.set('peer_id', savedPeerId);
        url.searchParams.set('peer_id_hash', savedPeerIdHash);
        wsUrl = url.toString();
      } catch (e) {
        // Fallback to basic url if URL parse fails
      }
    }

    try {
      this.ws = new WebSocket(wsUrl);
    } catch (e) {
      this._scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      this.connected = true;
      this.reconnectAttempts = 0;
      events.emit('signaling-connected');
    };

    this.ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        this._handleMessage(message);
      } catch (err) {
        console.error('[Signaling Parse Error]', err);
      }
    };

    this.ws.onclose = () => {
      this.connected = false;
      events.emit('signaling-disconnected');
      this._scheduleReconnect();
    };

    this.ws.onerror = (err) => {
      events.emit('signaling-error', err);
    };
  }

  send(data) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return false;
    try {
      this.ws.send(JSON.stringify(data));
      return true;
    } catch (err) {
      console.error('[Signaling Send Error]', err);
      return false;
    }
  }

  _handleMessage(message) {
    switch (message.type) {
      case 'ping':
        this.send({ type: 'pong' });
        break;

      case 'ws-config':
        if (message.rtcConfig) this.rtcConfig = message.rtcConfig;
        if (typeof message.wsFallback === 'boolean') this.wsFallbackEnabled = message.wsFallback;
        events.emit('ws-config', message);
        break;

      case 'display-name':
        this.selfId = message.peerId;
        this.selfName = message.displayName;
        if (message.peerId && message.peerIdHash) {
          sessionStorage.setItem('los_peer_id', message.peerId);
          sessionStorage.setItem('los_peer_id_hash', message.peerIdHash);
          localStorage.setItem('los_peer_id', message.peerId);
          localStorage.setItem('los_peer_id_hash', message.peerIdHash);
        }
        events.emit('self-identity', message);
        break;

      case 'peers-list':
        events.emit('peers-list', message.peers || [], message.discoveryScope);
        break;

      case 'peer-joined':
        events.emit('peer-joined', message.peer, message.roomType, {
          secret: message.secret,
          roomId: message.roomId,
        });
        break;

      case 'peer-left':
        events.emit('peer-left', message.peerId, message.roomType, {
          secret: message.secret,
          roomId: message.roomId,
        });
        break;

      case 'peer-updated':
        events.emit('peer-updated', message.peer);
        break;

      case 'secret-room-deleted':
        events.emit('secret-room-deleted', message.secret);
        break;

      case 'signal':
        events.emit('signal', message.sender, message.signal);
        break;

      case 'pair-code':
      case 'pair-result':
      case 'pair-success':
      case 'public-room-joined':
      case 'public-room-left':
        events.emit(message.type, message);
        break;

      // WebSocket fallback & text messages
      case 'request':
      case 'header':
      case 'partition':
      case 'partition-received':
      case 'progress':
      case 'files-transfer-response':
      case 'file-transfer-complete':
      case 'text':
      case 'ws-chunk':
        events.emit(`relay-${message.type}`, message);
        break;

      default:
        break;
    }
  }

  _scheduleReconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    const delay = Math.min(1000 * Math.pow(1.5, this.reconnectAttempts), 10000);
    this.reconnectAttempts++;
    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, delay);
  }

  changeDisplayName(name) {
    const cleanName = String(name || '').trim();
    if (!cleanName) return;
    this.selfName = cleanName;
    events.emit('self-identity', { displayName: cleanName, peerId: this.selfId });
    this.send({ type: 'change-name', displayName: cleanName });
  }

  joinRoomSecrets(secrets) {
    this.send({ type: 'join-room-secrets', secrets });
  }

  initiatePairing() {
    this.send({ type: 'pair-initiate' });
  }

  joinPair(pin) {
    this.send({ type: 'pair-join', pin });
  }

  cancelPairing() {
    this.send({ type: 'pair-cancel' });
  }

  joinPublicRoom(roomId) {
    this.send({ type: 'join-public-room', roomId });
  }

  leavePublicRoom() {
    this.send({ type: 'leave-public-room' });
  }

  sendSignal(to, signal) {
    this.send({ type: 'signal', to, signal });
  }

  sendRelay(type, to, payload = {}) {
    this.send({ type, to, ...payload });
  }
}

export const signaling = new SignalingClient();

