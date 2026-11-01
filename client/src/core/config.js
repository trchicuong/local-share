/**
 * Client Configuration & Constants
 */
export const CONFIG = {
  CHUNK_SIZE: 64 * 1024, // 64 KB per WebRTC packet
  PARTITION_SIZE: 1024 * 1024, // 1 MB per backpressure partition
  MAX_PARTITION_CHUNKS: 16,

  // Signaling URL
  getSignalingUrl() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    // In dev with Vite port 5173, connect to backend at port 3000
    if (window.location.port === '5173') {
      return `${protocol}//${window.location.hostname}:3000`;
    }
    return `${protocol}//${window.location.host}`;
  },

  DEFAULT_RTC_CONFIG: {
    sdpSemantics: 'unified-plan',
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:global.stun.twilio.com:3478' },
    ],
  },

  PREVIEW_TYPES: {
    image: /\.(jpe?g|png|gif|webp|svg|bmp|ico)$/i,
    video: /\.(mp4|webm|mov|mkv|ogg)$/i,
    audio: /\.(mp3|wav|ogg|m4a|aac|flac)$/i,
    text: /\.(txt|md|json|js|ts|html|css|py|sh|csv|xml|log|yaml|yml)$/i,
    pdf: /\.pdf$/i,
  },
};

