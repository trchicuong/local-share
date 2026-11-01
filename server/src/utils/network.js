/**
 * Network and IP detection utilities for Local Share (LoS)
 */

export function getClientIP(request) {
  let ip = '';
  if (request.headers['cf-connecting-ip']) {
    ip = request.headers['cf-connecting-ip'].split(/\s*,\s*/)[0];
  } else if (request.headers['x-forwarded-for']) {
    ip = request.headers['x-forwarded-for'].split(/\s*,\s*/)[0];
  } else {
    ip = request.socket.remoteAddress || '';
  }

  // Remove IPv4-mapped IPv6 prefix (e.g. ::ffff:192.168.1.5 -> 192.168.1.5)
  if (ip.startsWith('::ffff:')) {
    ip = ip.substring(7);
  }

  return ip.trim();
}

/**
 * Checks whether an IP address belongs to a private network (RFC 1918 / ULA)
 */
export function isPrivateIP(ip) {
  if (!ip) return false;

  // Localhost
  if (ip === '127.0.0.1' || ip === '::1' || ip === 'localhost') {
    return true;
  }

  // IPv4 Private Ranges
  if (!ip.includes(':')) {
    // 10.0.0.0 - 10.255.255.255
    if (/^10\./.test(ip)) return true;
    // 172.16.0.0 - 172.31.255.255
    if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(ip)) return true;
    // 192.168.0.0 - 192.168.255.255
    if (/^192\.168\./.test(ip)) return true;
    // Link-local 169.254.0.0 - 169.254.255.255
    if (/^169\.254\./.test(ip)) return true;
    return false;
  }

  // IPv6 Private & Local Ranges
  const firstBlock = (ip.split(':')[0] || '').toLowerCase();
  // Unique Local Address (fc00::/7 -> fc00 to fdff)
  if (/^f[cd][0-9a-f]{2}$/.test(firstBlock)) return true;
  // Link Local (fe80::/10 -> fe80 to febf)
  if (/^fe[89ab][0-9a-f]{2}$/.test(firstBlock)) return true;
  // Site Local (deprecated fec0::/10)
  if (/^fe[c-f][0-9a-f]{2}$/.test(firstBlock)) return true;

  return false;
}

/**
 * Normalizes client IP for room clustering:
 * All private LAN clients share the same '127.0.0.1' room on self-hosted instances.
 */
export function normalizeIP(ip, conf = {}) {
  let normalized = ip;

  if (conf.ipv6Localize && normalized.includes(':')) {
    normalized = normalized.split(':', conf.ipv6Localize).join(':');
  }

  // Put all peers on the local private network (LAN/Wi-Fi) into the exact same room
  if (isPrivateIP(normalized)) {
    return '127.0.0.1';
  }

  return normalized;
}

