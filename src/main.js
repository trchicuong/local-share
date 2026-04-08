import { ENV } from './config.js';
import {
  sanitizeHTML,
  sanitizeMarkdown,
  sanitizeSVG,
  sanitizeFilename,
  createSafeBlobURL,
  validateFileType,
  sanitizeText,
  detectMaliciousContent,
  createSafeElement,
} from './security.js';
import { cleanupManager } from './cleanup.js';

const statusEl = document.getElementById('status-text');
const statusDotEl = document.getElementById('status-dot');
const preloaderEl = document.getElementById('preloader');
const fileInput = document.getElementById('fileInput');
const selectFilesBtn = document.getElementById('select-files-btn');
const selectFolderBtn = document.getElementById('select-folder-btn');
const fileArea = document.querySelector('.file-area');
const fileCard = document.querySelector('.file-card');
const joinRoomBtn = document.getElementById('join-room-button');
const roomIdInput = document.getElementById('room-id-input');
const landingPage = document.getElementById('landing-page');
const appPage = document.getElementById('app-page');
const peerIdEl = document.getElementById('my-id');
const peerListEl = document.getElementById('device-list');
const progressEl = document.getElementById('progress-bar');
const serverPingEl = document.getElementById('server-ping');
const p2pPingEl = document.getElementById('p2p-ping');
const connectionIndicatorEl = document.getElementById('connection-indicator');
const connectionInfoEl = document.getElementById('connection-info');
const installBtn = document.getElementById('install-button');
const installBanner = document.getElementById('install-prompt-banner');
const iosBanner = document.getElementById('ios-install-prompt');
const closePromptBtn = document.getElementById('close-prompt-btn');
const closeIosBtn = document.getElementById('close-ios-prompt-btn');
const helpButton = document.getElementById('help-button');
const helpModal = document.getElementById('help-modal');
const closeHelpModal = document.getElementById('close-help-modal');
let deferredInstallPrompt = null;
const previewOverlay = document.getElementById('file-preview-overlay');
const previewContent = document.getElementById('preview-content');
const previewFilename = document.getElementById('preview-filename');
const previewDownloadBtn = document.getElementById('preview-download-btn');
const previewCloseBtn = document.getElementById('preview-close-btn');
const historyListEl = document.getElementById('history-list');
let currentPreviewUrl = null;

// Cache file selection UI elements
const fileNameEl = document.getElementById('file-name');
const fileSizeNoteEl = document.getElementById('file-size-note');
const fileWarningEl = document.getElementById('file-warning');

if (helpButton && helpModal) {
  helpButton.addEventListener('click', () => helpModal.classList.add('active'));
}

if (closeHelpModal && helpModal) {
  closeHelpModal.addEventListener('click', () => helpModal.classList.remove('active'));
}

if (helpModal) {
  helpModal.addEventListener('click', (e) => {
    if (e.target === helpModal) helpModal.classList.remove('active');
  });
}

if (selectFilesBtn) {
  selectFilesBtn.addEventListener('click', () => {
    fileInput.multiple = true;
    fileInput.removeAttribute('webkitdirectory');
    fileInput.click();
  });
}

if (selectFolderBtn) {
  selectFolderBtn.addEventListener('click', () => {
    fileInput.multiple = true; // webkitdirectory implies multiple
    fileInput.setAttribute('webkitdirectory', '');
    fileInput.click();
  });
}

let ws, peerConnection, dataChannel;
let myId = null;
let myRoomId = null;
let connectedPeerId = null;
let fileReader,
  fileMeta,
  fileBuffer = [];
let isSender = false;
let networkStats = {};
let receivedBytes = 0;
let pendingFileToSend = null;
let peerDevices = new Map();
let myDeviceInfo = null;
let networkTestInterval = null; // Track interval for cleanup
let p2pPingInterval = null; // Track P2P ping interval
let p2pPingStats = {}; // Store P2P ping timestamps

// State management for race conditions
let pendingIceCandidates = []; // Queue for ICE candidates received before remoteDescription
let pendingOutgoingCandidates = []; // Queue for ICE candidates when WebSocket not ready
let currentDataChannelHandlers = null; // Track handlers for cleanup
let isSendingFile = false; // Prevent concurrent file sends
let makingOffer = false; // Track offer negotiation state
let ignoreOffer = false; // Handle glare attack
let wsReconnectAttempts = 0; // WebSocket reconnection counter
let transferStartTime = null; // Track transfer speed
let lastProgressUpdate = 0; // Throttle progress updates

const WARNING_THRESHOLD = 500 * 1024 * 1024; // 500MB - show warning for large files
const PREVIEW_LIMIT = 500 * 1024 * 1024; // 500MB - prevent in-browser preview to avoid OOM
const MAX_BUFFER_SIZE = 800 * 1024 * 1024; // 800MB - hard limit to prevent OOM crash
const HISTORY_LIMIT = 10;
const MAX_RECONNECT_ATTEMPTS = 5; // WebSocket reconnection limit
const RECONNECT_DELAY = 3000; // 3 seconds between reconnection attempts
const P2P_PING_TIMEOUT = 30000; // 30 seconds timeout for P2P ping cleanup

/**
 * Safely send message via WebSocket with readyState check
 * @param {Object} data - Message object to send
 * @returns {boolean} - True if sent successfully, false otherwise
 */
function safeSendWS(data) {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    console.warn('Cannot send WebSocket message: WebSocket not ready', data);
    return false;
  }
  try {
    ws.send(JSON.stringify(data));
    return true;
  } catch (error) {
    console.error('Error sending WebSocket message:', error);
    return false;
  }
}

/**
 * Saves a file transfer record to localStorage.
 * @param {object} fileInfo - Information about the file transfer.
 * @param {'sent' | 'received'} type - The type of transfer.
 */

function saveToHistory(fileInfo, type) {
  if (!fileInfo) return;
  const peerDevice = peerDevices.get(connectedPeerId);
  const peerName = peerDevice ? peerDevice.deviceName : connectedPeerId;

  const historyItem = {
    name: fileInfo.name,
    size: fileInfo.size,
    type: type,
    timestamp: new Date().toISOString(),
    peer: peerName || 'Unknown',
  };

  let history = JSON.parse(localStorage.getItem('los-history') || '[]');
  history.unshift(historyItem);
  if (history.length > HISTORY_LIMIT) {
    history = history.slice(0, HISTORY_LIMIT);
  }
  localStorage.setItem('los-history', JSON.stringify(history));
  renderHistory();
}

/**
 * Renders the file transfer history from localStorage into the UI.
 */
function renderHistory() {
  if (!historyListEl) return;
  const history = JSON.parse(localStorage.getItem('los-history') || '[]');
  historyListEl.innerHTML = '';

  if (history.length === 0) {
    historyListEl.innerHTML = '<li class="no-history">Chưa có lịch sử nào.</li>';
    return;
  }

  const fragment = document.createDocumentFragment();
  history.forEach((item) => {
    const li = document.createElement('li');
    li.className = 'history-item';
    const isSent = item.type === 'sent';
    const icon = isSent
      ? `
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="history-icon sent">
        <path stroke-linecap="round" stroke-linejoin="round" d="M4.5 10.5 12 3m0 0 7.5 7.5M12 3v18" />
      </svg>`
      : `
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="history-icon received">
        <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 13.5 12 21m0 0-7.5-7.5M12 21V3" />
      </svg>`;

    const sizeFormatted =
      item.size > 1024 * 1024
        ? `${(item.size / (1024 * 1024)).toFixed(2)} MB`
        : `${(item.size / 1024).toFixed(1)} KB`;

    li.innerHTML = `
      ${icon}
      <div class="history-details">
        <div class="history-filename">${item.name}</div>
        <div class="history-meta">
          <span>${sizeFormatted}</span>
          <span>${isSent ? 'Gửi tới' : 'Nhận từ'} ${item.peer}</span>
        </div>
      </div>
      <div class="history-time">${new Date(item.timestamp).toLocaleString()}</div>
    `;
    fragment.appendChild(li);
  });
  historyListEl.appendChild(fragment);
}

function setStatus(msg, type = 'info') {
  statusEl.textContent = msg;
  statusEl.className = type;

  if (statusDotEl) {
    statusDotEl.className = 'status-dot';
    if (type === 'success') {
      statusDotEl.classList.add('connected');
    } else if (type === 'error') {
      statusDotEl.classList.add('failed');
    } else if (type === 'info') {
      statusDotEl.classList.add('connecting');
    }
  }
}

function showPreloader() {
  if (preloaderEl) preloaderEl.classList.remove('hidden');
}

function hidePreloader() {
  if (preloaderEl) preloaderEl.classList.add('hidden');
}

function updateFileSelectionUI(file) {
  // Use cached elements instead of querying DOM
  if (fileNameEl) fileNameEl.textContent = file ? file.name : '';
  if (fileSizeNoteEl) {
    if (file) {
      const maxMB = Math.floor(ENV.MAX_FILE_SIZE / (1024 * 1024));
      fileSizeNoteEl.textContent = `Kích thước tối đa: ${maxMB} MB`;
      fileSizeNoteEl.classList.add('visible');
    } else {
      fileSizeNoteEl.classList.remove('visible');
    }
  }
  if (fileWarningEl) {
    if (file && file.size >= WARNING_THRESHOLD) {
      fileWarningEl.classList.remove('hidden');
      fileWarningEl.textContent = `File lớn (${Math.round(
        file.size / (1024 * 1024),
      )} MB). Việc gửi có thể chiếm nhiều băng thông và bộ nhớ. Hãy đảm bảo cả hai thiết bị có đủ dung lượng. Cần xác nhận khi bấm Gửi.`;
    } else {
      fileWarningEl.classList.add('hidden');
      fileWarningEl.textContent = '';
    }
  }
}

function updatePeerList(peers) {
  peerListEl.innerHTML = '';
  if (!peers || peers.length === 0) {
    const li = document.createElement('li');
    li.className = 'no-device';
    li.textContent = 'Đang tìm các thiết bị khác trong phòng...';
    peerListEl.appendChild(li);
    updateRadarBlips(0);
    return;
  }
  peers.forEach((id) => addPeerToList(id));
  updateRadarBlips(peers.length);
}

function updateRadarBlips(count) {
  const radarContainer = document.querySelector('.radar-container');
  if (!radarContainer) return;

  const existingBlips = radarContainer.querySelectorAll('.device-blip');
  existingBlips.forEach((blip) => blip.remove());

  // Use DocumentFragment to batch DOM updates
  const fragment = document.createDocumentFragment();

  for (let i = 0; i < count; i++) {
    const blip = document.createElement('div');
    blip.className = 'device-blip';

    const angle = (360 / count) * i + Math.random() * 30;
    const distance = 30 + Math.random() * 40;
    const x = 50 + distance * Math.cos((angle * Math.PI) / 180);
    const y = 50 + distance * Math.sin((angle * Math.PI) / 180);

    blip.style.left = `${x}%`;
    blip.style.top = `${y}%`;
    blip.style.animationDelay = `${i * 0.3}s`;

    fragment.appendChild(blip);
  }

  // Single DOM update instead of count updates
  radarContainer.appendChild(fragment);
}

function getDeviceInfo() {
  const ua = navigator.userAgent;
  let deviceType = 'desktop';
  let deviceName = 'Desktop';
  let icon = `
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
      <path stroke-linecap="round" stroke-linejoin="round" d="M9 17.25v1.007a3 3 0 0 1-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0 1 15 18.257V17.25m6-12V15a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 15V5.25m18 0A2.25 2.25 0 0 0 18.75 3H5.25A2.25 2.25 0 0 0 3 5.25m18 0V12a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 12V5.25" />
    </svg>
  `;

  // Detect mobile
  if (/Mobile|Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(ua)) {
    deviceType = 'mobile';
    if (/iPad/i.test(ua)) {
      deviceName = 'iPad';
      icon = `
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" d="M10.5 19.5h3m-6.75 2.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-15a2.25 2.25 0 0 0-2.25-2.25H6.75A2.25 2.25 0 0 0 4.5 4.5v15a2.25 2.25 0 0 0 2.25 2.25Z" />
        </svg>
      `;
    } else if (/iPhone/i.test(ua)) {
      deviceName = 'iPhone';
      icon = `
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" d="M10.5 1.5H8.25A2.25 2.25 0 0 0 6 3.75v16.5a2.25 2.25 0 0 0 2.25 2.25h7.5A2.25 2.25 0 0 0 18 20.25V3.75a2.25 2.25 0 0 0-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 18.75h3" />
        </svg>
      `;
    } else if (/Android/i.test(ua)) {
      deviceName = 'Android';
      icon = `
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" d="M10.5 1.5H8.25A2.25 2.25 0 0 0 6 3.75v16.5a2.25 2.25 0 0 0 2.25 2.25h7.5A2.25 2.25 0 0 0 18 20.25V3.75a2.25 2.25 0 0 0-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 18.75h3" />
        </svg>
      `;
    } else {
      deviceName = 'Mobile';
      icon = `
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" d="M10.5 1.5H8.25A2.25 2.25 0 0 0 6 3.75v16.5a2.25 2.25 0 0 0 2.25 2.25h7.5A2.25 2.25 0 0 0 18 20.25V3.75a2.25 2.25 0 0 0-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 18.75h3" />
        </svg>
      `;
    }
  }
  // Detect tablet
  else if (/Tablet/i.test(ua)) {
    deviceType = 'tablet';
    deviceName = 'Tablet';
    icon = `
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" d="M10.5 19.5h3m-6.75 2.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-15a2.25 2.25 0 0 0-2.25-2.25H6.75A2.25 2.25 0 0 0 4.5 4.5v15a2.25 2.25 0 0 0 2.25 2.25Z" />
      </svg>
    `;
  }
  // Desktop variations
  else {
    if (/Windows/i.test(ua)) {
      deviceName = 'Windows PC';
    } else if (/Macintosh|MacIntel|MacPPC|Mac68K/i.test(ua)) {
      deviceName = 'Mac';
    } else if (/Linux/i.test(ua)) {
      deviceName = 'Linux';
    }
  }

  return { deviceType, deviceName, icon };
}

function addPeerToList(id) {
  if (!peerListEl) return;
  if (peerListEl.querySelector(`#peer-${id}`)) return;
  const noDevice = peerListEl.querySelector('.no-device');
  if (noDevice) noDevice.remove();
  const li = document.createElement('li');
  li.id = `peer-${id}`;
  li.setAttribute('data-peer-id', id);

  const deviceInfo = peerDevices.get(id) || {
    deviceName: 'Unknown Device',
    icon: `
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" d="M9 17.25v1.007a3 3 0 0 1-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0 1 15 18.257V17.25m6-12V15a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 15V5.25m18 0A2.25 2.25 0 0 0 18.75 3H5.25A2.25 2.25 0 0 0 3 5.25m18 0V12a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 12V5.25" />
      </svg>
    `,
  };

  const iconDiv = document.createElement('div');
  iconDiv.className = 'device-icon';
  iconDiv.innerHTML = deviceInfo.icon;

  const infoDiv = document.createElement('div');
  infoDiv.className = 'device-info';

  const nameSpan = document.createElement('div');
  nameSpan.className = 'device-name';
  nameSpan.textContent = deviceInfo.deviceName;

  const span = document.createElement('span');
  span.textContent = id;
  span.className = 'peer-id';

  infoDiv.appendChild(nameSpan);
  infoDiv.appendChild(span);

  const btn = document.createElement('button');
  btn.className = 'send-button button';
  btn.textContent = 'Gửi';

  // Debounce state for this button
  let isProcessing = false;

  // Store handler reference for cleanup
  const handleSendClick = async () => {
    // Prevent concurrent sends
    if (isSendingFile) {
      setStatus('Đang gửi file khác, vui lòng đợi!', 'info');
      return;
    }

    // Debounce: prevent rapid clicks
    if (isProcessing) {
      setStatus('Đang xử lý yêu cầu, vui lòng đợi...', 'info');
      return;
    }

    const f = fileInput && fileInput.files && fileInput.files[0];
    if (!f) {
      setStatus('Vui lòng chọn file trước!', 'error');
      return;
    }

    // Validate file
    if (!f.name || f.size === 0) {
      setStatus('File không hợp lệ. Vui lòng chọn lại.', 'error');
      if (fileInput) fileInput.value = '';
      return;
    }

    // Disable button and set processing state
    isProcessing = true;
    btn.disabled = true;
    btn.textContent = 'Đang kết nối...';

    try {
      pendingFileToSend = f;
      await connectToPeer(id);
    } catch (err) {
      console.error('Error connecting to peer:', err);
      setStatus('Lỗi khi kết nối. Vui lòng thử lại.', 'error');
    } finally {
      // Re-enable after delay (debounce)
      setTimeout(() => {
        isProcessing = false;
        btn.disabled = false;
        btn.textContent = 'Gửi';
      }, 1500); // 1.5s debounce
    }
  };
  btn.addEventListener('click', handleSendClick);
  btn._sendHandler = handleSendClick; // Store for later cleanup

  li.appendChild(iconDiv);
  li.appendChild(infoDiv);
  li.appendChild(btn);
  peerListEl.appendChild(li);
}

function removePeerFromList(id) {
  const el = peerListEl && peerListEl.querySelector(`#peer-${id}`);
  if (el) {
    // Cleanup event listener before removing element
    const btn = el.querySelector('.send-button');
    if (btn && btn._sendHandler) {
      btn.removeEventListener('click', btn._sendHandler);
      btn._sendHandler = null;
    }
    el.remove();
  }
  if (peerListEl && peerListEl.children.length === 0) {
    const li = document.createElement('li');
    li.className = 'no-device';
    li.textContent = 'Đang tìm các thiết bị khác...';
    peerListEl.appendChild(li);
  }
}

function connectWebSocket() {
  showPreloader();

  if (!myDeviceInfo) {
    myDeviceInfo = getDeviceInfo();
  }
  const roomId = roomIdInput.value.trim();
  const wsUrl = `${ENV.SIGNALING_SERVER_URL}?roomId=${encodeURIComponent(roomId)}`;
  ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    hidePreloader();
    wsReconnectAttempts = 0; // Reset reconnect counter on successful connection
    setStatus('Đã kết nối tới máy chủ. Tìm thiết bị trong phòng...', 'success');

    safeSendWS({
      type: 'device-info',
      deviceInfo: myDeviceInfo,
    });

    // Flush pending outgoing ICE candidates
    if (pendingOutgoingCandidates.length > 0) {
      console.log(`Flushing ${pendingOutgoingCandidates.length} pending ICE candidates`);
      pendingOutgoingCandidates.forEach((msg) => safeSendWS(msg));
      pendingOutgoingCandidates = [];
    }

    // Start network monitoring when WebSocket connected
    startNetworkMonitoring();
  };
  ws.onmessage = handleSignalMessage;
  ws.onclose = (event) => {
    hidePreloader();
    stopNetworkMonitoring();

    // Log close details for debugging
    console.warn(
      `WebSocket closed: code=${event.code}, reason='${event.reason}', clean=${event.wasClean}`,
    );

    // Implement auto-reconnect
    if (wsReconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
      wsReconnectAttempts++;
      setStatus(
        `Kết nối bị ngắt (code: ${event.code}). Đang thử kết nối lại (lần ${wsReconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})...`,
        'info',
      );

      setTimeout(() => {
        console.log('Attempting WebSocket reconnection...');
        connectWebSocket();
      }, RECONNECT_DELAY);
    } else {
      setStatus('Kết nối tới máy chủ bị ngắt. Vui lòng kiểm tra mạng hoặc tải lại trang.', 'error');
    }
  };
  ws.onerror = (error) => {
    hidePreloader();
    console.error('WebSocket error:', error);
    setStatus(
      'Lỗi kết nối WebSocket — máy chủ tín hiệu không phản hồi. Kiểm tra kết nối mạng.',
      'error',
    );
  };
}

function handleSignalMessage(event) {
  const data = JSON.parse(event.data);
  if (data.type === 'your-id') {
    myId = data.id;
    myRoomId = data.roomId;
    peerIdEl.textContent = `${myId} | ${myRoomId}`;

    const deviceIconEl = document.getElementById('my-device-icon');
    if (deviceIconEl && myDeviceInfo) {
      deviceIconEl.innerHTML = myDeviceInfo.icon;
    }
  } else if (data.type === 'peer-list') {
    updatePeerList(data.peers);
  } else if (data.type === 'new-peer') {
    addPeerToList(data.id);
  } else if (data.type === 'peer-disconnect') {
    removePeerFromList(data.id);
    peerDevices.delete(data.id);
  } else if (data.type === 'peer-device-info') {
    peerDevices.set(data.peerId, data.deviceInfo);

    const peerCard = document.querySelector(`[data-peer-id="${data.peerId}"]`);
    if (peerCard) {
      const iconEl = peerCard.querySelector('.device-icon');
      const nameEl = peerCard.querySelector('.device-name');
      if (iconEl && data.deviceInfo && data.deviceInfo.icon) {
        iconEl.innerHTML = data.deviceInfo.icon;
      }
      if (nameEl && data.deviceInfo && data.deviceInfo.deviceName) {
        nameEl.textContent = data.deviceInfo.deviceName;
      }
    }
  } else if (data.type === 'offer') {
    handleOffer(data);
  } else if (data.type === 'answer') {
    handleAnswer(data);
  } else if (data.type === 'candidate') {
    handleCandidate(data);
  } else if (data.type === 'pong') {
    networkStats.ping = Date.now() - networkStats.pingSent;
    updateDiagnostics();
  } else if (data.type === 'error') {
    setStatus(data.message || 'Lỗi từ server', 'error');
    console.error('Server error:', data.message);
  }
}

async function connectToPeer(id) {
  connectedPeerId = id;
  isSender = true;

  if (!peerConnection) {
    createPeerConnection();
  }

  // Check if already negotiating with better user feedback
  if (makingOffer) {
    console.log('Already making offer, waiting for completion');
    setStatus('Đang kết nối, vui lòng đợi...', 'info');
    return Promise.reject(new Error('Already negotiating'));
  }

  // Create data channel before making offer
  dataChannel = peerConnection.createDataChannel('file');
  setupDataChannel();

  setStatus(`Đang kết nối tới thiết bị ${id}...`, 'info');
  makingOffer = true;

  try {
    const offer = await peerConnection.createOffer();
    
    if (peerConnection.signalingState !== 'stable') {
      console.log('Signaling state not stable, aborting offer');
      throw new Error('Signaling state not stable');
    }

    await peerConnection.setLocalDescription(offer);

    if (!connectedPeerId) {
      console.error('Cannot send offer: connectedPeerId is null');
      throw new Error('Peer ID is null');
    }

    safeSendWS({
      type: 'offer',
      target: connectedPeerId,
      offer: peerConnection.localDescription,
    });

    console.log('Offer sent successfully to', id);
  } catch (err) {
    console.error('Error creating/sending offer:', err);
    setStatus('Lỗi khi kết nối. Vui lòng thử lại.', 'error');
    throw err;
  } finally {
    makingOffer = false;
  }
}

function createPeerConnection() {
  // Close existing connection before creating new one
  if (peerConnection) {
    console.log('[WebRTC] Closing existing peer connection before creating new one');
    try {
      if (peerConnection.connectionState !== 'closed') {
        peerConnection.close();
      }
    } catch (err) {
      console.warn('[WebRTC] Error closing old peer connection:', err);
    }
    peerConnection = null;
  }

  // Cleanup old data channel
  if (dataChannel) {
    try {
      if (dataChannel.readyState !== 'closed') {
        dataChannel.close();
      }
    } catch (err) {
      console.warn('[WebRTC] Error closing old data channel:', err);
    }
    dataChannel = null;
  }

  // Reset state for new connection
  pendingIceCandidates = [];
  isSender = false;

  peerConnection = new RTCPeerConnection(ENV.RTC_CONFIG);
  peerConnection.onicecandidate = (e) => {
    if (e.candidate) {
      if (!connectedPeerId) {
        console.warn('ICE candidate generated but connectedPeerId is null, queuing...');
        return;
      }
      const candidateMessage = {
        type: 'candidate',
        target: connectedPeerId,
        candidate: e.candidate,
      };

      // Try to send immediately, if fails then queue it
      const sent = safeSendWS(candidateMessage);
      if (!sent) {
        console.log('Queueing ICE candidate for later delivery');
        pendingOutgoingCandidates.push(candidateMessage);
      }
    }
  };
  peerConnection.ondatachannel = (e) => {
    dataChannel = e.channel;
    setupDataChannel();
  };

  peerConnection.onconnectionstatechange = () => {
    const st = peerConnection.connectionState;
    if (st === 'connecting') {
      setStatus('Đang thiết lập kênh WebRTC...', 'info');
      setConnectionState('connecting', 'Đang bắt tay WebRTC');
    } else if (st === 'connected') {
      setStatus('Kết nối tới thiết bị đã thiết lập. Có thể gửi/nhận file.', 'success');
      setConnectionState('connected', 'Đã kết nối');
      updateConnectionQuality();
      startNetworkMonitoring(); // Start monitoring when connected
    } else if (st === 'disconnected' || st === 'failed') {
      setStatus('Kết nối bị gián đoạn hoặc thất bại.', 'error');
      setConnectionState('disconnected', 'Kết nối đã ngắt');
      stopNetworkMonitoring(); // Stop monitoring when disconnected
      // Auto cleanup after disconnect
      setTimeout(() => {
        if (peerConnection && peerConnection.connectionState === 'disconnected') {
          console.log('[WebRTC] Auto-cleanup disconnected peer connection');
          cleanupConnection();
        }
      }, 5000); // Wait 5s before cleanup
    } else if (st === 'failed') {
      setStatus('Kết nối thất bại. Vui lòng thử lại.', 'error');
      setConnectionState('disconnected', 'Kết nối thất bại');
      stopNetworkMonitoring();
      cleanupConnection(); // Immediate cleanup on failure
    } else if (st === 'closed') {
      setStatus('Kênh kết nối đóng. Để gửi tiếp, chọn file mới và bấm Gửi.', 'error');
      setConnectionState('disconnected', 'Đã đóng');
      stopNetworkMonitoring(); // Stop monitoring when closed
    }
  };
}

function setupDataChannel() {
  // Cleanup old handlers if exist
  if (currentDataChannelHandlers) {
    cleanupDataChannelHandlers(currentDataChannelHandlers);
  }

  // Create new handler object
  const handlers = {
    onopen: () => {
      setStatus('Kênh dữ liệu sẵn sàng. Chờ lệnh gửi từ thiết bị nguồn.', 'success');
      if (pendingFileToSend && isSender) {
        sendFile(pendingFileToSend);
        pendingFileToSend = null;
      }
      startP2PPing();
    },
    onclose: () => {
      setStatus('Kênh dữ liệu đóng. Thử tạo kết nối lại nếu cần.', 'error');

      // Clear buffer to prevent data corruption
      if (fileBuffer.length > 0) {
        console.warn('Connection closed during file transfer, clearing buffer');
        fileBuffer = [];
        receivedBytes = 0;
        fileMeta = null;
        updateProgress(0, 0);
      }

      stopNetworkMonitoring();
      stopP2PPing();
    },
    onerror: (err) => {
      console.error('DataChannel error:', err);
      setStatus('Lỗi trên kênh dữ liệu. Kiểm tra kết nối.', 'error');

      // Clear buffer on error
      fileBuffer = [];
      receivedBytes = 0;
      fileMeta = null;
      updateProgress(0, 0);

      stopNetworkMonitoring();
      stopP2PPing();
    },
    onmessage: handleDataChannelMessage,
  };

  // Assign handlers
  dataChannel.onopen = handlers.onopen;
  dataChannel.onclose = handlers.onclose;
  dataChannel.onerror = handlers.onerror;
  dataChannel.onmessage = handlers.onmessage;

  // Store for cleanup
  currentDataChannelHandlers = { channel: dataChannel, handlers };
}

function cleanupDataChannelHandlers(handlerObj) {
  if (!handlerObj || !handlerObj.channel) return;

  const ch = handlerObj.channel;
  ch.onopen = null;
  ch.onclose = null;
  ch.onerror = null;
  ch.onmessage = null;
  ch.onbufferedamountlow = null;
}

async function handleOffer(data) {
  connectedPeerId = data.sender;
  isSender = false;

  if (!peerConnection) {
    createPeerConnection();
  }

  // Determine if we should ignore this offer (polite peer logic)
  // Only apply collision detection if we're currently negotiating
  const polite = myId < data.sender; // Peer with smaller ID is "polite"
  const offerCollision = makingOffer || peerConnection?.signalingState !== 'stable';

  // Only ignore if we're the impolite peer AND we're currently making our own offer
  // Don't ignore initial offers (when we're not making an offer ourselves)
  const shouldIgnore = !polite && offerCollision && makingOffer;

  if (shouldIgnore) {
    console.log('Ignoring offer due to collision (impolite peer actively making offer)');
    return;
  }

  try {
    await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));

    // Process queued candidates after remoteDescription is set
    pendingIceCandidates.forEach((candidate) => {
      peerConnection.addIceCandidate(candidate).catch((err) => {
        console.error('Error adding queued ICE candidate:', err);
      });
    });
    pendingIceCandidates = [];

    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);

    if (!connectedPeerId) {
      console.error('Cannot send answer: connectedPeerId is null');
      setStatus('Lỗi: Không xác định được peer', 'error');
      return;
    }

    safeSendWS({
      type: 'answer',
      target: connectedPeerId,
      answer: peerConnection.localDescription,
    });
  } catch (err) {
    console.error('Error handling offer:', err);
    setStatus('Lỗi khi xử lý offer từ peer', 'error');
  }
}

function handleAnswer(data) {
  peerConnection
    .setRemoteDescription(new RTCSessionDescription(data.answer))
    .then(() => {
      // Process queued candidates after answer is set
      pendingIceCandidates.forEach((candidate) => {
        peerConnection.addIceCandidate(candidate).catch((err) => {
          console.error('Error adding queued ICE candidate:', err);
        });
      });
      pendingIceCandidates = [];
    })
    .catch((err) => {
      console.error('Error handling answer:', err);
      setStatus('Lỗi khi xử lý answer từ peer', 'error');
    });
}

function handleCandidate(data) {
  // Queue candidates if remoteDescription not ready
  const candidate = new RTCIceCandidate(data.candidate);

  if (
    !peerConnection ||
    !peerConnection.remoteDescription ||
    !peerConnection.remoteDescription.type
  ) {
    // Queue candidate for later processing
    pendingIceCandidates.push(candidate);
    console.log('Queued ICE candidate (remoteDescription not ready)');
    return;
  }

  // Remote description is ready, add candidate immediately
  peerConnection.addIceCandidate(candidate).catch((err) => {
    console.error('Error adding ICE candidate:', err);
  });
}

// Process file metadata and binary chunks from sender
function handleDataChannelMessage(e) {
  if (typeof e.data === 'string') {
    const meta = JSON.parse(e.data);

    // Handle P2P ping/pong
    if (meta.type === 'p2p-ping') {
      // Receiver: send pong back
      if (dataChannel && dataChannel.readyState === 'open') {
        dataChannel.send(JSON.stringify({ type: 'p2p-pong', pingId: meta.pingId }));
      }
      return;
    } else if (meta.type === 'p2p-pong') {
      // Sender: calculate RTT
      const sentTime = p2pPingStats[meta.pingId];
      if (sentTime) {
        const rtt = Date.now() - sentTime;
        delete p2pPingStats[meta.pingId];
        updateDiagnostics({ p2pPing: rtt });
      }
      return;
    }

    if (isSender) return;
    if (meta.type === 'file-meta') {
      // Check file size BEFORE accepting
      if (meta.size && meta.size > MAX_BUFFER_SIZE) {
        const maxMB = (MAX_BUFFER_SIZE / (1024 * 1024)).toFixed(0);
        const fileMB = (meta.size / (1024 * 1024)).toFixed(1);
        setStatus(
          `File quá lớn (${fileMB} MB). Giới hạn tối đa: ${maxMB} MB để tránh crash trình duyệt.`,
          'error',
        );
        // Close connection to prevent OOM
        if (dataChannel && dataChannel.readyState === 'open') {
          dataChannel.close();
        }
        return; // Abort receiving
      }

      // Sanitize filename on receive
      meta.name = sanitizeFilename(meta.name);
      fileMeta = meta;
      fileBuffer = [];
      receivedBytes = 0;
      updateProgress(0, fileMeta.size || 0);
      const sizeMB = fileMeta && fileMeta.size ? (fileMeta.size / (1024 * 1024)).toFixed(1) : '-';
      setStatus(`Đang nhận file "${meta.name}" (${sizeMB} MB).`, 'info');
    } else if (meta.type === 'file-end') {
      try {
        const blob = new Blob(fileBuffer);
        // Avoid preview for large files to prevent memory issues
        if (fileMeta && fileMeta.size && fileMeta.size > PREVIEW_LIMIT) {
          fileBuffer = [];
          const sizeMB = (fileMeta.size / (1024 * 1024)).toFixed(1);
          const fileName = fileMeta.name || 'unnamed_file';
          // prepare download link in preview overlay
          if (previewContent && previewDownloadBtn && previewFilename && previewOverlay) {
            previewContent.innerHTML = `<p>File lớn (${sizeMB} MB) không khả dụng cho bản xem trước. Nhấn "Tải xuống" để lưu về thiết bị.</p>`;
            const url = URL.createObjectURL(blob);
            currentPreviewUrl = url;
            previewFilename.textContent = fileName;
            previewDownloadBtn.setAttribute('href', url);
            previewDownloadBtn.setAttribute('download', fileName);
            previewOverlay.classList.remove('hidden');
          }
          setStatus(
            `Đã nhận xong file “${fileName}” (${sizeMB} MB). Nhấn Tải xuống để lưu.`,
            'success',
          );
          updateProgress(0, 0);
        } else {
          const fileName = fileMeta ? fileMeta.name || 'unnamed_file' : 'unnamed_file';
          showFilePreview(fileName, blob);
          setStatus(`Đã nhận xong file “${fileName}”. Sẵn sàng tải về.`, 'success');
          fileBuffer = [];
          updateProgress(0, 0);
        }
        // Save received file to history
        saveToHistory(fileMeta, 'received');
      } catch (err) {
        console.error('Error handling received file:', err);
        setStatus('Lỗi khi xử lý file nhận được. Vui lòng thử lại.', 'error');
        fileBuffer = [];
        updateProgress(0, 0);
      }
    }
  } else {
    // Safety check: Don't exceed buffer limit during reception
    const newSize = receivedBytes + (e.data.byteLength || 0);
    if (newSize > MAX_BUFFER_SIZE) {
      const maxMB = (MAX_BUFFER_SIZE / (1024 * 1024)).toFixed(0);
      setStatus(`Vượt giới hạn buffer (${maxMB} MB). Hủy nhận file để tránh crash.`, 'error');
      fileBuffer = [];
      receivedBytes = 0;
      if (dataChannel && dataChannel.readyState === 'open') {
        dataChannel.close();
      }
      return;
    }

    fileBuffer.push(e.data);
    receivedBytes += e.data.byteLength || 0;
    if (fileMeta && fileMeta.size) updateProgress(receivedBytes, fileMeta.size);
  }
}

// Try preview by type; always provide download
function showFilePreview(filename, blob) {
  // Sanitize filename for display and download
  const safeName = sanitizeFilename(filename);

  if (!previewOverlay || !previewContent || !previewDownloadBtn || !previewFilename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = safeName; // Use sanitized name
    a.click();
    URL.revokeObjectURL(url);
    return;
  }
  if (currentPreviewUrl) {
    URL.revokeObjectURL(currentPreviewUrl);
    currentPreviewUrl = null;
  }
  previewContent.innerHTML = '';
  const url = createSafeBlobURL(blob); // Use safe blob URL with auto-cleanup
  currentPreviewUrl = url;
  previewFilename.textContent = safeName;
  previewDownloadBtn.setAttribute('href', url);
  previewDownloadBtn.setAttribute('download', safeName);
  const lower = safeName.toLowerCase();
  const { SUPPORTED_PREVIEW_FORMATS: F } = ENV; // preview regexes
  let el = null;
  if (F.image.test(lower)) {
    // Validate image file type for additional security
    if (!validateFileType(blob, ['image/*'])) {
      console.warn('[Security] Invalid image file type');
      el = createSafeElement('p', {}, 'File type không hợp lệ. Vui lòng tải xuống.');
    } else {
      el = createSafeElement('img', {
        src: url,
        alt: safeName,
        style: 'max-width: 100%; max-height: 70vh;',
      });
    }
  } else if (F.video.test(lower)) {
    // Validate video file type
    if (!validateFileType(blob, ['video/*'])) {
      console.warn('[Security] Invalid video file type');
      el = createSafeElement('p', {}, 'File type không hợp lệ. Vui lòng tải xuống.');
    } else {
      el = createSafeElement('video', {
        src: url,
        controls: 'true',
        style: 'max-width: 100%; max-height: 70vh;',
      });
    }
  } else if (F.audio.test(lower)) {
    // Validate audio file type
    if (!validateFileType(blob, ['audio/*'])) {
      console.warn('[Security] Invalid audio file type');
      el = createSafeElement('p', {}, 'File type không hợp lệ. Vui lòng tải xuống.');
    } else {
      el = createSafeElement('audio', {
        src: url,
        controls: 'true',
        style: 'width: 100%;',
      });
    }
  } else if (F.pdf.test(lower)) {
    // Validate PDF file type
    if (!validateFileType(blob, ['application/pdf'])) {
      console.warn('[Security] Invalid PDF file type');
      el = createSafeElement('p', {}, 'File type không hợp lệ. Vui lòng tải xuống.');
    } else {
      el = createSafeElement('iframe', {
        src: url,
        style: 'width: 100%; height: 70vh; border: none;',
      });
    }
  } else if (lower.endsWith('.md') || lower.endsWith('.markdown')) {
    const div = document.createElement('div');
    div.className = 'markdown-body'; // for styling
    div.style.maxHeight = '70vh';
    div.style.overflow = 'auto';
    blob
      .text()
      .then((text) => {
        // Sanitize markdown content before rendering
        const sanitizedMarkdown = sanitizeMarkdown(text);

        // Check for malicious content
        const securityCheck = detectMaliciousContent(sanitizedMarkdown);
        if (!securityCheck.safe) {
          console.warn('[Security] Malicious content detected in markdown:', securityCheck.reason);
          div.textContent = `⚠️ Phát hiện nội dung nguy hiểm: ${securityCheck.reason}. Không thể hiển thị.`;
          return;
        }

        // Ensure Marked library is available
        if (window.marked) {
          try {
            // Configure marked to be more secure
            window.marked.setOptions({
              sanitize: false, // We handle sanitization ourselves
              gfm: true,
              breaks: true,
            });
            const rendered = window.marked.parse(sanitizedMarkdown);
            // Double-check rendered HTML for safety
            const finalCheck = detectMaliciousContent(rendered);
            if (finalCheck.safe) {
              div.innerHTML = rendered;
            } else {
              console.warn('[Security] Malicious content detected after markdown rendering');
              div.textContent = sanitizedMarkdown; // Fallback to plain text
            }
          } catch (err) {
            console.error('[Preview] Error rendering markdown:', err);
            div.textContent = sanitizedMarkdown;
          }
        } else {
          div.textContent = sanitizedMarkdown;
        }
      })
      .catch((err) => {
        console.error('[Preview] Error reading markdown:', err);
        div.textContent = '[Không thể xem trước nội dung Markdown]';
      });
    el = div;
  } else if (lower.endsWith('.svg')) {
    // Special handling for SVG files (XSS risk)
    blob
      .text()
      .then((svgContent) => {
        const sanitizedSVG = sanitizeSVG(svgContent);
        if (!sanitizedSVG) {
          const p = createSafeElement(
            'p',
            {},
            'SVG không hợp lệ hoặc không an toàn. Vui lòng tải xuống.',
          );
          previewContent.innerHTML = '';
          previewContent.appendChild(p);
          return;
        }

        // Check for additional malicious patterns
        const securityCheck = detectMaliciousContent(sanitizedSVG);
        if (!securityCheck.safe) {
          console.warn('[Security] Malicious SVG detected:', securityCheck.reason);
          const p = createSafeElement('p', {}, `⚠️ SVG không an toàn: ${securityCheck.reason}`);
          previewContent.innerHTML = '';
          previewContent.appendChild(p);
          return;
        }

        // Display SVG safely in an object tag (sandboxed)
        const svgBlob = new Blob([sanitizedSVG], { type: 'image/svg+xml' });
        const svgUrl = createSafeBlobURL(svgBlob);
        const obj = createSafeElement('object', {
          data: svgUrl,
          type: 'image/svg+xml',
          style: 'max-width: 100%; max-height: 70vh;',
        });
        previewContent.innerHTML = '';
        previewContent.appendChild(obj);
      })
      .catch((err) => {
        console.error('[Preview] Error reading SVG:', err);
        const p = createSafeElement('p', {}, 'Không thể xem trước SVG');
        previewContent.innerHTML = '';
        previewContent.appendChild(p);
      });
    return; // Early return for async SVG handling
  } else if (F.text.test(lower)) {
    const pre = document.createElement('pre');
    pre.style.whiteSpace = 'pre-wrap';
    pre.style.maxHeight = '70vh';
    pre.style.overflow = 'auto';
    // Inline text preview (best effort)
    blob
      .text()
      .then((t) => {
        // Sanitize text content
        const sanitizedText = sanitizeText(t, 50000); // Limit to 50KB for display
        pre.textContent = sanitizedText;
      })
      .catch((err) => {
        console.error('[Preview] Error reading text:', err);
        pre.textContent = '[Không thể xem trước nội dung]';
      });
    el = pre;
  } else {
    el = createSafeElement(
      'p',
      {},
      'Không thể xem trước file. Vui lòng dùng nút tải về để lưu file.',
    );
  }

  if (el) {
    previewContent.appendChild(el);
  }
  previewOverlay.classList.remove('hidden');
}

// Function to close preview modal
function closePreviewModal() {
  if (!previewOverlay) return;
  
  previewOverlay.classList.add('hidden');
  if (previewContent) previewContent.innerHTML = '';
  
  if (currentPreviewUrl) {
    cleanupManager.blobURLs.revoke(currentPreviewUrl);
    currentPreviewUrl = null;
  }
}

// Close button click handler
if (previewCloseBtn && previewOverlay) {
  cleanupManager.listeners.add(previewCloseBtn, 'click', (e) => {
    e.stopPropagation();
    closePreviewModal();
  });
}

// Click outside to close (click on overlay background)
if (previewOverlay) {
  cleanupManager.listeners.add(previewOverlay, 'click', (e) => {
    // Only close if clicking directly on overlay, not on content
    if (e.target === previewOverlay) {
      closePreviewModal();
    }
  });
}

// ESC key to close
cleanupManager.listeners.add(document, 'keydown', (e) => {
  if (e.key === 'Escape' && previewOverlay && !previewOverlay.classList.contains('hidden')) {
    e.preventDefault();
    closePreviewModal();
  }
});

// Send file with chunking and backpressure handling
function sendFile(fileArg) {
  // Prevent concurrent sends
  if (isSendingFile) {
    setStatus('Đang gửi file khác, vui lòng đợi!', 'error');
    return;
  }

  const file = fileArg || (fileInput && fileInput.files ? fileInput.files[0] : null);
  if (!file) return setStatus('Chưa chọn file. Chọn file trước khi bấm Gửi.', 'error');

  if (typeof ENV.MAX_FILE_SIZE === 'number' && ENV.MAX_FILE_SIZE < Number.MAX_SAFE_INTEGER) {
    if (file.size > ENV.MAX_FILE_SIZE) {
      const maxMB = (ENV.MAX_FILE_SIZE / (1024 * 1024)).toFixed(1);
      setStatus(`File quá lớn (tối đa ${maxMB} MB)`, 'error');
      return;
    }
  }

  if (file.size >= WARNING_THRESHOLD) {
    const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
    const confirmMsg = `Đang gửi file lớn (${sizeMB} MB). Việc gửi có thể mất nhiều thời gian và chiếm nhiều bộ nhớ. Tiếp tục?`;
    if (!window.confirm(confirmMsg)) {
      setStatus('Hủy gửi file lớn theo yêu cầu người dùng.', 'info');
      return;
    }
  }

  updateProgress(0, file.size);

  if (!dataChannel || dataChannel.readyState !== 'open') {
    setStatus('Kênh dữ liệu chưa sẵn sàng. Chờ kết nối hoàn tất rồi thử lại.', 'error');
    return;
  }

  // Sanitize filename before sending
  const safeName = sanitizeFilename(file.name);

  isSendingFile = true; // Set flag to prevent concurrent sends

  try {
    dataChannel.send(JSON.stringify({ type: 'file-meta', name: safeName, size: file.size }));
  } catch (err) {
    console.error('Error sending file-meta:', err);
    setStatus('Lỗi khi gửi metadata file', 'error');
    isSendingFile = false;
    return;
  }

  // Dynamic chunk size based on connection quality
  function calculateChunkSize() {
    const baseChunk = ENV.CHUNK_SIZE || 64 * 1024; // 64KB default
    const p2pPing = networkStats.p2pPing;
    
    // Adjust chunk size based on latency
    if (p2pPing < 50) {
      // Excellent connection: use larger chunks (128KB)
      return Math.min(128 * 1024, baseChunk * 2);
    } else if (p2pPing < 100) {
      // Good connection: use standard chunk size (64KB)
      return baseChunk;
    } else if (p2pPing < 300) {
      // Fair connection: use smaller chunks (32KB)
      return Math.max(32 * 1024, baseChunk / 2);
    } else {
      // Poor connection: use very small chunks (16KB)
      return Math.max(16 * 1024, baseChunk / 4);
    }
  }

  const CHUNK = calculateChunkSize();
  console.log(`[File Transfer] Using chunk size: ${(CHUNK / 1024).toFixed(0)}KB (P2P ping: ${networkStats.p2pPing || 'N/A'}ms)`);
  
  let readerOffset = 0;
  const reader = new FileReader();

  // Set bufferedAmountLowThreshold to handle backpressure
  try {
    const chunk = CHUNK;
    // threshold: min(8 * chunk, 2 MiB)
    const threshold = Math.min(8 * chunk, 2 * 1024 * 1024);
    dataChannel.bufferedAmountLowThreshold = threshold;
  } catch (err) {
    dataChannel.bufferedAmountLowThreshold = 512 * 1024; // fallback 512 KiB
  }

  function readNext() {
    if (readerOffset >= file.size) return;
    const slice = file.slice(readerOffset, readerOffset + CHUNK);
    reader.readAsArrayBuffer(slice);
  }

  reader.onload = (e) => {
    try {
      dataChannel.send(e.target.result);
    } catch (err) {
      console.error('Error sending chunk:', err);
      isSendingFile = false;
      setStatus('Lỗi khi gửi dữ liệu file', 'error');
      return;
    }
    readerOffset += e.target.result.byteLength || CHUNK;
    updateProgress(readerOffset, file.size);
    if (readerOffset < file.size) {
      if (
        typeof dataChannel.bufferedAmountLowThreshold === 'number' &&
        dataChannel.bufferedAmount > dataChannel.bufferedAmountLowThreshold
      ) {
        return;
      }
      readNext();
    } else {
      try {
        dataChannel.send(JSON.stringify({ type: 'file-end' }));
        // Save sent file to history
        saveToHistory(file, 'sent');
        isSendingFile = false;
      } catch (_) {}
      setStatus(
        `Đã gửi xong file “${file.name}”. Để gửi tiếp, chọn file mới và bấm Gửi.`,
        'success',
      );
      updateProgress(0, 0);
      // clear chosen file so user must select and press 'Gửi' again
      if (fileInput) {
        try {
          fileInput.value = '';
        } catch (_) {}
      }
    }
  };

  reader.onerror = (err) => {
    console.error('FileReader error:', err);
    isSendingFile = false;
    setStatus('Lỗi khi đọc file', 'error');
  };

  dataChannel.onbufferedamountlow = () => {
    if (readerOffset < file.size) readNext();
  };

  readNext();
}

let lastProgressPercent = -1; // Track last progress percentage

function updateProgress(current = 0, total = 0) {
  if (!progressEl) return;

  if (total > 0) {
    const percent = Math.floor((current / total) * 100);
    
    // Only update DOM if percentage changed (performance optimization)
    if (percent !== lastProgressPercent) {
      progressEl.classList.remove('hidden');
      progressEl.value = percent;
      lastProgressPercent = percent;
    }

    // Calculate and display transfer speed
    if (!transferStartTime) {
      transferStartTime = Date.now();
    }

    const elapsed = (Date.now() - transferStartTime) / 1000; // seconds
    if (elapsed > 0 && current > 0) {
      const now = Date.now();
      // Throttle updates to every 1 second
      if (now - lastProgressUpdate > 1000 || percent === 100) {
        lastProgressUpdate = now;
        const speed = current / elapsed; // bytes per second
        const remaining = (total - current) / speed; // seconds remaining

        const speedMBps = (speed / (1024 * 1024)).toFixed(2);
        const remainingMin = Math.floor(remaining / 60);
        const remainingSec = Math.floor(remaining % 60);

        // Log transfer info to console (can be displayed in UI if needed)
        console.log(
          `Transfer: ${percent}% • ${speedMBps} MB/s • ~${remainingMin}m ${remainingSec}s remaining`,
        );
      }
    }
  } else {
    if (lastProgressPercent !== -1) {
      progressEl.value = 0;
      progressEl.classList.add('hidden');
      lastProgressPercent = -1;
    }
    transferStartTime = null; // Reset timer
    lastProgressUpdate = 0;
  }
}

function updateDiagnostics(options = {}) {
  // Update network stats if p2pPing provided
  if (options.p2pPing != null) {
    networkStats.p2pPing = options.p2pPing;
  }

  const serverPing = networkStats.ping;
  const p2pPing = networkStats.p2pPing;

  // Update Server ping display
  if (serverPingEl) {
    serverPingEl.textContent = serverPing != null ? `${serverPing}ms` : '--';
  }

  // Update P2P ping display
  if (p2pPingEl) {
    p2pPingEl.textContent = p2pPing != null ? `${p2pPing}ms` : '--';
  }

  updateConnectionQuality();
}

function testNetwork() {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  networkStats.pingSent = Date.now();
  safeSendWS({ type: 'ping' });
}

if (joinRoomBtn)
  joinRoomBtn.onclick = () => {
    if (landingPage) landingPage.classList.add('hidden');
    if (appPage) appPage.classList.remove('hidden');
    showPreloader();
    connectWebSocket();
  };

if (fileInput)
  fileInput.addEventListener('change', async (e) => {
    const files = e.target.files;
    if (!files || files.length === 0) {
      updateFileSelectionUI(null);
      return;
    }

    if (files.length > 1) {
      setStatus('Đang nén các file thành file .zip...', 'info');
      showPreloader();
      try {
        // Ensure JSZip is loaded
        if (typeof JSZip === 'undefined') {
          setStatus('Thư viện JSZip chưa tải xong, vui lòng thử lại!', 'error');
          hidePreloader();
          return;
        }
        const zip = new JSZip();
        for (const file of files) {
          zip.file(file.webkitRelativePath || file.name, file);
        }
        const zipBlob = await zip.generateAsync({
          type: 'blob',
          compression: 'DEFLATE',
          compressionOptions: { level: 6 },
        });
        const zipFile = new File([zipBlob], 'archive.zip', { type: 'application/zip' });

        // Update fileInput to hold the single zip file
        const dataTransfer = new DataTransfer();
        dataTransfer.items.add(zipFile);
        fileInput.files = dataTransfer.files;

        updateFileSelectionUI(zipFile);
      } catch (err) {
        console.error('Lỗi khi nén file:', err);
        setStatus('Đã xảy ra lỗi khi nén file.', 'error');
      } finally {
        hidePreloader();
      }
    } else {
      const f = files[0];
      updateFileSelectionUI(f);
    }
  });

if (fileArea) {
  ['dragenter', 'dragover'].forEach((evt) => {
    fileArea.addEventListener(evt, (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (fileCard) fileCard.classList.add('drag-over');
    });
  });
  ['dragleave', 'drop'].forEach((evt) => {
    fileArea.addEventListener(evt, (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (fileCard) fileCard.classList.remove('drag-over');
    });
  });
  fileArea.addEventListener('drop', async (e) => {
    const items = e.dataTransfer && e.dataTransfer.items;
    const files = e.dataTransfer && e.dataTransfer.files;

    if (!files || !files.length) return;

    // Check if folder (via webkitGetAsEntry)
    let isFolder = false;
    if (items && items.length > 0) {
      try {
        const firstItem = items[0];
        if (firstItem.webkitGetAsEntry) {
          const entry = firstItem.webkitGetAsEntry();
          if (entry && entry.isDirectory) {
            isFolder = true;
          }
        }
      } catch (err) {
        console.warn('Cannot detect folder via drag & drop:', err);
      }
    }

    if (isFolder) {
      // Handle folder drop
      setStatus('Đang xử lý folder...', 'info');
      try {
        if (folderInput) {
          folderInput.files = files;
          folderInput.dispatchEvent(new Event('change', { bubbles: true }));
        }
      } catch (err) {
        console.error('Error handling folder drop:', err);
        setStatus('Không thể xử lý folder. Vui lòng dùng nút "Chọn Folder".', 'error');
      }
    } else {
      // Handle single file drop
      try {
        if (fileInput) {
          fileInput.files = files;
          fileInput.dispatchEvent(new Event('change', { bubbles: true }));
        }
      } catch (err) {
        console.error('Error handling file drop:', err);
        setStatus('Không thể xử lý file. Vui lòng dùng nút "Chọn File".', 'error');
      }
    }
  });
}

function isStandalone() {
  return (
    window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true
  );
}

document.addEventListener('DOMContentLoaded', () => {
  renderHistory(); // Render history on page load

  // Show iOS install banner if applicable
  const isIOS = /iphone|ipad|ipod/i.test(window.navigator.userAgent || '');
  if (isIOS && iosBanner && !isStandalone()) {
    iosBanner.classList.remove('hidden');
  }

  // Hide install prompts if already in standalone mode
  if (isStandalone()) {
    if (installBtn) installBtn.classList.add('hidden');
    if (installBanner) installBanner.classList.add('hidden');
    if (iosBanner) iosBanner.classList.add('hidden');
  }
});

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  if (installBtn) installBtn.classList.remove('hidden');
  if (installBanner) installBanner.classList.remove('hidden');
});

if (installBtn) {
  installBtn.addEventListener('click', async () => {
    if (!deferredInstallPrompt) return;
    try {
      deferredInstallPrompt.prompt();
      await deferredInstallPrompt.userChoice;
    } catch (_) {
    } finally {
      deferredInstallPrompt = null;
      installBtn.classList.add('hidden');
      if (installBanner) installBanner.classList.add('hidden');
    }
  });
}

window.addEventListener('appinstalled', () => {
  if (installBtn) installBtn.classList.add('hidden');
  if (installBanner) installBanner.classList.add('hidden');
  if (iosBanner) iosBanner.classList.add('hidden');
});

if (closePromptBtn && installBanner) {
  closePromptBtn.addEventListener('click', () => installBanner.classList.add('hidden'));
}
if (closeIosBtn && iosBanner) {
  closeIosBtn.addEventListener('click', () => iosBanner.classList.add('hidden'));
}

// Network monitoring functions
function startNetworkMonitoring() {
  if (networkTestInterval) return; // Already running
  networkTestInterval = cleanupManager.intervals.set(testNetwork, 10000, 'network-test');
  testNetwork(); // Run immediately
}

function stopNetworkMonitoring() {
  if (networkTestInterval) {
    cleanupManager.intervals.clear('network-test');
    networkTestInterval = null;
  }
  // Reset display
  if (serverPingEl) {
    serverPingEl.textContent = '--';
    serverPingEl.classList.remove('excellent', 'good', 'fair', 'poor');
  }
  if (p2pPingEl) {
    p2pPingEl.textContent = '--';
    p2pPingEl.classList.remove('excellent', 'good', 'fair', 'poor');
  }
  networkStats = {};
}

// P2P Ping Functions
function startP2PPing() {
  if (p2pPingInterval) return; // Already running
  p2pPingInterval = cleanupManager.intervals.set(testP2PPing, 10000, 'p2p-ping'); // Every 10s
  testP2PPing(); // Run immediately
}

function testP2PPing() {
  if (!dataChannel || dataChannel.readyState !== 'open') return;

  const pingId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  p2pPingStats[pingId] = Date.now();

  // Set timeout to cleanup if no response - use cleanup manager
  cleanupManager.timeouts.set(
    () => {
      if (p2pPingStats[pingId]) {
        console.warn(`P2P ping ${pingId} timed out, cleaning up`);
        delete p2pPingStats[pingId];
      }
    },
    P2P_PING_TIMEOUT,
    `p2p-ping-timeout-${pingId}`,
  );

  try {
    dataChannel.send(JSON.stringify({ type: 'p2p-ping', pingId }));
  } catch (err) {
    console.error('P2P ping error:', err);
    delete p2pPingStats[pingId]; // Cleanup on error
  }
}

function stopP2PPing() {
  if (p2pPingInterval) {
    cleanupManager.intervals.clear('p2p-ping');
    p2pPingInterval = null;
  }

  // Force cleanup all ping stats and their timeouts
  for (const pingId of Object.keys(p2pPingStats)) {
    cleanupManager.timeouts.clear(`p2p-ping-timeout-${pingId}`);
  }
  p2pPingStats = {};

  if (networkStats.p2pPing != null) {
    delete networkStats.p2pPing;
    updateDiagnostics();
  }
}

function setConnectionState(state, info) {
  if (!connectionIndicatorEl) return;
  connectionIndicatorEl.classList.remove('connected', 'disconnected', 'connecting');
  if (state) connectionIndicatorEl.classList.add(state);
  if (connectionInfoEl && typeof info === 'string') connectionInfoEl.textContent = info;
}

function updateConnectionQuality() {
  const serverPing = networkStats.ping;
  const p2pPing = networkStats.p2pPing;

  // Apply color to Server ping
  if (serverPingEl && serverPing != null) {
    serverPingEl.classList.remove('excellent', 'good', 'fair', 'poor');
    serverPingEl.classList.add(getPingQualityClass(serverPing));
  }

  // Apply color to P2P ping
  if (p2pPingEl && p2pPing != null) {
    p2pPingEl.classList.remove('excellent', 'good', 'fair', 'poor');
    p2pPingEl.classList.add(getPingQualityClass(p2pPing));
  }
}

function getPingQualityClass(ping) {
  if (ping < 50) return 'excellent';
  if (ping < 100) return 'good';
  if (ping < 200) return 'fair';
  return 'poor';
}

/**
 * Comprehensive cleanup function for connection resources
 * C3 (handler cleanup), C5 (buffer cleanup), M1 (state reset)
 */
function closeConnection() {
  console.log('[Cleanup] Starting connection cleanup...');

  // Cleanup DataChannel handlers
  if (currentDataChannelHandlers) {
    cleanupDataChannelHandlers(currentDataChannelHandlers);
    currentDataChannelHandlers = null;
  }

  // Close DataChannel
  if (dataChannel) {
    try {
      dataChannel.close();
    } catch (e) {
      console.error('Error closing dataChannel:', e);
    }
    dataChannel = null;
  }

  // Close PeerConnection
  if (peerConnection) {
    try {
      peerConnection.close();
    } catch (e) {
      console.error('Error closing peerConnection:', e);
    }
    peerConnection = null;
  }

  // Stop monitoring using cleanup manager
  stopNetworkMonitoring();
  stopP2PPing();

  // Reset state variables
  pendingIceCandidates = [];
  pendingOutgoingCandidates = [];
  connectedPeerId = null;
  isSender = false;
  pendingFileToSend = null;
  isSendingFile = false;
  makingOffer = false;
  ignoreOffer = false;

  // Clear file transfer state
  fileBuffer = [];
  receivedBytes = 0;
  fileMeta = null;
  transferStartTime = null;
  lastProgressUpdate = 0;

  // Cleanup preview resources
  if (currentPreviewUrl) {
    cleanupManager.blobURLs.revoke(currentPreviewUrl);
    currentPreviewUrl = null;
  }

  // Log cleanup status
  const status = cleanupManager.getStatus();
  console.log('[Cleanup] Connection closed. Resource status:', status);
}
