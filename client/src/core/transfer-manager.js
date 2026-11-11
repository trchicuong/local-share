import { events } from './events.js';
import { signaling } from './signaling.js';
import { LoSPeerConnection } from './peer-connection.js';
import { FileStreamReader } from './stream-reader.js';
import { FileStreamWriter } from './stream-writer.js';
import { noSleep } from '../utils/nosleep.js';
import { storage } from '../utils/storage.js';
import { getMimeType } from '../utils/mime.js';
import { t } from '../utils/i18n.js';

export class TransferManager {
  constructor() {
    this.connections = new Map(); // peerId -> LoSPeerConnection
    this.activeTransfer = null; // Current active sender or receiver session

    this._bindSignalingEvents();
  }

  _bindSignalingEvents() {
    // WebRTC signal received
    events.on('signal', (sender, signal) => {
      const pc = this.getOrCreateConnection(sender.id);
      pc.handleSignal(signal);
    });

    // Fallback relay events
    events.on('relay-request', (msg) => this._onTransferRequest(msg.sender, msg));
    events.on('relay-files-transfer-response', (msg) => this._onTransferResponse(msg, true));
    events.on('relay-header', (msg) => this._onTransferHeader(msg.sender, msg, true));
    events.on('relay-partition', (msg) => this._onPartitionBoundary(msg, true));
    events.on('relay-partition-received', (msg) => this._onPartitionAck(msg));
    events.on('relay-file-transfer-complete', (msg) => this._onRemoteTransferComplete(msg));
    events.on('relay-transfer-cancel', (msg) => this._onRemoteTransferCancel(msg));
    events.on('relay-ws-chunk', (msg) => this._onWsChunkReceived(msg));
    events.on('relay-text', (msg) => {
      events.emit('text-received', msg.sender, msg.text);
    });

    // Broadcast self display name updates over open P2P channels for sub-5ms real-time sync
    events.on('self-identity', (identity) => {
      if (!identity?.displayName || !signaling.selfId) return;
      const updateMsg = {
        type: 'peer-updated',
        peer: {
          id: signaling.selfId,
          name: { displayName: identity.displayName },
        },
      };
      for (const [, conn] of this.connections) {
        if (conn.dc && conn.dc.readyState === 'open') {
          conn.sendJSON(updateMsg);
        }
      }
    });

    // Cleanup on peer leave
    events.on('peer-left', (peerId) => {
      const conn = this.connections.get(peerId);
      if (conn) {
        conn.close();
        this.connections.delete(peerId);
      }
    });
  }

  getOrCreateConnection(peerId) {
    if (this.connections.has(peerId)) {
      const existing = this.connections.get(peerId);
      if (existing.isHealthy()) {
        return existing;
      }
      existing.close();
      this.connections.delete(peerId);
    }

    // Polite peer determination: lexicographical comparison
    const isPolite = signaling.selfId ? signaling.selfId < peerId : true;
    const conn = new LoSPeerConnection(peerId, isPolite, signaling.rtcConfig);

    conn.on('open', () => {
      events.emit('peer-connected-p2p', peerId);
      this._startP2PPing(conn);
    });

    conn.on('message', (data) => {
      if (typeof data === 'string') {
        try {
          const msg = JSON.parse(data);
          this._handleDataChannelMessage(peerId, msg);
        } catch (e) {
          console.error('[DC Parse Error]', e);
        }
      } else {
        // Binary ArrayBuffer chunk
        this._handleBinaryChunk(data);
      }
    });

    conn.on('disconnected', (state) => {
      if (state === 'failed' || state === 'closed') {
        conn.close();
        if (this.connections.get(peerId) === conn) {
          this.connections.delete(peerId);
        }
      }
    });

    conn.on('close', () => {
      if (this.connections.get(peerId) === conn) {
        this.connections.delete(peerId);
      }
    });

    this.connections.set(peerId, conn);
    return conn;
  }

  _startP2PPing(conn) {
    const interval = setInterval(() => {
      if (conn.dc && conn.dc.readyState === 'open') {
        conn.sendJSON({ type: 'p2p-ping', ts: Date.now() });
      } else {
        clearInterval(interval);
      }
    }, 5000);
  }

  _handleDataChannelMessage(peerId, msg) {
    switch (msg.type) {
      case 'p2p-ping':
        if (msg.ts) {
          const conn = this.connections.get(peerId);
          conn?.sendJSON({ type: 'p2p-pong', ts: msg.ts });
        }
        break;

      case 'p2p-pong':
        if (msg.ts) {
          const rtt = Date.now() - msg.ts;
          events.emit('p2p-latency', peerId, rtt);
        }
        break;

      case 'request':
        this._onTransferRequest({ id: peerId }, msg);
        break;

      case 'files-transfer-response':
        this._onTransferResponse(msg);
        break;

      case 'header':
        this._onTransferHeader({ id: peerId }, msg);
        break;

      case 'partition':
        this._onPartitionBoundary(msg, false);
        break;

      case 'partition-received':
        this._onPartitionAck(msg);
        break;

      case 'file-transfer-complete':
        this._onRemoteTransferComplete(msg);
        break;

      case 'transfer-cancel':
        this._onRemoteTransferCancel(msg);
        break;

      case 'peer-updated':
        if (msg.peer) {
          events.emit('peer-updated', msg.peer);
        }
        break;

      case 'text':
        events.emit('text-received', { id: peerId }, msg.text);
        break;

      default:
        break;
    }
  }

  _handleBinaryChunk(arrayBuffer) {
    if (!this.activeTransfer || this.activeTransfer.type !== 'receive') return;
    if (!this.activeTransfer.writer) {
      if (!this.activeTransfer.pendingChunks) this.activeTransfer.pendingChunks = [];
      this.activeTransfer.pendingChunks.push(arrayBuffer);
      return;
    }
    this.activeTransfer.writer.writeChunk(arrayBuffer);
  }

  _sendControl(peerId, type, payload, preferRelay = false) {
    const conn = this.connections.get(peerId);
    if (!preferRelay && conn && conn.dc && conn.dc.readyState === 'open') {
      if (conn.sendJSON(payload)) {
        return false; // Sent via P2P DataChannel (not relay)
      }
    }
    signaling.sendRelay(type, peerId, payload);
    return true; // Sent via WebSocket Relay
  }

  _sendChunkViaRelay(recipientId, chunk) {
    const bytes = new Uint8Array(chunk);
    let binary = '';
    const step = 8192;
    for (let i = 0; i < bytes.length; i += step) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(i + step, bytes.length)));
    }
    const base64 = btoa(binary);
    signaling.sendRelay('ws-chunk', recipientId, { chunk: base64 });
  }

  async _waitForBufferDrain(conn, useRelay) {
    const HIGH_WATER_MARK = 512 * 1024; // 512 KB
    const LOW_WATER_MARK = 256 * 1024; // 256 KB
    let waited = 0;
    const maxWaitMs = 3500;

    if (useRelay) {
      if (signaling.bufferedAmount <= HIGH_WATER_MARK) return true;
      while (signaling.bufferedAmount > LOW_WATER_MARK && waited < maxWaitMs) {
        await new Promise((r) => setTimeout(r, 15));
        waited += 15;
      }
      return true;
    } else if (conn && conn.dc && conn.dc.readyState === 'open') {
      const initialBuffered = conn.bufferedAmount;
      if (initialBuffered <= HIGH_WATER_MARK) return true;
      while (conn.dc && conn.dc.readyState === 'open' && conn.bufferedAmount > LOW_WATER_MARK && waited < maxWaitMs) {
        await new Promise((r) => setTimeout(r, 15));
        waited += 15;
      }
      if (!conn.dc || conn.dc.readyState !== 'open' || conn.bufferedAmount >= initialBuffered) {
        return false; // WebRTC SCTP buffer stalled
      }
      return true;
    }
    return false;
  }

  // --- Sending Flow ---
  async sendFiles(recipientId, files) {
    const fileArray = Array.from(files || []);
    if (fileArray.length === 0) return;
    const firstFile = fileArray[0];

    if (this.activeTransfer) {
      if (this.activeTransfer.reader) this.activeTransfer.reader.abort();
      if (this.activeTransfer.writer) this.activeTransfer.writer.abort();
      this._endActiveTransfer();
    }

    noSleep.enable();

    const conn = this.getOrCreateConnection(recipientId);
    conn.createDataChannel('los-data');

    const totalSize = fileArray.reduce((acc, f) => acc + (f.size || 0), 0);
    const isWebRTCOpen = Boolean(conn.dc && conn.dc.readyState === 'open');

    const session = {
      type: 'send',
      recipientId: recipientId,
      files: fileArray,
      filesQueue: [...fileArray],
      filesCount: fileArray.length,
      currentFile: null,
      totalSize: totalSize,
      totalBytesSent: 0,
      startTime: Date.now(),
      lastSpeedCalcTime: Date.now(),
      lastBytesTransferred: 0,
      reader: null,
      useRelay: !isWebRTCOpen,
      partitionAckTimer: null,
    };
    this.activeTransfer = session;

    // Send transfer request
    const requestMsg = {
      type: 'request',
      senderName: signaling.selfName || t('peers.nearbyPeer'),
      filesCount: fileArray.length,
      firstFileName: firstFile.name,
      files: fileArray.map((f) => ({ name: f.name, size: f.size, mime: getMimeType(f.name, f.type) })),
      totalSize: totalSize,
      useRelay: session.useRelay,
    };

    const usedRelay = this._sendControl(recipientId, 'request', requestMsg, session.useRelay);
    if (usedRelay) {
      session.useRelay = true;
    }

    events.emit('transfer-started', {
      type: 'send',
      recipientId,
      fileName: firstFile.name,
      filesCount: fileArray.length,
      totalSize,
    });
  }

  _onTransferResponse(msg, fromRelay = false) {
    if (!this.activeTransfer || this.activeTransfer.type !== 'send') return;
    if (!msg.accepted) {
      events.emit('transfer-declined', { reason: msg.reason || 'User declined' });
      this._endActiveTransfer();
      return;
    }

    const conn = this.connections.get(this.activeTransfer.recipientId);
    const isWebRTCOpen = Boolean(conn && conn.dc && conn.dc.readyState === 'open');

    if (typeof msg.useRelay === 'boolean') {
      this.activeTransfer.useRelay = msg.useRelay || !isWebRTCOpen;
    } else if (fromRelay || !isWebRTCOpen) {
      this.activeTransfer.useRelay = true;
    }

    // Recipient accepted! Start sending the first file from queue
    this._dequeueAndSendNextFile();
  }

  _dequeueAndSendNextFile() {
    const session = this.activeTransfer;
    if (!session || session.type !== 'send') return;

    this._clearPartitionAckWatchdog(session);

    if (!session.filesQueue || session.filesQueue.length === 0) {
      // All files sent and acknowledged
      events.emit('transfer-progress', {
        currentBytes: session.totalSize,
        totalBytes: session.totalSize,
        progress: 100,
        speed: 0,
        etaSeconds: 0,
      });
      this._completeSending();
      return;
    }

    const file = session.filesQueue.shift();
    session.currentFile = file;
    this._streamCurrentFile(session, false);
  }

  _streamCurrentFile(session, isRetry = false) {
    if (!session || this.activeTransfer !== session || !session.currentFile) return;

    this._clearPartitionAckWatchdog(session);
    if (session.reader) {
      session.reader.abort();
      session.reader = null;
    }

    const file = session.currentFile;
    const conn = this.connections.get(session.recipientId);
    const isWebRTCOpen = Boolean(conn && conn.dc && conn.dc.readyState === 'open');
    if (!isWebRTCOpen || isRetry) {
      session.useRelay = true;
    }

    const fileIndex = session.files.length - session.filesQueue.length - 1;
    const mime = getMimeType(file.name, file.type);

    // Send Header (if retrying over relay after mid-file P2P drop, receiver resets partial writer for this file)
    const headerMsg = {
      type: 'header',
      name: file.name,
      size: file.size,
      mime: mime,
      fileIndex: fileIndex,
      filesCount: session.filesCount,
      reset: isRetry,
    };

    const headerUsedRelay = this._sendControl(session.recipientId, 'header', headerMsg, session.useRelay);
    if (headerUsedRelay) {
      session.useRelay = true;
    }

    session.reader = new FileStreamReader(file, {
      onChunk: async (chunk) => {
        if (this.activeTransfer !== session) return;

        const drainOk = await this._waitForBufferDrain(conn, session.useRelay);
        if (this.activeTransfer !== session) return;

        if (!session.useRelay && !drainOk) {
          console.warn('[WebRTC DataChannel buffer stalled, restarting current file via WebSocket Relay]');
          this._streamCurrentFile(session, true);
          return;
        }

        if (session.useRelay) {
          this._sendChunkViaRelay(session.recipientId, chunk);
        } else {
          const sentOk = conn ? conn.send(chunk) : false;
          if (!sentOk) {
            console.warn('[WebRTC DataChannel send failed, restarting current file via WebSocket Relay]');
            this._streamCurrentFile(session, true);
            return;
          }
        }
      },
      onPartitionEnd: (partitionIndex, offset) => {
        // Notify receiver of partition boundary and start safety watchdog for ACK
        this._sendControl(session.recipientId, 'partition', { type: 'partition', offset }, session.useRelay);
        this._schedulePartitionAckWatchdog(session, offset);
      },
      onProgress: (offset) => {
        const currentBatchBytes = (session.totalBytesSent || 0) + offset;
        this._updateTelemetry(currentBatchBytes, session.totalSize);
      },
      onComplete: () => {
        // File chunks pushed to channel. Wait for receiver ACK (file-transfer-complete) before sending next file!
        this._clearPartitionAckWatchdog(session);
        session.reader = null;
      },
      onError: (err) => {
        this._clearPartitionAckWatchdog(session);
        this._sendControl(session.recipientId, 'transfer-cancel', { type: 'transfer-cancel' }, session.useRelay);
        events.emit('transfer-error', err);
        this._endActiveTransfer();
      },
    });

    session.reader.start();
  }

  _schedulePartitionAckWatchdog(session, offset) {
    this._clearPartitionAckWatchdog(session);
    session.partitionAckTimer = setTimeout(() => {
      if (this.activeTransfer !== session || !session.reader || !session.reader.isPaused) return;
      // Re-send partition boundary over relay in case ACK or boundary was delayed
      signaling.sendRelay('partition', session.recipientId, { type: 'partition', offset });
      this._schedulePartitionAckWatchdog(session, offset);
    }, 3500);
  }

  _clearPartitionAckWatchdog(session) {
    if (session && session.partitionAckTimer) {
      clearTimeout(session.partitionAckTimer);
      session.partitionAckTimer = null;
    }
  }

  _onPartitionBoundary(msg, fromRelay = false) {
    const session = this.activeTransfer;
    if (!session || session.type !== 'receive') return;
    if (fromRelay) {
      session.useRelay = true;
    }
    if (session.writer && session.writer.bytesSinceLastAck > 0 && !session.writer.finalized) {
      session.writer.bytesSinceLastAck = 0;
      const ackMsg = { type: 'partition-received', offset: session.writer.receivedBytes };
      const ackUsedRelay = this._sendControl(session.senderId, 'partition-received', ackMsg, session.useRelay);
      if (ackUsedRelay) {
        session.useRelay = true;
      }
    }
  }

  _onPartitionAck(msg) {
    if (!this.activeTransfer || this.activeTransfer.type !== 'send') return;
    this._clearPartitionAckWatchdog(this.activeTransfer);
    if (this.activeTransfer.reader) {
      this.activeTransfer.reader.nextPartition();
    }
  }

  _onRemoteTransferComplete(msg) {
    const session = this.activeTransfer;
    if (!session || session.type !== 'send') return;

    this._clearPartitionAckWatchdog(session);

    if (session.currentFile) {
      session.totalBytesSent = (session.totalBytesSent || 0) + session.currentFile.size;
      session.currentFile = null;
    }

    if (!session.filesQueue || session.filesQueue.length === 0) {
      // All files finished!
      events.emit('transfer-progress', {
        currentBytes: session.totalSize,
        totalBytes: session.totalSize,
        progress: 100,
        speed: 0,
        etaSeconds: 0,
      });
      this._completeSending();
    } else {
      // Send next file in batch
      this._dequeueAndSendNextFile();
    }
  }

  _completeSending() {
    const filesCount = this.activeTransfer?.filesCount || 1;
    noSleep.disable();
    events.emit('transfer-completed', { type: 'send', filesCount });
    this._endActiveTransfer();
  }

  // --- Receiving Flow ---
  _onTransferRequest(sender, msg) {
    noSleep.enable();

    const senderId = sender?.id || msg?.sender?.id || msg?.from;
    const senderDisplayName =
      msg?.senderName || sender?.name?.displayName || msg?.sender?.name?.displayName || t('peers.nearbyPeer');

    // Check if Auto-Accept is enabled for this paired device
    let isAutoAccept = false;
    const peerInfo = this.connections.get(senderId)?.peer || window.losApp?.peersView?.peers?.get(senderId);
    if (peerInfo && peerInfo.roomType === 'secret' && peerInfo.secret) {
      isAutoAccept = storage.isAutoAccept(peerInfo.secret);
    } else {
      const pairedDevices = storage.getPairedDevices();
      const matched = pairedDevices.find(
        (d) => d.autoAccept && (d.displayName === senderDisplayName || (peerInfo && d.displayName === peerInfo.name?.displayName))
      );
      if (matched) isAutoAccept = true;
    }

    if (isAutoAccept) {
      events.emit('notify', {
        title: t('toast.autoAccepting'),
        message: t('toast.autoAcceptingDesc', { file: msg.firstFileName, sender: senderDisplayName }),
        type: 'info',
        duration: 3000,
      });
      this.acceptTransfer(senderId, msg, null, senderDisplayName);
      return;
    }

    // Trigger UI confirmation modal
    events.emit('incoming-transfer-request', {
      sender: {
        id: senderId,
        displayName: senderDisplayName,
        name: { displayName: senderDisplayName },
        ...(sender || {}),
      },
      filesCount: msg.filesCount,
      fileName: msg.firstFileName,
      totalSize: msg.totalSize,
      accept: (fileHandle = null) => this.acceptTransfer(senderId, msg, fileHandle, senderDisplayName),
      decline: () => this.declineTransfer(senderId),
    });
  }

  async acceptTransfer(senderId, msg, fileHandle = null, senderName = '') {
    const conn = this.connections.get(senderId);
    const isWebRTCOpen = Boolean(conn && conn.dc && conn.dc.readyState === 'open');
    const useRelay = !isWebRTCOpen;

    const session = {
      type: 'receive',
      senderId: senderId,
      senderName: senderName || t('peers.nearbyPeer'),
      filesCount: msg.filesCount || 1,
      filesReceived: [],
      totalSize: msg.totalSize,
      totalBytesReceived: 0,
      startTime: Date.now(),
      lastSpeedCalcTime: Date.now(),
      lastBytesTransferred: 0,
      writer: null,
      useRelay: useRelay,
      fileHandle: fileHandle,
      pendingChunks: [],
    };
    this.activeTransfer = session;

    const responseMsg = {
      type: 'files-transfer-response',
      accepted: true,
      useRelay: useRelay,
    };

    const respUsedRelay = this._sendControl(senderId, 'files-transfer-response', responseMsg, useRelay);
    if (respUsedRelay) {
      session.useRelay = true;
    }

    events.emit('transfer-started', {
      type: 'receive',
      senderId,
      fileName: msg.firstFileName,
      filesCount: msg.filesCount || 1,
      totalSize: msg.totalSize,
    });
  }

  declineTransfer(senderId) {
    const responseMsg = {
      type: 'files-transfer-response',
      accepted: false,
      reason: 'Rejected by user',
    };
    this._sendControl(senderId, 'files-transfer-response', responseMsg, false);
    this._endActiveTransfer();
  }

  async _onTransferHeader(sender, msg, fromRelay = false) {
    if (!this.activeTransfer || this.activeTransfer.type !== 'receive') return;

    const session = this.activeTransfer;
    if (fromRelay) {
      session.useRelay = true;
    }

    // If restarting current file after mid-file P2P fallback, abort incomplete partial writer and clear stale pending chunks
    if (session.writer && !session.writer.finalized) {
      session.writer.abort();
      session.pendingChunks = [];
    }

    // Ensure session.writer is null while new writer initializes so incoming chunks queue into pendingChunks
    session.writer = null;

    const writer = new FileStreamWriter(msg, {
      fileHandle: session.fileHandle,
      onProgress: (received, total, bytesSinceLastAck) => {
        if (this.activeTransfer !== session) return;
        const currentBatchBytes = (session.totalBytesReceived || 0) + received;
        this._updateTelemetry(currentBatchBytes, session.totalSize);

        // Send back partition ACK every 1MB for backpressure flow control
        if (bytesSinceLastAck >= 1024 * 1024 && received < total) {
          writer.bytesSinceLastAck = 0;
          const ackMsg = { type: 'partition-received', offset: received };
          const ackUsedRelay = this._sendControl(session.senderId, 'partition-received', ackMsg, session.useRelay);
          if (ackUsedRelay) {
            session.useRelay = true;
          }
        }
      },
      onComplete: (fileResult) => {
        if (this.activeTransfer !== session) return;
        if (!session.filesReceived) session.filesReceived = [];
        session.filesReceived.push(fileResult);
        session.totalBytesReceived = (session.totalBytesReceived || 0) + fileResult.size;

        // 1. Notify sender that THIS file was received cleanly so sender can dequeue next file
        const completeMsg = {
          type: 'file-transfer-complete',
          name: fileResult.name,
          count: session.filesReceived.length,
        };
        const completeUsedRelay = this._sendControl(session.senderId, 'file-transfer-complete', completeMsg, session.useRelay);
        if (completeUsedRelay) {
          session.useRelay = true;
        }

        const isLastFile = session.filesReceived.length >= (session.filesCount || 1);

        if (isLastFile) {
          noSleep.disable();

          events.emit('transfer-progress', {
            currentBytes: session.totalSize,
            totalBytes: session.totalSize,
            progress: 100,
            speed: 0,
            etaSeconds: 0,
          });

          // 2. Emit transfer-completed for receiver UI, audio chime, and post-receive preview dialog
          events.emit('transfer-completed', {
            type: 'receive',
            senderId: session.senderId,
            senderName: session.senderName,
            files: session.filesReceived,
            file: session.filesReceived[0],
          });
          this._endActiveTransfer();
        } else {
          // More files are arriving in this batch! Prepare writer for next header
          session.writer = null;
        }
      },
      onError: (err) => {
        this._sendControl(session.senderId, 'transfer-cancel', { type: 'transfer-cancel' }, session.useRelay);
        events.emit('transfer-error', err);
        this._endActiveTransfer();
      },
    });

    await writer.init();
    if (this.activeTransfer !== session) return;

    // Drain any chunks that arrived before or during writer.init() in strict FIFO order
    while (session.pendingChunks && session.pendingChunks.length > 0 && !writer.finalized) {
      const chunk = session.pendingChunks.shift();
      await writer.writeChunk(chunk);
    }

    if (this.activeTransfer === session && !writer.finalized) {
      session.writer = writer;
    }
  }

  _onWsChunkReceived(msg) {
    if (!this.activeTransfer || this.activeTransfer.type !== 'receive') return;
    this.activeTransfer.useRelay = true;
    try {
      const binary = atob(msg.chunk);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      this._handleBinaryChunk(bytes.buffer);
    } catch (err) {
      console.error('[WS Chunk Decode Error]', err);
    }
  }

  _updateTelemetry(currentBytes, totalBytes) {
    const now = Date.now();
    const session = this.activeTransfer;
    if (!session) return;

    const isFinal = currentBytes >= totalBytes;
    const timeDiff = (now - session.lastSpeedCalcTime) / 1000;

    if (timeDiff >= 0.2 || isFinal) {
      const bytesDiff = currentBytes - session.lastBytesTransferred;
      const speed = timeDiff > 0 ? bytesDiff / timeDiff : 0;
      const progress = totalBytes > 0 ? (currentBytes / totalBytes) * 100 : 100;
      const remainingBytes = Math.max(0, totalBytes - currentBytes);
      const etaSeconds = speed > 0 ? remainingBytes / speed : 0;

      session.lastSpeedCalcTime = now;
      session.lastBytesTransferred = currentBytes;

      events.emit('transfer-progress', {
        currentBytes,
        totalBytes,
        progress: Math.min(100, progress),
        speed,
        etaSeconds,
      });
    }
  }

  sendText(recipientId, text) {
    if (!text) return;
    const conn = this.getOrCreateConnection(recipientId);
    const msg = { type: 'text', text };

    if (conn.dc && conn.dc.readyState === 'open') {
      conn.sendJSON(msg);
    } else {
      signaling.sendRelay('text', recipientId, msg);
    }
  }

  cancelActiveTransfer() {
    if (!this.activeTransfer) return;
    const peerId =
      this.activeTransfer.type === 'send'
        ? this.activeTransfer.recipientId
        : this.activeTransfer.senderId;
    const useRelay = Boolean(this.activeTransfer.useRelay);

    if (this.activeTransfer.reader) this.activeTransfer.reader.abort();
    if (this.activeTransfer.writer) this.activeTransfer.writer.abort();
    this._endActiveTransfer();

    if (peerId) {
      this._sendControl(peerId, 'transfer-cancel', { type: 'transfer-cancel' }, useRelay);
    }
    events.emit('transfer-cancelled');
  }

  _onRemoteTransferCancel() {
    if (!this.activeTransfer) return;
    if (this.activeTransfer.reader) this.activeTransfer.reader.abort();
    if (this.activeTransfer.writer) this.activeTransfer.writer.abort();
    this._endActiveTransfer();
    events.emit('transfer-cancelled');
  }

  _endActiveTransfer() {
    this.activeTransfer = null;
    noSleep.disable();
  }
}

export const transferManager = new TransferManager();
