/**
 * Upload Store
 * 
 * Manages upload progress, queue, and background upload state for the navigation system
 */

import type { Uuid } from '@streetstudio/shared';
import { logger } from '../app/client-logger';

export interface UploadItem {
  id: string;
  file: File;
  progress: number;
  speed: number; // bytes per second
  status: 'queued' | 'uploading' | 'completed' | 'failed' | 'cancelled' | 'paused';
  error?: string;
  startTime?: Date;
  completedTime?: Date;
  retryCount: number;
  metadata?: {
    title?: string;
    description?: string;
    projectId?: Uuid;
    folderId?: Uuid;
    tags?: string[];
  };
}

export interface UploadState {
  uploads: UploadItem[];
  isUploading: boolean;
  totalProgress: number;
  completedUploads: number;
  failedUploads: number;
  queuedUploads: number;
  totalSpeed: number; // Combined speed of all active uploads
}

export interface UploadConfig {
  maxConcurrentUploads: number;
  chunkSize: number;
  maxRetries: number;
  retryDelay: number;
}

export class UploadStore {
  private state: UploadState;
  private listeners: Set<(state: UploadState) => void> = new Set();
  private activeUploads: Map<string, AbortController> = new Map();
  private config: UploadConfig;
  private uploadQueue: string[] = [];

  private readonly DEFAULT_CONFIG: UploadConfig = {
    maxConcurrentUploads: 3,
    chunkSize: 1024 * 1024, // 1MB chunks
    maxRetries: 3,
    retryDelay: 1000 // 1 second
  };

  constructor(config?: Partial<UploadConfig>) {
    this.config = { ...this.DEFAULT_CONFIG, ...config };
    this.state = this.getInitialState();
    this.setupEventListeners();
  }

  /**
   * Get initial state
   */
  private getInitialState(): UploadState {
    return {
      uploads: [],
      isUploading: false,
      totalProgress: 0,
      completedUploads: 0,
      failedUploads: 0,
      queuedUploads: 0,
      totalSpeed: 0
    };
  }

  /**
   * Setup event listeners for app lifecycle
   */
  private setupEventListeners(): void {
    // Pause uploads when tab is hidden
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        this.pauseAllActiveUploads();
      } else {
        this.resumeQueuedUploads();
      }
    });

    // Handle browser beforeunload
    window.addEventListener('beforeunload', (event) => {
      const activeUploads = this.state.uploads.filter(u => u.status === 'uploading');
      if (activeUploads.length > 0) {
        event.preventDefault();
        event.returnValue = 'You have uploads in progress. Are you sure you want to leave?';
        return event.returnValue;
      }
    });
  }

  /**
   * Get current upload state
   */
  public getState(): UploadState {
    return { ...this.state };
  }

  /**
   * Subscribe to upload state changes
   */
  public subscribe(listener: (state: UploadState) => void): () => void {
    this.listeners.add(listener);
    
    // Send current state immediately
    listener(this.getState());
    
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Update upload state
   */
  private updateState(updates: Partial<UploadState>): void {
    this.state = { ...this.state, ...updates };
    this.notifyListeners();
  }

  /**
   * Notify all listeners of state changes
   */
  private notifyListeners(): void {
    this.listeners.forEach(listener => {
      try {
        listener(this.getState());
      } catch (error) {
        logger.error('Upload store listener error', { error });
      }
    });
  }

  /**
   * Add file to upload queue
   */
  public addUpload(file: File, metadata?: UploadItem['metadata']): string {
    const uploadId = this.generateUploadId();
    
    const uploadItem: UploadItem = {
      id: uploadId,
      file,
      progress: 0,
      speed: 0,
      status: 'queued',
      retryCount: 0,
      metadata
    };

    const uploads = [...this.state.uploads, uploadItem];
    this.uploadQueue.push(uploadId);

    this.updateState({
      uploads,
      queuedUploads: this.state.queuedUploads + 1
    });

    this.processQueue();

    logger.debug('Upload added to queue', {
      uploadId,
      filename: file.name,
      size: file.size
    });

    return uploadId;
  }

  /**
   * Process upload queue
   */
  private async processQueue(): Promise<void> {
    const activeUploadsCount = this.activeUploads.size;
    
    if (activeUploadsCount >= this.config.maxConcurrentUploads) {
      return;
    }

    const queuedUpload = this.uploadQueue.shift();
    if (!queuedUpload) {
      return;
    }

    const uploadItem = this.state.uploads.find(u => u.id === queuedUpload);
    if (!uploadItem || uploadItem.status !== 'queued') {
      // Continue processing queue
      this.processQueue();
      return;
    }

    await this.startUpload(queuedUpload);
  }

  /**
   * Start upload for specific item
   */
  private async startUpload(uploadId: string): Promise<void> {
    const uploadItem = this.state.uploads.find(u => u.id === uploadId);
    if (!uploadItem) return;

    const abortController = new AbortController();
    this.activeUploads.set(uploadId, abortController);

    // Update state
    this.updateUploadItem(uploadId, {
      status: 'uploading',
      startTime: new Date()
    });

    this.updateGlobalState();

    try {
      await this.performUpload(uploadItem, abortController.signal);
      
      this.updateUploadItem(uploadId, {
        status: 'completed',
        progress: 100,
        completedTime: new Date()
      });

      this.activeUploads.delete(uploadId);
      this.updateGlobalState();

      // Continue processing queue
      this.processQueue();

      logger.info('Upload completed', {
        uploadId,
        filename: uploadItem.file.name,
        duration: uploadItem.completedTime && uploadItem.startTime 
          ? uploadItem.completedTime.getTime() - uploadItem.startTime.getTime()
          : 0
      });

    } catch (error) {
      this.handleUploadError(uploadId, error as Error);
      this.activeUploads.delete(uploadId);
      this.updateGlobalState();
      
      // Continue processing queue
      this.processQueue();
    }
  }

  /**
   * Perform the actual upload with chunking
   */
  private async performUpload(uploadItem: UploadItem, signal: AbortSignal): Promise<void> {
    const { file, id: uploadId } = uploadItem;
    const chunkSize = this.config.chunkSize;
    const totalChunks = Math.ceil(file.size / chunkSize);
    let uploadedBytes = 0;

    // Initialize multipart upload
    const uploadSession = await this.initializeUpload(uploadItem, signal);
    
    for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
      if (signal.aborted) {
        throw new Error('Upload aborted');
      }

      const start = chunkIndex * chunkSize;
      const end = Math.min(start + chunkSize, file.size);
      const chunk = file.slice(start, end);

      const startTime = Date.now();
      
      await this.uploadChunk(uploadSession.uploadUrl, chunk, chunkIndex, signal);
      
      const endTime = Date.now();
      const chunkTime = endTime - startTime;
      const chunkSpeed = chunk.size / (chunkTime / 1000); // bytes per second

      uploadedBytes += chunk.size;
      const progress = (uploadedBytes / file.size) * 100;

      this.updateUploadItem(uploadId, {
        progress,
        speed: chunkSpeed
      });

      this.updateGlobalState();
    }

    // Finalize upload
    await this.finalizeUpload(uploadSession, signal);
  }

  /**
   * Initialize upload session
   */
  private async initializeUpload(uploadItem: UploadItem, signal: AbortSignal): Promise<{ uploadUrl: string; sessionId: string }> {
    const response = await fetch('/api/uploads/initialize', {
      method: 'POST',
      signal,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${await this.getAccessToken()}`
      },
      body: JSON.stringify({
        filename: uploadItem.file.name,
        size: uploadItem.file.size,
        mimeType: uploadItem.file.type,
        metadata: uploadItem.metadata
      })
    });

    if (!response.ok) {
      throw new Error(`Failed to initialize upload: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Upload single chunk
   */
  private async uploadChunk(uploadUrl: string, chunk: Blob, chunkIndex: number, signal: AbortSignal): Promise<void> {
    const formData = new FormData();
    formData.append('chunk', chunk);
    formData.append('chunkIndex', chunkIndex.toString());

    const response = await fetch(uploadUrl, {
      method: 'PUT',
      signal,
      body: formData
    });

    if (!response.ok) {
      throw new Error(`Failed to upload chunk ${chunkIndex}: ${response.statusText}`);
    }
  }

  /**
   * Finalize upload session
   */
  private async finalizeUpload(uploadSession: { uploadUrl: string; sessionId: string }, signal: AbortSignal): Promise<void> {
    const response = await fetch('/api/uploads/finalize', {
      method: 'POST',
      signal,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${await this.getAccessToken()}`
      },
      body: JSON.stringify({
        sessionId: uploadSession.sessionId
      })
    });

    if (!response.ok) {
      throw new Error(`Failed to finalize upload: ${response.statusText}`);
    }
  }

  /**
   * Handle upload error with retry logic
   */
  private handleUploadError(uploadId: string, error: Error): void {
    const uploadItem = this.state.uploads.find(u => u.id === uploadId);
    if (!uploadItem) return;

    logger.error('Upload error', {
      uploadId,
      filename: uploadItem.file.name,
      error: error.message,
      retryCount: uploadItem.retryCount
    });

    if (uploadItem.retryCount < this.config.maxRetries && error.message !== 'Upload aborted') {
      // Retry upload
      const retryCount = uploadItem.retryCount + 1;
      
      this.updateUploadItem(uploadId, {
        status: 'queued',
        retryCount,
        error: `Retry ${retryCount}/${this.config.maxRetries}: ${error.message}`
      });

      // Add back to queue with delay
      setTimeout(() => {
        this.uploadQueue.push(uploadId);
        this.processQueue();
      }, this.config.retryDelay * retryCount);

    } else {
      // Mark as failed
      this.updateUploadItem(uploadId, {
        status: 'failed',
        error: error.message
      });
    }
  }

  /**
   * Update specific upload item
   */
  private updateUploadItem(uploadId: string, updates: Partial<UploadItem>): void {
    const uploads = this.state.uploads.map(upload => {
      if (upload.id === uploadId) {
        return { ...upload, ...updates };
      }
      return upload;
    });

    this.updateState({ uploads });
  }

  /**
   * Update global state counters
   */
  private updateGlobalState(): void {
    const uploads = this.state.uploads;
    
    const isUploading = uploads.some(u => u.status === 'uploading');
    const completedUploads = uploads.filter(u => u.status === 'completed').length;
    const failedUploads = uploads.filter(u => u.status === 'failed').length;
    const queuedUploads = uploads.filter(u => u.status === 'queued').length;
    
    const activeUploads = uploads.filter(u => u.status === 'uploading');
    const totalProgress = uploads.length > 0 
      ? uploads.reduce((sum, upload) => sum + upload.progress, 0) / uploads.length
      : 0;
    
    const totalSpeed = activeUploads.reduce((sum, upload) => sum + upload.speed, 0);

    this.updateState({
      isUploading,
      totalProgress,
      completedUploads,
      failedUploads,
      queuedUploads,
      totalSpeed
    });
  }

  /**
   * Pause upload
   */
  public pauseUpload(uploadId: string): void {
    const abortController = this.activeUploads.get(uploadId);
    if (abortController) {
      abortController.abort();
      this.activeUploads.delete(uploadId);
    }

    this.updateUploadItem(uploadId, { status: 'paused' });
    this.updateGlobalState();
    
    // Continue processing other uploads in queue
    this.processQueue();
  }

  /**
   * Resume upload
   */
  public resumeUpload(uploadId: string): void {
    this.updateUploadItem(uploadId, { status: 'queued' });
    this.uploadQueue.push(uploadId);
    this.processQueue();
  }

  /**
   * Cancel upload
   */
  public cancelUpload(uploadId: string): void {
    const abortController = this.activeUploads.get(uploadId);
    if (abortController) {
      abortController.abort();
      this.activeUploads.delete(uploadId);
    }

    this.updateUploadItem(uploadId, { status: 'cancelled' });
    this.updateGlobalState();
    
    // Continue processing queue
    this.processQueue();
  }

  /**
   * Remove upload from list
   */
  public removeUpload(uploadId: string): void {
    this.cancelUpload(uploadId);
    
    const uploads = this.state.uploads.filter(u => u.id !== uploadId);
    this.updateState({ uploads });
    this.updateGlobalState();
  }

  /**
   * Retry failed upload
   */
  public retryUpload(uploadId: string): void {
    const uploadItem = this.state.uploads.find(u => u.id === uploadId);
    if (uploadItem && uploadItem.status === 'failed') {
      this.updateUploadItem(uploadId, {
        status: 'queued',
        progress: 0,
        error: undefined
      });
      
      this.uploadQueue.push(uploadId);
      this.processQueue();
    }
  }

  /**
   * Pause all active uploads
   */
  public pauseAllActiveUploads(): void {
    const activeUploads = this.state.uploads.filter(u => u.status === 'uploading');
    activeUploads.forEach(upload => {
      this.pauseUpload(upload.id);
    });
  }

  /**
   * Resume queued uploads
   */
  public resumeQueuedUploads(): void {
    this.processQueue();
  }

  /**
   * Clear completed uploads
   */
  public clearCompleted(): void {
    const uploads = this.state.uploads.filter(u => u.status !== 'completed');
    this.updateState({ uploads });
    this.updateGlobalState();
  }

  /**
   * Clear all uploads
   */
  public clearAll(): void {
    // Cancel all active uploads
    this.activeUploads.forEach((controller) => {
      controller.abort();
    });
    this.activeUploads.clear();
    this.uploadQueue = [];

    this.updateState({
      uploads: [],
      isUploading: false,
      totalProgress: 0,
      completedUploads: 0,
      failedUploads: 0,
      queuedUploads: 0,
      totalSpeed: 0
    });
  }

  /**
   * Get upload by ID
   */
  public getUpload(uploadId: string): UploadItem | undefined {
    return this.state.uploads.find(u => u.id === uploadId);
  }

  /**
   * Get uploads by status
   */
  public getUploadsByStatus(status: UploadItem['status']): UploadItem[] {
    return this.state.uploads.filter(u => u.status === status);
  }

  /**
   * Generate unique upload ID
   */
  private generateUploadId(): string {
    return `upload_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get access token (placeholder - would integrate with auth store)
   */
  private async getAccessToken(): Promise<string> {
    // This should integrate with the auth store
    // For now, return a placeholder
    return 'TOKEN_PLACEHOLDER';
  }

  /**
   * Destroy store and clean up resources
   */
  public destroy(): void {
    // Cancel all active uploads
    this.activeUploads.forEach((controller) => {
      controller.abort();
    });
    this.activeUploads.clear();
    this.uploadQueue = [];
    this.listeners.clear();
    
    logger.info('Upload store destroyed');
  }
}

// Export singleton instance
let uploadStoreInstance: UploadStore | null = null;

export function createUploadStore(config?: Partial<UploadConfig>): UploadStore {
  if (uploadStoreInstance) {
    uploadStoreInstance.destroy();
  }
  
  uploadStoreInstance = new UploadStore(config);
  return uploadStoreInstance;
}

export function getUploadStore(): UploadStore {
  if (!uploadStoreInstance) {
    throw new Error('Upload store not initialized. Call createUploadStore first.');
  }
  
  return uploadStoreInstance;
}

// Convenience functions
export function useUploadState(): UploadState {
  return getUploadStore().getState();
}

export function subscribeToUploads(callback: (state: UploadState) => void): () => void {
  return getUploadStore().subscribe(callback);
}

export function isUploading(): boolean {
  return getUploadStore().getState().isUploading;
}

export function getUploadProgress(): number {
  return getUploadStore().getState().totalProgress;
}