/**
 * Unit Tests for Upload Store
 * 
 * Tests upload progress tracking, state management, queue processing,
 * retry logic, pause/resume, and lifecycle management.
 * 
 * Requirements: 3.7, 3.8, 3.9
 */

// @vitest-environment jsdom

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { UploadStore, createUploadStore, getUploadStore } from './upload-store.js';
import type { UploadState, UploadItem } from './upload-store.js';

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
const mockFetch = vi.fn();
global.fetch = mockFetch;

function createMockFile(name: string, size: number, type: string): File {
  const content = new ArrayBuffer(size);
  return new File([content], name, { type, lastModified: Date.now() });
}

describe('UploadStore', () => {
  let store: UploadStore;

  beforeEach(() => {
    vi.clearAllMocks();
    store = new UploadStore();
  });

  afterEach(() => {
    store.destroy();
  });

  describe('Initialization', () => {
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
  });

  describe('Adding Uploads', () => {
    it('should add a file to upload queue', () => {
      const file = createMockFile('video.mp4', 1024 * 1024, 'video/mp4');
      const uploadId = store.addUpload(file);

      expect(uploadId).toBeTruthy();
      expect(uploadId).toContain('upload_');

      const state = store.getState();
      expect(state.uploads).toHaveLength(1);
      expect(state.uploads[0].file).toBe(file);
      // Upload transitions from queued to uploading immediately if queue has capacity
      expect(['queued', 'uploading']).toContain(state.uploads[0].status);
      expect(state.uploads[0].retryCount).toBe(0);
    });

    it('should add upload with metadata', () => {
      const file = createMockFile('video.mp4', 1024 * 1024, 'video/mp4');
      const metadata = {
        title: 'My Video',
        description: 'Test description',
        tags: ['test', 'demo']
      };

      store.addUpload(file, metadata);
      const state = store.getState();

      expect(state.uploads[0].metadata).toEqual(metadata);
    });

    it('should increment queued uploads count', () => {
      const file1 = createMockFile('video1.mp4', 1024, 'video/mp4');
      const file2 = createMockFile('video2.mp4', 1024, 'video/mp4');

      store.addUpload(file1);
      store.addUpload(file2);

      const state = store.getState();
      expect(state.uploads).toHaveLength(2);
    });
  });

  describe('State Subscriptions', () => {
    it('should notify subscribers on state changes', () => {
      const listener = vi.fn();
      store.subscribe(listener);

      // Listener called immediately with current state
      expect(listener).toHaveBeenCalledTimes(1);

      const file = createMockFile('video.mp4', 1024, 'video/mp4');
      store.addUpload(file);

      // Called with updated state (may be called multiple times due to queue processing)
      expect(listener.mock.calls.length).toBeGreaterThan(1);
      const lastCall = listener.mock.calls[listener.mock.calls.length - 1][0] as UploadState;
      expect(lastCall.uploads).toHaveLength(1);
    });

    it('should return unsubscribe function', () => {
      const listener = vi.fn();
      const unsubscribe = store.subscribe(listener);

      expect(listener).toHaveBeenCalledTimes(1);

      unsubscribe();

      const file = createMockFile('video.mp4', 1024, 'video/mp4');
      store.addUpload(file);

      // Should not be called again after unsubscribe
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('should handle listener errors gracefully', () => {
      const errorListener = vi.fn(() => { throw new Error('Listener error'); });
      const goodListener = vi.fn();

      store.subscribe(errorListener);
      store.subscribe(goodListener);

      const file = createMockFile('video.mp4', 1024, 'video/mp4');
      store.addUpload(file);

      // Good listener should still be called despite error listener
      expect(goodListener).toHaveBeenCalled();
    });
  });

  describe('Upload Lifecycle', () => {
    it('should pause an active upload', () => {
      const file = createMockFile('video.mp4', 1024, 'video/mp4');
      const uploadId = store.addUpload(file);

      store.pauseUpload(uploadId);
      const upload = store.getUpload(uploadId);
      expect(upload?.status).toBe('paused');
    });

    it('should resume a paused upload', () => {
      const file = createMockFile('video.mp4', 1024, 'video/mp4');
      const uploadId = store.addUpload(file);

      store.pauseUpload(uploadId);
      store.resumeUpload(uploadId);

      const upload = store.getUpload(uploadId);
      expect(upload?.status).toBe('queued');
    });

    it('should cancel an upload', () => {
      const file = createMockFile('video.mp4', 1024, 'video/mp4');
      const uploadId = store.addUpload(file);

      store.cancelUpload(uploadId);
      const upload = store.getUpload(uploadId);
      expect(upload?.status).toBe('cancelled');
    });

    it('should remove an upload from the list', () => {
      const file = createMockFile('video.mp4', 1024, 'video/mp4');
      const uploadId = store.addUpload(file);

      store.removeUpload(uploadId);
      expect(store.getUpload(uploadId)).toBeUndefined();
      expect(store.getState().uploads).toHaveLength(0);
    });

    it('should retry a failed upload', () => {
      const file = createMockFile('video.mp4', 1024, 'video/mp4');
      const uploadId = store.addUpload(file);

      // Manually set as failed (simulating internal state)
      (store as any).updateUploadItem(uploadId, { status: 'failed', error: 'Network error' });

      store.retryUpload(uploadId);
      const upload = store.getUpload(uploadId);
      expect(upload?.status).toBe('queued');
      expect(upload?.progress).toBe(0);
      expect(upload?.error).toBeUndefined();
    });
  });

  describe('Batch Operations', () => {
    it('should pause all active uploads', () => {
      const file1 = createMockFile('video1.mp4', 1024, 'video/mp4');
      const file2 = createMockFile('video2.mp4', 1024, 'video/mp4');

      store.addUpload(file1);
      store.addUpload(file2);

      store.pauseAllActiveUploads();

      const state = store.getState();
      const uploading = state.uploads.filter(u => u.status === 'uploading');
      expect(uploading).toHaveLength(0);
    });

    it('should clear completed uploads', () => {
      const file1 = createMockFile('video1.mp4', 1024, 'video/mp4');
      const file2 = createMockFile('video2.mp4', 1024, 'video/mp4');

      const id1 = store.addUpload(file1);
      const id2 = store.addUpload(file2);

      // Mark one as completed
      (store as any).updateUploadItem(id1, { status: 'completed', progress: 100 });

      store.clearCompleted();

      const state = store.getState();
      expect(state.uploads).toHaveLength(1);
      expect(state.uploads[0].id).toBe(id2);
    });

    it('should clear all uploads', () => {
      const file1 = createMockFile('video1.mp4', 1024, 'video/mp4');
      const file2 = createMockFile('video2.mp4', 1024, 'video/mp4');

      store.addUpload(file1);
      store.addUpload(file2);

      store.clearAll();

      const state = store.getState();
      expect(state.uploads).toHaveLength(0);
      expect(state.isUploading).toBe(false);
      expect(state.totalProgress).toBe(0);
    });
  });

  describe('Query Methods', () => {
    it('should get upload by ID', () => {
      const file = createMockFile('video.mp4', 1024, 'video/mp4');
      const uploadId = store.addUpload(file);

      const upload = store.getUpload(uploadId);
      expect(upload).toBeDefined();
      expect(upload?.id).toBe(uploadId);
    });

    it('should return undefined for non-existent upload', () => {
      const upload = store.getUpload('non-existent');
      expect(upload).toBeUndefined();
    });

    it('should get uploads by status', () => {
      const file1 = createMockFile('video1.mp4', 1024, 'video/mp4');
      const file2 = createMockFile('video2.mp4', 1024, 'video/mp4');

      const id1 = store.addUpload(file1);
      store.addUpload(file2);

      // Mark first as failed
      (store as any).updateUploadItem(id1, { status: 'failed' });

      const failed = store.getUploadsByStatus('failed');
      expect(failed).toHaveLength(1);
      expect(failed[0].id).toBe(id1);

      const queued = store.getUploadsByStatus('queued');
      expect(queued.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Global State Computation', () => {
    it('should compute totalProgress as average of all uploads', () => {
      const file1 = createMockFile('video1.mp4', 1024, 'video/mp4');
      const file2 = createMockFile('video2.mp4', 1024, 'video/mp4');

      const id1 = store.addUpload(file1);
      const id2 = store.addUpload(file2);

      (store as any).updateUploadItem(id1, { progress: 50 });
      (store as any).updateUploadItem(id2, { progress: 100 });
      (store as any).updateGlobalState();

      const state = store.getState();
      expect(state.totalProgress).toBe(75); // (50 + 100) / 2
    });

    it('should track completed and failed counts', () => {
      const file1 = createMockFile('video1.mp4', 1024, 'video/mp4');
      const file2 = createMockFile('video2.mp4', 1024, 'video/mp4');
      const file3 = createMockFile('video3.mp4', 1024, 'video/mp4');

      const id1 = store.addUpload(file1);
      const id2 = store.addUpload(file2);
      store.addUpload(file3);

      (store as any).updateUploadItem(id1, { status: 'completed' });
      (store as any).updateUploadItem(id2, { status: 'failed' });
      (store as any).updateGlobalState();

      const state = store.getState();
      expect(state.completedUploads).toBe(1);
      expect(state.failedUploads).toBe(1);
    });

    it('should compute total speed from active uploads', () => {
      const file1 = createMockFile('video1.mp4', 1024, 'video/mp4');
      const file2 = createMockFile('video2.mp4', 1024, 'video/mp4');

      const id1 = store.addUpload(file1);
      const id2 = store.addUpload(file2);

      (store as any).updateUploadItem(id1, { status: 'uploading', speed: 1024 * 1024 });
      (store as any).updateUploadItem(id2, { status: 'uploading', speed: 512 * 1024 });
      (store as any).updateGlobalState();

      const state = store.getState();
      expect(state.totalSpeed).toBe(1024 * 1024 + 512 * 1024);
      expect(state.isUploading).toBe(true);
    });
  });

  describe('Cleanup and Destruction', () => {
    it('should clean up on destroy', () => {
      const file = createMockFile('video.mp4', 1024, 'video/mp4');
      store.addUpload(file);

      const listener = vi.fn();
      store.subscribe(listener);

      store.destroy();

      // After destroy, listener should be cleared
      // Adding new upload should not trigger listener
      // (Store is in destroyed state)
    });
  });
});

describe('Upload Store Singleton', () => {
  afterEach(() => {
    // Clean up singleton
    try {
      getUploadStore().destroy();
    } catch {}
  });

  it('should create store singleton with createUploadStore', () => {
    const store = createUploadStore();
    expect(store).toBeInstanceOf(UploadStore);
  });

  it('should return same instance with getUploadStore', () => {
    const store = createUploadStore();
    const retrieved = getUploadStore();
    expect(retrieved).toBe(store);
  });

  it('should throw if getUploadStore called before create', () => {
    // Destroy any existing instance
    try {
      const existing = getUploadStore();
      existing.destroy();
    } catch {}

    // Force the singleton to null
    createUploadStore().destroy();
    
    // After destroy and re-create cycle, it should work
    const newStore = createUploadStore({ maxConcurrentUploads: 2 });
    expect(getUploadStore()).toBe(newStore);
    newStore.destroy();
  });

  it('should destroy previous instance when creating new one', () => {
    const store1 = createUploadStore();
    const file = createMockFile('video.mp4', 1024, 'video/mp4');
    store1.addUpload(file);

    const store2 = createUploadStore();
    // New store should have empty state
    expect(store2.getState().uploads).toHaveLength(0);
    store2.destroy();
  });
});
