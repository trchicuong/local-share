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

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

export function updateCrc32(crc, bytes) {
  let c = crc >>> 0;
  for (let i = 0; i < bytes.length; i++) {
    c = CRC32_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  }
  return c >>> 0;
}

async function computeBlobCrc32(blob) {
  const SLICE_SIZE = 2 * 1024 * 1024;
  let crc = 0xffffffff;
  let offset = 0;
  while (offset < blob.size) {
    const slice = blob.slice(offset, Math.min(offset + SLICE_SIZE, blob.size));
    const buf = await slice.arrayBuffer();
    crc = updateCrc32(crc, new Uint8Array(buf));
    offset += buf.byteLength;
    if (buf.byteLength === 0) break;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function getUniqueEntryName(rawName, usedNames) {
  const baseName = String(rawName || 'file').replace(/^[/\\]+/, '') || 'file';
  if (!usedNames.has(baseName.toLowerCase())) {
    usedNames.add(baseName.toLowerCase());
    return baseName;
  }
  const dotIdx = baseName.lastIndexOf('.');
  const stem = dotIdx > 0 ? baseName.slice(0, dotIdx) : baseName;
  const ext = dotIdx > 0 ? baseName.slice(dotIdx) : '';
  let counter = 1;
  let candidate = `${stem} (${counter})${ext}`;
  while (usedNames.has(candidate.toLowerCase())) {
    counter++;
    candidate = `${stem} (${counter})${ext}`;
  }
  usedNames.add(candidate.toLowerCase());
  return candidate;
}

export async function createZipFromFiles(files, progressCallback = null) {
  const encoder = new TextEncoder();
  const now = new Date();
  const dosTime =
    ((now.getHours() & 0x1f) << 11) |
    ((now.getMinutes() & 0x3f) << 5) |
    ((now.getSeconds() >> 1) & 0x1f);
  const dosDate =
    (((Math.max(1980, now.getFullYear()) - 1980) & 0x7f) << 9) |
    (((now.getMonth() + 1) & 0x0f) << 5) |
    (now.getDate() & 0x1f);

  const blobParts = [];
  const entries = [];
  const usedNames = new Set();
  let offset = 0;
  let completed = 0;

  for (const f of files) {
    const rawData = f?.blob || f;
    if (!rawData) {
      completed++;
      continue;
    }
    const dataBlob = rawData instanceof Blob ? rawData : new Blob([rawData]);
    const size = dataBlob.size >>> 0;
    const crc32 = typeof f?.crc32 === 'number' ? f.crc32 >>> 0 : await computeBlobCrc32(dataBlob);
    const entryName = getUniqueEntryName(f?.name, usedNames);
    const nameBytes = encoder.encode(entryName);

    const localHeader = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(localHeader.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0x0800, true); // UTF-8 filename flag
    lv.setUint16(8, 0, true); // STORE (uncompressed, zero-copy)
    lv.setUint16(10, dosTime, true);
    lv.setUint16(12, dosDate, true);
    lv.setUint32(14, crc32, true);
    lv.setUint32(18, size, true);
    lv.setUint32(22, size, true);
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true);
    localHeader.set(nameBytes, 30);

    const localHeaderOffset = offset >>> 0;
    blobParts.push(localHeader, dataBlob);
    offset += localHeader.byteLength + dataBlob.size;

    entries.push({ nameBytes, crc32, size, localHeaderOffset });

    completed++;
    if (progressCallback) {
      progressCallback(completed / files.length);
    }
  }

  const centralDirOffset = offset >>> 0;
  let centralDirSize = 0;

  for (const entry of entries) {
    const cd = new Uint8Array(46 + entry.nameBytes.length);
    const cv = new DataView(cd.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 0, true); // STORE
    cv.setUint16(12, dosTime, true);
    cv.setUint16(14, dosDate, true);
    cv.setUint32(16, entry.crc32, true);
    cv.setUint32(20, entry.size, true);
    cv.setUint32(24, entry.size, true);
    cv.setUint16(28, entry.nameBytes.length, true);
    cv.setUint16(30, 0, true);
    cv.setUint16(32, 0, true);
    cv.setUint16(34, 0, true);
    cv.setUint16(36, 0, true);
    cv.setUint32(38, 0, true);
    cv.setUint32(42, entry.localHeaderOffset, true);
    cd.set(entry.nameBytes, 46);

    blobParts.push(cd);
    centralDirSize += cd.byteLength;
  }

  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(4, 0, true);
  ev.setUint16(6, 0, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, centralDirSize >>> 0, true);
  ev.setUint32(16, centralDirOffset, true);
  ev.setUint16(20, 0, true);
  blobParts.push(eocd);

  const pad = (n) => String(n).padStart(2, '0');
  const timestamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`;
  const zipName = `LocalShare_files_${timestamp}.zip`;

  const zipBlob = new Blob(blobParts, { type: 'application/zip' });

  return {
    name: zipName,
    size: zipBlob.size,
    mime: 'application/zip',
    blob: zipBlob,
    downloadUrl: URL.createObjectURL(zipBlob),
  };
}

