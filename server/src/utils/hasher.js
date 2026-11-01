import crypto from 'crypto';

/**
 * 53-bit cyrb53 string hashing function
 */
export function cyrb53(str, seed = 0) {
  let h1 = 0xdeadbeef ^ seed,
    h2 = 0x41c6ce57 ^ seed;
  for (let i = 0, ch; i < str.length; i++) {
    ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

/**
 * Hash a string with sha256
 */
export function sha256(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

const SERVER_SALT = 'los_secret_salt_v3';

/**
 * Hash peer ID with server salt to prevent client ID spoofing
 */
export function hashPeerId(peerId) {
  return sha256(`${peerId}:${SERVER_SALT}`);
}

/**
 * Verify whether client-provided peerIdHash matches the peerId
 */
export function isValidPeerIdHash(peerId, hash) {
  return Boolean(peerId && hash && hashPeerId(peerId) === hash);
}

/**
 * Generate a cryptographically secure random pairing code (e.g., 6 digits: 839201)
 */
export function generatePairPin() {
  return crypto.randomInt(100000, 999999).toString();
}

/**
 * Generate random hex token
 */
export function generateToken(bytes = 16) {
  return crypto.randomBytes(bytes).toString('hex');
}

