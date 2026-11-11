import { EventEmitter } from './events.js';
import { signaling } from './signaling.js';

/**
 * RTCPeerConnection wrapper with Perfect Negotiation Pattern
 */
export class LoSPeerConnection extends EventEmitter {
  constructor(peerId, isPolite = false, rtcConfig = null) {
    super();
    this.peerId = peerId;
    this.isPolite = isPolite;
    this.rtcConfig = rtcConfig || signaling.rtcConfig;

    this.pc = null;
    this.dc = null;
    this.makingOffer = false;
    this.ignoreOffer = false;
    this.pendingCandidates = [];
    this._signalQueue = Promise.resolve();

    this._initPeerConnection();
  }

  isHealthy() {
    if (!this.pc) return false;
    const cs = this.pc.connectionState;
    const ics = this.pc.iceConnectionState;
    if (cs === 'failed' || cs === 'closed' || ics === 'failed' || ics === 'closed') {
      return false;
    }
    return true;
  }

  _initPeerConnection() {
    this.pc = new RTCPeerConnection(this.rtcConfig);

    this.pc.onicecandidate = (event) => {
      if (event.candidate) {
        signaling.sendSignal(this.peerId, { candidate: event.candidate });
      }
    };

    this.pc.ondatachannel = (event) => {
      this._setupDataChannel(event.channel);
    };

    this.pc.onconnectionstatechange = () => {
      if (!this.pc) return;
      if (this.pc.connectionState === 'connected') {
        this.emit('connected');
      } else if (
        this.pc.connectionState === 'disconnected' ||
        this.pc.connectionState === 'failed' ||
        this.pc.connectionState === 'closed'
      ) {
        this.emit('disconnected', this.pc.connectionState);
      }
    };

    this.pc.oniceconnectionstatechange = () => {
      if (!this.pc) return;
      if (this.pc.iceConnectionState === 'failed' || this.pc.iceConnectionState === 'closed') {
        this.emit('disconnected', this.pc.iceConnectionState);
      }
    };

    this.pc.onnegotiationneeded = async () => {
      try {
        this.makingOffer = true;
        await this.pc.setLocalDescription();
        signaling.sendSignal(this.peerId, { description: this.pc.localDescription });
      } catch (err) {
        console.error('[Negotiation Error]', err);
      } finally {
        this.makingOffer = false;
      }
    };
  }

  createDataChannel(label = 'los-data') {
    if (this.dc && this.dc.readyState !== 'closing' && this.dc.readyState !== 'closed') {
      return this.dc;
    }
    if (!this.isHealthy()) {
      this.close();
      this._initPeerConnection();
    }
    try {
      const channel = this.pc.createDataChannel(label, {
        ordered: true,
      });
      this._setupDataChannel(channel);
    } catch (err) {
      console.warn('[Create DataChannel Error]', err);
    }
    return this.dc;
  }

  _setupDataChannel(channel) {
    this.dc = channel;
    this.dc.binaryType = 'arraybuffer';

    this.dc.onopen = () => {
      this.emit('open');
    };

    this.dc.onclose = () => {
      this.emit('close');
    };

    this.dc.onerror = (err) => {
      this.emit('error', err);
    };

    this.dc.onmessage = (event) => {
      this.emit('message', event.data);
    };
  }

  handleSignal(signal) {
    this._signalQueue = this._signalQueue
      .then(() => this._processSignal(signal))
      .catch((err) => {
        console.error('[Signal Queue Error]', err);
      });
    return this._signalQueue;
  }

  async _processSignal(signal) {
    if (!this.pc) return;

    try {
      if (signal.description) {
        const description = signal.description;
        const offerCollision =
          description.type === 'offer' &&
          (this.makingOffer || this.pc.signalingState !== 'stable');

        this.ignoreOffer = !this.isPolite && offerCollision;
        if (this.ignoreOffer) {
          return;
        }

        if (offerCollision && this.isPolite) {
          await Promise.all([
            this.pc.setLocalDescription({ type: 'rollback' }),
            this.pc.setRemoteDescription(description),
          ]);
        } else {
          await this.pc.setRemoteDescription(description);
        }

        // Process queued ICE candidates
        while (this.pendingCandidates.length > 0) {
          const candidate = this.pendingCandidates.shift();
          try {
            await this.pc.addIceCandidate(candidate);
          } catch (err) {
            if (!this.ignoreOffer) {
              console.warn('[Queued ICE Candidate Error]', err);
            }
          }
        }

        if (description.type === 'offer') {
          await this.pc.setLocalDescription();
          signaling.sendSignal(this.peerId, { description: this.pc.localDescription });
        }
      } else if (signal.candidate) {
        try {
          if (this.pc.remoteDescription && this.pc.remoteDescription.type) {
            await this.pc.addIceCandidate(signal.candidate);
          } else {
            this.pendingCandidates.push(signal.candidate);
          }
        } catch (err) {
          if (!this.ignoreOffer) {
            console.error('[Add ICE Candidate Error]', err);
          }
        }
      }
    } catch (err) {
      console.error('[Signal Handling Error]', err);
    }
  }

  send(data) {
    if (this.dc && this.dc.readyState === 'open') {
      try {
        this.dc.send(data);
        return true;
      } catch (err) {
        console.warn('[DataChannel Send Error]', err);
        return false;
      }
    }
    return false;
  }

  sendJSON(obj) {
    return this.send(JSON.stringify(obj));
  }

  get bufferedAmount() {
    return this.dc ? this.dc.bufferedAmount : 0;
  }

  close() {
    if (this.dc) {
      this.dc.close();
      this.dc = null;
    }
    if (this.pc) {
      this.pc.close();
      this.pc = null;
    }
  }
}

