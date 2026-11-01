import { events } from './core/events.js';
import { signaling } from './core/signaling.js';
import { storage } from './utils/storage.js';
import { detectDevice, ICONS } from './utils/device.js';
import { t, getLanguage } from './utils/i18n.js';

import { RadarCanvas } from './ui/radar-canvas.js';
import { DataBeam } from './ui/data-beam.js';
import { PeersView } from './ui/peers-view.js';
import { TransferCard } from './ui/transfer-card.js';
import { Notifications } from './ui/notifications.js';

import { PairModal } from './ui/dialogs/pair-modal.js';
import { PublicRoomModal } from './ui/dialogs/public-room-modal.js';
import { TextModal } from './ui/dialogs/text-modal.js';
import { ReceiveModal } from './ui/dialogs/receive-modal.js';
import { SettingsModal } from './ui/dialogs/settings-modal.js';
import { AboutModal } from './ui/dialogs/about-modal.js';
import { FilePreviewModal } from './ui/dialogs/file-preview-modal.js';
import { PairedDevicesModal } from './ui/dialogs/paired-devices-modal.js';

class LoSApp {
  constructor() {
    this.deferredInstallPrompt = null;
    this.device = detectDevice();
    this.currentPublicRoom = null;

    // Parse URL invitation parameters (?pair=123456 or ?room=MYROOM)
    const urlParams = new URLSearchParams(window.location.search);
    this.urlPairPin = urlParams.get('pair');
    this.urlRoomId = urlParams.get('room');
    if (this.urlPairPin || this.urlRoomId) {
      window.history.replaceState({}, document.title, window.location.pathname);
    }

    this._initUI();
    this._initModals();
    this._bindEvents();
    this._initPWA();

    // Connect WebSocket signaling
    signaling.connect();
  }

  _initUI() {
    // 1. Radar Canvas (Smooth, calm, non-dizzying wave)
    const radarCanvasEl = document.getElementById('radar-canvas');
    this.radar = new RadarCanvas(radarCanvasEl);
    this.radar.start();

    // 2. Data Beam Canvas
    const beamCanvasEl = document.getElementById('beam-canvas');
    this.beam = new DataBeam(beamCanvasEl);

    // 3. Peers View
    const peersContainer = document.getElementById('peers-container');
    const emptyState = document.getElementById('empty-state');
    this.peersView = new PeersView(peersContainer, emptyState);

    // Initial view mode setup
    const initialMode = storage.getViewMode();
    this.peersView.setViewMode(initialMode);

    // 4. Transfer Telemetry HUD
    const hudContainer = document.getElementById('transfer-hud-container');
    this.transferCard = new TransferCard(hudContainer);

    // 5. Notifications
    const toastContainer = document.getElementById('toast-container');
    this.notifications = new Notifications(toastContainer);

    // 6. Bottom Device Tethering Avatar
    const myAvatar = document.getElementById('my-avatar');
    if (myAvatar) {
      myAvatar.innerHTML = ICONS.tethering;
    }

    // Initialize Header Controls and Localized UI
    this._updateAllI18n();
  }

  _initModals() {
    const modalContainer = document.getElementById('modal-container');
    this.pairModal = new PairModal(modalContainer);
    this.publicRoomModal = new PublicRoomModal(modalContainer);
    this.textModal = new TextModal(modalContainer);
    this.receiveModal = new ReceiveModal(modalContainer);
    this.settingsModal = new SettingsModal(modalContainer);
    this.aboutModal = new AboutModal(modalContainer);
    this.filePreviewModal = new FilePreviewModal(modalContainer);
    this.pairedDevicesModal = new PairedDevicesModal(modalContainer);
  }

  _updateAllI18n() {
    this._updateControlIcons();
    this._updateDiscoveryBadges();

    // Footer labels
    const knownAsLabel = document.querySelector('.known-as-label');
    if (knownAsLabel) knownAsLabel.textContent = t('footer.youAreKnownAs');
    const knownAsWrapper = document.getElementById('name-badge-btn');
    if (knownAsWrapper) knownAsWrapper.title = t('footer.editName');

    const discoveryLabel = document.querySelector('.discovery-label');
    if (discoveryLabel) discoveryLabel.textContent = t('footer.youCanBeDiscovered');

    // Hint instructions
    const descDesktop = document.querySelector('.instruction-desktop');
    if (descDesktop) descDesktop.textContent = t('hint.desktop');
    const descMobile = document.querySelector('.instruction-mobile');
    if (descMobile) descMobile.textContent = t('hint.mobile');

    // Empty state
    if (this.peersView && this.peersView.peers.size === 0) {
      const titleEl = document.querySelector('.empty-title');
      const descEl = document.querySelector('.empty-desc');
      if (this.peersView.viewMode === 'grid') {
        if (titleEl) titleEl.textContent = t('empty.gridTitle');
        if (descEl) descEl.textContent = t('empty.gridDesc');
      } else {
        if (titleEl) titleEl.textContent = t('empty.radarTitle');
        if (descEl) descEl.textContent = t('empty.radarDesc');
      }
    }
  }

  _updateControlIcons() {
    const publicRoomBtn = document.getElementById('btn-public-room');
    const pairBtn = document.getElementById('btn-pair');
    const viewBtn = document.getElementById('btn-toggle-view');
    const aboutBtn = document.getElementById('btn-about');
    const settingsBtn = document.getElementById('btn-settings');

    if (publicRoomBtn) {
      publicRoomBtn.innerHTML = ICONS.users;
      publicRoomBtn.title = t('header.joinPublicRoom');
    }
    if (pairBtn) {
      pairBtn.innerHTML = ICONS.pair;
      pairBtn.title = t('header.pairDevices');
    }
    if (viewBtn) {
      viewBtn.innerHTML = this.peersView.viewMode === 'radar' ? ICONS.grid : ICONS.radar;
      viewBtn.title = this.peersView.viewMode === 'radar' ? t('header.switchToGrid') : t('header.switchToRadar');
    }
    if (aboutBtn) {
      aboutBtn.innerHTML = ICONS.info;
      aboutBtn.title = t('header.about');
    }
    if (settingsBtn) {
      settingsBtn.innerHTML = ICONS.settings;
      settingsBtn.title = t('header.settings');
    }
  }

  _updateDiscoveryBadges(discoveryScope) {
    const scopeEl = document.getElementById('my-discovery-scope');
    const pairedEl = document.getElementById('my-paired-badge');
    const publicEl = document.getElementById('my-public-room-badge');

    if (scopeEl) scopeEl.textContent = t('footer.onThisNetwork');

    // 1. Paired Devices Badge
    const pairedCount = storage.getRoomSecrets().length;
    if (pairedEl) {
      if (pairedCount > 0) {
        pairedEl.classList.remove('hidden');
        pairedEl.textContent = pairedCount === 1 ? t('footer.pairedDeviceSingle') : t('footer.pairedDevicePlural', { count: pairedCount });
        pairedEl.title = `Connected to ${pairedCount} paired device(s). Click to view in settings.`;
      } else {
        pairedEl.classList.add('hidden');
      }
    }

    // 2. Public Room Badge
    const activeRoom = this.currentPublicRoom || discoveryScope?.publicRoom;
    if (publicEl) {
      if (activeRoom) {
        publicEl.classList.remove('hidden');
        publicEl.textContent = t('footer.inRoom', { room: activeRoom });
        publicEl.title = `Visible in room ${activeRoom}. Click to manage or leave.`;
      } else {
        publicEl.classList.add('hidden');
      }
    }

    events.emit('radar-refresh');
  }

  _bindEvents() {
    // 1. Toggle View (Radar <-> Grid)
    document.getElementById('btn-toggle-view')?.addEventListener('click', (e) => {
      e.stopPropagation();
      const nextMode = this.peersView.viewMode === 'radar' ? 'grid' : 'radar';
      this.peersView.setViewMode(nextMode);
      this._updateControlIcons();
      this.notifications.show({
        title: nextMode === 'grid' ? t('toast.gridViewActive') : t('toast.radarViewActive'),
        type: 'info',
        duration: 2000,
      });
    });

    // 2. Public Room
    document.getElementById('btn-public-room')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.publicRoomModal.open();
    });

    // 3. Pair Device
    document.getElementById('btn-pair')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.pairModal.open();
    });

    // 4. About
    document.getElementById('btn-about')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.aboutModal.open();
    });

    // 5. Settings
    document.getElementById('btn-settings')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.settingsModal.open();
    });

    // Footer device click -> Settings / Name
    document.getElementById('my-device-anchor')?.addEventListener('click', (e) => {
      // If clicking directly on discovery badges, do not trigger avatar settings
      if (e.target.closest('.discovery-badges')) return;
      this.settingsModal.open();
    });

    // Discovery badge click actions
    document.getElementById('my-paired-badge')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.pairedDevicesModal.open();
    });

    document.getElementById('my-public-room-badge')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.publicRoomModal.open();
    });

    events.on('change-view-mode', (mode) => {
      this.peersView.setViewMode(mode);
      this._updateControlIcons();
      this.notifications.show({
        title: mode === 'grid' ? t('toast.gridViewActive') : t('toast.radarViewActive'),
        type: 'info',
        duration: 2000,
      });
    });

    // Signaling connection
    events.on('signaling-connected', () => {
      // Restore paired secret rooms
      const secrets = storage.getRoomSecrets();
      if (secrets.length > 0) {
        signaling.joinRoomSecrets(secrets);
      }

      // Auto-join from URL parameter if present
      if (this.urlPairPin) {
        signaling.joinPair(this.urlPairPin.trim());
        this.notifications.show({
          title: t('toast.pairing'),
          message: t('toast.pairingAttempt', { pin: this.urlPairPin }),
          type: 'info',
        });
        this.urlPairPin = null;
      } else if (this.urlRoomId) {
        const cleanRoom = this.urlRoomId.trim().toUpperCase().substring(0, 10);
        signaling.joinPublicRoom(cleanRoom);
        this.notifications.show({
          title: t('toast.joiningRoom'),
          message: t('toast.joiningRoomConnecting', { room: cleanRoom }),
          type: 'info',
        });
        this.urlRoomId = null;
      } else {
        // Restore session public room if previously joined
        const savedRoom = sessionStorage.getItem('los_public_room');
        if (savedRoom) {
          signaling.joinPublicRoom(savedRoom);
        }
      }

      // Restore display name
      const savedName = storage.getDisplayName();
      if (savedName) {
        signaling.changeDisplayName(savedName);
      }

      this._updateDiscoveryBadges();
    });

    events.on('peers-list', (peerList, discoveryScope) => {
      if (discoveryScope?.publicRoom !== undefined) {
        this.currentPublicRoom = discoveryScope.publicRoom;
      }
      for (const p of peerList) {
        if (p.roomType === 'secret' && p.secret) {
          const dev = storage.getPairedDevice(p.secret);
          if (dev) {
            storage.savePairedDevice({
              ...dev,
              displayName: p.name?.displayName || dev.displayName,
              deviceName: p.name?.deviceName || dev.deviceName,
              deviceType: p.name?.deviceType || dev.deviceType,
            });
          }
        }
      }
      this._updateDiscoveryBadges(discoveryScope);
    });

    events.on('peer-joined', (p, roomType, extra) => {
      const secret = extra?.secret || p.secret;
      if (secret) {
        const dev = storage.getPairedDevice(secret);
        if (dev) {
          storage.savePairedDevice({
            ...dev,
            displayName: p.name?.displayName || dev.displayName,
            deviceName: p.name?.deviceName || dev.deviceName,
            deviceType: p.name?.deviceType || dev.deviceType,
          });
        }
      }
      this._updateDiscoveryBadges();
    });

    events.on('peers-state-updated', () => {
      this._updateDiscoveryBadges();
    });

    events.on('public-room-joined', (data) => {
      this.currentPublicRoom = data.roomId;
      this._updateDiscoveryBadges();
    });

    events.on('public-room-left', () => {
      this.currentPublicRoom = null;
      this._updateDiscoveryBadges();
    });

    events.on('pair-success', () => {
      this._updateDiscoveryBadges();
    });

    events.on('pair-updated', () => {
      this._updateDiscoveryBadges();
    });

    events.on('language-changed', () => {
      this._updateAllI18n();
    });

    events.on('self-identity', (identity) => {
      const nameEl = document.getElementById('my-display-name');
      const scopeEl = document.getElementById('my-discovery-scope');
      if (nameEl) nameEl.textContent = identity.displayName;
      if (scopeEl) scopeEl.textContent = t('footer.onThisNetwork');
      this._updateDiscoveryBadges();
    });

    events.on('peer-updated', (peer) => {
      if (peer.id === signaling.selfId) {
        const nameEl = document.getElementById('my-display-name');
        if (nameEl) nameEl.textContent = peer.name?.displayName;
      }
    });

    // Data beam & peer avatar progress orchestration
    let activePeerId = null;

    events.on('transfer-started', (session) => {
      const isSend = session.type === 'send';
      activePeerId = isSend ? session.recipientId : session.senderId;

      if (this.peersView.viewMode === 'radar') {
        this.beam.start(
          () => this.radar.getOrigin(),
          () => this.peersView.getPeerPosition(activePeerId),
          isSend
        );
      }
    });

    events.on('transfer-progress', (telemetry) => {
      this.beam.setSpeed(telemetry.speed);
      if (activePeerId) {
        this.peersView.updatePeerProgress(activePeerId, telemetry.progress);
      }
    });

    const cleanupTransferVisuals = () => {
      this.beam.stop();
      if (activePeerId) {
        this.peersView.clearPeerProgress(activePeerId);
        activePeerId = null;
      }
    };

    events.on('transfer-completed', cleanupTransferVisuals);
    events.on('transfer-cancelled', cleanupTransferVisuals);
    events.on('transfer-error', cleanupTransferVisuals);
  }

  _initPWA() {
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this.deferredInstallPrompt = e;
      const installBtn = document.getElementById('btn-install');
      if (installBtn) {
        installBtn.classList.remove('hidden');
        installBtn.innerHTML = ICONS.mobile;
        installBtn.addEventListener('click', async () => {
          if (this.deferredInstallPrompt) {
            this.deferredInstallPrompt.prompt();
            const { outcome } = await this.deferredInstallPrompt.userChoice;
            if (outcome === 'accepted') {
              installBtn.classList.add('hidden');
            }
            this.deferredInstallPrompt = null;
          }
        });
      }
    });

    // Only register Service Worker in production mode
    if (import.meta.env.PROD) {
      import('virtual:pwa-register')
        .then(({ registerSW }) => {
          registerSW({
            immediate: true,
            onNeedRefresh() {
              console.log('[PWA] New version detected, auto-updating...');
            },
            onOfflineReady() {
              console.log('[PWA] Content cached for offline use.');
            },
            onRegisterError(err) {
              console.warn('[PWA] Service Worker registration failed:', err);
            },
          });
        })
        .catch((err) => {
          console.warn('[PWA] Could not load virtual:pwa-register:', err);
        });
    } else if ('serviceWorker' in navigator) {
      // In development: unregister any stale service workers to prevent cache/sync headaches
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        for (const registration of registrations) {
          registration.unregister();
          console.log('[PWA Dev] Unregistered lingering dev Service Worker');
        }
      });
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.losApp = new LoSApp();
});
