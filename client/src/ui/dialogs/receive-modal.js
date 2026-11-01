import { events } from '../../core/events.js';
import { formatBytes } from '../../utils/formatters.js';
import { t, getLanguage } from '../../utils/i18n.js';

export class ReceiveModal {
  constructor(modalElement) {
    this.modal = modalElement;

    events.on('incoming-transfer-request', (req) => {
      this.show(req);
    });
  }

  show(req) {
    const supportsPicker = typeof window.showSaveFilePicker === 'function';
    const isMulti = (req.filesCount || 1) > 1;
    const isVi = getLanguage() === 'vi';
    const displayName = isMulti
      ? `${req.fileName} (+${req.filesCount - 1} ${isVi ? 'file khác' : 'other files'})`
      : req.fileName;

    const senderTitle = req.sender?.displayName || req.sender?.name?.displayName || (isVi ? 'Một thiết bị lân cận' : 'A nearby peer');

    this.modal.classList.remove('hidden');
    this.modal.innerHTML = `
      <div class="modal-backdrop"></div>
      <div class="modal-card glass-panel receive-card">
        <div class="modal-header">
          <h3>${isMulti ? (isVi ? `Yêu cầu chuyển ${req.filesCount} file` : `Incoming Transfer (${req.filesCount} Files)`) : (isVi ? 'Yêu cầu chuyển file' : 'Incoming File Transfer')}</h3>
        </div>
        <div class="receive-info">
          <p class="receive-from"><strong>${senderTitle}</strong> ${isVi ? 'muốn gửi cho bạn:' : 'wants to send you:'}</p>
          <div class="file-badge">
            <span class="file-name" title="${displayName}">${displayName}</span>
            <span class="file-size">${formatBytes(req.totalSize)}</span>
          </div>
          ${supportsPicker ? `<small class="stream-tip">${isVi ? 'Hỗ trợ ghi trực tiếp vào ổ đĩa (Không tốn RAM)' : 'Direct disk stream supported (Zero-RAM usage)'}</small>` : ''}
        </div>
        <div class="modal-actions">
          <button class="btn btn-secondary" id="receive-decline">${isVi ? 'Từ chối' : 'Decline'}</button>
          ${
            supportsPicker
              ? `<button class="btn btn-secondary" id="receive-save-disk">${isVi ? 'Chọn vị trí lưu...' : 'Save Location...'}</button>`
              : ''
          }
          <button class="btn btn-primary" id="receive-accept">${isVi ? 'Chấp nhận nhận file' : 'Accept Transfer'}</button>
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
    this.modal.classList.add('hidden');
    this.modal.innerHTML = '';
  }
}
