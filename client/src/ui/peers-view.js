import { events } from '../core/events.js';
import { getDeviceIcon } from '../utils/device.js';
import { transferManager } from '../core/transfer-manager.js';
import { storage } from '../utils/storage.js';
import { t } from '../utils/i18n.js';

export class PeersView {
  constructor(peersContainer, emptyStateContainer) {
    this.container = peersContainer;
    this.emptyState = emptyStateContainer;
    this.peers = new Map(); // peerId -> peerObj
    this.viewMode = storage.getViewMode(); // 'radar' | 'grid'
    this.selectedPeerId = null;

    this._createHiddenFileInput();
    this._bindEvents();

    const handleResume = () => {
      this.render();
      setTimeout(() => this.render(), 100);
      setTimeout(() => this.render(), 300);
    };

    window.addEventListener('resize', () => this.render());
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) handleResume();
    });
    window.addEventListener('pageshow', handleResume);
    window.addEventListener('focus', handleResume);
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', () => this.render());
    }
  }

  _createHiddenFileInput() {
    this.fileInput = document.createElement('input');
    this.fileInput.type = 'file';
    this.fileInput.multiple = true;
    this.fileInput.style.display = 'none';
    document.body.appendChild(this.fileInput);

    this.fileInput.addEventListener('change', (e) => {
      if (this.selectedPeerId && e.target.files && e.target.files.length > 0) {
        const targetPeerId = this.selectedPeerId;
        const selectedFiles = Array.from(e.target.files);
        this.selectedPeerId = null;
        transferManager.sendFiles(targetPeerId, selectedFiles);
      }
    });

    const resetFileInput = () => {
      if (this.fileInput) {
        this.fileInput.value = '';
      }
    };
    events.on('transfer-completed', resetFileInput);
    events.on('transfer-cancelled', resetFileInput);
    events.on('transfer-declined', resetFileInput);
    events.on('transfer-error', resetFileInput);
  }

  _bindEvents() {
    events.on('peers-list', (peerList) => {
      this.peers.clear();
      for (const p of peerList) {
        this.peers.set(p.id, p);
      }
      this.render();
      events.emit('peers-state-updated', Array.from(this.peers.values()));
    });

    events.on('peer-joined', (peer, roomType, extra) => {
      const existing = this.peers.get(peer.id) || {};
      const roomsSet = new Set(existing.rooms || []);
      if (roomType) roomsSet.add(roomType);
      if (peer.rooms) {
        peer.rooms.forEach((r) => roomsSet.add(r));
      }
      const secret = extra?.secret || peer.secret || existing.secret || null;
      const roomId = extra?.roomId || peer.roomId || peer.publicRoomId || existing.roomId || existing.publicRoomId || null;
      if (secret) roomsSet.add('secret');
      if (roomId) roomsSet.add('public');

      const updatedRooms = Array.from(roomsSet);
      const isSecret = updatedRooms.includes('secret');
      const isPublic = updatedRooms.includes('public');
      const primaryType = isSecret ? 'secret' : isPublic ? 'public' : 'ip';

      this.peers.set(peer.id, {
        ...existing,
        ...peer,
        rooms: updatedRooms,
        roomType: primaryType,
        secret: secret,
        roomId: roomId,
        publicRoomId: roomId,
      });

      this.render();
      events.emit('peers-state-updated', Array.from(this.peers.values()));
    });

    events.on('peer-updated', (peer) => {
      if (this.peers.has(peer.id)) {
        this.peers.set(peer.id, { ...this.peers.get(peer.id), ...peer });
        this.render();
        events.emit('peers-state-updated', Array.from(this.peers.values()));
      }
    });

    events.on('peer-left', (peerId, roomType, extra) => {
      const existing = this.peers.get(peerId);
      if (!existing) return;

      // If roomType specified, remove only that room scope
      if (roomType && Array.isArray(existing.rooms)) {
        existing.rooms = existing.rooms.filter((r) => r !== roomType);
        if (roomType === 'secret' && extra?.secret && existing.secret === extra.secret) {
          existing.secret = null;
        }
        if (roomType === 'public') {
          existing.roomId = null;
          existing.publicRoomId = null;
        }

        // If peer still belongs to another room (e.g. LAN or secret), keep peer visible!
        if (existing.rooms.length > 0) {
          existing.roomType = existing.rooms.includes('secret')
            ? 'secret'
            : existing.rooms.includes('public')
            ? 'public'
            : 'ip';
          this.peers.set(peerId, existing);
          this.render();
          events.emit('peers-state-updated', Array.from(this.peers.values()));
          return;
        }
      }

      this.peers.delete(peerId);
      this.render();
      events.emit('peers-state-updated', Array.from(this.peers.values()));
    });

    events.on('language-changed', () => {
      this.render();
    });

    events.on('radar-origin-updated', () => {
      if (this.viewMode === 'radar' && this.peers.size > 0) {
        this.render();
      }
    });

    events.on('radar-refresh', () => {
      if (this.viewMode === 'radar' && this.peers.size > 0) {
        this.render();
      }
    });
  }

  setViewMode(mode) {
    this.viewMode = mode;
    storage.setViewMode(mode);
    this.render();
  }

  render() {
    this.container.className = `peers-view ${this.viewMode}-mode`;

    // Toggle radar canvas visibility based on view mode
    const radarCanvas = document.getElementById('radar-canvas');
    if (radarCanvas) {
      radarCanvas.style.display = this.viewMode === 'radar' ? 'block' : 'none';
    }

    const hintEl = document.getElementById('peers-instructions');

    if (this.peers.size === 0) {
      this.container.innerHTML = '';
      this.emptyState.classList.remove('hidden');
      if (hintEl) hintEl.classList.add('hidden');

      const titleEl = this.emptyState.querySelector('.empty-title');
      const descEl = this.emptyState.querySelector('.empty-desc');
      if (this.viewMode === 'grid') {
        if (titleEl) titleEl.textContent = t('empty.gridTitle');
        if (descEl) descEl.textContent = t('empty.gridDesc');
      } else {
        if (titleEl) titleEl.textContent = t('empty.radarTitle');
        if (descEl) descEl.textContent = t('empty.radarDesc');
      }
      return;
    }

    this.emptyState.classList.add('hidden');
    if (hintEl) hintEl.classList.remove('hidden');
    this.container.innerHTML = '';

    const peerArray = Array.from(this.peers.values());

    if (this.viewMode === 'grid') {
      this._renderGridView(peerArray);
    } else {
      this._renderRadarView(peerArray);
    }
  }

  _renderRadarView(peers) {
    const rect = this.container.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;

    // Anchor precisely from #my-avatar's center
    const anchor = document.getElementById('my-avatar');
    let centerX = width / 2;
    let centerY = height - 90;
    if (anchor) {
      const aRect = anchor.getBoundingClientRect();
      centerX = aRect.left + aRect.width / 2 - rect.left;
      centerY = aRect.top + aRect.height / 2 - rect.top;
    }

    const total = peers.length;
    const startAngle = (155 * Math.PI) / 180;
    const endAngle = (25 * Math.PI) / 180;
    const angleStep = total > 1 ? (startAngle - endAngle) / (total - 1) : 0;

    const isMobile = width < 600;
    const nodeMargin = isMobile ? 48 : 60;
    const maxVertical = Math.max(120, centerY - (isMobile ? 70 : 90));
    const minRadius = isMobile ? 125 : 165;

    peers.forEach((peer, i) => {
      const angle = total === 1 ? Math.PI / 2 : startAngle - angleStep * i;
      const cosA = Math.cos(angle);
      const sinA = Math.sin(angle);

      // Max horizontal extension allowed so peer node never clips viewport edges
      const maxHorizontalRadius =
        Math.abs(cosA) > 0.08 ? (width / 2 - nodeMargin) / Math.abs(cosA) : maxVertical;

      const maxAllowedRadius = Math.min(maxVertical, maxHorizontalRadius);

      // Position peer elegantly in the middle-upper field of radar waves
      const idealRadius =
        total === 1
          ? Math.min(maxAllowedRadius * 0.72, isMobile ? 220 : 310)
          : Math.min(
              maxAllowedRadius,
              Math.max(minRadius, maxVertical * 0.65 + (i % 2 === 0 ? 0 : isMobile ? 15 : 28))
            );

      const radius = Math.max(Math.min(minRadius, maxAllowedRadius), Math.min(maxAllowedRadius, idealRadius));

      const x = centerX + radius * cosA;
      const y = centerY - radius * sinA;

      const el = this._createPeerNode(peer);
      el.style.left = `${x}px`;
      el.style.top = `${y}px`;
      el.style.transform = 'translate(-50%, -50%)';
      this.container.appendChild(el);
    });
  }

  _renderGridView(peers) {
    peers.forEach((peer) => {
      const el = this._createPeerNode(peer);
      el.style.left = '';
      el.style.top = '';
      el.style.transform = '';
      this.container.appendChild(el);
    });
  }

  _createPeerNode(peer) {
    const node = document.createElement('div');
    node.className = 'peer-node';
    node.id = `peer-${peer.id}`;
    node.setAttribute('data-id', peer.id);

    const iconSvg = getDeviceIcon(peer.name?.deviceType);

    // Build room status indicator bars (colored lines per discovery scope)
    const rooms = Array.isArray(peer.rooms) && peer.rooms.length > 0
      ? peer.rooms
      : [peer.roomType || 'ip'];

    let barsHtml = '';
    // Paired status bar (Green: #10b981)
    if (rooms.includes('secret') || peer.secret || peer.roomType === 'secret') {
      barsHtml += `<span class="peer-status-bar secret" title="${t('badges.paired')}"></span>`;
    }
    // Public room status bar (Amber/Orange: #f59e0b)
    if (rooms.includes('public') || peer.publicRoomId || peer.roomId) {
      const roomNum = peer.publicRoomId || peer.roomId || '';
      barsHtml += `<span class="peer-status-bar public" title="${t('badges.public')}: #${roomNum}"></span>`;
    }
    // LAN status bar (Blue: #3b82f6)
    if (rooms.includes('ip') || (!rooms.includes('secret') && !rooms.includes('public'))) {
      barsHtml += `<span class="peer-status-bar ip" title="${t('badges.lan')}"></span>`;
    }

    node.innerHTML = `
      <div class="peer-avatar">
        <svg class="peer-progress-ring" viewBox="0 0 100 100">
          <circle class="peer-progress-circle" cx="50" cy="50" r="46" fill="none" stroke="var(--primary)" stroke-width="4" stroke-dasharray="289.03" stroke-dashoffset="289.03" stroke-linecap="round"/>
        </svg>
        ${iconSvg}
      </div>
      <div class="peer-status-bars">
        ${barsHtml}
      </div>
      <div class="peer-name" title="${peer.name?.displayName || t('peers.nearbyDevice')}">${peer.name?.displayName || t('peers.nearbyDevice')}</div>
      <div class="peer-sub">${peer.name?.deviceName || t('peers.ready')}</div>
    `;

    const prewarmConnection = () => {
      const conn = transferManager.getOrCreateConnection(peer.id);
      conn.createDataChannel('los-data');
    };

    node.addEventListener('pointerdown', prewarmConnection, { passive: true });
    node.addEventListener('dragenter', prewarmConnection, { passive: true });

    // Click: choose file to send
    node.addEventListener('click', () => {
      this.selectedPeerId = peer.id;
      // Pre-warm WebRTC connection so DataChannel is ready while user chooses files
      prewarmConnection();
      this.fileInput.value = '';
      this.fileInput.click();
    });

    // Right-click / Context menu: send text
    node.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      events.emit('open-text-modal', peer);
    });

    // Touch long-press support for mobile devices
    let touchTimer = null;
    let touchMoved = false;

    node.addEventListener('touchstart', () => {
      touchMoved = false;
      touchTimer = setTimeout(() => {
        touchTimer = null;
        events.emit('open-text-modal', peer);
      }, 550);
    }, { passive: true });

    node.addEventListener('touchmove', () => {
      touchMoved = true;
      if (touchTimer) {
        clearTimeout(touchTimer);
        touchTimer = null;
      }
    }, { passive: true });

    node.addEventListener('touchend', () => {
      if (touchTimer) {
        clearTimeout(touchTimer);
        touchTimer = null;
      }
    }, { passive: true });

    // Drag and drop onto peer
    node.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.stopPropagation();
      node.classList.add('drag-over');
    });

    node.addEventListener('dragleave', (e) => {
      e.preventDefault();
      e.stopPropagation();
      node.classList.remove('drag-over');
    });

    node.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      node.classList.remove('drag-over');

      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        transferManager.sendFiles(peer.id, e.dataTransfer.files);
      }
    });

    return node;
  }

  getPeerPosition(peerId) {
    const node = this.container.querySelector(`.peer-node[data-id="${peerId}"]`) || document.getElementById(`peer-${peerId}`);
    if (!node) return null;
    const avatar = node.querySelector('.peer-avatar') || node;
    const rect = avatar.getBoundingClientRect();
    const canvas = document.getElementById('beam-canvas') || document.getElementById('radar-canvas');
    const canvasRect = canvas ? canvas.getBoundingClientRect() : { left: 0, top: 0 };
    return {
      x: Math.round(rect.left + rect.width / 2 - canvasRect.left),
      y: Math.round(rect.top + rect.height / 2 - canvasRect.top),
    };
  }

  updatePeerProgress(peerId, progress) {
    const node = this.container.querySelector(`.peer-node[data-id="${peerId}"]`) || document.getElementById(`peer-${peerId}`);
    if (!node) return;
    const ring = node.querySelector('.peer-progress-ring');
    const circle = node.querySelector('.peer-progress-circle');
    if (ring && circle) {
      ring.classList.add('active');
      const circumference = 289.03;
      const offset = circumference * (1 - Math.min(1, Math.max(0, progress)));
      circle.style.strokeDashoffset = `${offset}`;
    }
  }

  clearPeerProgress(peerId) {
    const node = this.container.querySelector(`.peer-node[data-id="${peerId}"]`) || document.getElementById(`peer-${peerId}`);
    if (!node) return;
    const ring = node.querySelector('.peer-progress-ring');
    const circle = node.querySelector('.peer-progress-circle');
    if (ring && circle) {
      ring.classList.remove('active');
      circle.style.strokeDashoffset = '289.03';
    }
  }
}
