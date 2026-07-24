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
  maxConcurrentUploads?: number;
  enableResume?: boolean;
  resumeFromStorage?: boolean;
  onProgress?: (progress: UploadProgress) => void;
  onChunkComplete?: (chunkIndex: number, totalChunks: number) => void;
  onError?: (error: UploadError) => void;
  onResume?: (resumedChunks: number) => void;
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
  uploaded?: boolean;
  etag?: string;
  retryCount?: number;
}

/**
 * Resume information for interrupted uploads
 */
export interface ResumeInfo {
  uploadId: string;
  fileName: string;
  fileSize: number;
  fileLastModified: number;
  chunks: ChunkInfo[];
  completedChunks: number[];
  metadata?: Record<string, any>;
}

export class UploadManager {
  private activeUploads = new Map<string, UploadSession>();
  private maxConcurrentUploads = 3;
  private defaultChunkSize = 5 * 1024 * 1024; // 5MB chunks
  private resumeStorage = new Map<string, ResumeInfo>(); // In-memory resume storage
  
  /**
   * Resume information for interrupted uploads
   */
  private interface ResumeInfo {
    uploadId: string;
    fileName: string;
    fileSize: number;
    fileLastModified: number;
    chunks: ChunkInfo[];
    completedChunks: number[];
    metadata?: Record<string, any>;
  }

  constructor() {
    this.loadResumeInfoFromStorage();
    this.setupResumeCleanup();
  }

  /**
   * Load resume information from localStorage on initialization
   */
  private loadResumeInfoFromStorage(): void {
    try {
      const stored = localStorage.getItem('streetstudio_upload_resume');
      if (stored) {
        const resumeData = JSON.parse(stored);
        this.resumeStorage = new Map(Object.entries(resumeData));
      }
    } catch (error) {
      logger.warn('Failed to load resume information from storage:', error);
    }
  }

  /**
   * Save resume information to localStorage
   */
  private saveResumeInfoToStorage(): void {
    try {
      const resumeData = Object.fromEntries(this.resumeStorage);
      localStorage.setItem('streetstudio_upload_resume', JSON.stringify(resumeData));
    } catch (error) {
      logger.warn('Failed to save resume information to storage:', error);
    }
  }

  /**
   * Setup cleanup of old resume information (older than 7 days)
   */
  private setupResumeCleanup(): void {
    const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
    
    for (const [key, resumeInfo] of this.resumeStorage.entries()) {
      if (resumeInfo.fileLastModified < sevenDaysAgo) {
        this.resumeStorage.delete(key);
      }
    }
    
    this.saveResumeInfoToStorage();
  }

  /**
   * Generate a resume key for a file
   */
  private generateResumeKey(file: File): string {
    return `${file.name}_${file.size}_${file.lastModified}`;
  }

  /**
   * Check if a file can be resumed
   */
  public canResumeUpload(file: File): boolean {
    const resumeKey = this.generateResumeKey(file);
    return this.resumeStorage.has(resumeKey);
  }

  /**
   * Get resume information for a file
   */
  public getResumeInfo(file: File): ResumeInfo | null {
    const resumeKey = this.generateResumeKey(file);
    return this.resumeStorage.get(resumeKey) || null;
  }

  /**
   * Configure upload manager settings
   */
  public configure(options: {
    maxConcurrentUploads?: number;
    defaultChunkSize?: number;
  }): void {
    if (options.maxConcurrentUploads) {
      this.maxConcurrentUploads = options.maxConcurrentUploads;
    }
    if (options.defaultChunkSize) {
      this.defaultChunkSize = options.defaultChunkSize;
    }
  }

  /**
   * Upload a file with chunked uploading and error handling
   */
  public async uploadFile(file: File, options: UploadOptions = {}): Promise<UploadResult> {
    const uploadId = crypto.randomUUID();
    const resumeKey = this.generateResumeKey(file);
    
    // Apply manager-level configuration
    const finalOptions: UploadOptions = {
      chunkSize: this.defaultChunkSize,
      maxConcurrentUploads: this.maxConcurrentUploads,
      enableResume: true,
      resumeFromStorage: true,
      maxRetries: 3,
      retryDelay: 1000,
      ...options
    };

    // Check for resumeable upload
    let resumeInfo: ResumeInfo | null = null;
    if (finalOptions.enableResume && finalOptions.resumeFromStorage) {
      resumeInfo = this.getResumeInfo(file);
      if (resumeInfo) {
        logger.info(`Found resumeable upload for ${file.name}`, {
          uploadId,
          completedChunks: resumeInfo.completedChunks.length,
          totalChunks: resumeInfo.chunks.length
        });
      }
    }

    const session = new UploadSession(uploadId, file, finalOptions, resumeInfo);

    try {
      // Check concurrent upload limit
      if (this.activeUploads.size >= finalOptions.maxConcurrentUploads!) {
        throw this.createUploadError(
          'quota',
          `Too many active uploads. Maximum ${finalOptions.maxConcurrentUploads} concurrent uploads allowed.`,
          false
        );
      }

      this.activeUploads.set(uploadId, session);

      // Validate file if validator provided
      if (finalOptions.validateFile) {
        try {
          await finalOptions.validateFile(file);
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
        chunkSize: finalOptions.chunkSize,
        resuming: !!resumeInfo
      });

      // Save resume info before starting
      if (finalOptions.enableResume) {
        const newResumeInfo: ResumeInfo = resumeInfo || {
          uploadId,
          fileName: file.name,
          fileSize: file.size,
          fileLastModified: file.lastModified,
          chunks: session.getChunks(),
          completedChunks: [],
          metadata: finalOptions.metadata
        };
        
        this.resumeStorage.set(resumeKey, newResumeInfo);
        this.saveResumeInfoToStorage();
      }

      const result = await session.start();

      // Clean up resume info on successful completion
      if (finalOptions.enableResume) {
        this.resumeStorage.delete(resumeKey);
        this.saveResumeInfoToStorage();
      }

      this.activeUploads.delete(uploadId);
      
      logger.info(`Upload completed: ${file.name}`, {
        uploadId,
        resultId: result.id,
      });

      return result;

    } catch (error) {
      this.activeUploads.delete(uploadId);
      
      const uploadError = error as UploadError;
      
      // Update resume info with current progress if error is retryable
      if (finalOptions.enableResume && uploadError.retryable) {
        const currentResumeInfo = this.resumeStorage.get(resumeKey);
        if (currentResumeInfo) {
          currentResumeInfo.completedChunks = session.getCompletedChunks();
          this.resumeStorage.set(resumeKey, currentResumeInfo);
          this.saveResumeInfoToStorage();
        }
      }
      
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
  private resumeInfo: ResumeInfo | null;
  private chunks: ChunkInfo[] = [];
  private completedChunks: number[] = [];
  private isAborted = false;
  private startTime = 0;
  private uploadedBytes = 0;
  private lastProgressTime = 0;
  private speeds: number[] = [];

  constructor(id: string, file: File, options: UploadOptions, resumeInfo: ResumeInfo | null = null) {
    this.id = id;
    this.file = file;
    this.resumeInfo = resumeInfo;
    this.options = {
      chunkSize: 5 * 1024 * 1024, // 5MB default
      maxRetries: 3,
      retryDelay: 1000,
      enableResume: true,
      ...options,
    };

    // Initialize or restore chunks
    if (resumeInfo) {
      this.chunks = resumeInfo.chunks;
      this.completedChunks = [...resumeInfo.completedChunks];
      this.uploadedBytes = this.completedChunks.length * this.options.chunkSize!;
      
      // Notify about resume
      options.onResume?.(this.completedChunks.length);
    } else {
      this.chunks = this.createChunks();
    }
  }

  public getId(): string {
    return this.id;
  }

  public getFileName(): string {
    return this.file.name;
  }

  public getChunks(): ChunkInfo[] {
    return this.chunks;
  }

  public getCompletedChunks(): number[] {
    return [...this.completedChunks];
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
    // Initialize upload session (or restore existing one)
    let uploadId: string;
    let uploadUrl: string;

    if (this.resumeInfo) {
      // Verify existing upload session is still valid
      try {
        const statusResponse = await apiClient.get(`/uploads/${this.resumeInfo.uploadId}/status`);
        uploadId = this.resumeInfo.uploadId;
        uploadUrl = statusResponse.data.uploadUrl;
        
        logger.info(`Resuming upload session ${uploadId}`, {
          completedChunks: this.completedChunks.length,
          totalChunks: this.chunks.length
        });
      } catch (error) {
        // Session expired, create new one
        logger.warn(`Upload session ${this.resumeInfo.uploadId} expired, starting fresh`);
        const initResponse = await this.initializeNewUpload();
        uploadId = initResponse.uploadId;
        uploadUrl = initResponse.uploadUrl;
        
        // Reset progress
        this.completedChunks = [];
        this.uploadedBytes = 0;
      }
    } else {
      // Create new upload session
      const initResponse = await this.initializeNewUpload();
      uploadId = initResponse.uploadId;
      uploadUrl = initResponse.uploadUrl;
    }

    try {
      // Upload remaining chunks
      const chunksToUpload = this.chunks.filter(chunk => 
        !this.completedChunks.includes(chunk.index)
      );

      for (const chunk of chunksToUpload) {
        if (this.isAborted) {
          throw this.createUploadError('abort', 'Upload was cancelled', false);
        }

        await this.uploadChunkWithRetry(chunk, uploadId, uploadUrl);
        
        this.completedChunks.push(chunk.index);
        this.options.onChunkComplete?.(chunk.index, this.chunks.length);
      }

      // Complete upload
      const completeResponse = await apiClient.post(`/uploads/${uploadId}/complete`, {});
      
      return completeResponse.data;

    } catch (error) {
      // Clean up failed upload only if it's a new upload (not resumed)
      if (!this.resumeInfo) {
        try {
          await apiClient.delete(`/uploads/${uploadId}`);
        } catch (cleanupError) {
          logger.warn(`Failed to cleanup upload ${uploadId}:`, (cleanupError as Error).message);
        }
      }
      
      throw error;
    }
  }

  private async initializeNewUpload(): Promise<{ uploadId: string; uploadUrl: string }> {
    const initResponse = await apiClient.post('/uploads/init', {
      fileName: this.file.name,
      fileSize: this.file.size,
      fileType: this.file.type,
      chunkCount: this.chunks.length,
      metadata: this.options.metadata,
    });

    return {
      uploadId: initResponse.data.uploadId,
      uploadUrl: initResponse.data.uploadUrl
    };
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