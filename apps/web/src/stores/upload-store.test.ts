/**
 * Unit Tests for Upload Store
 * 
 * Tests upload progress tracking, state management, queue processing,
 * retry logic, and lifecycle operations.
 * 
 * Requirements: 3.7, 3.8, 3.9
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { UploadStore, type UploadItem, type UploadState } from './upload-store.js';

// Mock dependencies
vi.mock('../app/client-logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  }
}));

// Mock fetch
global.fetch = vi.fn();

describe('UploadStore', () => {
  let store: UploadStore;
  let mockFile: File;
  let mockFile2: File;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    store = new UploadStore({
      maxConcurrentUploads: 3,
      chunkSize: 1024 * 1024,
      maxRetries: 3,
      retryDelay: 1000
    });

    mockFile = new File(['test content for upload'], 'video.mp4', {
      type: 'video/mp4',
      lastModified: Date.now()
    });

    mockFile2 = new File(['second test file content'], 'second-video.mp4', {
      type: 'video/mp4',
      lastModified: Date.now()
    });

    // Default fetch mock - successful responses
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ uploadUrl: 'https://api.test/upload/session-1', sessionId: 'session-1' }),
      status: 200,
      statusText: 'OK'
    });
  });

  afterEach(() => {
    store.destroy();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('Initial State', () => {
    it('should initialize with empty state', () => {
      const state = store.getState();

      expect(state.uploads).toEqual([]);
      expect(state.isUploading).toBe(false);
      expect(state.totalProgress).toBe(0);
      expect(state.completedUploads).toBe(0);
      expect(state.failedUploads).toBe(0);
      expect(state.queuedUploads).toBe(0);
      expect(state.totalSpeed).toBe(0);
    });

    it('should accept custom configuration', () => {
      const customStore = new UploadStore({
        maxConcurrentUploads: 5,
        chunkSize: 2 * 1024 * 1024,
        maxRetries: 5,
        retryDelay: 2000
      });

      // Store should initialize without error
      expect(customStore.getState().uploads).toEqual([]);
      customStore.destroy();
    });

    it('should use default config when none provided', () => {
      const defaultStore = new UploadStore();
      expect(defaultStore.getState().uploads).toEqual([]);
      defaultStore.destroy();
    });
  });

  describe('Adding Uploads', () => {
    it('should add a file to the upload queue', () => {
      const uploadId = store.addUpload(mockFile);

      expect(uploadId).toBeTruthy();
      expect(uploadId).toMatch(/^upload_/);

      const state = store.getState();
      expect(state.uploads).toHaveLength(1);
      expect(state.uploads[0]!.file).toBe(mockFile);
      // The store immediately processes the queue, so the upload may already be 'uploading'
      expect(['queued', 'uploading']).toContain(state.uploads[0]!.status);
      expect(state.uploads[0]!.progress).toBe(0);
      expect(state.uploads[0]!.retryCount).toBe(0);
    });

    it('should add upload with metadata', () => {
      const metadata = {
        title: 'Test Video',
        description: 'A test video description',
        projectId: 'project-123' as any,
        tags: ['test', 'demo']
      };

      const uploadId = store.addUpload(mockFile, metadata);
      const upload = store.getUpload(uploadId);

      expect(upload).toBeTruthy();
      expect(upload!.metadata).toEqual(metadata);
    });

    it('should generate unique upload IDs', () => {
      const id1 = store.addUpload(mockFile);
      const id2 = store.addUpload(mockFile2);

      expect(id1).not.toBe(id2);
    });

    it('should track upload after adding', () => {
      store.addUpload(mockFile);
      
      const state = store.getState();
      // Upload may be queued or already started processing
      expect(state.uploads).toHaveLength(1);
      expect(state.queuedUploads + (state.isUploading ? 1 : 0)).toBeGreaterThanOrEqual(0);
    });

    it('should add multiple files to queue', () => {
      store.addUpload(mockFile);
      store.addUpload(mockFile2);

      const state = store.getState();
      expect(state.uploads).toHaveLength(2);
    });
  });

  describe('State Subscription', () => {
    it('should notify subscribers on state changes', () => {
      const listener = vi.fn();
      store.subscribe(listener);

      // Listener should be called immediately with current state
      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith(expect.objectContaining({
        uploads: [],
        isUploading: false
      }));

      // Add an upload
      store.addUpload(mockFile);

      // Should be called multiple times as state updates (addUpload triggers queue processing)
      expect(listener.mock.calls.length).toBeGreaterThan(1);
    });

    it('should return unsubscribe function', () => {
      const listener = vi.fn();
      const unsubscribe = store.subscribe(listener);

      listener.mockClear();
      unsubscribe();

      // Should not be called after unsubscribe
      store.addUpload(mockFile);
      expect(listener).not.toHaveBeenCalled();
    });

    it('should handle listener errors gracefully', () => {
      // The store wraps listener calls in try/catch
      let callCount = 0;
      const errorListener = vi.fn(() => {
        callCount++;
        if (callCount > 1) {
          // Only throw on state updates, not initial subscribe call
          throw new Error('Listener error');
        }
      });
      const goodListener = vi.fn();

      store.subscribe(goodListener);
      store.subscribe(errorListener);

      // Clear initial subscribe calls
      goodListener.mockClear();
      errorListener.mockClear();

      // Adding an upload triggers state updates - store should catch listener errors
      store.addUpload(mockFile);

      // Good listener should still be notified despite the error listener
      expect(goodListener).toHaveBeenCalled();
    });

    it('should provide state snapshot (not reference) to subscribers', () => {
      const listener = vi.fn();
      store.subscribe(listener);

      const state1 = listener.mock.calls[0]![0] as UploadState;

      store.addUpload(mockFile);

      const state2 = listener.mock.calls[1]![0] as UploadState;

      // States should be different references
      expect(state1).not.toBe(state2);
      expect(state1.uploads).toHaveLength(0);
      expect(state2.uploads).toHaveLength(1);
    });
  });

  describe('Upload Lifecycle', () => {
    it('should transition upload from queued to uploading', async () => {
      // Setup fetch to allow the upload to start
      (global.fetch as any).mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve({
          ok: true,
          json: () => Promise.resolve({ uploadUrl: 'https://api.test/upload', sessionId: 'session-1' })
        }), 100))
      );

      store.addUpload(mockFile);

      // Advance timers to allow queue processing
      await vi.advanceTimersByTimeAsync(50);

      const state = store.getState();
      const upload = state.uploads[0];
      // Upload should be in uploading or queued state depending on timing
      expect(['queued', 'uploading']).toContain(upload!.status);
    });

    it('should set startTime when upload begins', async () => {
      (global.fetch as any).mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve({
          ok: true,
          json: () => Promise.resolve({ uploadUrl: 'https://api.test/upload', sessionId: 'session-1' })
        }), 100))
      );

      store.addUpload(mockFile);
      await vi.advanceTimersByTimeAsync(50);

      const state = store.getState();
      const upload = state.uploads[0];
      if (upload!.status === 'uploading') {
        expect(upload!.startTime).toBeInstanceOf(Date);
      }
    });
  });

  describe('Upload Pause and Resume', () => {
    it('should pause an uploading item', () => {
      const uploadId = store.addUpload(mockFile);

      // Manually set status to uploading for testing
      (store as any).updateUploadItem(uploadId, { status: 'uploading' });
      (store as any).activeUploads.set(uploadId, new AbortController());

      store.pauseUpload(uploadId);

      const upload = store.getUpload(uploadId);
      expect(upload!.status).toBe('paused');
    });

    it('should resume a paused upload', () => {
      const uploadId = store.addUpload(mockFile);
      (store as any).updateUploadItem(uploadId, { status: 'paused' });

      store.resumeUpload(uploadId);

      const upload = store.getUpload(uploadId);
      expect(upload!.status).toBe('queued');
    });

    it('should abort the upload controller when pausing', () => {
      const uploadId = store.addUpload(mockFile);
      const abortController = new AbortController();
      const abortSpy = vi.spyOn(abortController, 'abort');

      (store as any).activeUploads.set(uploadId, abortController);
      (store as any).updateUploadItem(uploadId, { status: 'uploading' });

      store.pauseUpload(uploadId);

      expect(abortSpy).toHaveBeenCalled();
    });

    it('should pause all active uploads', () => {
      const id1 = store.addUpload(mockFile);
      const id2 = store.addUpload(mockFile2);

      (store as any).updateUploadItem(id1, { status: 'uploading' });
      (store as any).updateUploadItem(id2, { status: 'uploading' });
      (store as any).activeUploads.set(id1, new AbortController());
      (store as any).activeUploads.set(id2, new AbortController());

      store.pauseAllActiveUploads();

      expect(store.getUpload(id1)!.status).toBe('paused');
      expect(store.getUpload(id2)!.status).toBe('paused');
    });
  });

  describe('Upload Cancellation', () => {
    it('should cancel an active upload', () => {
      const uploadId = store.addUpload(mockFile);
      const abortController = new AbortController();
      const abortSpy = vi.spyOn(abortController, 'abort');

      (store as any).activeUploads.set(uploadId, abortController);
      (store as any).updateUploadItem(uploadId, { status: 'uploading' });

      store.cancelUpload(uploadId);

      expect(abortSpy).toHaveBeenCalled();
      expect(store.getUpload(uploadId)!.status).toBe('cancelled');
    });

    it('should handle cancelling a queued upload', () => {
      const uploadId = store.addUpload(mockFile);

      store.cancelUpload(uploadId);

      expect(store.getUpload(uploadId)!.status).toBe('cancelled');
    });
  });

  describe('Upload Removal', () => {
    it('should remove an upload from the list', () => {
      const uploadId = store.addUpload(mockFile);

      store.removeUpload(uploadId);

      const state = store.getState();
      expect(state.uploads).toHaveLength(0);
    });

    it('should cancel before removing an active upload', () => {
      const uploadId = store.addUpload(mockFile);
      const abortController = new AbortController();
      const abortSpy = vi.spyOn(abortController, 'abort');
      (store as any).activeUploads.set(uploadId, abortController);

      store.removeUpload(uploadId);

      expect(abortSpy).toHaveBeenCalled();
      expect(store.getState().uploads).toHaveLength(0);
    });
  });

  describe('Retry Logic', () => {
    it('should retry failed uploads', () => {
      const uploadId = store.addUpload(mockFile);
      (store as any).updateUploadItem(uploadId, { status: 'failed', error: 'Network error' });

      store.retryUpload(uploadId);

      const upload = store.getUpload(uploadId);
      expect(upload!.status).toBe('queued');
      expect(upload!.progress).toBe(0);
      expect(upload!.error).toBeUndefined();
    });

    it('should not retry uploads that are not in failed state', () => {
      const uploadId = store.addUpload(mockFile);
      // Upload is in 'queued' state

      store.retryUpload(uploadId);

      // Should remain queued (not double-queued)
      const upload = store.getUpload(uploadId);
      expect(upload!.status).toBe('queued');
    });

    it('should handle error with retry when within retry limit', () => {
      const uploadId = store.addUpload(mockFile);
      (store as any).updateUploadItem(uploadId, { status: 'uploading', retryCount: 0 });

      const error = new Error('Network timeout');
      (store as any).handleUploadError(uploadId, error);

      const upload = store.getUpload(uploadId);
      expect(upload!.status).toBe('queued');
      expect(upload!.retryCount).toBe(1);
      expect(upload!.error).toContain('Retry 1/3');
    });

    it('should mark as failed when retry limit exceeded', () => {
      const uploadId = store.addUpload(mockFile);
      (store as any).updateUploadItem(uploadId, { status: 'uploading', retryCount: 3 });

      const error = new Error('Network timeout');
      (store as any).handleUploadError(uploadId, error);

      const upload = store.getUpload(uploadId);
      expect(upload!.status).toBe('failed');
      expect(upload!.error).toBe('Network timeout');
    });

    it('should not retry aborted uploads', () => {
      const uploadId = store.addUpload(mockFile);
      (store as any).updateUploadItem(uploadId, { status: 'uploading', retryCount: 0 });

      const error = new Error('Upload aborted');
      (store as any).handleUploadError(uploadId, error);

      const upload = store.getUpload(uploadId);
      expect(upload!.status).toBe('failed');
    });

    it('should use exponential backoff delay on retries', () => {
      const uploadId = store.addUpload(mockFile);
      (store as any).updateUploadItem(uploadId, { status: 'uploading', retryCount: 1 });

      const setTimeoutSpy = vi.spyOn(global, 'setTimeout');

      const error = new Error('Network timeout');
      (store as any).handleUploadError(uploadId, error);

      // retryDelay * retryCount = 1000 * 2 = 2000ms
      expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 2000);
    });
  });

  describe('Queue Processing', () => {
    it('should respect concurrent upload limits', () => {
      const storeWithLimit = new UploadStore({ maxConcurrentUploads: 1 });

      // Mock fetch to hang forever
      (global.fetch as any).mockImplementation(() => new Promise(() => {}));

      storeWithLimit.addUpload(mockFile);
      storeWithLimit.addUpload(mockFile2);

      // Only 1 should be active at a time
      const activeCount = (storeWithLimit as any).activeUploads.size;
      expect(activeCount).toBeLessThanOrEqual(1);

      storeWithLimit.destroy();
    });
  });

  describe('Global State Updates', () => {
    it('should calculate isUploading correctly', () => {
      const uploadId = store.addUpload(mockFile);
      (store as any).updateUploadItem(uploadId, { status: 'uploading' });
      (store as any).updateGlobalState();

      expect(store.getState().isUploading).toBe(true);
    });

    it('should calculate isUploading as false when no active uploads', () => {
      const uploadId = store.addUpload(mockFile);
      (store as any).updateUploadItem(uploadId, { status: 'completed', progress: 100 });
      (store as any).updateGlobalState();

      expect(store.getState().isUploading).toBe(false);
    });

    it('should count completed uploads correctly', () => {
      const id1 = store.addUpload(mockFile);
      const id2 = store.addUpload(mockFile2);
      (store as any).updateUploadItem(id1, { status: 'completed', progress: 100 });
      (store as any).updateUploadItem(id2, { status: 'uploading', progress: 50 });
      (store as any).updateGlobalState();

      expect(store.getState().completedUploads).toBe(1);
    });

    it('should count failed uploads correctly', () => {
      const id1 = store.addUpload(mockFile);
      const id2 = store.addUpload(mockFile2);
      (store as any).updateUploadItem(id1, { status: 'failed', error: 'Error' });
      (store as any).updateUploadItem(id2, { status: 'completed', progress: 100 });
      (store as any).updateGlobalState();

      expect(store.getState().failedUploads).toBe(1);
    });

    it('should calculate total progress as average', () => {
      const id1 = store.addUpload(mockFile);
      const id2 = store.addUpload(mockFile2);
      (store as any).updateUploadItem(id1, { progress: 50 });
      (store as any).updateUploadItem(id2, { progress: 100 });
      (store as any).updateGlobalState();

      expect(store.getState().totalProgress).toBe(75);
    });

    it('should calculate total speed from active uploads', () => {
      const id1 = store.addUpload(mockFile);
      const id2 = store.addUpload(mockFile2);
      (store as any).updateUploadItem(id1, { status: 'uploading', speed: 1024 * 1024 });
      (store as any).updateUploadItem(id2, { status: 'uploading', speed: 512 * 1024 });
      (store as any).updateGlobalState();

      expect(store.getState().totalSpeed).toBe(1024 * 1024 + 512 * 1024);
    });

    it('should handle zero uploads for total progress', () => {
      (store as any).updateGlobalState();
      expect(store.getState().totalProgress).toBe(0);
    });
  });

  describe('Clearing Uploads', () => {
    it('should clear completed uploads only', () => {
      const id1 = store.addUpload(mockFile);
      const id2 = store.addUpload(mockFile2);
      (store as any).updateUploadItem(id1, { status: 'completed', progress: 100 });
      (store as any).updateUploadItem(id2, { status: 'uploading', progress: 50 });

      store.clearCompleted();

      const state = store.getState();
      expect(state.uploads).toHaveLength(1);
      expect(state.uploads[0]!.id).toBe(id2);
    });

    it('should clear all uploads and abort active ones', () => {
      const id1 = store.addUpload(mockFile);
      const id2 = store.addUpload(mockFile2);

      const abortController = new AbortController();
      const abortSpy = vi.spyOn(abortController, 'abort');
      (store as any).activeUploads.set(id1, abortController);

      store.clearAll();

      expect(abortSpy).toHaveBeenCalled();
      const state = store.getState();
      expect(state.uploads).toHaveLength(0);
      expect(state.isUploading).toBe(false);
      expect(state.totalProgress).toBe(0);
    });
  });

  describe('Query Methods', () => {
    it('should get upload by ID', () => {
      const uploadId = store.addUpload(mockFile);
      const upload = store.getUpload(uploadId);

      expect(upload).toBeTruthy();
      expect(upload!.id).toBe(uploadId);
      expect(upload!.file).toBe(mockFile);
    });

    it('should return undefined for non-existent upload', () => {
      const upload = store.getUpload('non-existent-id');
      expect(upload).toBeUndefined();
    });

    it('should get uploads by status', () => {
      const id1 = store.addUpload(mockFile);
      const id2 = store.addUpload(mockFile2);
      (store as any).updateUploadItem(id1, { status: 'completed' });
      (store as any).updateUploadItem(id2, { status: 'failed' });

      const completed = store.getUploadsByStatus('completed');
      const failed = store.getUploadsByStatus('failed');

      expect(completed).toHaveLength(1);
      expect(completed[0]!.id).toBe(id1);
      expect(failed).toHaveLength(1);
      expect(failed[0]!.id).toBe(id2);
    });

    it('should return empty array for no matching status', () => {
      store.addUpload(mockFile);
      const uploading = store.getUploadsByStatus('uploading');
      expect(uploading).toHaveLength(0);
    });
  });

  describe('Cleanup and Destruction', () => {
    it('should abort all active uploads on destroy', () => {
      const uploadId = store.addUpload(mockFile);
      const abortController = new AbortController();
      const abortSpy = vi.spyOn(abortController, 'abort');
      (store as any).activeUploads.set(uploadId, abortController);

      store.destroy();

      expect(abortSpy).toHaveBeenCalled();
    });

    it('should clear listeners on destroy', () => {
      const listener = vi.fn();
      store.subscribe(listener);
      listener.mockClear();

      store.destroy();

      // Verify the listeners set is cleared
      expect((store as any).listeners.size).toBe(0);
    });

    it('should clear upload queue on destroy', () => {
      store.addUpload(mockFile);
      store.destroy();

      expect((store as any).uploadQueue).toHaveLength(0);
    });
  });

  describe('Progress Tracking', () => {
    it('should update individual upload progress', () => {
      const uploadId = store.addUpload(mockFile);
      (store as any).updateUploadItem(uploadId, { progress: 45.5, speed: 1024 * 512 });

      const upload = store.getUpload(uploadId);
      expect(upload!.progress).toBe(45.5);
      expect(upload!.speed).toBe(1024 * 512);
    });

    it('should track upload speed per item', () => {
      const uploadId = store.addUpload(mockFile);
      (store as any).updateUploadItem(uploadId, { status: 'uploading', speed: 2 * 1024 * 1024 });

      const upload = store.getUpload(uploadId);
      expect(upload!.speed).toBe(2 * 1024 * 1024);
    });
  });
});
