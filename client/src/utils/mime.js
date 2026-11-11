import JSZip from 'jszip';

const EXTENSION_MIME_MAP = {
  // Images
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  bmp: 'image/bmp',
  ico: 'image/x-icon',
  heic: 'image/heic',
  heif: 'image/heif',
  // Audio
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  m4a: 'audio/mp4',
  flac: 'audio/flac',
  aac: 'audio/aac',
  // Video
  mp4: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
  mkv: 'video/x-matroska',
  avi: 'video/x-msvideo',
  // Documents
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  txt: 'text/plain',
  csv: 'text/csv',
  html: 'text/html',
  json: 'application/json',
  zip: 'application/zip',
  tar: 'application/x-tar',
  gz: 'application/gzip',
  '7z': 'application/x-7z-compressed',
};

export function getMimeType(filename, declaredMime) {
  if (declaredMime && declaredMime !== 'application/octet-stream' && declaredMime !== '') {
    return declaredMime;
  }
  const ext = String(filename || '').split('.').pop()?.toLowerCase();
  if (ext && EXTENSION_MIME_MAP[ext]) {
    return EXTENSION_MIME_MAP[ext];
  }
  return declaredMime || 'application/octet-stream';
}

export function isMobileDevice() {
  const isIOS =
    (/iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isAndroid = /android/i.test(navigator.userAgent);
  return isIOS || isAndroid;
}

const ALREADY_COMPRESSED_EXT =
  /\.(jpe?g|png|gif|webp|heic|heif|mp4|webm|mov|mkv|avi|mp3|ogg|m4a|aac|flac|zip|gz|7z|rar|pdf|docx|xlsx|pptx)$/i;

export async function createZipFromFiles(files, progressCallback = null) {
  const zip = new JSZip();
  let completed = 0;

  for (const f of files) {
    const data = f.blob || f;
    const isCompressed = ALREADY_COMPRESSED_EXT.test(f.name || '');
    zip.file(f.name, data, {
      compression: isCompressed ? 'STORE' : 'DEFLATE',
      compressionOptions: isCompressed ? null : { level: 5 },
    });
    completed++;
    if (progressCallback) {
      progressCallback(completed / files.length);
    }
  }

  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const timestamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`;
  const zipName = `LocalShare_files_${timestamp}.zip`;

  const zipBlob = await zip.generateAsync({
    type: 'blob',
  });

  return {
    name: zipName,
    size: zipBlob.size,
    mime: 'application/zip',
    blob: zipBlob,
    downloadUrl: URL.createObjectURL(zipBlob),
  };
}

