import { sanitizeFilename } from '../utils/formatters.js';

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
    this.fileHandle = options.fileHandle || null;
    this.writableStream = null;
    this.aborted = false;
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
  }

  async writeChunk(arrayBuffer) {
    if (this.aborted) return;

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
      this.chunks.push(arrayBuffer);
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
    if (this.aborted) return;

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
      // Create final Blob and object URL for download
      const blob = new Blob(this.chunks, { type: this.mime });
      this.chunks = []; // Release chunks memory immediately
      const downloadUrl = URL.createObjectURL(blob);

      this.onComplete({
        name: this.name,
        size: this.receivedBytes,
        mime: this.mime,
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
  }
}
