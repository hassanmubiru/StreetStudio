/**
 * Upload Service
 * 
 * Handles file uploads with chunked uploading, retry logic, progress tracking,
 * and comprehensive error handling with graceful degradation.
 */

import { handleError, getDegradationManager } from '../app/error-handler.js';
import { logger } from '../app/client-logger.js';
import { apiClient, type ApiError } from './api.js';

export interface UploadProgress {
  loaded: number;
  total: number;
  percentage: number;
  speed: number; // bytes per second
  timeRemaining: number; // seconds
}

export interface UploadOptions {
  chunkSize?: number;
  maxRetries?: number;
  retryDelay?: number;
  onProgress?: (progress: UploadProgress) => void;
  onChunkComplete?: (chunkIndex: number, totalChunks: number) => void;
  onError?: (error: UploadError) => void;
  validateFile?: (file: File) => Promise<void>;
  metadata?: Record<string, any>;
}

export interface UploadError extends Error {
  type: 'validation' | 'network' | 'server' | 'chunk' | 'abort' | 'quota';
  chunkIndex?: number;
  retryable: boolean;
  originalError?: Error;
}

export interface UploadResult {
  id: string;
  url: string;
  metadata?: Record<string, any>;
}

export interface ChunkInfo {
  index: number;
  start: number;
  end: number;
  size: number;
  checksum?: string;
}

export class UploadManager {
  private activeUploads = new Map<string, UploadSession>();
  private maxConcurrentUploads = 3;
  private defaultChunkSize = 5 * 1024 * 1024; // 5MB chunks

  /**
   * Upload a file with chunked uploading and error handling
   */
  public async uploadFile(file: File, options: UploadOptions = {}): Promise<UploadResult> {
    const uploadId = crypto.randomUUID();
    const session = new UploadSession(uploadId, file, options);

    try {
      // Check if we can start upload
      if (this.activeUploads.size >= this.maxConcurrentUploads) {
        throw this.createUploadError(
          'quota',
          'Too many active uploads. Please wait for others to complete.',
          false
        );
      }

      this.activeUploads.set(uploadId, session);

      // Validate file if validator provided
      if (options.validateFile) {
        try {
          await options.validateFile(file);
        } catch (error) {
          throw this.createUploadError(
            'validation',
            `File validation failed: ${(error as Error).message}`,
            false,
            error as Error
          );
        }
      }

      logger.info(`Starting upload: ${file.name} (${this.formatFileSize(file.size)})`, {
        uploadId,
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type,
      });

      const result = await session.start();

      this.activeUploads.delete(uploadId);
      
      logger.info(`Upload completed: ${file.name}`, {
        uploadId,
        resultId: result.id,
      });

      return result;

    } catch (error) {
      this.activeUploads.delete(uploadId);
      
      const uploadError = error as UploadError;
      logger.error(`Upload failed: ${file.name}`, {
        uploadId,
        error: uploadError.message,
        type: uploadError.type,
        retryable: uploadError.retryable,
      });

      // Handle upload error through error system
      handleError(uploadError, 'component', {
        feature: 'chunked-upload',
        uploadId,
        fileName: file.name,
        fileSize: file.size,
      });

      throw error;
    }
  }

  /**
   * Cancel an active upload
   */
  public cancelUpload(uploadId: string): boolean {
    const session = this.activeUploads.get(uploadId);
    if (session) {
      session.cancel();
      this.activeUploads.delete(uploadId);
      return true;
    }
    return false;
  }

  /**
   * Get active upload progress
   */
  public getUploadProgress(uploadId: string): UploadProgress | null {
    const session = this.activeUploads.get(uploadId);
    return session ? session.getProgress() : null;
  }

  /**
   * Get all active uploads
   */
  public getActiveUploads(): Array<{ id: string; fileName: string; progress: UploadProgress }> {
    return Array.from(this.activeUploads.values()).map(session => ({
      id: session.getId(),
      fileName: session.getFileName(),
      progress: session.getProgress(),
    }));
  }

  /**
   * Cancel all active uploads
   */
  public cancelAllUploads(): void {
    this.activeUploads.forEach(session => session.cancel());
    this.activeUploads.clear();
  }

  private createUploadError(
    type: UploadError['type'],
    message: string,
    retryable: boolean,
    originalError?: Error
  ): UploadError {
    const error = new Error(message) as UploadError;
    error.type = type;
    error.retryable = retryable;
    error.originalError = originalError;
    return error;
  }

  private formatFileSize(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;
    
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    
    return `${size.toFixed(1)} ${units[unitIndex]}`;
  }
}

class UploadSession {
  private id: string;
  private file: File;
  private options: UploadOptions;
  private isAborted = false;
  private startTime = 0;
  private uploadedBytes = 0;
  private lastProgressTime = 0;
  private speeds: number[] = [];

  constructor(id: string, file: File, options: UploadOptions) {
    this.id = id;
    this.file = file;
    this.options = {
      chunkSize: 5 * 1024 * 1024, // 5MB default
      maxRetries: 3,
      retryDelay: 1000,
      ...options,
    };
  }

  public getId(): string {
    return this.id;
  }

  public getFileName(): string {
    return this.file.name;
  }

  public async start(): Promise<UploadResult> {
    this.startTime = Date.now();
    this.lastProgressTime = this.startTime;

    // Check if chunked upload is available, fallback to simple upload
    const degradationManager = getDegradationManager();
    const useChunkedUpload = !degradationManager?.isFeatureFailed('chunked-upload');

    if (useChunkedUpload && this.file.size > this.options.chunkSize!) {
      return this.uploadInChunks();
    } else {
      return this.uploadSimple();
    }
  }

  public cancel(): void {
    this.isAborted = true;
  }

  public getProgress(): UploadProgress {
    const percentage = this.file.size > 0 ? (this.uploadedBytes / this.file.size) * 100 : 0;
    const avgSpeed = this.speeds.length > 0 
      ? this.speeds.reduce((sum, speed) => sum + speed, 0) / this.speeds.length 
      : 0;
    const remainingBytes = this.file.size - this.uploadedBytes;
    const timeRemaining = avgSpeed > 0 ? remainingBytes / avgSpeed : 0;

    return {
      loaded: this.uploadedBytes,
      total: this.file.size,
      percentage,
      speed: avgSpeed,
      timeRemaining,
    };
  }

  private async uploadInChunks(): Promise<UploadResult> {
    const chunks = this.createChunks();
    
    // Initialize upload session
    const initResponse = await apiClient.post('/uploads/init', {
      fileName: this.file.name,
      fileSize: this.file.size,
      fileType: this.file.type,
      chunkCount: chunks.length,
      metadata: this.options.metadata,
    });

    const { uploadId, uploadUrl } = initResponse.data;

    try {
      // Upload chunks
      for (let i = 0; i < chunks.length; i++) {
        if (this.isAborted) {
          throw this.createUploadError('abort', 'Upload was cancelled', false);
        }

        await this.uploadChunk(chunks[i]!, uploadId, uploadUrl);
        
        this.options.onChunkComplete?.(i, chunks.length);
      }

      // Complete upload
      const completeResponse = await apiClient.post(`/uploads/${uploadId}/complete`, {});
      
      return completeResponse.data;

    } catch (error) {
      // Clean up failed upload
      try {
        await apiClient.delete(`/uploads/${uploadId}`);
      } catch (cleanupError) {
        logger.warn(`Failed to cleanup upload ${uploadId}:`, (cleanupError as Error).message);
      }
      
      throw error;
    }
  }

  private async uploadSimple(): Promise<UploadResult> {
    const formData = new FormData();
    formData.append('file', this.file);
    
    if (this.options.metadata) {
      formData.append('metadata', JSON.stringify(this.options.metadata));
    }

    // Simple upload without chunks
    const response = await fetch('/api/uploads/simple', {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      throw this.createUploadError(
        'server',
        `Upload failed: ${response.statusText}`,
        response.status >= 500
      );
    }

    this.uploadedBytes = this.file.size;
    this.updateProgress();

    return response.json();
  }

  private createChunks(): ChunkInfo[] {
    const chunks: ChunkInfo[] = [];
    const chunkSize = this.options.chunkSize!;
    
    for (let start = 0; start < this.file.size; start += chunkSize) {
      const end = Math.min(start + chunkSize, this.file.size);
      chunks.push({
        index: chunks.length,
        start,
        end,
        size: end - start,
      });
    }
    
    return chunks;
  }

  private async uploadChunk(chunk: ChunkInfo, uploadId: string, uploadUrl: string): Promise<void> {
    const blob = this.file.slice(chunk.start, chunk.end);
    let lastError: Error;

    for (let attempt = 0; attempt < this.options.maxRetries!; attempt++) {
      if (this.isAborted) {
        throw this.createUploadError('abort', 'Upload was cancelled', false);
      }

      try {
        await this.uploadChunkAttempt(blob, chunk, uploadId, uploadUrl);
        
        // Update progress
        this.uploadedBytes += chunk.size;
        this.updateProgress();
        
        return;

      } catch (error) {
        lastError = error as Error;
        
        if (attempt < this.options.maxRetries! - 1) {
          const delay = this.options.retryDelay! * Math.pow(2, attempt);
          logger.warn(`Chunk ${chunk.index} upload failed, retrying in ${delay}ms`, {
            attempt: attempt + 1,
            error: lastError.message,
          });
          
          await this.delay(delay);
        }
      }
    }

    throw this.createUploadError(
      'chunk',
      `Failed to upload chunk ${chunk.index} after ${this.options.maxRetries} attempts`,
      true,
      lastError!
    );
  }

  private async uploadChunkAttempt(
    blob: Blob,
    chunk: ChunkInfo,
    uploadId: string,
    uploadUrl: string
  ): Promise<void> {
    const response = await fetch(`${uploadUrl}/${chunk.index}`, {
      method: 'PUT',
      body: blob,
      headers: {
        'Content-Type': 'application/octet-stream',
        'X-Chunk-Index': chunk.index.toString(),
        'X-Chunk-Size': chunk.size.toString(),
      },
    });

    if (!response.ok) {
      const error = this.createUploadError(
        response.status >= 500 ? 'server' : 'network',
        `Chunk upload failed: ${response.statusText}`,
        response.status >= 500 || response.status === 408
      );
      error.chunkIndex = chunk.index;
      throw error;
    }
  }

  private updateProgress(): void {
    const now = Date.now();
    const timeDelta = now - this.lastProgressTime;
    
    if (timeDelta > 0) {
      const bytesPerMs = this.uploadedBytes / (now - this.startTime);
      const speed = bytesPerMs * 1000; // bytes per second
      
      this.speeds.push(speed);
      
      // Keep only last 10 speed measurements for smoothing
      if (this.speeds.length > 10) {
        this.speeds.shift();
      }
    }
    
    this.lastProgressTime = now;
    
    if (this.options.onProgress) {
      this.options.onProgress(this.getProgress());
    }
  }

  private createUploadError(
    type: UploadError['type'],
    message: string,
    retryable: boolean,
    originalError?: Error
  ): UploadError {
    const error = new Error(message) as UploadError;
    error.type = type;
    error.retryable = retryable;
    error.originalError = originalError;
    return error;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Export default upload manager instance
export const uploadManager = new UploadManager();

// Convenience functions for common upload scenarios
export async function uploadVideo(
  file: File,
  options: UploadOptions = {}
): Promise<UploadResult> {
  const videoOptions: UploadOptions = {
    ...options,
    validateFile: async (file) => {
      // Basic video file validation
      if (!file.type.startsWith('video/')) {
        throw new Error('File must be a video');
      }
      
      const maxSize = 2 * 1024 * 1024 * 1024; // 2GB
      if (file.size > maxSize) {
        throw new Error('Video file too large (max 2GB)');
      }
      
      // Run custom validation if provided
      if (options.validateFile) {
        await options.validateFile(file);
      }
    },
    chunkSize: 10 * 1024 * 1024, // 10MB chunks for videos
  };

  return uploadManager.uploadFile(file, videoOptions);
}

export async function uploadImage(
  file: File,
  options: UploadOptions = {}
): Promise<UploadResult> {
  const imageOptions: UploadOptions = {
    ...options,
    validateFile: async (file) => {
      // Basic image file validation
      if (!file.type.startsWith('image/')) {
        throw new Error('File must be an image');
      }
      
      const maxSize = 50 * 1024 * 1024; // 50MB
      if (file.size > maxSize) {
        throw new Error('Image file too large (max 50MB)');
      }
      
      // Run custom validation if provided
      if (options.validateFile) {
        await options.validateFile(file);
      }
    },
    chunkSize: 2 * 1024 * 1024, // 2MB chunks for images
  };

  return uploadManager.uploadFile(file, imageOptions);
}