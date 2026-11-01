import { CONFIG } from './config.js';

/**
 * File Stream Reader with Partition Flow Control (Sender Side)
 * Reads files in 64KB chunks and 1MB partitions, waiting for receiver ACK before advancing
 */
export class FileStreamReader {
  constructor(file, options = {}) {
    this.file = file;
    this.chunkSize = options.chunkSize || CONFIG.CHUNK_SIZE;
    this.maxPartitionSize = options.maxPartitionSize || CONFIG.PARTITION_SIZE;

    this.onChunk = options.onChunk || (() => {});
    this.onPartitionEnd = options.onPartitionEnd || (() => {});
    this.onProgress = options.onProgress || (() => {});
    this.onComplete = options.onComplete || (() => {});
    this.onError = options.onError || (() => {});

    this.offset = 0;
    this.partitionSize = 0;
    this.partitionIndex = 0;
    this.aborted = false;
    this.isPaused = false;
  }

  start() {
    this.nextPartition();
  }

  nextPartition() {
    if (this.aborted || this.isEOF()) return;
    this.partitionSize = 0;
    this.isPaused = false;
    this._readNextChunk();
  }

  isEOF() {
    return this.offset >= this.file.size;
  }

  abort() {
    this.aborted = true;
  }

  async _readNextChunk() {
    if (this.aborted || this.isPaused) return;

    if (this.isEOF()) {
      this.onComplete();
      return;
    }

    const end = Math.min(this.offset + this.chunkSize, this.file.size);
    const slice = this.file.slice(this.offset, end);

    try {
      const arrayBuffer = await slice.arrayBuffer();
      if (this.aborted) return;

      const chunkLength = arrayBuffer.byteLength;
      this.offset += chunkLength;
      this.partitionSize += chunkLength;

      this.onChunk(arrayBuffer);
      this.onProgress(this.offset, this.file.size);

      // If entire file has been read, trigger completion immediately
      if (this.isEOF()) {
        this.onComplete();
        return;
      }

      // Check if current 1MB partition is filled
      if (this.partitionSize >= this.maxPartitionSize) {
        this.isPaused = true;
        this.partitionIndex++;
        this.onPartitionEnd(this.partitionIndex, this.offset, false);
      } else {
        // Continue reading next chunk immediately
        this._readNextChunk();
      }
    } catch (err) {
      if (!this.aborted) {
        this.onError(err);
      }
    }
  }
}
