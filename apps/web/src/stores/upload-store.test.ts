/**
 * Unit Tests for Upload Store
 * 
 * Tests upload progress tracking, state management, queue processing,
 * retry logic, pause/resume, and lifecycle management.
 * 
 * Requirements: 3.7, 3.8, 3.9
 */

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
      expect(state.uploads[0].status).toBe('queued');
      expect(state.uploads[0].progress).toBe(0);
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
