import { events } from '../core/events.js';
import { storage } from './storage.js';

export const TRANSLATIONS = {
  en: {
    // Header
    'header.joinPublicRoom': 'Join Public Room',
    'header.pairDevices': 'Pair Devices',
    'header.toggleView': 'Toggle Grid / Radar View',
    'header.switchToGrid': 'Switch to Grid View',
    'header.switchToRadar': 'Switch to Radar View',
    'header.about': 'About Local Share',
    'header.settings': 'Settings',
    'header.installApp': 'Install App',

    // Empty state
    'empty.radarTitle': 'Open Local Share on other devices to send files',
    'empty.radarDesc': 'Pair devices or enter a public room to be discoverable on other networks',
    'empty.gridTitle': 'Grid View',
    'empty.gridDesc': 'Waiting for other devices to open Local Share on this network...',

    // Instructions hint
    'hint.desktop': 'Click to send files or right-click to send a message',
    'hint.mobile': 'Tap to send files or tap & hold to send a message',

    // Footer
    'footer.youAreKnownAs': 'You are known as:',
    'footer.editName': 'Click to edit display name',
    'footer.youCanBeDiscovered': 'You can be discovered:',
    'footer.onThisNetwork': 'on this network',
    'footer.pairedDeviceSingle': '1 paired device',
    'footer.pairedDevicePlural': '{count} paired devices',
    'footer.inRoom': 'in room {room}',

    // Badges & Status
    'badges.paired': 'Paired',
    'badges.public': 'Public',
    'badges.lan': 'LAN',
    'badges.online': 'Online',
    'badges.saved': 'Saved',

    // Settings Modal
    'settings.title': 'Settings',
    'settings.displayName': 'DISPLAY NAME',
    'settings.namePlaceholder': 'Enter your nickname',
    'settings.saveName': 'Save',
    'settings.nameSaved': 'Display name updated',
    'settings.language': 'LANGUAGE / NGON NGU',
    'settings.radarView': 'Radar View',
    'settings.gridView': 'Grid View',
    'settings.preferences': 'PREFERENCES',
    'settings.audioNotifications': 'Audio Notifications',
    'settings.audioDesc': 'Play chime on incoming transfers and completions',
    'settings.autoDownload': 'Auto-Download Files',
    'settings.autoDownloadDesc':
      'Automatically download files upon transfer completion without prompting',
    'settings.close': 'Close',

    // Pair Modal
    'pair.title': 'Pair New Device',
    'pair.subtitle':
      'Link devices permanently to discover each other across different Wi-Fi or cellular networks.',
    'pair.enterPinTitle': 'Enter 6-Digit PIN from another device',
    'pair.pairBtn': 'Pair Device',
    'pair.pairing': 'Pairing...',
    'pair.orQr': 'Or scan QR / share this code',
    'pair.expiresIn': 'Expires in {time}',
    'pair.copyLink': 'Copy Link',
    'pair.linkCopied': 'Pairing link copied to clipboard!',
    'pair.invalidPin': 'Please enter a valid 6-digit PIN',
    'pair.cancel': 'Cancel',
    'pair.close': 'Close',

    // Paired Devices Modal
    'paired.title': 'Paired Devices',
    'paired.desc':
      'Devices linked permanently to yours across networks. Enable Auto-Accept to receive files automatically without prompting.',
    'paired.empty': 'No paired devices yet.',
    'paired.emptyHelp':
      'Pair devices using a 6-digit PIN or QR code to share files securely across any network.',
    'paired.autoAccept': 'Auto-Accept',
    'paired.unpair': 'Unpair',
    'paired.pairNew': '+ Pair New Device',
    'paired.close': 'Close',
    'paired.unpairedSuccess': 'Device successfully unpaired',

    // Public Room Modal
    'public.title': 'Public Room',
    'public.subtitle':
      'Devices in the same public room can discover and share files with each other regardless of network.',
    'public.currentRoom': 'Currently in Room: {room}',
    'public.leaveRoom': 'Leave Room',
    'public.enterRoomId': 'Enter 5-character Room Code',
    'public.joinRoom': 'Join Room',
    'public.orShare': 'Or share this room link with others:',
    'public.copyLink': 'Copy Room Link',
    'public.linkCopied': 'Room link copied to clipboard!',
    'public.joinedSuccess': 'Joined room {room}',
    'public.leftSuccess': 'Left public room',
    'public.close': 'Close',

    // File Preview Modal
    'preview.filesReceivedSingle': 'File Received',
    'preview.filesReceivedPlural': '{count} Files Received',
    'preview.photoReceived': 'Photo Received',
    'preview.videoReceived': 'Video Received',
    'preview.from': 'From:',
    'preview.itemsBundled': '{count} items bundled',
    'preview.saveToFiles': 'Save to Files / Share',
    'preview.share': 'Share',
    'preview.download': 'Download',
    'preview.downloadAgain': 'Download Again',
    'preview.downloadZip': 'Download ZIP',
    'preview.close': 'Close',
    'preview.previewTag': 'Preview',
    'preview.viewingTag': 'Viewing',

    // About Modal
    'about.title': 'About',
    'about.subtitle':
      'Fast, private P2P file sharing directly in your browser without cloud storage.',
    'about.github': 'GitHub Repository',
    'about.githubDesc': 'Source code, releases & contributions',
    'about.sponsor': 'Sponsor / Donate',
    'about.sponsorDesc': 'Support development & open source servers',
    'about.faq': 'FAQ & Guide',
    'about.faqDesc': 'Documentation, troubleshooting & tips',
    'about.close': 'Close',

    // Send Message Modal
    'message.title': 'Send Message to {name}',
    'message.placeholder': 'Type your message here...',
    'message.send': 'Send',
    'message.cancel': 'Cancel',
    'message.copied': 'Message copied to clipboard!',

    // Transfer HUD
    'hud.sending': 'Sending',
    'hud.receiving': 'Receiving',
    'hud.completed': 'Transfer Completed',
    'hud.cancelled': 'Transfer Cancelled',
    'hud.error': 'Transfer Failed',

    // Toast Notifications
    'toast.fileSent': 'File sent successfully',
    'toast.filesSent': '{count} files sent successfully',
    'toast.fileReceived': 'File received successfully',
    'toast.transferStarted': 'Transfer started...',
    'toast.gridViewActive': 'Grid View Active',
    'toast.radarViewActive': 'Radar View Active',
    'toast.pairing': 'Pairing Device...',
    'toast.pairingAttempt': 'Attempting connection with code {pin}',
    'toast.pairSuccess': 'Paired Successfully!',
    'toast.pairConnectedWith': 'Connected with {name}',
    'toast.pairFailed': 'Pairing Failed',
    'toast.pairInvalidCode': 'Invalid or expired pair code',
    'toast.joiningRoom': 'Joining Room...',
    'toast.joiningRoomConnecting': 'Connecting to public room "{room}"',
  },

  vi: {
    // Header
    'header.joinPublicRoom': 'Vào phòng công khai',
    'header.pairDevices': 'Ghép đôi thiết bị',
    'header.toggleView': 'Đổi chế độ xem Lưới / Radar',
    'header.switchToGrid': 'Chuyển sang chế độ lưới',
    'header.switchToRadar': 'Chuyển sang chế độ radar',
    'header.about': 'Thông tin giới thiệu',
    'header.settings': 'Cài đặt',
    'header.installApp': 'Cài đặt ứng dụng',

    // Empty state
    'empty.radarTitle': 'Mở Local Share trên thiết bị khác để gửi file',
    'empty.radarDesc':
      'Ghép đôi thiết bị hoặc vào phòng công khai để tìm thấy nhau qua các mạng khác nhau',
    'empty.gridTitle': 'Chế độ lưới',
    'empty.gridDesc': 'Đang chờ các thiết bị khác mở Local Share trên mạng này...',

    // Instructions hint
    'hint.desktop': 'Nhấp chuột để gửi file hoặc nhấp chuột phải để gửi tin nhắn',
    'hint.mobile': 'Chạm để gửi file hoặc nhấn giữ để gửi tin nhắn',

    // Footer
    'footer.youAreKnownAs': 'Tên của bạn là:',
    'footer.editName': 'Bấm để đổi tên hiển thị',
    'footer.youCanBeDiscovered': 'Có thể tìm thấy bạn:',
    'footer.onThisNetwork': 'mạng nội bộ',
    'footer.pairedDeviceSingle': '1 thiết bị ghép đôi',
    'footer.pairedDevicePlural': '{count} thiết bị ghép đôi',
    'footer.inRoom': 'phòng {room}',

    // Badges & Status
    'badges.paired': 'Ghép đôi',
    'badges.public': 'Công khai',
    'badges.lan': 'LAN',
    'badges.online': 'Trực tuyến',
    'badges.saved': 'Đã lưu',

    // Settings Modal
    'settings.title': 'Cài đặt',
    'settings.displayName': 'TÊN HIỂN THỊ',
    'settings.namePlaceholder': 'Nhập biệt danh của bạn',
    'settings.saveName': 'Lưu',
    'settings.nameSaved': 'Đã cập nhật tên hiển thị',
    'settings.language': 'NGÔN NGỮ / LANGUAGE',
    'settings.radarView': 'Chế độ Radar',
    'settings.gridView': 'Chế độ Lưới',
    'settings.preferences': 'TÙY CHỌN',
    'settings.audioNotifications': 'Âm thanh thông báo',
    'settings.audioDesc': 'Phát chuông âm thanh khi có yêu cầu hoặc hoàn tất nhận file',
    'settings.autoDownload': 'Tự động tải file',
    'settings.autoDownloadDesc':
      'Tự động tải file ngay sau khi chuyển tiếp thành công mà không cần hỏi',
    'settings.close': 'Đóng',

    // Pair Modal
    'pair.title': 'Ghép đôi thiết bị mới',
    'pair.subtitle':
      'Liên kết vĩnh viễn các thiết bị để tìm thấy nhau mọi lúc qua mạng Wi-Fi hoặc 4G/5G khác nhau.',
    'pair.enterPinTitle': 'Nhập mã PIN 6 số từ thiết bị kia',
    'pair.pairBtn': 'Ghép đôi',
    'pair.pairing': 'Đang kết nối...',
    'pair.orQr': 'Hoặc quét mã QR / chia sẻ mã này',
    'pair.expiresIn': 'Hết hạn sau {time}',
    'pair.copyLink': 'Sao chép liên kết',
    'pair.linkCopied': 'Đã sao chép liên kết ghép đôi!',
    'pair.invalidPin': 'Vui lòng nhập đủ mã PIN 6 số',
    'pair.cancel': 'Hủy',
    'pair.close': 'Đóng',

    // Paired Devices Modal
    'paired.title': 'Thiết bị đã ghép đôi',
    'paired.desc':
      'Các thiết bị được liên kết vĩnh viễn với bạn. Bật Tự động nhận để nhận file ngay lập tức mà không cần xác nhận.',
    'paired.empty': 'Chưa có thiết bị nào được ghép đôi.',
    'paired.emptyHelp':
      'Ghép đôi thiết bị bằng mã PIN 6 số hoặc mã QR để chia sẻ file an toàn qua mọi mạng.',
    'paired.autoAccept': 'Tự động nhận',
    'paired.unpair': 'Hủy ghép',
    'paired.pairNew': '+ Ghép đôi thiết bị mới',
    'paired.close': 'Đóng',
    'paired.unpairedSuccess': 'Đã hủy ghép đôi thiết bị',

    // Public Room Modal
    'public.title': 'Phòng công khai',
    'public.subtitle':
      'Các thiết bị trong cùng phòng công khai có thể nhìn thấy và gửi file cho nhau không phụ thuộc vào mạng.',
    'public.currentRoom': 'Hiện đang trong phòng: {room}',
    'public.leaveRoom': 'Rời phòng',
    'public.enterRoomId': 'Nhập mã phòng 5 ký tự',
    'public.joinRoom': 'Vào phòng',
    'public.orShare': 'Hoặc chia sẻ liên kết phòng này:',
    'public.copyLink': 'Sao chép link phòng',
    'public.linkCopied': 'Đã sao chép liên kết phòng!',
    'public.joinedSuccess': 'Đã vào phòng {room}',
    'public.leftSuccess': 'Đã rời phòng công khai',
    'public.close': 'Đóng',

    // File Preview Modal
    'preview.filesReceivedSingle': 'Đã nhận file',
    'preview.filesReceivedPlural': 'Đã nhận {count} file',
    'preview.photoReceived': 'Đã nhận ảnh',
    'preview.videoReceived': 'Đã nhận video',
    'preview.from': 'Từ:',
    'preview.itemsBundled': 'Gồm {count} tệp tin',
    'preview.saveToFiles': 'Lưu vào Tệp / Chia sẻ',
    'preview.share': 'Chia sẻ',
    'preview.download': 'Tải về',
    'preview.downloadAgain': 'Tải lại',
    'preview.downloadZip': 'Tải file ZIP',
    'preview.close': 'Đóng',
    'preview.previewTag': 'Xem trước',
    'preview.viewingTag': 'Đang xem',

    // About Modal
    'about.title': 'Thông tin',
    'about.subtitle':
      'Chia sẻ file P2P trực tiếp, tốc độ cao và bảo mật trong mạng nội bộ và liên mạng.',
    'about.github': 'Mã nguồn GitHub',
    'about.githubDesc': 'Xem mã nguồn, báo lỗi và đóng góp phát triển',
    'about.sponsor': 'Ủng hộ dự án',
    'about.sponsorDesc': 'Đồng hành duy trì hạ tầng máy chủ và phát triển',
    'about.faq': 'Hướng dẫn & FAQ',
    'about.faqDesc': 'Tài liệu hướng dẫn sử dụng và câu hỏi thường gặp',
    'about.close': 'Đóng',

    // Send Message Modal
    'message.title': 'Gửi tin nhắn tới {name}',
    'message.placeholder': 'Nhập nội dung tin nhắn tại đây...',
    'message.send': 'Gửi',
    'message.cancel': 'Hủy',
    'message.copied': 'Đã sao chép tin nhắn vào bộ nhớ tạm!',

    // Transfer HUD
    'hud.sending': 'Đang gửi',
    'hud.receiving': 'Đang nhận',
    'hud.completed': 'Chuyển file thành công',
    'hud.cancelled': 'Đã hủy chuyển file',
    'hud.error': 'Chuyển file thất bại',

    // Toast Notifications
    'toast.fileSent': 'Đã gửi file thành công',
    'toast.filesSent': 'Đã gửi {count} file thành công',
    'toast.fileReceived': 'Đã nhận file thành công',
    'toast.transferStarted': 'Bắt đầu chuyển file...',
    'toast.gridViewActive': 'Đã chuyển sang chế độ lưới',
    'toast.radarViewActive': 'Đã chuyển sang chế độ radar',
    'toast.pairing': 'Đang ghép đôi thiết bị...',
    'toast.pairingAttempt': 'Đang thử kết nối với mã {pin}',
    'toast.pairSuccess': 'Ghép đôi thành công!',
    'toast.pairConnectedWith': 'Đã kết nối với {name}',
    'toast.pairFailed': 'Ghép đôi thất bại',
    'toast.pairInvalidCode': 'Mã PIN không hợp lệ hoặc đã hết hạn',
    'toast.joiningRoom': 'Đang vào phòng...',
    'toast.joiningRoomConnecting': 'Đang kết nối vào phòng công khai "{room}"',
  },
};

// English is strictly the primary default language of the application
let currentLanguage = storage.getLanguage() || 'en';
if (currentLanguage !== 'en' && currentLanguage !== 'vi') {
  currentLanguage = 'en';
}

export function getLanguage() {
  return currentLanguage;
}

export function setLanguage(lang, chosenByUser = true) {
  if (lang !== 'en' && lang !== 'vi') return;
  currentLanguage = lang;
  storage.setLanguage(lang, chosenByUser);
  document.documentElement.lang = lang;
  events.emit('language-changed', lang);
}

export function t(key, params = {}) {
  const dict = TRANSLATIONS[currentLanguage] || TRANSLATIONS.en;
  let text = dict[key] || TRANSLATIONS.en[key] || key;
  for (const [k, v] of Object.entries(params)) {
    text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), v);
  }
  return text;
}
