import { events } from './events.js';
import { signaling } from './signaling.js';
import { LoSPeerConnection } from './peer-connection.js';
import { FileStreamReader } from './stream-reader.js';
import { FileStreamWriter } from './stream-writer.js';
import { noSleep } from '../utils/nosleep.js';
import { storage } from '../utils/storage.js';
import { getMimeType, isMobileDevice } from '../utils/mime.js';

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
    events.on('relay-files-transfer-response', (msg) => this._onTransferResponse(msg));
    events.on('relay-header', (msg) => this._onTransferHeader(msg.sender, msg));
    events.on('relay-partition-received', (msg) => this._onPartitionAck(msg));
    events.on('relay-file-transfer-complete', (msg) => this._onRemoteTransferComplete(msg));
    events.on('relay-ws-chunk', (msg) => this._onWsChunkReceived(msg));
    events.on('relay-text', (msg) => {
      events.emit('text-received', msg.sender, msg.text);
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
      return this.connections.get(peerId);
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

    conn.on('close', () => {
      this.connections.delete(peerId);
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

      case 'partition-received':
        this._onPartitionAck(msg);
        break;

      case 'file-transfer-complete':
        this._onRemoteTransferComplete(msg);
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

  // --- Sending Flow ---
  async sendFiles(recipientId, files) {
    const fileArray = Array.from(files || []);
    if (fileArray.length === 0) return;
    const firstFile = fileArray[0];

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
    };
    this.activeTransfer = session;

    // Send transfer request
    const requestMsg = {
      type: 'request',
      senderName: signaling.selfName || 'Nearby Peer',
      filesCount: fileArray.length,
      firstFileName: firstFile.name,
      files: fileArray.map((f) => ({ name: f.name, size: f.size, mime: getMimeType(f.name, f.type) })),
      totalSize: totalSize,
      useRelay: session.useRelay,
    };

    if (isWebRTCOpen) {
      conn.sendJSON(requestMsg);
    } else {
      // Use WebSocket relay fallback
      signaling.sendRelay('request', recipientId, requestMsg);
    }

    events.emit('transfer-started', {
      type: 'send',
      recipientId,
      fileName: firstFile.name,
      filesCount: fileArray.length,
      totalSize,
    });
  }

  _onTransferResponse(msg) {
    if (!this.activeTransfer || this.activeTransfer.type !== 'send') return;
    if (!msg.accepted) {
      events.emit('transfer-declined', { reason: msg.reason || 'User declined' });
      this._endActiveTransfer();
      return;
    }

    if (typeof msg.useRelay === 'boolean') {
      this.activeTransfer.useRelay = msg.useRelay;
    }

    // Recipient accepted! Start sending the first file from queue
    this._dequeueAndSendNextFile();
  }

  _dequeueAndSendNextFile() {
    const session = this.activeTransfer;
    if (!session || session.type !== 'send') return;

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

    const conn = this.connections.get(session.recipientId);
    const fileIndex = session.files.length - session.filesQueue.length - 1;
    const mime = getMimeType(file.name, file.type);

    // Send Header
    const headerMsg = {
      type: 'header',
      name: file.name,
      size: file.size,
      mime: mime,
      fileIndex: fileIndex,
      filesCount: session.filesCount,
    };

    if (session.useRelay) {
      signaling.sendRelay('header', session.recipientId, headerMsg);
    } else {
      conn?.sendJSON(headerMsg);
    }

    session.reader = new FileStreamReader(file, {
      onChunk: (chunk) => {
        if (session.useRelay) {
          // Convert arrayBuffer to base64 safely without call stack limit
          const bytes = new Uint8Array(chunk);
          let binary = '';
          const chunkSize = 8192;
          for (let i = 0; i < bytes.length; i += chunkSize) {
            binary += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(i + chunkSize, bytes.length)));
          }
          const base64 = btoa(binary);
          signaling.sendRelay('ws-chunk', session.recipientId, { chunk: base64 });
        } else {
          try {
            conn?.send(chunk);
          } catch (err) {
            console.warn('[WebRTC DataChannel send failed, switching to relay]', err);
            session.useRelay = true;
            const bytes = new Uint8Array(chunk);
            let binary = '';
            const chunkSize = 8192;
            for (let i = 0; i < bytes.length; i += chunkSize) {
              binary += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(i + chunkSize, bytes.length)));
            }
            const base64 = btoa(binary);
            signaling.sendRelay('ws-chunk', session.recipientId, { chunk: base64 });
          }
        }
      },
      onPartitionEnd: () => {
        // Paused waiting for partition ACK from receiver
      },
      onProgress: (offset) => {
        const currentBatchBytes = (session.totalBytesSent || 0) + offset;
        this._updateTelemetry(currentBatchBytes, session.totalSize);
      },
      onComplete: () => {
        // File chunks pushed to channel. Wait for receiver ACK (file-transfer-complete) before sending next file!
        session.reader = null;
      },
      onError: (err) => {
        events.emit('transfer-error', err);
        this._endActiveTransfer();
      },
    });

    session.reader.start();
  }

  _onPartitionAck(msg) {
    if (!this.activeTransfer || this.activeTransfer.type !== 'send') return;
    if (this.activeTransfer.reader) {
      this.activeTransfer.reader.nextPartition();
    }
  }

  _onRemoteTransferComplete(msg) {
    const session = this.activeTransfer;
    if (!session || session.type !== 'send') return;

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
    noSleep.disable();
    events.emit('transfer-completed', { type: 'send' });
    this._endActiveTransfer();
  }

  // --- Receiving Flow ---
  _onTransferRequest(sender, msg) {
    noSleep.enable();

    const senderId = sender?.id || msg?.sender?.id || msg?.from;
    const senderDisplayName = msg?.senderName || sender?.name?.displayName || msg?.sender?.name?.displayName || 'Nearby Peer';

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
        title: 'Auto-Accepting Transfer',
        message: `Receiving "${msg.firstFileName}" from ${senderDisplayName}...`,
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
    const useRelay = Boolean(msg?.useRelay || !isWebRTCOpen);

    const session = {
      type: 'receive',
      senderId: senderId,
      senderName: senderName || 'Nearby Peer',
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

    if (useRelay) {
      signaling.sendRelay('files-transfer-response', senderId, responseMsg);
    } else {
      conn?.sendJSON(responseMsg);
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
    const conn = this.connections.get(senderId);
    const responseMsg = {
      type: 'files-transfer-response',
      accepted: false,
      reason: 'Rejected by user',
    };
    if (conn && conn.dc && conn.dc.readyState === 'open') {
      conn.sendJSON(responseMsg);
    } else {
      signaling.sendRelay('files-transfer-response', senderId, responseMsg);
    }
    this._endActiveTransfer();
  }

  async _onTransferHeader(sender, msg) {
    if (!this.activeTransfer || this.activeTransfer.type !== 'receive') return;

    const session = this.activeTransfer;
    session.writer = new FileStreamWriter(msg, {
      fileHandle: session.fileHandle,
      onProgress: (received, total, bytesSinceLastAck) => {
        const currentBatchBytes = (session.totalBytesReceived || 0) + received;
        this._updateTelemetry(currentBatchBytes, session.totalSize);

        // Send back partition ACK every 1MB for backpressure flow control
        if (bytesSinceLastAck >= 1024 * 1024 && received < total) {
          session.writer.bytesSinceLastAck = 0;
          const ackMsg = { type: 'partition-received', offset: received };
          if (session.useRelay) {
            signaling.sendRelay('partition-received', session.senderId, ackMsg);
          } else {
            const conn = this.connections.get(session.senderId);
            conn?.sendJSON(ackMsg);
          }
        }
      },
      onComplete: (fileResult) => {
        if (!session.filesReceived) session.filesReceived = [];
        session.filesReceived.push(fileResult);
        session.totalBytesReceived = (session.totalBytesReceived || 0) + fileResult.size;

        // 1. Notify sender that THIS file was received cleanly so sender can dequeue next file
        const completeMsg = {
          type: 'file-transfer-complete',
          name: fileResult.name,
          count: session.filesReceived.length,
        };
        if (session.useRelay) {
          signaling.sendRelay('file-transfer-complete', session.senderId, completeMsg);
        } else {
          const conn = this.connections.get(session.senderId);
          conn?.sendJSON(completeMsg);
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
        events.emit('transfer-error', err);
        this._endActiveTransfer();
      },
    });

    await session.writer.init();

    // Process any chunks that arrived while writer was initializing
    if (session.pendingChunks && session.pendingChunks.length > 0) {
      for (const chunk of session.pendingChunks) {
        await session.writer.writeChunk(chunk);
      }
      session.pendingChunks = [];
    }
  }

  _onWsChunkReceived(msg) {
    if (!this.activeTransfer || this.activeTransfer.type !== 'receive') return;
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
