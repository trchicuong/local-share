import crypto from 'crypto';
import parser from 'ua-parser-js';
import { getClientIP, normalizeIP } from './utils/network.js';
import { generateRandomName } from './utils/name-generator.js';
import { hashPeerId, isValidPeerIdHash } from './utils/hasher.js';

export default class Peer {
  constructor(socket, request, conf) {
    this.socket = socket;
    this.conf = conf;
    this.connectedAt = Date.now();
    this.isAlive = true;

    // Set persistent peer id and hash
    this._setPeerId(request);

    // IP detection
    this.rawIp = getClientIP(request);
    this.ip = normalizeIP(this.rawIp, conf);

    // Device and browser identification
    this._parseDeviceInfo(request);

    // Rate limiting tracking
    this.requestRate = 0;

    // Room memberships
    this.roomSecrets = new Set();
    this.pairKey = null;
    this.publicRoomId = null;

    if (this.conf.debugMode) {
      console.log(`[Peer Connected] ID: ${this.id} (Reconnected: ${this.isReconnected}) | IP: ${this.ip} | Device: ${this.name.deviceName}`);
    }
  }

  _setPeerId(request) {
    const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
    const reqPeerId = url.searchParams.get('peer_id');
    const reqPeerIdHash = url.searchParams.get('peer_id_hash');

    if (reqPeerId && Peer.isValidUuid(reqPeerId) && isValidPeerIdHash(reqPeerId, reqPeerIdHash)) {
      this.id = reqPeerId;
      this.isReconnected = true;
    } else {
      this.id = crypto.randomUUID();
      this.isReconnected = false;
    }
    this.peerIdHash = hashPeerId(this.id);
  }

  rateLimitReached(maxRate = 20, windowMs = 5000) {
    if (this.requestRate >= maxRate) {
      return true;
    }
    this.requestRate += 1;
    setTimeout(() => {
      this.requestRate = Math.max(0, this.requestRate - 1);
    }, windowMs);
    return false;
  }

  _parseDeviceInfo(request) {
    const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
    const ua = request.headers['user-agent'] || '';
    const parsedUa = parser(ua);

    this.rtcSupported = url.searchParams.get('webrtc') !== 'false';

    let deviceType = parsedUa.device.type || 'desktop';
    if (!parsedUa.device.type) {
      if (/mobile|android|touch/i.test(ua)) {
        deviceType = 'mobile';
      } else if (/ipad|tablet/i.test(ua)) {
        deviceType = 'tablet';
      }
    }

    const osName = parsedUa.os.name || 'Unknown OS';
    const browserName = parsedUa.browser.name || 'Web Browser';

    let deviceName = `${browserName} on ${osName}`;
    if (parsedUa.device.model) {
      deviceName = `${parsedUa.device.model} (${browserName})`;
    }

    this.name = {
      displayName: generateRandomName(this.id),
      deviceName: deviceName,
      deviceType: deviceType, // 'desktop' | 'mobile' | 'tablet'
      os: osName,
      browser: browserName,
    };
  }

  getInfo() {
    return {
      id: this.id,
      name: this.name,
      rtcSupported: this.rtcSupported,
    };
  }

  static isValidUuid(id) {
    return typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
  }
}

