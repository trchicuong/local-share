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

    this._initPeerConnection();
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
      if (this.pc.connectionState === 'connected') {
        this.emit('connected');
      } else if (this.pc.connectionState === 'disconnected' || this.pc.connectionState === 'failed') {
        this.emit('disconnected');
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
    if (this.dc) return this.dc;
    const channel = this.pc.createDataChannel(label, {
      ordered: true,
    });
    this._setupDataChannel(channel);
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

  async handleSignal(signal) {
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

        await this.pc.setRemoteDescription(description);

        // Process queued ICE candidates
        while (this.pendingCandidates.length > 0) {
          const candidate = this.pendingCandidates.shift();
          await this.pc.addIceCandidate(candidate);
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
      this.dc.send(data);
      return true;
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

