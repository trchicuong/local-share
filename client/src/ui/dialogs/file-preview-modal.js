import { events } from '../../core/events.js';
import { formatBytes } from '../../utils/formatters.js';
import { createZipFromFiles, getMimeType, isMobileDevice } from '../../utils/mime.js';
import { storage } from '../../utils/storage.js';
import { t, getLanguage } from '../../utils/i18n.js';

export class FilePreviewModal {
  constructor(modalElement) {
    this.modal = modalElement;
    this.currentFiles = [];
    this.zipArchive = null;
    this.selectedIndex = 0;

    this._bindEvents();
  }

  _bindEvents() {
    events.on('transfer-completed', (data) => {
      if (data.type === 'receive' && (data.files || data.file)) {
        this.show(data);
      }
    });
  }

  _getFileIconMini(file) {
    const fileName = file.name || '';
    const mime = getMimeType(fileName, file.mime || (file instanceof Blob ? file.type : ''));
    if (mime.startsWith('image/') || /\.(png|jpe?g|gif|webp|svg|bmp)$/i.test(fileName)) {
      return '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>';
    }
    if (mime.startsWith('video/') || /\.(mp4|webm|mov|mkv)$/i.test(fileName)) {
      return '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>';
    }
    if (mime.startsWith('audio/') || /\.(mp3|wav|ogg|m4a|aac)$/i.test(fileName)) {
      return '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>';
    }
    if (/\.(pdf)$/i.test(fileName)) {
      return '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>';
    }
    if (/\.(zip|tar|gz|7z|rar)$/i.test(fileName)) {
      return '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></svg>';
    }
    if (/\.(docx?|xlsx?|pptx?|txt|csv)$/i.test(fileName)) {
      return '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>';
    }
    return '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>';
  }

  _renderPreviewContent(file) {
    if (!file) return '';
    const fileName = file.name || 'received-file';
    const mime = getMimeType(fileName, file.mime || (file instanceof Blob ? file.type : ''));
    const isImage = mime.startsWith('image/') || /\.(png|jpe?g|gif|webp|svg|bmp)$/i.test(fileName);
    const isVideo = mime.startsWith('video/') || /\.(mp4|webm|mov|mkv)$/i.test(fileName);
    const isAudio = mime.startsWith('audio/') || /\.(mp3|wav|ogg|m4a|aac)$/i.test(fileName);

    if (isImage && file.downloadUrl) {
      return `<img src="${file.downloadUrl}" class="preview-media" alt="${fileName}" />`;
    } else if (isVideo && file.downloadUrl) {
      return `<video src="${file.downloadUrl}" class="preview-media" controls playsinline></video>`;
    } else if (isAudio && file.downloadUrl) {
      return `
        <div class="preview-audio-container">
          <div class="preview-audio-disc">
            <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>
            </svg>
          </div>
          <div class="preview-audio-title">${fileName}</div>
          <audio src="${file.downloadUrl}" class="preview-media-audio" controls></audio>
        </div>
      `;
    } else {
      const ext = fileName.split('.').pop()?.toUpperCase() || 'FILE';
      return `
        <div class="preview-file-icon-box">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" class="preview-doc-icon">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
          </svg>
          <span class="preview-file-ext">${ext}</span>
          <div class="preview-file-name-meta">${fileName}</div>
        </div>
      `;
    }
  }

  async show(data) {
    const files = data.files && data.files.length > 0 ? data.files : (data.file ? [data.file] : []);
    if (files.length === 0) return;
    this.currentFiles = files;
    this.zipArchive = null;
    this.selectedIndex = 0;

    const senderName = data.senderName || 'Nearby Device';
    const isMulti = files.length > 1;
    const totalBytes = files.reduce((acc, f) => acc + (f.size || 0), 0);
    const isMobile = isMobileDevice();
    const autoDownload = storage.isAutoDownload();

    // Initial selected file
    const primaryFile = files[0];
    const initialTitle = isMulti
      ? `${files.length} ${t('preview.filesReceivedPlural', { count: files.length })} (${formatBytes(totalBytes)})`
      : `${primaryFile.name} (${formatBytes(primaryFile.size || totalBytes)})`;

    // Multi-file list if more than 1 file
    let multiFileListHtml = '';
    if (isMulti) {
      multiFileListHtml = `
        <div class="preview-files-list">
          ${files
            .map(
              (f, idx) => `
            <div class="preview-file-item ${idx === this.selectedIndex ? 'active' : ''}" data-file-index="${idx}" title="${t('preview.previewTag')}: ${f.name}">
              <div class="preview-item-left">
                <span class="preview-item-icon">${this._getFileIconMini(f)}</span>
                <div class="preview-item-details">
                  <span class="preview-item-name">${f.name}</span>
                  <span class="preview-item-size">${formatBytes(f.size)}</span>
                </div>
              </div>
              <span class="preview-item-action-tag">
                ${idx === this.selectedIndex ? t('preview.viewingTag') : t('preview.previewTag')}
              </span>
            </div>
          `
            )
            .join('')}
        </div>
      `;
    }

    const modalTitle = isMulti
      ? t('preview.filesReceivedPlural', { count: files.length })
      : t('preview.filesReceivedSingle');

    // Build shareable files for Web Share API (PairDrop Mobile approach)
    let canShare = false;
    if (isMobile && typeof navigator.share === 'function') {
      try {
        if (typeof navigator.canShare === 'function') {
          // Check capability with a standardized test file
          const testFile = new File([''], 'test.zip', { type: 'application/zip' });
          canShare = navigator.canShare({ files: [testFile] });
        } else {
          canShare = true;
        }
      } catch (_) {
        canShare = true;
      }
    }

    // Dynamic action buttons
    let actionsHtml = '';
    if (canShare) {
      actionsHtml = `
        <button class="btn btn-primary" id="preview-share-btn">
          ${t('preview.saveToFiles')}
        </button>
        <button class="btn btn-secondary" id="preview-download-btn">
          ${isMulti ? t('preview.downloadZip') : (autoDownload ? t('preview.downloadAgain') : t('preview.download'))}
        </button>
        <button class="btn btn-secondary" id="preview-close-btn">${t('preview.close')}</button>
      `;
    } else {
      actionsHtml = `
        <button class="btn btn-primary" id="preview-download-btn">
          ${isMulti ? t('preview.downloadZip') : (autoDownload ? t('preview.downloadAgain') : t('preview.download'))}
        </button>
        ${
          typeof navigator.share === 'function'
            ? `<button class="btn btn-secondary" id="preview-share-btn">${t('preview.share')}</button>`
            : ''
        }
        <button class="btn btn-secondary" id="preview-close-btn">${t('preview.close')}</button>
      `;
    }

    this.modal.classList.remove('hidden');
    this.modal.innerHTML = `
      <div class="modal-backdrop"></div>
      <div class="modal-card preview-card">
        <div class="modal-header">
          <h3>${modalTitle}</h3>
          <button class="modal-close-btn" id="preview-modal-close">&times;</button>
        </div>

        <div class="preview-meta">
          <div class="preview-sender">
            <span class="preview-from-label">${t('preview.from')}</span>
            <span class="identity-badge">${senderName}</span>
          </div>
          <div class="preview-file-title" id="preview-file-title" title="${initialTitle}">${initialTitle}</div>
          ${isMulti ? `<div class="preview-multi-badge">${t('preview.itemsBundled', { count: files.length })}</div>` : ''}
        </div>

        <div class="preview-content-box" id="preview-content-box">
          ${this._renderPreviewContent(primaryFile)}
        </div>

        ${multiFileListHtml}

        <div class="modal-actions preview-actions">
          ${actionsHtml}
        </div>
      </div>
    `;

    document.getElementById('preview-modal-close')?.addEventListener('click', () => this.close());
    document.getElementById('preview-close-btn')?.addEventListener('click', () => this.close());
    this.modal.querySelector('.modal-backdrop')?.addEventListener('click', () => this.close());

    // Interactive multi-file item click to switch preview
    if (isMulti) {
      const items = this.modal.querySelectorAll('.preview-file-item');
      items.forEach((item) => {
        item.addEventListener('click', () => {
          const idx = parseInt(item.dataset.fileIndex, 10);
          if (idx !== this.selectedIndex && files[idx]) {
            this.selectedIndex = idx;
            const target = files[idx];

            // Update preview box
            const box = this.modal.querySelector('#preview-content-box');
            if (box) {
              box.innerHTML = this._renderPreviewContent(target);
            }

            // Update title text
            const titleEl = this.modal.querySelector('#preview-file-title');
            if (titleEl) {
              titleEl.textContent = `${target.name} (${formatBytes(target.size)})`;
              titleEl.title = target.name;
            }

            // Update active states
            items.forEach((el, i) => {
              const isCur = i === idx;
              el.classList.toggle('active', isCur);
              const tag = el.querySelector('.preview-item-action-tag');
              if (tag) {
                tag.textContent = isCur
                  ? t('preview.viewingTag')
                  : t('preview.previewTag');
              }
            });
          }
        });
      });
    }

    // Generate ZIP in background if multi-file
    if (isMulti) {
      createZipFromFiles(files)
        .then((zip) => {
          this.zipArchive = zip;
        })
        .catch((err) => {
          console.error('[Zip generation failed]', err);
        });
    }

    const triggerDownloadAll = async () => {
      if (isMulti) {
        if (!this.zipArchive) {
          try {
            this.zipArchive = await createZipFromFiles(files);
          } catch (e) {
            console.error('[Zip failed]', e);
          }
        }
        if (this.zipArchive?.downloadUrl) {
          this._triggerDownload(this.zipArchive);
          return;
        }
        for (const f of files) {
          this._triggerDownload(f);
        }
      } else {
        this._triggerDownload(files[0]);
      }
    };

    // Download handler
    document.getElementById('preview-download-btn')?.addEventListener('click', async () => {
      await triggerDownloadAll();
    });

    // Native Web Share API (Triggers iOS / Android native Share Sheet -> "Save to Files")
    const shareBtn = document.getElementById('preview-share-btn');
    if (shareBtn) {
      shareBtn.addEventListener('click', async () => {
        try {
          if (isMulti) {
            // For multiple files, iOS Safari reliably shares a ZIP bundle with "Save to Files" option
            if (!this.zipArchive) {
              this.zipArchive = await createZipFromFiles(files);
            }
            if (this.zipArchive?.blob && navigator.share) {
              const zipFile = new File(
                [this.zipArchive.blob],
                this.zipArchive.name || 'LocalShare_files.zip',
                { type: 'application/zip', lastModified: Date.now() }
              );
              await navigator.share({
                files: [zipFile],
                title: this.zipArchive.name || `${files.length} files from ${senderName}`,
              });
              return;
            }
          } else {
            // For single file, share with explicit MIME type
            const blobData = primaryFile.blob || primaryFile;
            const fileMime =
              getMimeType(
                primaryFile.name,
                primaryFile.mime || (blobData instanceof Blob ? blobData.type : '')
              ) || 'application/octet-stream';
            const singleFile = new File([blobData], primaryFile.name, {
              type: fileMime,
              lastModified: Date.now(),
            });
            if (navigator.share) {
              await navigator.share({
                files: [singleFile],
                title: primaryFile.name,
              });
              return;
            }
          }
        } catch (err) {
          if (err.name === 'AbortError') {
            // User cancelled native share sheet dialog, do nothing
            return;
          }
          console.warn('[Web Share Warning]', err);
        }
        // Fallback: direct download
        await triggerDownloadAll();
      });
    }

    // Auto-download files if enabled in settings
    if (autoDownload) {
      await triggerDownloadAll();
    }
  }

  _triggerDownload(file) {
    if (!file) return;
    if (!file.downloadUrl && file.blob) {
      file.downloadUrl = URL.createObjectURL(file.blob);
    }
    if (!file.downloadUrl) return;

    const a = document.createElement('a');
    a.href = file.downloadUrl;
    a.download = file.name || 'download';
    a.rel = 'noopener';
    a.target = '_self';
    // Off-screen positioning rather than display:none ensures WebKit / mobile browsers register the element in render tree
    a.style.position = 'fixed';
    a.style.top = '-9999px';
    a.style.left = '-9999px';
    a.style.opacity = '0';
    document.body.appendChild(a);

    try {
      a.click();
    } catch (_) {
      const clickEvent = new MouseEvent('click', {
        view: window,
        bubbles: true,
        cancelable: true,
      });
      a.dispatchEvent(clickEvent);
    }

    setTimeout(() => {
      if (document.body.contains(a)) {
        document.body.removeChild(a);
      }
    }, 1500);
  }

  close() {
    this.modal.classList.add('hidden');
    this.modal.innerHTML = '';
    this.currentFiles = [];
    this.zipArchive = null;
    this.selectedIndex = 0;
  }
}
