import QRCode from 'qrcode';
import { signaling } from '../../core/signaling.js';
import { events } from '../../core/events.js';
import { storage } from '../../utils/storage.js';
import { SegmentedInput } from '../segmented-input.js';
import { t, getLanguage } from '../../utils/i18n.js';

export class PairModal {
  constructor(modalElement) {
    this.modal = modalElement;
    this.currentPin = null;
    this.segmentedInput = null;

    this._bindEvents();
  }

  _bindEvents() {
    events.on('pair-code', (data) => {
      this.currentPin = data.pin;
      this._renderPairCode(data.pin);
    });

    events.on('pair-success', (data) => {
      const pairedPeer = data.pairedWith || {};
      const devName = pairedPeer.name?.displayName || (getLanguage() === 'vi' ? 'Thiết bị' : 'Device');
      storage.savePairedDevice({
        secret: data.secret,
        displayName: devName,
        deviceName: pairedPeer.name?.deviceName || 'Nearby Device',
        deviceType: pairedPeer.name?.deviceType || 'desktop',
        autoAccept: false,
      });
      this.close();
      events.emit('pair-updated');
      events.emit('notify', {
        title: t('toast.pairSuccess'),
        message: t('toast.pairConnectedWith', { name: devName }),
        type: 'success',
      });
    });

    events.on('pair-result', (data) => {
      if (!data.success) {
        events.emit('notify', {
          title: t('toast.pairFailed'),
          message: t('toast.pairInvalidCode'),
          type: 'error',
        });
      }
    });
  }

  open() {
    this.modal.classList.remove('hidden');
    this.modal.innerHTML = `
      <div class="modal-backdrop"></div>
      <div class="modal-card">
        <div class="modal-header">
          <h3>${t('pair.title')}</h3>
          <button class="modal-close-btn" id="pair-modal-close">&times;</button>
        </div>

        <div class="pair-tabs">
          <button class="tab-btn active" id="tab-my-code">${getLanguage() === 'vi' ? 'Mã của tôi' : 'My Pair Code'}</button>
          <button class="tab-btn" id="tab-enter-code">${getLanguage() === 'vi' ? 'Nhập mã PIN' : 'Enter Code'}</button>
        </div>

        <div class="tab-content" id="my-code-view">
          <p class="pair-instructions">${t('pair.subtitle')}</p>
          <div class="qr-box">
            <canvas id="pair-qr-canvas"></canvas>
          </div>
          <div class="pin-display" id="pin-display">${t('pair.pairing')}</div>
          <div style="display:flex; justify-content:center; margin-top:8px;">
            <button class="btn btn-secondary btn-sm copy-link-btn" id="copy-pair-link-btn">${t('pair.copyLink')}</button>
          </div>
          <small class="pin-expiry" style="display:block; text-align:center; margin-top:8px;">${t('pair.expiresIn', { time: '5m' })}</small>
        </div>

        <div class="tab-content hidden" id="enter-code-view">
          <p class="pair-instructions">${t('pair.enterPinTitle')}:</p>
          
          <div class="segmented-code-container" id="pair-segmented-input">
            <div class="code-cells-group">
              <input type="tel" inputmode="numeric" pattern="[0-9]*" class="code-cell" maxlength="1" data-index="0" autofocus />
              <input type="tel" inputmode="numeric" pattern="[0-9]*" class="code-cell" maxlength="1" data-index="1" />
              <input type="tel" inputmode="numeric" pattern="[0-9]*" class="code-cell" maxlength="1" data-index="2" />
            </div>
            <div class="code-cells-separator">&ndash;</div>
            <div class="code-cells-group">
              <input type="tel" inputmode="numeric" pattern="[0-9]*" class="code-cell" maxlength="1" data-index="3" />
              <input type="tel" inputmode="numeric" pattern="[0-9]*" class="code-cell" maxlength="1" data-index="4" />
              <input type="tel" inputmode="numeric" pattern="[0-9]*" class="code-cell" maxlength="1" data-index="5" />
            </div>
          </div>

          <div class="pair-action-row">
            <button class="btn btn-primary btn-block" id="join-pin-btn" disabled>${t('pair.pairBtn')}</button>
          </div>
        </div>
      </div>
    `;

    document.getElementById('pair-modal-close')?.addEventListener('click', () => this.close());
    this.modal.querySelector('.modal-backdrop')?.addEventListener('click', () => this.close());

    // Tab switching
    const tabMy = document.getElementById('tab-my-code');
    const tabEnter = document.getElementById('tab-enter-code');
    const viewMy = document.getElementById('my-code-view');
    const viewEnter = document.getElementById('enter-code-view');
    const joinBtn = document.getElementById('join-pin-btn');

    tabMy?.addEventListener('click', () => {
      tabMy.classList.add('active');
      tabEnter.classList.remove('active');
      viewMy.classList.remove('hidden');
      viewEnter.classList.add('hidden');
    });

    tabEnter?.addEventListener('click', () => {
      tabEnter.classList.add('active');
      tabMy.classList.remove('active');
      viewEnter.classList.remove('hidden');
      viewMy.classList.add('hidden');
      setTimeout(() => this.segmentedInput?.focus(), 50);
    });

    // Copy Link action
    document.getElementById('copy-pair-link-btn')?.addEventListener('click', () => {
      if (this.currentPin) {
        const url = `${window.location.origin}?pair=${this.currentPin}`;
        navigator.clipboard?.writeText(url).then(() => {
          events.emit('notify', {
            title: t('pair.copyLink'),
            message: t('pair.linkCopied'),
            type: 'success',
          });
        });
      }
    });

    // Segmented Input Logic
    const container = document.getElementById('pair-segmented-input');
    if (container) {
      this.segmentedInput = new SegmentedInput(container, {
        regex: /^[0-9]$/,
        onChange: (val) => {
          if (val.length === 6) {
            joinBtn?.removeAttribute('disabled');
          } else {
            joinBtn?.setAttribute('disabled', 'true');
          }
        },
        onComplete: (val) => {
          joinBtn?.removeAttribute('disabled');
          signaling.joinPair(val);
        },
      });
    }

    // Join action button
    joinBtn?.addEventListener('click', () => {
      const pin = this.segmentedInput?.getValue()?.trim();
      if (pin && pin.length === 6) {
        signaling.joinPair(pin);
      }
    });

    // Request new pairing session from server
    signaling.initiatePairing();
  }

  _renderPairCode(pin) {
    const pinEl = document.getElementById('pin-display');
    if (pinEl) pinEl.textContent = pin;

    const canvas = document.getElementById('pair-qr-canvas');
    if (canvas) {
      const pairUrl = `${window.location.origin}?pair=${pin}`;
      QRCode.toCanvas(canvas, pairUrl, {
        width: 180,
        margin: 1,
        color: {
          dark: '#000000',
          light: '#ffffff',
        },
      });
    }
  }

  close() {
    this.modal.classList.add('hidden');
    this.modal.innerHTML = '';
    this.segmentedInput = null;
    signaling.cancelPairing();
  }
}
