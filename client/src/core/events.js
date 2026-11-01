/**
 * Lightweight Event Emitter for LoS
 */
export class EventEmitter {
  constructor() {
    this._events = new Map();
  }

  on(event, listener) {
    if (!this._events.has(event)) {
      this._events.set(event, new Set());
    }
    this._events.get(event).add(listener);
    return () => this.off(event, listener);
  }

  once(event, listener) {
    const wrapper = (...args) => {
      this.off(event, wrapper);
      listener(...args);
    };
    return this.on(event, wrapper);
  }

  off(event, listener) {
    const listeners = this._events.get(event);
    if (listeners) {
      listeners.delete(listener);
      if (listeners.size === 0) {
        this._events.delete(event);
      }
    }
  }

  emit(event, ...args) {
    const listeners = this._events.get(event);
    if (listeners) {
      for (const listener of listeners) {
        try {
          listener(...args);
        } catch (err) {
          console.error(`[Event Error: ${event}]`, err);
        }
      }
    }
  }
}

export const events = new EventEmitter();

