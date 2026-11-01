import dotenv from 'dotenv';
import fs from 'fs';
dotenv.config();

const rtcConfigEnv = process.env.RTC_CONFIG;
let parsedRtcConfig = {
  sdpSemantics: 'unified-plan',
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:global.stun.twilio.com:3478' }
  ]
};

if (rtcConfigEnv && rtcConfigEnv !== 'false') {
  try {
    if (fs.existsSync(rtcConfigEnv)) {
      parsedRtcConfig = JSON.parse(fs.readFileSync(rtcConfigEnv, 'utf8'));
    } else {
      parsedRtcConfig = JSON.parse(rtcConfigEnv);
    }
  } catch (err) {
    console.warn('[Config] Failed to parse custom RTC_CONFIG, using default STUN servers:', err.message);
  }
}

export const CONFIG = {
  port: parseInt(process.env.PORT, 10) || 3000,
  host: process.env.HOST || '0.0.0.0',
  nodeEnv: process.env.NODE_ENV || 'development',
  debugMode: process.env.DEBUG_MODE === 'true',
  wsFallback: process.env.WS_FALLBACK !== 'false', // Default enabled
  rtcConfig: parsedRtcConfig,
  signalingServer: process.env.SIGNALING_SERVER || false,
  ipv6Localize: parseInt(process.env.IPV6_LOCALIZE, 10) || false,
  rateLimit: process.env.RATE_LIMIT === 'true' ? 5 : parseInt(process.env.RATE_LIMIT, 10) || false,
  maxConnections: parseInt(process.env.MAX_CONNECTIONS, 10) || 200,
  heartbeatInterval: parseInt(process.env.HEARTBEAT_INTERVAL, 10) || 20000,
  connectionTimeout: parseInt(process.env.CONNECTION_TIMEOUT, 10) || 35000,
};

