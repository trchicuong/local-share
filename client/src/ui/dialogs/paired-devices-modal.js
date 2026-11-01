import { storage } from '../../utils/storage.js';
import { signaling } from '../../core/signaling.js';
import { events } from '../../core/events.js';
import { getDeviceIcon } from '../../utils/device.js';
import { t, getLanguage } from '../../utils/i18n.js';

export class PairedDevicesModal {
  constructor(modalElement) {
    this.modal = modalElement;

    events.on('pair-updated', () => {
      if (!this.modal.classList.contains('hidden') && this.isOpen) {
        this.render();
      }
    });

    events.on('peers-state-updated', () => {
      if (!this.modal.classList.contains('hidden') && this.isOpen) {
        this.render();
      }
    });

    events.on('secret-room-deleted', (secret) => {
      storage.removePairedDevice(secret);
      events.emit('pair-updated');
    });

    events.on('language-changed', () => {
      if (!this.modal.classList.contains('hidden') && this.isOpen) {
        this.render();
      }
    });
  }

  open() {
    this.isOpen = true;
    this.modal.classList.remove('hidden');
    this.render();
  }

  render() {
    const devices = storage.getPairedDevices();
    // Check which devices are currently online in peersView
    const activePeers = window.losApp?.peersView?.peers || new Map();
    const onlineSecrets = new Set();
    for (const [id, peer] of activePeers) {
      if (peer.secret) {
        onlineSecrets.add(peer.secret);
      }
      for (const d of devices) {
        if (d.secret === peer.secret || (peer.name?.displayName && d.displayName === peer.name.displayName)) {
          onlineSecrets.add(d.secret);
        }
      }
    }

    let devicesHtml = '';
    if (devices.length === 0) {
      devicesHtml = `
        <div class="paired-empty-box">
          <p class="pair-instructions">${t('paired.empty')}</p>
          <small style="color:var(--text-muted); display:block; margin-top:4px;">
            ${t('paired.emptyHelp')}
          </small>
        </div>
      `;
    } else {
      devicesHtml = devices
        .map((device) => {
          const isOnline = onlineSecrets.has(device.secret);
          const iconSvg = getDeviceIcon(device.deviceType);
          const statusHtml = isOnline
            ? `<span class="peer-status-tag online"><span class="status-dot"></span> ${t('badges.online')}</span>`
            : `<span class="peer-status-tag offline">${t('badges.saved')}</span>`;

          return `
            <div class="paired-device-card" data-secret="${device.secret}">
              <div class="paired-card-main">
                <div class="paired-card-icon">${iconSvg}</div>
                <div class="paired-card-info">
                  <div class="paired-card-title-row">
                    <span class="paired-display-name">${device.displayName}</span>
                    ${statusHtml}
                  </div>
                  <div class="paired-device-meta">${device.deviceName}</div>
                </div>
              </div>

              <div class="paired-card-controls">
                <label class="auto-accept-toggle" title="${t('paired.autoAccept')}">
                  <span class="toggle-text">${t('paired.autoAccept')}</span>
                  <span class="switch-toggle switch-sm">
                    <input type="checkbox" class="auto-accept-chk" ${device.autoAccept ? 'checked' : ''} data-secret="${device.secret}" />
                    <span class="switch-slider"></span>
                  </span>
                </label>
                <button class="btn btn-secondary btn-sm unpair-single-btn" data-secret="${device.secret}" title="${t('paired.unpair')}">${t('paired.unpair')}</button>
              </div>
            </div>
          `;
        })
        .join('');
    }

    this.modal.innerHTML = `
      <div class="modal-backdrop"></div>
      <div class="modal-card paired-manager-card">
        <div class="modal-header">
          <h3>${t('paired.title')}</h3>
          <button class="modal-close-btn" id="paired-modal-close">&times;</button>
        </div>

        <p class="pair-instructions" style="font-size:0.83rem; margin-bottom:12px;">
          ${t('paired.desc')}
        </p>

        <div class="paired-devices-scrollbox">
          ${devicesHtml}
        </div>

        <div class="paired-modal-actions">
          <button class="btn btn-primary" id="btn-open-pair-flow">${t('paired.pairNew')}</button>
          <button class="btn btn-secondary" id="btn-close-paired-mgr">${t('paired.close')}</button>
        </div>
      </div>
    `;

    document.getElementById('paired-modal-close')?.addEventListener('click', () => this.close());
    document.getElementById('btn-close-paired-mgr')?.addEventListener('click', () => this.close());
    this.modal.querySelector('.modal-backdrop')?.addEventListener('click', () => this.close());

    // Switch to pair new device flow
    document.getElementById('btn-open-pair-flow')?.addEventListener('click', () => {
      this.close();
      window.losApp?.pairModal?.open();
    });

    // Auto-accept checkbox changes
    const toggles = this.modal.querySelectorAll('.auto-accept-chk');
    toggles.forEach((chk) => {
      chk.addEventListener('change', (e) => {
        const secret = chk.dataset.secret;
        if (secret) {
          storage.updateAutoAccept(secret, e.target.checked);
          events.emit('notify', {
            title: t('paired.autoAccept'),
            message: e.target.checked
              ? (getLanguage() === 'vi' ? 'Đã bật tự động nhận file cho thiết bị này.' : 'Auto-Accept enabled for this device.')
              : (getLanguage() === 'vi' ? 'Đã tắt tự động nhận file cho thiết bị này.' : 'Auto-Accept disabled for this device.'),
            type: 'info',
            duration: 2000,
          });
        }
      });
    });

    // Unpair single device
    const unpairBtns = this.modal.querySelectorAll('.unpair-single-btn');
    unpairBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const secret = btn.dataset.secret;
        if (secret) {
          signaling.send({ type: 'delete-room-secrets', secrets: [secret] });
          storage.removePairedDevice(secret);
          events.emit('pair-updated');
          events.emit('notify', {
            title: t('paired.unpair'),
            message: t('paired.unpairedSuccess'),
            type: 'info',
          });
          this.render();
        }
      });
    });
  }

  close() {
    this.isOpen = false;
    this.modal.classList.add('hidden');
    this.modal.innerHTML = '';
  }
}
