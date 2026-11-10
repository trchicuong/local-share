/**
 * Persistent Storage wrapper for client preferences, paired devices & auto-accept
 */

const STORAGE_KEYS = {
  DISPLAY_NAME: 'los_display_name',
  ROOM_SECRETS: 'los_room_secrets',
  PAIRED_DEVICES: 'los_paired_devices',
  THEME: 'los_theme',
  VIEW_MODE: 'los_view_mode',
  SOUND_ENABLED: 'los_sound_enabled',
  AUTO_DOWNLOAD: 'los_auto_download',
  LANGUAGE: 'los_language',
};

export const storage = {
  getDisplayName() {
    return localStorage.getItem(STORAGE_KEYS.DISPLAY_NAME) || '';
  },
  setDisplayName(name) {
    if (name) localStorage.setItem(STORAGE_KEYS.DISPLAY_NAME, name);
    else localStorage.removeItem(STORAGE_KEYS.DISPLAY_NAME);
  },

  // --- Paired Devices Management ---
  getPairedDevices() {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.PAIRED_DEVICES);
      let list = data ? JSON.parse(data) : [];

      // Migrate legacy string secrets if any
      const legacySecrets = this._getLegacySecrets();
      for (const secret of legacySecrets) {
        if (!list.some((d) => d.secret === secret)) {
          list.push({
            secret: secret,
            displayName: 'Paired Device',
            deviceName: 'Linked Device',
            deviceType: 'desktop',
            autoAccept: false,
            pairedAt: Date.now(),
          });
        }
      }
      return list;
    } catch (e) {
      return [];
    }
  },

  getPairedDevice(secret) {
    const devices = this.getPairedDevices();
    return devices.find((d) => d.secret === secret) || null;
  },

  savePairedDevice(info) {
    if (!info || !info.secret) return;
    const devices = this.getPairedDevices();
    const existingIndex = devices.findIndex((d) => d.secret === info.secret);

    const deviceEntry = {
      secret: info.secret,
      displayName: info.displayName || info.name?.displayName || 'Paired Device',
      deviceName: info.deviceName || info.name?.deviceName || 'Nearby Device',
      deviceType: info.deviceType || info.name?.deviceType || 'desktop',
      autoAccept: info.autoAccept !== undefined ? Boolean(info.autoAccept) : false,
      pairedAt: info.pairedAt || Date.now(),
    };

    if (existingIndex >= 0) {
      devices[existingIndex] = {
        ...devices[existingIndex],
        ...deviceEntry,
        // Preserve user's autoAccept setting unless explicitly provided
        autoAccept: info.autoAccept !== undefined ? Boolean(info.autoAccept) : devices[existingIndex].autoAccept,
      };
    } else {
      devices.push(deviceEntry);
    }

    localStorage.setItem(STORAGE_KEYS.PAIRED_DEVICES, JSON.stringify(devices));
    localStorage.setItem(STORAGE_KEYS.ROOM_SECRETS, JSON.stringify(devices.map((d) => d.secret)));
  },

  removePairedDevice(secret) {
    const devices = this.getPairedDevices().filter((d) => d.secret !== secret);
    localStorage.setItem(STORAGE_KEYS.PAIRED_DEVICES, JSON.stringify(devices));
    localStorage.setItem(STORAGE_KEYS.ROOM_SECRETS, JSON.stringify(devices.map((d) => d.secret)));
  },

  clearAllPairedDevices() {
    localStorage.removeItem(STORAGE_KEYS.PAIRED_DEVICES);
    localStorage.removeItem(STORAGE_KEYS.ROOM_SECRETS);
  },

  updateAutoAccept(secret, autoAccept) {
    const devices = this.getPairedDevices();
    const dev = devices.find((d) => d.secret === secret);
    if (dev) {
      dev.autoAccept = Boolean(autoAccept);
      localStorage.setItem(STORAGE_KEYS.PAIRED_DEVICES, JSON.stringify(devices));
    }
  },

  isAutoAccept(secret) {
    if (!secret) return false;
    const devices = this.getPairedDevices();
    const dev = devices.find((d) => d.secret === secret);
    return Boolean(dev && dev.autoAccept);
  },

  // Returns array of string secret tokens for WebSocket room subscriptions
  getRoomSecrets() {
    return this.getPairedDevices().map((d) => d.secret);
  },

  saveRoomSecret(secret) {
    this.savePairedDevice({ secret });
  },

  removeRoomSecret(secret) {
    this.removePairedDevice(secret);
  },

  _getLegacySecrets() {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.ROOM_SECRETS);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      return [];
    }
  },

  // --- Preferences ---
  getTheme() {
    return localStorage.getItem(STORAGE_KEYS.THEME) || 'dark';
  },
  setTheme(theme) {
    localStorage.setItem(STORAGE_KEYS.THEME, theme);
  },

  getViewMode() {
    return localStorage.getItem(STORAGE_KEYS.VIEW_MODE) || 'radar';
  },
  setViewMode(mode) {
    localStorage.setItem(STORAGE_KEYS.VIEW_MODE, mode);
  },

  isSoundEnabled() {
    return localStorage.getItem(STORAGE_KEYS.SOUND_ENABLED) !== 'false';
  },
  setSoundEnabled(enabled) {
    localStorage.setItem(STORAGE_KEYS.SOUND_ENABLED, String(enabled));
  },

  isAutoDownload() {
    return localStorage.getItem(STORAGE_KEYS.AUTO_DOWNLOAD) !== 'false';
  },
  setAutoDownload(enabled) {
    localStorage.setItem(STORAGE_KEYS.AUTO_DOWNLOAD, String(Boolean(enabled)));
  },

  getLanguage() {
    const chosen = localStorage.getItem('los_lang_chosen_by_user');
    if (chosen === 'true') {
      return localStorage.getItem(STORAGE_KEYS.LANGUAGE) || 'en';
    }
    return 'en';
  },
  setLanguage(lang, chosenByUser = false) {
    localStorage.setItem(STORAGE_KEYS.LANGUAGE, lang);
    if (chosenByUser) {
      localStorage.setItem('los_lang_chosen_by_user', 'true');
    }
  },
};
