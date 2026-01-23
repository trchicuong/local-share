/**
 * Resource cleanup utilities to prevent memory leaks
 * @module cleanup
 */

/**
 * Manages intervals with automatic cleanup
 * @class IntervalManager
 */
export class IntervalManager {
  constructor() {
    this.intervals = new Map();
  }

  /**
   * Set an interval with automatic tracking
   * @param {Function} callback - Function to execute
   * @param {number} delay - Delay in milliseconds
   * @param {string} name - Identifier for this interval
   * @returns {number} - Interval ID
   */
  set(callback, delay, name = null) {
    const id = setInterval(callback, delay);
    const key = name || id;
    this.intervals.set(key, id);
    console.log(`[IntervalManager] Started interval: ${key}`);
    return id;
  }

  /**
   * Clear a specific interval
   * @param {string|number} key - Interval name or ID
   */
  clear(key) {
    const id = this.intervals.get(key) || key;
    if (id) {
      clearInterval(id);
      this.intervals.delete(key);
      console.log(`[IntervalManager] Cleared interval: ${key}`);
    }
  }

  /**
   * Clear all managed intervals
   */
  clearAll() {
    console.log(`[IntervalManager] Clearing ${this.intervals.size} intervals`);
    for (const [key, id] of this.intervals.entries()) {
      clearInterval(id);
      console.log(`[IntervalManager] Cleared: ${key}`);
    }
    this.intervals.clear();
  }

  /**
   * Get count of active intervals
   * @returns {number}
   */
  count() {
    return this.intervals.size;
  }
}

/**
 * Manages timeouts with automatic cleanup
 * @class TimeoutManager
 */
export class TimeoutManager {
  constructor() {
    this.timeouts = new Map();
  }

  /**
   * Set a timeout with automatic tracking
   * @param {Function} callback - Function to execute
   * @param {number} delay - Delay in milliseconds
   * @param {string} name - Identifier for this timeout
   * @returns {number} - Timeout ID
   */
  set(callback, delay, name = null) {
    const id = setTimeout(() => {
      callback();
      // Auto-remove after execution
      const key = name || id;
      this.timeouts.delete(key);
    }, delay);
    const key = name || id;
    this.timeouts.set(key, id);
    return id;
  }

  /**
   * Clear a specific timeout
   * @param {string|number} key - Timeout name or ID
   */
  clear(key) {
    const id = this.timeouts.get(key) || key;
    if (id) {
      clearTimeout(id);
      this.timeouts.delete(key);
    }
  }

  /**
   * Clear all managed timeouts
   */
  clearAll() {
    console.log(`[TimeoutManager] Clearing ${this.timeouts.size} timeouts`);
    for (const id of this.timeouts.values()) {
      clearTimeout(id);
    }
    this.timeouts.clear();
  }

  /**
   * Get count of active timeouts
   * @returns {number}
   */
  count() {
    return this.timeouts.size;
  }
}

/**
 * Manages event listeners with automatic cleanup
 * @class EventListenerManager
 */
export class EventListenerManager {
  constructor() {
    this.listeners = [];
  }

  /**
   * Add an event listener with tracking
   * @param {EventTarget} element - DOM element or EventTarget
   * @param {string} event - Event name
   * @param {Function} handler - Event handler function
   * @param {object} options - Event listener options
   * @returns {Function} - Cleanup function
   */
  add(element, event, handler, options = null) {
    if (!element || !event || !handler) {
      console.warn('[EventListenerManager] Invalid parameters for addEventListener');
      return () => {};
    }

    element.addEventListener(event, handler, options);
    this.listeners.push({ element, event, handler, options });

    // Return cleanup function
    return () => this.remove(element, event, handler);
  }

  /**
   * Remove a specific event listener
   * @param {EventTarget} element - DOM element
   * @param {string} event - Event name
   * @param {Function} handler - Event handler function
   */
  remove(element, event, handler) {
    const index = this.listeners.findIndex(
      (l) => l.element === element && l.event === event && l.handler === handler,
    );

    if (index !== -1) {
      const listener = this.listeners[index];
      element.removeEventListener(event, handler, listener.options);
      this.listeners.splice(index, 1);
    }
  }

  /**
   * Remove all managed event listeners
   */
  removeAll() {
    console.log(`[EventListenerManager] Removing ${this.listeners.length} event listeners`);
    for (const { element, event, handler, options } of this.listeners) {
      try {
        element.removeEventListener(event, handler, options);
      } catch (err) {
        console.warn('[EventListenerManager] Error removing listener:', err);
      }
    }
    this.listeners = [];
  }

  /**
   * Get count of active listeners
   * @returns {number}
   */
  count() {
    return this.listeners.length;
  }
}

/**
 * Manages Blob URLs with automatic cleanup
 * @class BlobURLManager
 */
export class BlobURLManager {
  constructor() {
    this.urls = new Map();
  }

  /**
   * Create and track a Blob URL
   * @param {Blob} blob - Blob object
   * @param {string} name - Identifier for this URL
   * @param {number} autoCleanupMs - Auto cleanup after milliseconds (0 = no auto cleanup)
   * @returns {string} - Blob URL
   */
  create(blob, name = null, autoCleanupMs = 0) {
    const url = URL.createObjectURL(blob);
    const key = name || url;
    this.urls.set(key, url);

    if (autoCleanupMs > 0) {
      setTimeout(() => this.revoke(key), autoCleanupMs);
    }

    return url;
  }

  /**
   * Revoke a specific Blob URL
   * @param {string} key - URL identifier or the URL itself
   */
  revoke(key) {
    const url = this.urls.get(key) || key;
    if (url) {
      try {
        URL.revokeObjectURL(url);
        this.urls.delete(key);
        console.log(`[BlobURLManager] Revoked URL: ${url.substring(0, 50)}...`);
      } catch (err) {
        console.warn('[BlobURLManager] Error revoking URL:', err);
      }
    }
  }

  /**
   * Revoke all managed Blob URLs
   */
  revokeAll() {
    console.log(`[BlobURLManager] Revoking ${this.urls.size} Blob URLs`);
    for (const [key, url] of this.urls.entries()) {
      try {
        URL.revokeObjectURL(url);
      } catch (err) {
        console.warn(`[BlobURLManager] Error revoking ${key}:`, err);
      }
    }
    this.urls.clear();
  }

  /**
   * Get count of active URLs
   * @returns {number}
   */
  count() {
    return this.urls.size;
  }
}

/**
 * Main cleanup coordinator
 * @class CleanupManager
 */
export class CleanupManager {
  constructor() {
    this.intervals = new IntervalManager();
    this.timeouts = new TimeoutManager();
    this.listeners = new EventListenerManager();
    this.blobURLs = new BlobURLManager();
    this.customCleanupFunctions = [];
  }

  /**
   * Register a custom cleanup function
   * @param {Function} cleanupFn - Cleanup function to register
   * @param {string} name - Identifier for this cleanup function
   */
  registerCleanup(cleanupFn, name = 'anonymous') {
    if (typeof cleanupFn !== 'function') {
      console.warn('[CleanupManager] Invalid cleanup function');
      return;
    }
    this.customCleanupFunctions.push({ fn: cleanupFn, name });
  }

  /**
   * Execute all cleanup operations
   */
  cleanupAll() {
    console.log('[CleanupManager] Starting full cleanup...');

    // Clear intervals
    this.intervals.clearAll();

    // Clear timeouts
    this.timeouts.clearAll();

    // Remove event listeners
    this.listeners.removeAll();

    // Revoke Blob URLs
    this.blobURLs.revokeAll();

    // Execute custom cleanup functions
    console.log(
      `[CleanupManager] Executing ${this.customCleanupFunctions.length} custom cleanup functions`,
    );
    for (const { fn, name } of this.customCleanupFunctions) {
      try {
        fn();
        console.log(`[CleanupManager] Executed cleanup: ${name}`);
      } catch (err) {
        console.error(`[CleanupManager] Error in cleanup function ${name}:`, err);
      }
    }
    this.customCleanupFunctions = [];

    console.log('[CleanupManager] Cleanup complete');
  }

  /**
   * Get cleanup status
   * @returns {object} - Status of all managed resources
   */
  getStatus() {
    return {
      intervals: this.intervals.count(),
      timeouts: this.timeouts.count(),
      listeners: this.listeners.count(),
      blobURLs: this.blobURLs.count(),
      customCleanups: this.customCleanupFunctions.length,
    };
  }
}

// Create singleton instance
export const cleanupManager = new CleanupManager();

// Auto-cleanup on page unload
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    cleanupManager.cleanupAll();
  });

  // Also cleanup on visibility change (tab close, etc.)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      console.log('[CleanupManager] Page hidden, performing cleanup');
      cleanupManager.cleanupAll();
    }
  });
}
