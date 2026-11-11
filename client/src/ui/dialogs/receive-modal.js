import { events } from '../../core/events.js';
import { formatBytes } from '../../utils/formatters.js';
import { t } from '../../utils/i18n.js';

export class ReceiveModal {
  constructor(modalElement) {
    this.modal = modalElement;
    this.activeReq = null;

    events.on('incoming-transfer-request', (req) => {
      this.activeReq = req;
      this.show(req);
    });

    events.on('language-changed', () => {
      if (this.activeReq && !this.modal.classList.contains('hidden')) {
        this.show(this.activeReq);
      }
    });

    events.on('peer-updated', (peer) => {
      if (this.activeReq && this.activeReq.sender?.id === peer.id && peer.name?.displayName) {
        this.activeReq.sender.displayName = peer.name.displayName;
        if (!this.modal.classList.contains('hidden')) {
          this.show(this.activeReq);
        }
      }
    });
  }

  show(req) {
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
      let handle = null;
      try {
        handle = await window.showSaveFilePicker({
          suggestedName: req.fileName,
        });
      } catch (err) {
        // User cancelled picker -> proceed with standard download
      }
      this.close();
      await req.accept(handle);
    });

    document.getElementById('receive-accept')?.addEventListener('click', async () => {
      this.close();
      await req.accept(null);
    });
  }

  close() {
    this.activeReq = null;
    this.modal.classList.add('hidden');
    this.modal.innerHTML = '';
  }
}
