/**
 * Screen Wake Lock utility to prevent mobile phones from sleeping during transfers
 */
class NoSleepManager {
  constructor() {
    this._wakeLock = null;
  }

  async enable() {
    if ('wakeLock' in navigator) {
      try {
        if (!this._wakeLock) {
          this._wakeLock = await navigator.wakeLock.request('screen');
          this._wakeLock.addEventListener('release', () => {
            this._wakeLock = null;
          });
        }
      } catch (err) {
        // May fail if tab in background
      }
    }
  }

  disable() {
    if (this._wakeLock) {
      this._wakeLock.release().catch(() => {});
      this._wakeLock = null;
    }
  }
}

export const noSleep = new NoSleepManager();

