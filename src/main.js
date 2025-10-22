import { ENV } from './config.js';

const statusEl = document.getElementById('status-text');
const statusDotEl = document.getElementById('status-dot');
const preloaderEl = document.getElementById('preloader');
const fileInput = document.getElementById('fileInput');
const fileArea = document.querySelector('.file-area');
const fileCard = document.querySelector('.file-card');
const receiveBtn = document.getElementById('enter-app-button');
const landingPage = document.getElementById('landing-page');
const appPage = document.getElementById('app-page');
const peerIdEl = document.getElementById('my-id');
const peerListEl = document.getElementById('device-list');
const progressEl = document.getElementById('progress-bar');
const diagnosticsEl = document.getElementById('ping-value');
const connectionIndicatorEl = document.getElementById('connection-indicator');
const connectionInfoEl = document.getElementById('connection-info');
const connectionQualityEl = document.getElementById('connection-quality');
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

let ws, peerConnection, dataChannel;
let myId = null;
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

const WARNING_THRESHOLD = 500 * 1024 * 1024; // 500MB - show warning for large files
const PREVIEW_LIMIT = 500 * 1024 * 1024; // 500MB - prevent in-browser preview to avoid OOM
const MAX_BUFFER_SIZE = 800 * 1024 * 1024; // 800MB - hard limit to prevent OOM crash

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
    li.textContent = 'Đang tìm các thiết bị khác...';
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

  // Store handler reference for cleanup
  const handleSendClick = () => {
    const f = fileInput && fileInput.files && fileInput.files[0];
    if (!f) return alert('Vui lòng chọn file trước!');
    pendingFileToSend = f;
    connectToPeer(id);
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
  ws = new WebSocket(ENV.SIGNALING_SERVER_URL);
  ws.onopen = () => {
    hidePreloader();
    setStatus('Đã kết nối tới máy chủ tín hiệu. Thiết bị khác sẽ xuất hiện khi online.', 'success');

    ws.send(
      JSON.stringify({
        type: 'device-info',
        deviceInfo: myDeviceInfo,
      }),
    );
  };
  ws.onmessage = handleSignalMessage;
  ws.onclose = () => {
    hidePreloader();
    setStatus('Kết nối tới máy chủ bị ngắt. Kiểm tra mạng hoặc tải lại trang.', 'error');
  };
  ws.onerror = () => {
    hidePreloader();
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
    peerIdEl.textContent = myId;

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

function connectToPeer(id) {
  connectedPeerId = id;
  isSender = true;
  createPeerConnection();
  dataChannel = peerConnection.createDataChannel('file');
  setupDataChannel();
  peerConnection.createOffer().then((offer) => {
    peerConnection.setLocalDescription(offer);
    ws.send(JSON.stringify({ type: 'offer', target: id, offer }));
  });
  setStatus(`Đang kết nối tới thiết bị ${id}...`, 'info');
}

function createPeerConnection() {
  peerConnection = new RTCPeerConnection(ENV.RTC_CONFIG);
  peerConnection.onicecandidate = (e) => {
    if (e.candidate) {
      ws.send(
        JSON.stringify({
          type: 'candidate',
          target: connectedPeerId,
          candidate: e.candidate,
        }),
      );
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
    } else if (st === 'closed') {
      setStatus('Kênh kết nối đóng. Để gửi tiếp, chọn file mới và bấm Gửi.', 'error');
      setConnectionState('disconnected', 'Đã đóng');
      stopNetworkMonitoring(); // Stop monitoring when closed
    }
  };
}

function setupDataChannel() {
  dataChannel.onopen = () => {
    setStatus('Kênh dữ liệu sẵn sàng. Chờ lệnh gửi từ thiết bị nguồn.', 'success');
    if (pendingFileToSend && isSender) {
      sendFile(pendingFileToSend);
      pendingFileToSend = null;
    }
  };
  dataChannel.onclose = () => {
    setStatus('Kênh dữ liệu đóng. Thử tạo kết nối lại nếu cần.', 'error');
    stopNetworkMonitoring(); // Stop when channel closes
  };
  dataChannel.onerror = () => {
    setStatus('Lỗi trên kênh dữ liệu. Kiểm tra kết nối.', 'error');
    stopNetworkMonitoring(); // Stop on error
  };
  dataChannel.onmessage = handleDataChannelMessage;
}

function handleOffer(data) {
  connectedPeerId = data.sender;
  isSender = false;
  createPeerConnection();
  peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer)).then(() => {
    peerConnection.createAnswer().then((answer) => {
      peerConnection.setLocalDescription(answer);
      ws.send(
        JSON.stringify({
          type: 'answer',
          target: connectedPeerId,
          answer,
        }),
      );
    });
  });
}

function handleAnswer(data) {
  peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
}

function handleCandidate(data) {
  peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
}

// Process file metadata and binary chunks from sender
function handleDataChannelMessage(e) {
  if (isSender) return;
  if (typeof e.data === 'string') {
    const meta = JSON.parse(e.data);
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
          // prepare download link in preview overlay
          if (previewContent && previewDownloadBtn && previewFilename && previewOverlay) {
            previewContent.innerHTML = `<p>File lớn (${sizeMB} MB) không khả dụng cho bản xem trước. Nhấn "Tải xuống" để lưu về thiết bị.</p>`;
            const url = URL.createObjectURL(blob);
            currentPreviewUrl = url;
            previewFilename.textContent = fileMeta.name;
            previewDownloadBtn.setAttribute('href', url);
            previewDownloadBtn.setAttribute('download', fileMeta.name);
            previewOverlay.classList.remove('hidden');
          }
          setStatus(
            `Đã nhận xong file “${fileMeta.name}” (${sizeMB} MB). Nhấn Tải xuống để lưu.`,
            'success',
          );
          updateProgress(0, 0);
        } else {
          showFilePreview(fileMeta.name, blob);
          setStatus(`Đã nhận xong file “${fileMeta.name}”. Sẵn sàng tải về.`, 'success');
          fileBuffer = [];
          updateProgress(0, 0);
        }
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
  if (!previewOverlay || !previewContent || !previewDownloadBtn || !previewFilename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    return;
  }
  if (currentPreviewUrl) {
    URL.revokeObjectURL(currentPreviewUrl);
    currentPreviewUrl = null;
  }
  previewContent.innerHTML = '';
  const url = URL.createObjectURL(blob);
  currentPreviewUrl = url;
  previewFilename.textContent = filename;
  previewDownloadBtn.setAttribute('href', url);
  previewDownloadBtn.setAttribute('download', filename);
  const lower = filename.toLowerCase();
  const { SUPPORTED_PREVIEW_FORMATS: F } = ENV; // preview regexes
  let el = null;
  if (F.image.test(lower)) {
    el = document.createElement('img');
    el.src = url;
    el.alt = filename;
    el.style.maxWidth = '100%';
    el.style.maxHeight = '70vh';
  } else if (F.video.test(lower)) {
    el = document.createElement('video');
    el.src = url;
    el.controls = true;
    el.style.maxWidth = '100%';
    el.style.maxHeight = '70vh';
  } else if (F.audio.test(lower)) {
    el = document.createElement('audio');
    el.src = url;
    el.controls = true;
    el.style.width = '100%';
  } else if (F.pdf.test(lower)) {
    el = document.createElement('iframe');
    el.src = url;
    el.style.width = '100%';
    el.style.height = '70vh';
  } else if (F.text.test(lower)) {
    const pre = document.createElement('pre');
    pre.style.whiteSpace = 'pre-wrap';
    pre.style.maxHeight = '70vh';
    pre.style.overflow = 'auto';
    // Inline text preview (best effort)
    blob
      .text()
      .then((t) => (pre.textContent = t))
      .catch(() => (pre.textContent = '[Không thể xem trước nội dung]'));
    el = pre;
  } else {
    const p = document.createElement('p');
    p.textContent = 'Không thể xem trước file. Vui lòng dùng nút tải về để lưu file.';
    el = p;
  }
  previewContent.appendChild(el);
  previewOverlay.classList.remove('hidden');
}

if (previewCloseBtn && previewOverlay) {
  previewCloseBtn.addEventListener('click', () => {
    previewOverlay.classList.add('hidden');
    previewContent.innerHTML = '';
    if (currentPreviewUrl) {
      URL.revokeObjectURL(currentPreviewUrl);
      currentPreviewUrl = null;
    }
  });
}

// Send file with chunking and backpressure handling
function sendFile(fileArg) {
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
  fileReader = new FileReader();
  let offset = 0;
  updateProgress(0, file.size);
  if (!dataChannel || dataChannel.readyState !== 'open') {
    setStatus('Kênh dữ liệu chưa sẵn sàng. Chờ kết nối hoàn tất rồi thử lại.', 'error');
    return;
  }

  dataChannel.send(JSON.stringify({ type: 'file-meta', name: file.name, size: file.size }));

  const CHUNK = ENV.CHUNK_SIZE || 64 * 1024;
  let readerOffset = 0;
  const reader = new FileReader();

  // Set bufferedAmountLowThreshold to handle backpressure
  try {
    const chunk = typeof ENV.CHUNK_SIZE === 'number' ? ENV.CHUNK_SIZE : 128 * 1024;
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
    } catch (err) {}
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

  dataChannel.onbufferedamountlow = () => {
    if (readerOffset < file.size) readNext();
  };

  readNext();
}

function updateProgress(current = 0, total = 0) {
  if (!progressEl) return;
  if (total > 0) {
    const percent = Math.floor((current / total) * 100);
    progressEl.classList.remove('hidden');
    progressEl.value = percent;
  } else {
    progressEl.value = 0;
    progressEl.classList.add('hidden');
  }
}

function updateDiagnostics() {
  diagnosticsEl.textContent = `Ping: ${networkStats.ping || '-'}ms`;
  updateConnectionQuality();
}

function testNetwork() {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  networkStats.pingSent = Date.now();
  ws.send(JSON.stringify({ type: 'ping' }));
}

if (receiveBtn)
  receiveBtn.onclick = () => {
    // Keep Vanta.js running for beautiful background throughout the app
    // Trade-off: ~30-40% CPU for professional look

    if (landingPage) landingPage.classList.add('hidden');
    if (appPage) appPage.classList.remove('hidden');
    showPreloader();
    connectWebSocket();
  };

if (fileInput)
  fileInput.addEventListener('change', () => {
    const f = fileInput.files && fileInput.files[0];
    updateFileSelectionUI(f);
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
  fileArea.addEventListener('drop', (e) => {
    const files = e.dataTransfer && e.dataTransfer.files;
    if (!files || !files.length) return;
    const f = files[0];
    try {
      const dt = new DataTransfer();
      dt.items.add(f);
      if (fileInput) fileInput.files = dt.files;
    } catch (_) {}
    updateFileSelectionUI(f);
  });
}

function isStandalone() {
  return (
    window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true
  );
}

document.addEventListener('DOMContentLoaded', () => {
  if (isStandalone()) {
    if (landingPage) landingPage.classList.add('hidden');
    if (appPage) appPage.classList.remove('hidden');
    connectWebSocket();
    if (installBtn) installBtn.classList.add('hidden');
    if (installBanner) installBanner.classList.add('hidden');
    if (iosBanner) iosBanner.classList.add('hidden');
    return;
  }
  const isIOS = /iphone|ipad|ipod/i.test(window.navigator.userAgent || '');
  if (isIOS && iosBanner) {
    iosBanner.classList.remove('hidden');
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
  networkTestInterval = setInterval(testNetwork, 10000);
  testNetwork(); // Run immediately
}

function stopNetworkMonitoring() {
  if (networkTestInterval) {
    clearInterval(networkTestInterval);
    networkTestInterval = null;
  }
  // Reset display
  if (diagnosticsEl) diagnosticsEl.textContent = '--';
  if (connectionQualityEl) connectionQualityEl.textContent = 'Đang chờ kết nối...';
  networkStats = {};
}

function setConnectionState(state, info) {
  if (!connectionIndicatorEl) return;
  connectionIndicatorEl.classList.remove('connected', 'disconnected', 'connecting');
  if (state) connectionIndicatorEl.classList.add(state);
  if (connectionInfoEl && typeof info === 'string') connectionInfoEl.textContent = info;
}

function updateConnectionQuality() {
  if (!connectionQualityEl) return;
  const ping = networkStats.ping || null;
  if (ping == null) {
    connectionQualityEl.textContent = 'Đang kiểm tra...';
    return;
  }
  let label = 'Tốt';
  if (ping > 200) label = 'Kém';
  else if (ping > 100) label = 'Trung bình';
  connectionQualityEl.textContent = `${label} (${ping}ms)`;
}
