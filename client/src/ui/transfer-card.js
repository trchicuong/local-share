import { events } from '../core/events.js';
import { formatBytes, formatSpeed, formatTime } from '../utils/formatters.js';
import { transferManager } from '../core/transfer-manager.js';
import { t } from '../utils/i18n.js';

export class TransferCard {
  constructor(containerElement) {
    this.container = containerElement;
    this.visible = false;
    this.currentSession = null;
    this.lastTelemetry = null;

    this._bindEvents();
  }

  _bindEvents() {
    events.on('transfer-started', (session) => {
      this.currentSession = session;
      this.lastTelemetry = null;
      this.show(session);
    });

    events.on('transfer-progress', (telemetry) => {
      this.lastTelemetry = telemetry;
      this.update(telemetry);
    });

    events.on('language-changed', () => {
      if (this.visible && this.currentSession) {
        this.show(this.currentSession);
        if (this.lastTelemetry) {
          this.update(this.lastTelemetry);
        }
      }
    });

    events.on('transfer-completed', () => {
      const fill = document.getElementById('hud-fill');
      const percent = document.getElementById('hud-percent');
      if (fill) fill.style.width = '100%';
      if (percent) percent.textContent = '100%';
      setTimeout(() => this.hide(), 800);
    });

    events.on('transfer-cancelled', () => {
      this.hide();
    });

    events.on('transfer-error', () => {
      this.hide();
    });
  }

  show(session) {
    this.visible = true;
    this.container.classList.remove('hidden');

    const isSend = session.type === 'send';
    const isMulti = (session.filesCount || 1) > 1;
    const displayFileName = isMulti
      ? `${session.fileName} (+${session.filesCount - 1} ${t('hud.moreFiles')})`
      : session.fileName;

    this.container.innerHTML = `
      <div class="transfer-hud">
        <div class="hud-main-row">
          <div class="hud-badge ${isSend ? 'badge-send' : 'badge-recv'}" title="${isSend ? t('hud.sending') : t('hud.receiving')}">
            ${
              isSend
                ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="19" x2="12" y2="5"></line><polyline points="5 12 12 5 19 12"></polyline></svg>'
                : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"></line><polyline points="19 12 12 19 5 12"></polyline></svg>'
            }
          </div>

          <div class="hud-center">
            <div class="hud-filename" title="${displayFileName}">${displayFileName}</div>
            <div class="hud-subline">
              <span id="hud-bytes">0 B / ${formatBytes(session.totalSize)}</span>
              <span class="hud-bullet">&bull;</span>
              <span id="hud-speed">0 KB/s</span>
              <span class="hud-bullet">&bull;</span>
              <span id="hud-eta">--</span>
            </div>
          </div>

          <div class="hud-right">
            <span class="hud-percent" id="hud-percent">0%</span>
            <button class="hud-cancel-btn" id="hud-cancel" title="${t('hud.cancelTransfer')}" aria-label="${t('hud.cancelTransfer')}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>
        </div>

        <div class="hud-progress-bar">
          <div class="hud-progress-fill" id="hud-fill" style="width: 0%"></div>
        </div>
      </div>
    `;

    document.getElementById('hud-cancel')?.addEventListener('click', () => {
      transferManager.cancelActiveTransfer();
    });
  }

  update(telemetry) {
    if (!this.visible) return;

    const fill = document.getElementById('hud-fill');
    const percent = document.getElementById('hud-percent');
    const speed = document.getElementById('hud-speed');
    const bytes = document.getElementById('hud-bytes');
    const eta = document.getElementById('hud-eta');

    if (fill) fill.style.width = `${Math.min(100, telemetry.progress).toFixed(1)}%`;
    if (percent) percent.textContent = `${Math.round(telemetry.progress)}%`;
    if (speed) speed.textContent = formatSpeed(telemetry.speed);
    if (bytes) bytes.textContent = `${formatBytes(telemetry.currentBytes)} / ${formatBytes(telemetry.totalBytes)}`;
    if (eta) eta.textContent = telemetry.etaSeconds > 0 ? formatTime(telemetry.etaSeconds) : t('hud.almostDone');
  }

  hide() {
    this.visible = false;
    this.currentSession = null;
    this.lastTelemetry = null;
    this.container.classList.add('hidden');
    this.container.innerHTML = '';
  }
}
