/**
 * Formatting & Sanitization Utilities
 */

export function formatBytes(bytes, decimals = 1) {
  if (!bytes || bytes <= 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

export function formatSpeed(bytesPerSecond) {
  if (!bytesPerSecond || bytesPerSecond <= 0) return '0 KB/s';
  return `${formatBytes(bytesPerSecond, 1)}/s`;
}

export function formatTime(seconds) {
  if (!seconds || seconds <= 0 || !isFinite(seconds)) return '--';
  const s = Math.round(seconds);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const remS = s % 60;
  if (m < 60) return `${m}m ${remS}s`;
  const h = Math.floor(m / 60);
  const remM = m % 60;
  return `${h}h ${remM}m`;
}

export function sanitizeFilename(name) {
  if (!name || typeof name !== 'string') return 'unnamed_file';
  // Remove dangerous path traversals and control characters
  return name
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .replace(/^\.+/, '')
    .trim()
    .substring(0, 255) || 'unnamed_file';
}

export async function copyToClipboard(text) {
  const value = String(text ?? '');
  if (!value) return false;

  if (
    typeof navigator !== 'undefined' &&
    navigator.clipboard &&
    typeof navigator.clipboard.writeText === 'function' &&
    typeof window !== 'undefined' &&
    window.isSecureContext
  ) {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch (_) {
      // Fall back to execCommand below
    }
  }

  if (typeof document === 'undefined' || !document.body) return false;

  const ta = document.createElement('textarea');
  ta.value = value;
  ta.setAttribute('readonly', '');
  ta.style.position = 'fixed';
  ta.style.top = '0';
  ta.style.left = '-9999px';
  ta.style.opacity = '0';
  ta.style.fontSize = '16px';
  ta.style.userSelect = 'text';
  ta.style.webkitUserSelect = 'text';

  document.body.appendChild(ta);
  try {
    ta.focus();
    ta.select();
    ta.setSelectionRange(0, value.length);
    return document.execCommand('copy');
  } catch (_) {
    return false;
  } finally {
    if (document.body.contains(ta)) {
      document.body.removeChild(ta);
    }
  }
}

