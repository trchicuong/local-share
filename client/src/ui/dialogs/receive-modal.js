import { events } from '../../core/events.js';
import { formatBytes } from '../../utils/formatters.js';
import { t } from '../../utils/i18n.js';

export class ReceiveModal {
  constructor(modalElement) {
    this.modal = modalElement;
    this.activeReq = null;
    this.isOpen = false;

    events.on('incoming-transfer-request', (req) => {
      this.activeReq = req;
      this.show(req);
    });

    events.on('language-changed', () => {
      if (this.activeReq && this.isOpen && !this.modal.classList.contains('hidden')) {
        this.show(this.activeReq);
      }
    });

    events.on('peer-updated', (peer) => {
      if (this.activeReq && this.activeReq.sender?.id === peer.id && peer.name?.displayName) {
        this.activeReq.sender.displayName = peer.name.displayName;
        if (this.isOpen && !this.modal.classList.contains('hidden')) {
          this.show(this.activeReq);
        }
      }
    });

    events.on('transfer-cancelled', () => {
      if (this.isOpen && this.activeReq) {
        this.close();
      }
    });

    events.on('peer-left', (peerId) => {
      if (this.isOpen && this.activeReq && this.activeReq.sender?.id === peerId) {
        const stillVisible = window.losApp?.peersView?.peers?.has(peerId);
        if (!stillVisible) {
          this.close();
        }
      }
    });

    events.on('modal-opened', (modal) => {
      if (modal !== this) {
        this.isOpen = false;
        this.activeReq = null;
      }
    });
  }

  show(req) {
    this.isOpen = true;
    events.emit('modal-opened', this);
    const supportsPicker = typeof window.showSaveFilePicker === 'function';
    const isMulti = (req.filesCount || 1) > 1;
    const displayName = isMulti
      ? `${req.fileName} (+${req.filesCount - 1} ${t('receive.otherFiles')})`
      : req.fileName;

    const senderTitle = req.sender?.displayName || req.sender?.name?.displayName || t('receive.nearbyPeer');

    this.modal.classList.remove('hidden');
    this.modal.innerHTML = `
      <div class="modal-backdrop"></div>
      <div class="modal-card glass-panel receive-card">
        <div class="modal-header">
          <h3>${isMulti ? t('receive.titleMulti', { count: req.filesCount }) : t('receive.titleSingle')}</h3>
        </div>
        <div class="receive-info">
          <p class="receive-from"><strong>${senderTitle}</strong> ${t('receive.wantsToSend')}</p>
          <div class="file-badge">
            <span class="file-name" title="${displayName}">${displayName}</span>
            <span class="file-size">${formatBytes(req.totalSize)}</span>
          </div>
          ${supportsPicker ? `<small class="stream-tip">${t('receive.directStreamTip')}</small>` : ''}
        </div>
        <div class="modal-actions">
          <button class="btn btn-secondary" id="receive-decline">${t('receive.decline')}</button>
          ${
            supportsPicker
              ? `<button class="btn btn-secondary" id="receive-save-disk">${t('receive.saveLocation')}</button>`
              : ''
          }
          <button class="btn btn-primary" id="receive-accept">${t('receive.accept')}</button>
        </div>
      </div>
    `;

    document.getElementById('receive-decline')?.addEventListener('click', () => {
      this.close();
      req.decline();
    });

    document.getElementById('receive-save-disk')?.addEventListener('click', async () => {
      const currentSenderName = this.activeReq?.sender?.displayName || req.sender?.displayName;
      let handle = null;
      try {
        handle = await window.showSaveFilePicker({
          suggestedName: req.fileName,
        });
      } catch (err) {
        // User cancelled picker -> proceed with standard download
      }
      this.close();
      await req.accept(handle, currentSenderName);
    });

    document.getElementById('receive-accept')?.addEventListener('click', async () => {
      const currentSenderName = this.activeReq?.sender?.displayName || req.sender?.displayName;
      this.close();
      await req.accept(null, currentSenderName);
    });
  }

  close() {
    this.isOpen = false;
    this.activeReq = null;
    this.modal.classList.add('hidden');
    this.modal.innerHTML = '';
  }
}
