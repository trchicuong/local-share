import { events } from '../core/events.js';
import { storage } from '../utils/storage.js';
import { t, getLanguage } from '../utils/i18n.js';

const TOAST_ICONS = {
  success: `<svg class="toast-icon-svg" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clip-rule="evenodd" /></svg>`,
  error: `<svg class="toast-icon-svg" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z" clip-rule="evenodd" /></svg>`,
  info: `<svg class="toast-icon-svg" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.247.25v3.25a.75.75 0 001.5 0v-3.25A1.75 1.75 0 009.253 9H9z" clip-rule="evenodd" /></svg>`,
};

export class Notifications {
  constructor(containerElement) {
    this.container = containerElement;
    this.audio = new Audio('/sounds/blop.mp3');

    events.on('notify', (data) => this.show(data));
    events.on('incoming-transfer-request', () => this.playSound());
    events.on('transfer-completed', (data) => {
      this.playSound();
      if (data.type === 'receive') {
        const count = data.files?.length || 1;
        const msg =
          count > 1
            ? t('toast.filesReceived', { count })
            : data.file?.name || data.files?.[0]?.name || t('toast.fileReceived');
        this.show({
          title: t('hud.completed'),
          message: msg,
          type: 'success',
        });
      } else {
        const count = data.filesCount || 1;
        this.show({
          title: t('hud.completed'),
          message: count > 1 ? t('toast.filesSent', { count }) : t('toast.fileSent'),
          type: 'success',
        });
      }
    });

    events.on('transfer-declined', (data) => {
      const isDefaultReason =
        !data?.reason || data.reason === 'Rejected by user' || data.reason === 'User declined';
      this.show({
        title: t('toast.transferDeclined'),
        message: isDefaultReason ? t('toast.declinedByRecipient') : data.reason,
        type: 'error',
      });
    });

    events.on('transfer-error', (err) => {
      this.show({
        title: t('toast.transferError'),
        message: t('toast.connectionLost'),
        type: 'error',
      });
    });
  }

  playSound() {
    if (storage.isSoundEnabled()) {
      this.audio.play().catch(() => {});
    }
  }

  show({ title, message, type = 'info', duration = 3500 }) {
    const toast = document.createElement('div');
    toast.className = `toast-pill ${type}`;
    const iconSvg = TOAST_ICONS[type] || TOAST_ICONS.info;

    toast.innerHTML = `
      <div class="toast-icon-wrapper ${type}">
        ${iconSvg}
      </div>
      <div class="toast-content">
        <span class="toast-title">${title}</span>
        ${message ? `<span class="toast-sep">&bull;</span><span class="toast-desc" title="${message}">${message}</span>` : ''}
      </div>
    `;

    this.container.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('fade-out');
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }
}

