import { storage } from '../../utils/storage.js';
import { signaling } from '../../core/signaling.js';
import { events } from '../../core/events.js';
import { t, getLanguage, setLanguage } from '../../utils/i18n.js';

export class SettingsModal {
  constructor(modalElement) {
    this.modal = modalElement;
  }

  open() {
    this.render();
  }

  render() {
    const currentName = storage.getDisplayName() || signaling.selfName || '';
    const currentMode = storage.getViewMode();
    const soundEnabled = storage.isSoundEnabled();
    const autoDownload = storage.isAutoDownload();
    const pairedCount = storage.getRoomSecrets().length;
    const currentLang = getLanguage();

    this.modal.classList.remove('hidden');
    this.modal.innerHTML = `
      <div class="modal-backdrop"></div>
      <div class="modal-card settings-card">
        <div class="modal-header">
          <h3>${t('settings.title')}</h3>
          <button class="modal-close-btn" id="settings-close">&times;</button>
        </div>

        <div class="settings-group">
          <label class="settings-label">${t('settings.displayName')}</label>
          <div class="settings-input-group">
            <input type="text" id="settings-name-input" class="settings-name-input" value="${currentName}" maxlength="30" placeholder="${t('settings.namePlaceholder')}" />
            <button class="btn btn-primary" id="save-name-btn">${t('settings.saveName')}</button>
          </div>
        </div>

        <div class="settings-group">
          <label class="settings-label">${t('settings.language')}</label>
          <div class="view-mode-tabs language-tabs">
            <button class="tab-btn ${currentLang === 'vi' ? 'active' : ''}" id="lang-vi-btn">Tiếng Việt</button>
            <button class="tab-btn ${currentLang === 'en' ? 'active' : ''}" id="lang-en-btn">English</button>
          </div>
        </div>

        <div class="settings-group">
          <label class="settings-label">${t('header.toggleView')}</label>
          <div class="view-mode-tabs">
            <button class="tab-btn ${currentMode === 'radar' ? 'active' : ''}" id="mode-radar-btn">${t('settings.radarView')}</button>
            <button class="tab-btn ${currentMode === 'grid' ? 'active' : ''}" id="mode-grid-btn">${t('settings.gridView')}</button>
          </div>
        </div>

        <div class="settings-group">
          <div class="settings-row">
            <div class="settings-row-text">
              <span class="settings-row-title">${t('settings.audioNotifications')}</span>
              <span class="settings-row-desc">${t('settings.audioDesc')}</span>
            </div>
            <label class="switch-toggle" for="sound-toggle" title="${t('settings.audioNotifications')}">
              <input type="checkbox" id="sound-toggle" ${soundEnabled ? 'checked' : ''} />
              <span class="switch-slider"></span>
            </label>
          </div>
        </div>

        <div class="settings-group">
          <div class="settings-row">
            <div class="settings-row-text">
              <span class="settings-row-title">${t('settings.autoDownload')}</span>
              <span class="settings-row-desc">${t('settings.autoDownloadDesc')}</span>
            </div>
            <label class="switch-toggle" for="auto-download-toggle" title="${t('settings.autoDownload')}">
              <input type="checkbox" id="auto-download-toggle" ${autoDownload ? 'checked' : ''} />
              <span class="switch-slider"></span>
            </label>
          </div>
        </div>

        <div class="settings-group">
          <div class="settings-row">
            <div class="settings-row-text">
              <span class="settings-row-title">${t('paired.title')}</span>
              <span class="settings-row-desc">${pairedCount === 1 ? t('footer.pairedDeviceSingle') : t('footer.pairedDevicePlural', { count: pairedCount })}</span>
            </div>
            <div class="settings-row-actions">
              <button class="btn btn-secondary btn-sm" id="manage-pairs-btn">${t('settings.managePairs')}</button>
              ${
                pairedCount > 0
                  ? `<button class="btn btn-secondary btn-sm" id="clear-pairs-btn">${t('settings.unpairAll')}</button>`
                  : ''
              }
            </div>
          </div>
        </div>

        <div class="settings-footer">
          <span>${t('footer.createdWith')} <svg class="footer-heart-icon" viewBox="0 0 24 24" width="14" height="14" fill="#ef4444" style="vertical-align: -1px; display: inline-block;"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg> ${t('footer.by')} <strong style="color: #ffffff; font-weight: 600;">trchicuong</strong></span>
        </div>
      </div>
    `;

    document.getElementById('settings-close')?.addEventListener('click', () => this.close());
    this.modal.querySelector('.modal-backdrop')?.addEventListener('click', () => this.close());

    // Language toggle
    document.getElementById('lang-vi-btn')?.addEventListener('click', () => {
      setLanguage('vi', true);
      this.render();
    });
    document.getElementById('lang-en-btn')?.addEventListener('click', () => {
      setLanguage('en', true);
      this.render();
    });

    // Save Name
    const doSaveName = () => {
      const newName = document.getElementById('settings-name-input')?.value?.trim();
      if (newName) {
        storage.setDisplayName(newName);
        signaling.changeDisplayName(newName);
        events.emit('notify', { title: t('settings.nameSaved'), message: newName, type: 'success' });
        this.close();
      }
    };

    document.getElementById('save-name-btn')?.addEventListener('click', doSaveName);
    document.getElementById('settings-name-input')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        doSaveName();
      }
    });

    // View Mode Toggle
    document.getElementById('mode-radar-btn')?.addEventListener('click', () => {
      events.emit('change-view-mode', 'radar');
      this.render();
    });
    document.getElementById('mode-grid-btn')?.addEventListener('click', () => {
      events.emit('change-view-mode', 'grid');
      this.render();
    });

    // Sound toggle
    document.getElementById('sound-toggle')?.addEventListener('change', (e) => {
      storage.setSoundEnabled(e.target.checked);
      if (e.target.checked) {
        window.losApp?.notifications?.playSound();
      }
    });

    // Auto-download toggle
    document.getElementById('auto-download-toggle')?.addEventListener('change', (e) => {
      storage.setAutoDownload(e.target.checked);
      events.emit('notify', {
        title: e.target.checked ? t('toast.autoDownloadEnabled') : t('toast.autoDownloadDisabled'),
        message: e.target.checked
          ? t('toast.autoDownloadEnabledDesc')
          : t('toast.autoDownloadDisabledDesc'),
        type: 'info',
        duration: 2500,
      });
    });

    // Manage paired devices
    document.getElementById('manage-pairs-btn')?.addEventListener('click', () => {
      this.close();
      window.losApp?.pairedDevicesModal?.open();
    });

    // Clear paired devices
    document.getElementById('clear-pairs-btn')?.addEventListener('click', () => {
      const secrets = storage.getRoomSecrets();
      signaling.send({ type: 'delete-room-secrets', secrets });
      storage.clearAllPairedDevices();
      events.emit('pair-updated');
      events.emit('notify', {
        title: t('toast.clearedPairsTitle'),
        message: t('toast.clearedPairsDesc'),
        type: 'info',
      });
      this.close();
    });
  }

  close() {
    this.modal.classList.add('hidden');
    this.modal.innerHTML = '';
  }
}
