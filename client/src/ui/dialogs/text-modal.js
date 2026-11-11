import { transferManager } from '../../core/transfer-manager.js';
import { events } from '../../core/events.js';
import { t } from '../../utils/i18n.js';

export class TextModal {
  constructor(modalElement) {
    this.modal = modalElement;
    this.targetPeer = null;

    events.on('open-text-modal', (peer) => this.open(peer));
    events.on('text-received', (sender, text) => this.showReceivedText(sender, text));
    events.on('peer-updated', (peer) => {
      if (this.targetPeer && this.targetPeer.id === peer.id && !this.modal.classList.contains('hidden')) {
        this.targetPeer = { ...this.targetPeer, ...peer };
        const headerEl = this.modal.querySelector('.modal-header h3');
        if (headerEl) {
          headerEl.textContent = t('message.title', { name: this.targetPeer.name?.displayName || t('pair.deviceFallback') });
        }
      }
    });
  }

  open(peer) {
    this.targetPeer = peer;
    const peerName = peer.name?.displayName || t('pair.deviceFallback');
    this.modal.classList.remove('hidden');
    this.modal.innerHTML = `
      <div class="modal-backdrop"></div>
      <div class="modal-card glass-panel">
        <div class="modal-header">
          <h3>${t('message.title', { name: peerName })}</h3>
          <button class="modal-close-btn" id="text-modal-close">&times;</button>
        </div>
        <div class="modal-body">
          <textarea id="text-input" placeholder="${t('message.placeholder')}" rows="5"></textarea>
          <div class="modal-actions">
            <button class="btn btn-secondary" id="text-cancel">${t('message.cancel')}</button>
            <button class="btn btn-primary" id="text-send">${t('message.send')}</button>
          </div>
        </div>
      </div>
    `;

    document.getElementById('text-modal-close')?.addEventListener('click', () => this.close());
    document.getElementById('text-cancel')?.addEventListener('click', () => this.close());
    this.modal.querySelector('.modal-backdrop')?.addEventListener('click', () => this.close());

    document.getElementById('text-send')?.addEventListener('click', () => {
      const text = document.getElementById('text-input')?.value?.trim();
      if (text && this.targetPeer) {
        const recipientName = this.targetPeer.name?.displayName || t('peers.nearbyDevice');
        transferManager.sendText(this.targetPeer.id, text);
        this.close();
        events.emit('notify', {
          title: t('message.send'),
          message: t('toast.messageSent', { name: recipientName }),
          type: 'success',
        });
      }
    });

    document.getElementById('text-input')?.focus();
  }

  showReceivedText(sender, text) {
    const senderName = sender.name?.displayName || t('peers.nearbyDevice');
    this.modal.classList.remove('hidden');
    this.modal.innerHTML = `
      <div class="modal-backdrop"></div>
      <div class="modal-card glass-panel">
        <div class="modal-header">
          <h3>${t('message.receivedFrom', { name: senderName })}</h3>
          <button class="modal-close-btn" id="text-modal-close">&times;</button>
        </div>
        <div class="modal-body">
          <textarea class="received-textarea" readonly rows="6">${text}</textarea>
          <div class="modal-actions">
            <button class="btn btn-secondary" id="text-close-btn">${t('preview.close')}</button>
            <button class="btn btn-primary" id="text-copy-btn">${t('message.copy')}</button>
          </div>
        </div>
      </div>
    `;

    document.getElementById('text-modal-close')?.addEventListener('click', () => this.close());
    document.getElementById('text-close-btn')?.addEventListener('click', () => this.close());
    this.modal.querySelector('.modal-backdrop')?.addEventListener('click', () => this.close());

    document.getElementById('text-copy-btn')?.addEventListener('click', () => {
      if (navigator.clipboard) {
        navigator.clipboard.writeText(text).then(() => {
          events.emit('notify', {
            title: t('message.copiedTitle'),
            message: t('message.copied'),
            type: 'success',
          });
          this.close();
        });
      }
    });
  }

  close() {
    this.modal.classList.add('hidden');
    this.modal.innerHTML = '';
    this.targetPeer = null;
  }
}
