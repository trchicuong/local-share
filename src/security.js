/**
 * Security utilities for sanitizing user input and preventing XSS attacks
 * @module security
 */

/**
 * Sanitize HTML string to prevent XSS attacks
 * @param {string} html - Raw HTML string
 * @returns {string} - Sanitized HTML
 */
export function sanitizeHTML(html) {
  if (!html || typeof html !== 'string') return '';

  const tempDiv = document.createElement('div');
  tempDiv.textContent = html; // This escapes all HTML tags
  return tempDiv.innerHTML;
}

/**
 * Sanitize Markdown content before rendering
 * Removes dangerous HTML tags and attributes
 * @param {string} markdown - Markdown content
 * @returns {string} - Sanitized markdown
 */
export function sanitizeMarkdown(markdown) {
  if (!markdown || typeof markdown !== 'string') return '';

  // Remove script tags and their content
  let sanitized = markdown.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');

  // Remove on* event handlers (onclick, onload, etc.)
  sanitized = sanitized.replace(/\son\w+\s*=\s*["'][^"']*["']/gi, '');

  // Remove javascript: protocol in links
  sanitized = sanitized.replace(/javascript:/gi, '');

  // Remove data: URLs (can contain embedded scripts)
  sanitized = sanitized.replace(/data:text\/html/gi, '');

  // Remove iframe tags
  sanitized = sanitized.replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '');

  // Remove object and embed tags
  sanitized = sanitized.replace(/<(object|embed)\b[^<]*(?:(?!<\/\1>)<[^<]*)*<\/\1>/gi, '');

  return sanitized;
}

/**
 * Validate and sanitize SVG content
 * @param {string} svgContent - SVG string content
 * @returns {string|null} - Sanitized SVG or null if invalid
 */
export function sanitizeSVG(svgContent) {
  if (!svgContent || typeof svgContent !== 'string') return null;

  // Remove script tags from SVG
  let sanitized = svgContent.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');

  // Remove on* event handlers
  sanitized = sanitized.replace(/\son\w+\s*=\s*["'][^"']*["']/gi, '');

  // Remove xlink:href with javascript:
  sanitized = sanitized.replace(/xlink:href\s*=\s*["']javascript:[^"']*["']/gi, '');

  // Check if it's valid SVG
  if (!sanitized.includes('<svg')) return null;

  return sanitized;
}

/**
 * Sanitize filename to prevent path traversal and special character issues
 * @param {string} filename - Original filename
 * @returns {string} - Sanitized filename
 */
export function sanitizeFilename(filename) {
  if (!filename || typeof filename !== 'string') {
    return 'unnamed_file';
  }

  // Remove or replace dangerous characters
  let sanitized = filename
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_') // Replace illegal chars
    .replace(/^\.+/, '') // Remove leading dots
    .replace(/\.{2,}/g, '.') // Replace multiple dots with single dot
    .trim();

  // Prevent path traversal
  sanitized = sanitized.split(/[/\\]/).pop() || 'unnamed_file';

  // Limit length (255 chars for most filesystems)
  if (sanitized.length > 255) {
    const parts = sanitized.split('.');
    const ext = parts.length > 1 ? parts.pop() : '';
    const nameWithoutExt = parts.join('.');
    const maxNameLength = 255 - (ext ? ext.length + 1 : 0);
    sanitized = nameWithoutExt.slice(0, maxNameLength) + (ext ? '.' + ext : '');
  }

  // Ensure not empty after sanitization
  if (!sanitized || sanitized === '') {
    sanitized = 'unnamed_file';
  }

  return sanitized;
}

/**
 * Create a safe Blob URL with automatic cleanup
 * @param {Blob} blob - File blob
 * @param {number} autoCleanupMs - Auto cleanup after milliseconds (default: 5 minutes)
 * @returns {string} - Blob URL
 */
export function createSafeBlobURL(blob, autoCleanupMs = 300000) {
  const url = URL.createObjectURL(blob);

  // Auto cleanup after specified time to prevent memory leaks
  setTimeout(() => {
    try {
      URL.revokeObjectURL(url);
      console.log(`[Security] Auto-revoked blob URL: ${url.substring(0, 50)}...`);
    } catch (err) {
      console.warn('[Security] Failed to revoke blob URL:', err);
    }
  }, autoCleanupMs);

  return url;
}

/**
 * Validate file type against allowed MIME types
 * @param {File} file - File object
 * @param {string[]} allowedTypes - Array of allowed MIME types (wildcards supported: "image/*")
 * @returns {boolean} - True if file type is allowed
 */
export function validateFileType(file, allowedTypes = []) {
  if (!file || !file.type) return false;
  if (allowedTypes.length === 0) return true; // No restrictions

  const fileType = file.type.toLowerCase();

  return allowedTypes.some((allowed) => {
    const pattern = allowed.toLowerCase().replace('*', '.*');
    const regex = new RegExp(`^${pattern}$`);
    return regex.test(fileType);
  });
}

/**
 * Sanitize text content for safe display
 * @param {string} text - Text content
 * @param {number} maxLength - Maximum length (default: 10000)
 * @returns {string} - Sanitized text
 */
export function sanitizeText(text, maxLength = 10000) {
  if (!text || typeof text !== 'string') return '';

  // Truncate if too long
  let sanitized = text.length > maxLength ? text.substring(0, maxLength) + '...' : text;

  // Escape HTML entities
  const div = document.createElement('div');
  div.textContent = sanitized;

  return div.innerHTML;
}

/**
 * Check if content contains potentially malicious patterns
 * @param {string} content - Content to check
 * @returns {object} - { safe: boolean, reason: string }
 */
export function detectMaliciousContent(content) {
  if (!content || typeof content !== 'string') {
    return { safe: true, reason: '' };
  }

  const patterns = [
    {
      regex: /<script[\s\S]*?>[\s\S]*?<\/script>/gi,
      reason: 'Script tags detected',
    },
    {
      regex: /javascript:/gi,
      reason: 'JavaScript protocol detected',
    },
    {
      regex: /on\w+\s*=\s*["'][^"']*["']/gi,
      reason: 'Event handler attributes detected',
    },
    {
      regex: /data:text\/html/gi,
      reason: 'Data URI with HTML detected',
    },
    {
      regex: /<iframe/gi,
      reason: 'Iframe tags detected',
    },
  ];

  for (const pattern of patterns) {
    if (pattern.regex.test(content)) {
      return { safe: false, reason: pattern.reason };
    }
  }

  return { safe: true, reason: '' };
}

/**
 * Safe DOM element creation with attributes
 * @param {string} tagName - HTML tag name
 * @param {object} attributes - Element attributes
 * @param {string|HTMLElement} content - Element content
 * @returns {HTMLElement} - Created element
 */
export function createSafeElement(tagName, attributes = {}, content = '') {
  const element = document.createElement(tagName);

  // Set attributes safely
  for (const [key, value] of Object.entries(attributes)) {
    // Prevent setting dangerous attributes
    if (key.startsWith('on') || (key === 'href' && value.startsWith('javascript:'))) {
      console.warn(`[Security] Blocked dangerous attribute: ${key}=${value}`);
      continue;
    }
    element.setAttribute(key, value);
  }

  // Set content safely
  if (typeof content === 'string') {
    element.textContent = content;
  } else if (content instanceof HTMLElement) {
    element.appendChild(content);
  }

  return element;
}
