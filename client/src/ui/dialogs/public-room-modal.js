import QRCode from 'qrcode';
import { signaling } from '../../core/signaling.js';
import { events } from '../../core/events.js';
import { SegmentedInput } from '../segmented-input.js';
import { t, getLanguage } from '../../utils/i18n.js';

export class PublicRoomModal {
  constructor(modalElement) {
    this.modal = modalElement;
    this.currentRoom = sessionStorage.getItem('los_public_room') || null;
    this.segmentedInput = null;

    events.on('public-room-joined', (data) => {
      this.currentRoom = data.roomId;
      sessionStorage.setItem('los_public_room', data.roomId);
      this.close();
      events.emit('notify', {
        title: t('public.title'),
        message: t('public.joinedSuccess', { room: data.roomId }),
        type: 'success',
      });
    });

    events.on('public-room-left', (data) => {
      this.currentRoom = null;
      sessionStorage.removeItem('los_public_room');
      this.close();
      events.emit('notify', {
        title: t('public.title'),
        message: t('public.leftSuccess'),
        type: 'info',
      });
    });

    events.on('peers-list', (peers, discoveryScope) => {
      if (discoveryScope?.publicRoom) {
        this.currentRoom = discoveryScope.publicRoom;
        sessionStorage.setItem('los_public_room', discoveryScope.publicRoom);
      }
    });
  }

  open() {
    this.modal.classList.remove('hidden');

    if (this.currentRoom) {
      this.modal.innerHTML = `
        <div class="modal-backdrop"></div>
        <div class="modal-card">
          <div class="modal-header">
            <h3>${t('public.title')}</h3>
            <button class="modal-close-btn" id="room-close">&times;</button>
          </div>

          <div class="public-room-active-box">
            <p class="pair-instructions">${t('public.currentRoomLabel')}</p>
            <div class="room-code-badge">${this.currentRoom}</div>
            
            <div class="qr-box" style="margin: 0.6rem 0;">
              <canvas id="public-room-qr"></canvas>
            </div>

            <div class="room-actions-row">
              <button class="btn btn-secondary" id="copy-room-link-btn">${t('public.copyLink')}</button>
              <button class="btn btn-danger" id="leave-room-btn">${t('public.leaveRoom')}</button>
            </div>
          </div>

          <hr class="modal-divider" style="margin: 1rem 0; border: none; border-top: 1px solid var(--border-color);" />

          <p class="pair-instructions" style="font-size: 0.8rem; margin-top: 10px;">${t('public.switchRoomPrompt')}</p>
          <div class="segmented-code-container" id="room-switch-segmented-input">
            <div class="code-cells-group">
              <input type="text" class="code-cell" maxlength="1" data-index="0" />
              <input type="text" class="code-cell" maxlength="1" data-index="1" />
              <input type="text" class="code-cell" maxlength="1" data-index="2" />
              <input type="text" class="code-cell" maxlength="1" data-index="3" />
              <input type="text" class="code-cell" maxlength="1" data-index="4" />
            </div>
          </div>
          <div class="pair-action-row">
            <button class="btn btn-primary btn-block" id="room-switch-btn" disabled>${t('public.switchRoomBtn')}</button>
          </div>
        </div>
      `;

      const canvas = document.getElementById('public-room-qr');
      if (canvas) {
        const shareUrl = `${window.location.origin}?room=${this.currentRoom}`;
        QRCode.toCanvas(canvas, shareUrl, {
          width: 140,
          margin: 1,
          color: { dark: '#000000', light: '#ffffff' },
        }).catch(() => {});
      }

      document.getElementById('copy-room-link-btn')?.addEventListener('click', () => {
        const url = `${window.location.origin}?room=${this.currentRoom}`;
        if (navigator.clipboard) {
          navigator.clipboard.writeText(url).then(() => {
            events.emit('notify', {
              title: t('public.copyLink'),
              message: t('public.linkCopied'),
              type: 'success',
            });
          });
        }
      });

      document.getElementById('leave-room-btn')?.addEventListener('click', () => {
        signaling.leavePublicRoom();
      });

      const switchContainer = document.getElementById('room-switch-segmented-input');
      const switchBtn = document.getElementById('room-switch-btn');
      if (switchContainer) {
        this.segmentedInput = new SegmentedInput(switchContainer, {
          regex: /^[a-zA-Z0-9]$/,
          onChange: (val) => {
            if (val.length === 5) {
              switchBtn?.removeAttribute('disabled');
            } else {
              switchBtn?.setAttribute('disabled', 'true');
            }
          },
          onComplete: (val) => {
            switchBtn?.removeAttribute('disabled');
            signaling.joinPublicRoom(val);
          },
        });
      }

      switchBtn?.addEventListener('click', () => {
        const roomId = this.segmentedInput?.getValue()?.trim();
        if (roomId && roomId.length === 5) {
          signaling.joinPublicRoom(roomId);
        }
      });
    } else {
      this.modal.innerHTML = `
        <div class="modal-backdrop"></div>
        <div class="modal-card">
          <div class="modal-header">
            <h3>${t('public.title')}</h3>
            <button class="modal-close-btn" id="room-close">&times;</button>
          </div>

          <p class="pair-instructions">${t('public.subtitle')}</p>

          <div style="margin: 16px 0;">
            <p class="pair-instructions" style="font-size:0.83rem; margin-bottom: 8px;">${t('public.enterRoomId')}:</p>
            <div class="segmented-code-container" id="public-room-segmented-input">
              <div class="code-cells-group">
                <input type="text" class="code-cell" maxlength="1" data-index="0" autofocus />
                <input type="text" class="code-cell" maxlength="1" data-index="1" />
                <input type="text" class="code-cell" maxlength="1" data-index="2" />
                <input type="text" class="code-cell" maxlength="1" data-index="3" />
                <input type="text" class="code-cell" maxlength="1" data-index="4" />
              </div>
            </div>
          </div>

          <div class="pair-action-row">
            <button class="btn btn-primary btn-block" id="join-room-btn" disabled>${t('public.joinRoom')}</button>
          </div>
        </div>
      `;

      const joinContainer = document.getElementById('public-room-segmented-input');
      const joinBtn = document.getElementById('join-room-btn');
      if (joinContainer) {
        this.segmentedInput = new SegmentedInput(joinContainer, {
          regex: /^[a-zA-Z0-9]$/,
          onChange: (val) => {
            if (val.length === 5) {
              joinBtn?.removeAttribute('disabled');
            } else {
              joinBtn?.setAttribute('disabled', 'true');
            }
          },
          onComplete: (val) => {
            joinBtn?.removeAttribute('disabled');
            signaling.joinPublicRoom(val);
          },
        });
      }

      joinBtn?.addEventListener('click', () => {
        const roomId = this.segmentedInput?.getValue()?.trim();
        if (roomId && roomId.length === 5) {
          signaling.joinPublicRoom(roomId);
        }
      });
    }

    document.getElementById('room-close')?.addEventListener('click', () => this.close());
    this.modal.querySelector('.modal-backdrop')?.addEventListener('click', () => this.close());
  }

  close() {
    this.modal.classList.add('hidden');
    this.modal.innerHTML = '';
    this.segmentedInput = null;
  }
}
