import { sanitizeFilename } from '../utils/formatters.js';
import { updateCrc32 } from '../utils/mime.js';

const SEGMENT_FLUSH_SIZE = 8 * 1024 * 1024; // 8 MB per segmented Blob compaction

/**
 * File Stream Writer (Receiver Side)
 * Supports:
 * 1. FileSystemWritableFileStream (Direct Disk Write - Zero RAM footprint)
 * 2. Segmented Blob Streaming fallback for iOS / Safari / Firefox
 */
export class FileStreamWriter {
  constructor(meta, options = {}) {
    this.meta = meta;
    this.name = sanitizeFilename(meta.name);
    this.size = meta.size || 0;
    this.mime = meta.mime || 'application/octet-stream';

    this.onProgress = options.onProgress || (() => {});
    this.onComplete = options.onComplete || (() => {});
    this.onError = options.onError || (() => {});

    this.receivedBytes = 0;
    this.bytesSinceLastAck = 0;
    this.chunks = [];
    this.segments = [];
    this.chunksByteLength = 0;
    this._crc = 0xffffffff;
    this.fileHandle = options.fileHandle || null;
    this.writableStream = null;
    this.aborted = false;
    this.finalized = false;
    this._writeQueue = Promise.resolve();
  }

  async init() {
    if (this.fileHandle) {
      try {
        this.writableStream = await this.fileHandle.createWritable();
      } catch (err) {
        console.warn('[Direct Disk Stream Init Failed, falling back to Blob]', err);
        this.writableStream = null;
      }
    }
    if (this.size === 0) {
      await this.finalize();
    }
  }

  writeChunk(arrayBuffer) {
    this._writeQueue = this._writeQueue
      .then(() => this._processChunk(arrayBuffer))
      .catch((err) => {
        if (!this.aborted) {
          this.onError(err);
        }
      });
    return this._writeQueue;
  }

  async _processChunk(arrayBuffer) {
    if (this.aborted || this.finalized) return;

    const chunkLength = arrayBuffer.byteLength || arrayBuffer.size || 0;
    this.receivedBytes += chunkLength;
    this.bytesSinceLastAck += chunkLength;

    if (this.writableStream) {
      try {
        await this.writableStream.write(arrayBuffer);
      } catch (err) {
        this.onError(err);
        return;
      }
    } else {
      this._crc = updateCrc32(this._crc, new Uint8Array(arrayBuffer));
      this.chunks.push(arrayBuffer);
      this.chunksByteLength += chunkLength;
      if (this.chunksByteLength >= SEGMENT_FLUSH_SIZE) {
        this.segments.push(new Blob(this.chunks));
        this.chunks = [];
        this.chunksByteLength = 0;
      }
    }

    this.onProgress(this.receivedBytes, this.size, this.bytesSinceLastAck);

    if (this.isComplete()) {
      await this.finalize();
    }
  }

  isComplete() {
    return this.receivedBytes >= this.size;
  }

  async finalize() {
    if (this.aborted || this.finalized) return;
    this.finalized = true;

    if (this.writableStream) {
      try {
        await this.writableStream.close();
        this.writableStream = null;
        this.onComplete({
          name: this.name,
          size: this.receivedBytes,
          mime: this.mime,
          savedDirectly: true,
        });
      } catch (err) {
        this.onError(err);
      }
    } else {
      if (this.chunks.length > 0) {
        this.segments.push(new Blob(this.chunks));
        this.chunks = [];
        this.chunksByteLength = 0;
      }
      // Create final Blob and object URL for download
      const blob = new Blob(this.segments, { type: this.mime });
      this.segments = []; // Release segment references immediately
      const downloadUrl = URL.createObjectURL(blob);
      const crc32 = (this._crc ^ 0xffffffff) >>> 0;

      this.onComplete({
        name: this.name,
        size: this.receivedBytes,
        mime: this.mime,
        crc32: crc32,
        blob: blob,
        downloadUrl: downloadUrl,
        savedDirectly: false,
      });
    }
  }

  abort() {
    this.aborted = true;
    if (this.writableStream) {
      this.writableStream.abort().catch(() => {});
      this.writableStream = null;
    }
    this.chunks = [];
    this.segments = [];
    this.chunksByteLength = 0;
  }
}
