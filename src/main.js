// Client: signaling (WS) + P2P transfer (WebRTC DataChannel)
import { ENV } from './config.js';

// DOM refs
const statusEl = document.getElementById('status-text');
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
let deferredInstallPrompt = null;
const previewOverlay = document.getElementById('file-preview-overlay');
const previewContent = document.getElementById('preview-content');
const previewFilename = document.getElementById('preview-filename');
const previewDownloadBtn = document.getElementById('preview-download-btn');
const previewCloseBtn = document.getElementById('preview-close-btn');
let currentPreviewUrl = null;

// Global connection state (single-peer)
let ws, peerConnection, dataChannel;
let myId = null;
let connectedPeerId = null;
// Receiver buffer/meta
let fileReader,
    fileMeta,
    fileBuffer = [];
let isSender = false;
let networkStats = {};
let receivedBytes = 0;
let pendingFileToSend = null;
// Warning threshold (bytes) for showing a strong warning to users (500 MB)
const WARNING_THRESHOLD = 500 * 1024 * 1024; // >= 500MB: warn
// If a received file is larger than this, do not attempt an in-browser preview (avoids OOM on mobiles)
const PREVIEW_LIMIT = 500 * 1024 * 1024; // 500 MB

// Update status (info|success|error)
function setStatus(msg, type = 'info') {
    statusEl.textContent = msg;
    statusEl.className = type;
}

function showPreloader() {
    if (preloaderEl) preloaderEl.classList.remove('hidden');
}

function hidePreloader() {
    if (preloaderEl) preloaderEl.classList.add('hidden');
}

// Reflect chosen file + size note
function updateFileSelectionUI(file) {
    const fileNameEl = document.getElementById('file-name');
    const noteEl = document.getElementById('file-size-note');
    const warnEl = document.getElementById('file-warning');
    if (fileNameEl) fileNameEl.textContent = file ? file.name : '';
    if (noteEl) {
        const maxMB = Math.floor(ENV.MAX_FILE_SIZE / (1024 * 1024));
        noteEl.textContent = `Kích thước tối đa: ${maxMB} MB`;
    }
    if (warnEl) {
        if (file && file.size >= WARNING_THRESHOLD) {
            warnEl.classList.remove('hidden');
            warnEl.textContent = `File lớn (${Math.round(
                file.size / (1024 * 1024),
            )} MB). Việc gửi có thể chiếm nhiều băng thông và bộ nhớ. Hãy đảm bảo cả hai thiết bị có đủ dung lượng. Cần xác nhận khi bấm Gửi.`;
        } else {
            warnEl.classList.add('hidden');
            warnEl.textContent = '';
        }
    }
}

// Replace device list (except self)
function updatePeerList(peers) {
    peerListEl.innerHTML = '';
    if (!peers || peers.length === 0) {
        const li = document.createElement('li');
        li.className = 'no-device';
        li.textContent = 'Đang tìm các thiết bị khác...';
        peerListEl.appendChild(li);
        return;
    }
    peers.forEach((id) => addPeerToList(id));
}

// Add peer row + Send button
function addPeerToList(id) {
    if (!peerListEl) return;
    if (peerListEl.querySelector(`#peer-${id}`)) return;
    const noDevice = peerListEl.querySelector('.no-device');
    if (noDevice) noDevice.remove();
    const li = document.createElement('li');
    li.id = `peer-${id}`;
    const span = document.createElement('span');
    span.textContent = id;
    span.className = 'peer-id';
    const btn = document.createElement('button');
    btn.className = 'send-button button';
    btn.textContent = 'Gửi';
    // Lazy connect on send
    btn.addEventListener('click', () => {
        const f = fileInput && fileInput.files && fileInput.files[0];
        if (!f) return alert('Vui lòng chọn file trước!');
        pendingFileToSend = f;
        connectToPeer(id);
    });
    li.appendChild(span);
    li.appendChild(btn);
    peerListEl.appendChild(li);
}

function removePeerFromList(id) {
    const el = peerListEl && peerListEl.querySelector(`#peer-${id}`);
    if (el) el.remove();
    if (peerListEl && peerListEl.children.length === 0) {
        const li = document.createElement('li');
        li.className = 'no-device';
        li.textContent = 'Đang tìm các thiết bị khác...';
        peerListEl.appendChild(li);
    }
}

// Open signaling WebSocket
function connectWebSocket() {
    showPreloader();
    ws = new WebSocket(ENV.SIGNALING_SERVER_URL);
    ws.onopen = () => {
        hidePreloader();
        setStatus(
            'Đã kết nối tới máy chủ tín hiệu. Thiết bị khác sẽ xuất hiện khi online.',
            'success',
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

// Handle signaling messages
function handleSignalMessage(event) {
    const data = JSON.parse(event.data);
    if (data.type === 'your-id') {
        myId = data.id;
        peerIdEl.textContent = myId;
    } else if (data.type === 'peer-list') {
        updatePeerList(data.peers);
    } else if (data.type === 'new-peer') {
        addPeerToList(data.id);
    } else if (data.type === 'peer-disconnect') {
        removePeerFromList(data.id);
    } else if (data.type === 'offer') {
        handleOffer(data);
    } else if (data.type === 'answer') {
        handleAnswer(data);
    } else if (data.type === 'candidate') {
        handleCandidate(data);
    } else if (data.type === 'pong') {
        networkStats.ping = Date.now() - networkStats.pingSent;
        updateDiagnostics();
    }
}

// Outbound: create offer + data channel
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

// Create RTCPeerConnection + callbacks
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
    // Reflect lifecycle to UI
    peerConnection.onconnectionstatechange = () => {
        const st = peerConnection.connectionState;
        if (st === 'connecting') {
            setStatus('Đang thiết lập kênh WebRTC...', 'info');
            setConnectionState('connecting', 'Đang bắt tay WebRTC');
        } else if (st === 'connected') {
            setStatus('Kết nối tới thiết bị đã thiết lập. Có thể gửi/nhận file.', 'success');
            setConnectionState('connected', 'Đã kết nối');
            updateConnectionQuality();
        } else if (st === 'disconnected' || st === 'failed') {
            setStatus('Kết nối bị gián đoạn hoặc thất bại.', 'error');
            setConnectionState('disconnected', 'Kết nối đã ngắt');
        } else if (st === 'closed') {
            setStatus('Kênh kết nối đóng. Để gửi tiếp, chọn file mới và bấm Gửi.', 'error');
            setConnectionState('disconnected', 'Đã đóng');
        }
    };
}

// Bind DataChannel events
function setupDataChannel() {
    dataChannel.onopen = () => {
        setStatus('Kênh dữ liệu sẵn sàng. Chờ lệnh gửi từ thiết bị nguồn.', 'success');
        if (pendingFileToSend && isSender) {
            sendFile(pendingFileToSend);
            pendingFileToSend = null;
        }
    };
    dataChannel.onclose = () =>
        setStatus('Kênh dữ liệu đóng. Thử tạo kết nối lại nếu cần.', 'error');
    dataChannel.onerror = () => setStatus('Lỗi trên kênh dữ liệu. Kiểm tra kết nối.', 'error');
    dataChannel.onmessage = handleDataChannelMessage;
}

// Inbound: handle offer -> answer
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

// Handle answer
function handleAnswer(data) {
    peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
}

// Add ICE candidate
function handleCandidate(data) {
    peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
}

// Receiver: process meta/control (JSON) + binary chunks
function handleDataChannelMessage(e) {
    if (isSender) return;
    if (typeof e.data === 'string') {
        const meta = JSON.parse(e.data);
        if (meta.type === 'file-meta') {
            fileMeta = meta;
            fileBuffer = [];
            receivedBytes = 0;
            updateProgress(0, fileMeta.size || 0);
            const sizeMB =
                fileMeta && fileMeta.size ? (fileMeta.size / (1024 * 1024)).toFixed(1) : '-';
            setStatus(`Đang nhận file “${meta.name}” (${sizeMB} MB).`, 'info');
        } else if (meta.type === 'file-end') {
            try {
                const blob = new Blob(fileBuffer);
                // Large file: avoid heavy preview
                if (fileMeta && fileMeta.size && fileMeta.size > PREVIEW_LIMIT) {
                    // free fileBuffer early to reduce memory
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
        blob.text()
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

// Sender: stream file via chunks + backpressure
function sendFile(fileArg) {
    const file = fileArg || (fileInput && fileInput.files ? fileInput.files[0] : null);
    if (!file) return setStatus('Chưa chọn file. Chọn file trước khi bấm Gửi.', 'error');
    // If MAX_FILE_SIZE is a finite number smaller than JS safe max, enforce it.
    if (typeof ENV.MAX_FILE_SIZE === 'number' && ENV.MAX_FILE_SIZE < Number.MAX_SAFE_INTEGER) {
        if (file.size > ENV.MAX_FILE_SIZE) {
            const maxMB = (ENV.MAX_FILE_SIZE / (1024 * 1024)).toFixed(1);
            setStatus(`File quá lớn (tối đa ${maxMB} MB)`, 'error');
            return;
        }
    }

    // Large file: confirm
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

    // Backpressure: pause reads when bufferedAmount high
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

    // Send next chunk; respect backpressure
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

    // Resume when channel drains
    dataChannel.onbufferedamountlow = () => {
        if (readerOffset < file.size) readNext();
    };

    readNext();
}

// Update progress bar
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

// Show ping + quality label
function updateDiagnostics() {
    diagnosticsEl.textContent = `Ping: ${networkStats.ping || '-'}ms`;
    updateConnectionQuality();
}

// Ping via signaling (not P2P RTT)
function testNetwork() {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    networkStats.pingSent = Date.now();
    ws.send(JSON.stringify({ type: 'ping' }));
}

if (receiveBtn)
    receiveBtn.onclick = () => {
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

// Skip landing if PWA installed
function isStandalone() {
    return (
        window.matchMedia('(display-mode: standalone)').matches ||
        window.navigator.standalone === true
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

// PWA install prompt (Chrome/Edge)
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

// PWA installed
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

// Periodic diagnostics
setInterval(testNetwork, 10000);

// Toggle connection state + info
function setConnectionState(state, info) {
    if (!connectionIndicatorEl) return;
    connectionIndicatorEl.classList.remove('connected', 'disconnected', 'connecting');
    if (state) connectionIndicatorEl.classList.add(state);
    if (connectionInfoEl && typeof info === 'string') connectionInfoEl.textContent = info;
}

// Quality label from signaling ping (heuristic)
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
