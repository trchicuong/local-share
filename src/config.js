export const ENV = {
  SIGNALING_SERVER_URL:
    window.SIGNALING_SERVER_URL ||
    import.meta.env.VITE_SIGNALING_SERVER_URL ||
    'ws://localhost:8080',
  RTC_CONFIG: {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:global.stun.twilio.com:3478' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:stun3.l.google.com:19302' },
      { urls: 'stun:stun4.l.google.com:19302' },
    ],
  },
  MAX_FILE_SIZE: 2 * 1024 * 1024 * 1024,
  CHUNK_SIZE: 64 * 1024,
  CONNECTION_TIMEOUT: 30000,
  HEARTBEAT_INTERVAL: 30000,
  SUPPORTED_PREVIEW_FORMATS: {
    image: /\.(jpeg|jpg|gif|png|webp|svg|bmp|ico)$/i,
    video: /\.(mp4|webm|mov|ogv|avi|mkv|m4v)$/i,
    audio: /\.(mp3|wav|ogg|m4a|aac|flac|wma)$/i,
    pdf: /\.(pdf)$/i,
    text: /\.(txt|md|json|xml|csv|log|yaml|yml)$/i,
  },
};
