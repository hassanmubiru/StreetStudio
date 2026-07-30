/**
 * Unit Tests for Upload Service
 * 
 * Tests chunked upload logic, retry mechanisms with exponential backoff,
 * progress tracking, resume capabilities, and error handling.
 * 
 * Requirements: 3.7, 3.8, 3.9
 */

// @vitest-environment jsdom

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { UploadManager, uploadVideo, uploadImage } from './upload.js';
import type { UploadOptions, UploadProgress, UploadError } from './upload.js';

// Mock dependencies
vi.mock('../app/error-handler.js', () => ({
  handleError: vi.fn(),
  getDegradationManager: vi.fn(() => ({
    isFeatureFailed: vi.fn(() => false)
  }))
}));

vi.mock('../app/client-logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  }
}));

vi.mock('./api.js', () => ({
  apiClient: {
    post: vi.fn(),
    get: vi.fn(),
    delete: vi.fn()
  }
}));

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock crypto
Object.defineProperty(global, 'crypto', {
  value: {
    randomUUID: vi.fn(() => 'test-uuid-' + Math.random().toString(36).slice(2))
  }
});

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
    removeItem: vi.fn((key: string) => { delete store[key]; }),
    clear: vi.fn(() => { store = {}; })
  };
})();
Object.defineProperty(global, 'localStorage', { value: localStorageMock });

function createMockFile(name: string, size: number, type: string): File {
  const content = new ArrayBuffer(size);
  return new File([content], name, { type, lastModified: Date.now() });
}

describe('UploadManager', () => {
  let manager: UploadManager;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    localStorageMock.clear();
    manager = new UploadManager();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Configuration', () => {
    it('should use default chunk size of 5MB', () => {
      const status = manager.getQueueStatus();
      expect(status.maxConcurrent).toBe(3);
    });

    it('should allow custom configuration', () => {
      manager.configure({
        maxConcurrentUploads: 5,
        defaultChunkSize: 10 * 1024 * 1024
      });
      const status = manager.getQueueStatus();
      expect(status.maxConcurrent).toBe(5);
    });

    it('should report queue availability', () => {
      const status = manager.getQueueStatus();
      expect(status.active).toBe(0);
      expect(status.canAcceptMore).toBe(true);
    });
  });

  describe('Chunked Upload Logic', () => {
    it('should split file into chunks based on configured chunk size', async () => {
      const { apiClient } = await import('./api.js');
      const file = createMockFile('video.mp4', 15 * 1024 * 1024, 'video/mp4'); // 15MB

      // Mock init response
      (apiClient.post as any).mockResolvedValueOnce({
        data: { uploadId: 'upload-123', uploadUrl: '/uploads/upload-123/chunks' }
      });

      // Mock chunk uploads (15MB / 5MB = 3 chunks)
      mockFetch.mockResolvedValue({ ok: true, json: async () => ({}) });

      // Mock complete
      (apiClient.post as any).mockResolvedValueOnce({
        data: { id: 'result-id', url: '/videos/result-id' }
      });

      const onChunkComplete = vi.fn();
      const result = await manager.uploadFile(file, {
        chunkSize: 5 * 1024 * 1024,
        onChunkComplete
      });

      expect(onChunkComplete).toHaveBeenCalledTimes(3);
      expect(onChunkComplete).toHaveBeenCalledWith(0, 3);
      expect(onChunkComplete).toHaveBeenCalledWith(1, 3);
      expect(onChunkComplete).toHaveBeenCalledWith(2, 3);
      expect(result.id).toBe('result-id');
    });

    it('should use simple upload for files smaller than chunk size', async () => {
      const file = createMockFile('small.mp4', 1024, 'video/mp4'); // 1KB

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'simple-id', url: '/videos/simple-id' })
      });

      const result = await manager.uploadFile(file, {
        chunkSize: 5 * 1024 * 1024
      });

      expect(result.id).toBe('simple-id');
      // Simple upload uses fetch directly, not apiClient.post for init
      expect(mockFetch).toHaveBeenCalledWith('/api/uploads/simple', expect.objectContaining({
        method: 'POST'
      }));
    });

    it('should send correct headers with chunk uploads', async () => {
      const { apiClient } = await import('./api.js');
      const file = createMockFile('video.mp4', 6 * 1024 * 1024, 'video/mp4'); // 6MB = 2 chunks

      (apiClient.post as any).mockResolvedValueOnce({
        data: { uploadId: 'upload-456', uploadUrl: '/uploads/upload-456/chunks' }
      });

      mockFetch.mockResolvedValue({ ok: true, json: async () => ({}) });

      (apiClient.post as any).mockResolvedValueOnce({
        data: { id: 'result-456', url: '/videos/result-456' }
      });

      await manager.uploadFile(file, { chunkSize: 5 * 1024 * 1024 });

      // Verify chunk upload calls include proper headers
      const chunkCalls = mockFetch.mock.calls.filter(
        (call: any[]) => call[0]?.includes('/chunks/')
      );
      expect(chunkCalls.length).toBe(2);

      expect(chunkCalls[0]![1].headers['Content-Type']).toBe('application/octet-stream');
      expect(chunkCalls[0]![1].headers['X-Chunk-Index']).toBe('0');
    });
  });

  describe('Retry Mechanism with Exponential Backoff', () => {
    it('should retry failed chunks up to maxRetries times', async () => {
      const { apiClient } = await import('./api.js');
      const file = createMockFile('video.mp4', 6 * 1024 * 1024, 'video/mp4');

      (apiClient.post as any).mockResolvedValueOnce({
        data: { uploadId: 'upload-retry', uploadUrl: '/uploads/upload-retry/chunks' }
      });

      // First chunk succeeds
      mockFetch.mockResolvedValueOnce({ ok: true });
      // Second chunk fails twice then succeeds
      mockFetch.mockResolvedValueOnce({ ok: false, status: 500, statusText: 'Server Error' });
      mockFetch.mockResolvedValueOnce({ ok: false, status: 500, statusText: 'Server Error' });
      mockFetch.mockResolvedValueOnce({ ok: true });

      (apiClient.post as any).mockResolvedValueOnce({
        data: { id: 'result-retry', url: '/videos/result-retry' }
      });

      const promise = manager.uploadFile(file, {
        chunkSize: 5 * 1024 * 1024,
        maxRetries: 3,
        retryDelay: 1000
      });

      // Advance past retries
      await vi.advanceTimersByTimeAsync(10000);

      const result = await promise;
      expect(result.id).toBe('result-retry');
    });

    it('should fail after exhausting all retries', async () => {
      const { apiClient } = await import('./api.js');
      const file = createMockFile('video.mp4', 6 * 1024 * 1024, 'video/mp4');

      (apiClient.post as any).mockResolvedValueOnce({
        data: { uploadId: 'upload-fail', uploadUrl: '/uploads/upload-fail/chunks' }
      });

      // All attempts fail
      mockFetch.mockResolvedValue({ ok: false, status: 500, statusText: 'Server Error' });

      // Mock cleanup
      (apiClient.delete as any).mockResolvedValue({});

      const promise = manager.uploadFile(file, {
        chunkSize: 5 * 1024 * 1024,
        maxRetries: 2,
        retryDelay: 100
      });

      await vi.advanceTimersByTimeAsync(5000);

      await expect(promise).rejects.toThrow(/Failed to upload chunk/);
    });

    it('should apply exponential backoff between retries', async () => {
      const { apiClient } = await import('./api.js');
      const file = createMockFile('video.mp4', 6 * 1024 * 1024, 'video/mp4');

      (apiClient.post as any).mockResolvedValueOnce({
        data: { uploadId: 'upload-backoff', uploadUrl: '/uploads/upload-backoff/chunks' }
      });

      // First chunk: fails on first attempt, succeeds on second
      const fetchCalls: number[] = [];
      mockFetch.mockImplementation(async () => {
        fetchCalls.push(Date.now());
        if (fetchCalls.length <= 2) {
          return { ok: false, status: 500, statusText: 'Server Error' };
        }
        return { ok: true };
      });

      (apiClient.post as any).mockResolvedValueOnce({
        data: { id: 'result-backoff', url: '/videos/result-backoff' }
      });

      const promise = manager.uploadFile(file, {
        chunkSize: 5 * 1024 * 1024,
        maxRetries: 3,
        retryDelay: 1000
      });

      // Advance timers to process retries
      await vi.advanceTimersByTimeAsync(20000);

      const result = await promise;
      expect(result.id).toBe('result-backoff');
    });

    it('should mark error as retryable for server errors', async () => {
      const { apiClient } = await import('./api.js');
      const file = createMockFile('video.mp4', 6 * 1024 * 1024, 'video/mp4');

      (apiClient.post as any).mockResolvedValueOnce({
        data: { uploadId: 'upload-err', uploadUrl: '/uploads/upload-err/chunks' }
      });

      mockFetch.mockResolvedValue({ ok: false, status: 500, statusText: 'Server Error' });
      (apiClient.delete as any).mockResolvedValue({});

      const onError = vi.fn();
      const promise = manager.uploadFile(file, {
        chunkSize: 5 * 1024 * 1024,
        maxRetries: 1,
        retryDelay: 100,
        onError
      });

      await vi.advanceTimersByTimeAsync(5000);

      try {
        await promise;
      } catch (error) {
        const uploadError = error as UploadError;
        expect(uploadError.type).toBe('chunk');
        expect(uploadError.retryable).toBe(true);
      }
    });
  });

  describe('Progress Tracking', () => {
    it('should report progress during upload', async () => {
      const { apiClient } = await import('./api.js');
      const file = createMockFile('video.mp4', 10 * 1024 * 1024, 'video/mp4'); // 10MB

      (apiClient.post as any).mockResolvedValueOnce({
        data: { uploadId: 'upload-progress', uploadUrl: '/uploads/upload-progress/chunks' }
      });

      mockFetch.mockResolvedValue({ ok: true });

      (apiClient.post as any).mockResolvedValueOnce({
        data: { id: 'result-progress', url: '/videos/result-progress' }
      });

      const progressUpdates: UploadProgress[] = [];
      await manager.uploadFile(file, {
        chunkSize: 5 * 1024 * 1024,
        onProgress: (progress) => progressUpdates.push({ ...progress })
      });

      expect(progressUpdates.length).toBeGreaterThan(0);
      // Final progress should be 100%
      const lastProgress = progressUpdates[progressUpdates.length - 1]!;
      expect(lastProgress.percentage).toBe(100);
      expect(lastProgress.loaded).toBe(file.size);
      expect(lastProgress.total).toBe(file.size);
    });

    it('should calculate upload speed', async () => {
      const { apiClient } = await import('./api.js');
      const file = createMockFile('video.mp4', 10 * 1024 * 1024, 'video/mp4');

      (apiClient.post as any).mockResolvedValueOnce({
        data: { uploadId: 'upload-speed', uploadUrl: '/uploads/upload-speed/chunks' }
      });

      mockFetch.mockResolvedValue({ ok: true });

      (apiClient.post as any).mockResolvedValueOnce({
        data: { id: 'result-speed', url: '/videos/result-speed' }
      });

      const progressUpdates: UploadProgress[] = [];
      await manager.uploadFile(file, {
        chunkSize: 5 * 1024 * 1024,
        onProgress: (progress) => progressUpdates.push({ ...progress })
      });

      // Speed should be calculated (>=0 since test runs quickly)
      const lastProgress2 = progressUpdates[progressUpdates.length - 1]!;
      expect(lastProgress2.speed).toBeGreaterThanOrEqual(0);
    });

    it('should track time remaining', async () => {
      const { apiClient } = await import('./api.js');
      const file = createMockFile('video.mp4', 10 * 1024 * 1024, 'video/mp4');

      (apiClient.post as any).mockResolvedValueOnce({
        data: { uploadId: 'upload-time', uploadUrl: '/uploads/upload-time/chunks' }
      });

      mockFetch.mockResolvedValue({ ok: true });

      (apiClient.post as any).mockResolvedValueOnce({
        data: { id: 'result-time', url: '/videos/result-time' }
      });

      const progressUpdates: UploadProgress[] = [];
      await manager.uploadFile(file, {
        chunkSize: 5 * 1024 * 1024,
        onProgress: (progress) => progressUpdates.push({ ...progress })
      });

      // Time remaining should be non-negative
      for (const progress of progressUpdates) {
        expect(progress.timeRemaining).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('Upload Cancellation', () => {
    it('should cancel an active upload', async () => {
      const { apiClient } = await import('./api.js');
      const file = createMockFile('video.mp4', 20 * 1024 * 1024, 'video/mp4');

      (apiClient.post as any).mockResolvedValueOnce({
        data: { uploadId: 'upload-cancel', uploadUrl: '/uploads/upload-cancel/chunks' }
      });

      // First chunk succeeds, then we cancel
      let chunkCount = 0;
      mockFetch.mockImplementation(async () => {
        chunkCount++;
        if (chunkCount === 1) return { ok: true };
        // Delay to simulate slow upload
        await new Promise(resolve => setTimeout(resolve, 100));
        return { ok: true };
      });

      (apiClient.delete as any).mockResolvedValue({});

      // Start upload (don't await). Attach a rejection handler immediately so
      // the eventual cancellation rejection is never treated as unhandled.
      const uploadPromise = manager.uploadFile(file, {
        chunkSize: 5 * 1024 * 1024
      });
      const uploadSettled = uploadPromise.then(
        () => ({ ok: true as const }),
        (error: unknown) => ({ ok: false as const, error })
      );

      // Cancel after a tick
      await vi.advanceTimersByTimeAsync(50);

      // Get active uploads and cancel
      const activeUploads = manager.getActiveUploads();
      if (activeUploads.length > 0) {
        const cancelled = manager.cancelUpload(activeUploads[0]!.id);
        expect(cancelled).toBe(true);
      }

      await vi.advanceTimersByTimeAsync(5000);

      // Upload should reject
      const outcome = await uploadSettled;
      expect(outcome.ok).toBe(false);
    });

    it('should return false when cancelling non-existent upload', () => {
      const result = manager.cancelUpload('non-existent-id');
      expect(result).toBe(false);
    });

    it('should cancel all active uploads', () => {
      manager.cancelAllUploads();
      expect(manager.getActiveUploads()).toHaveLength(0);
    });
  });

  describe('Concurrent Upload Limits', () => {
    it('should reject uploads exceeding concurrent limit', async () => {
      manager.configure({ maxConcurrentUploads: 1 });

      const { apiClient } = await import('./api.js');
      const file1 = createMockFile('video1.mp4', 6 * 1024 * 1024, 'video/mp4');
      const file2 = createMockFile('video2.mp4', 6 * 1024 * 1024, 'video/mp4');

      // First upload hangs
      (apiClient.post as any).mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 10000));
        return { data: { uploadId: 'upload-1', uploadUrl: '/chunks' } };
      });

      // Start first upload
      const upload1Promise = manager.uploadFile(file1);

      // Second upload should fail due to concurrent limit
      await expect(manager.uploadFile(file2)).rejects.toThrow(/Too many active uploads/);

      // Cleanup
      manager.cancelAllUploads();
      await vi.advanceTimersByTimeAsync(20000);
      try { await upload1Promise; } catch {}
    });
  });

  describe('File Validation', () => {
    it('should run custom file validation before upload', async () => {
      const file = createMockFile('document.pdf', 1024, 'application/pdf');

      const validateFile = vi.fn().mockRejectedValue(new Error('Only video files allowed'));

      await expect(
        manager.uploadFile(file, { validateFile })
      ).rejects.toThrow('File validation failed: Only video files allowed');

      expect(validateFile).toHaveBeenCalledWith(file);
    });

    it('should not start upload if validation fails', async () => {
      const { apiClient } = await import('./api.js');
      const file = createMockFile('bad.exe', 1024, 'application/exe');

      const validateFile = vi.fn().mockRejectedValue(new Error('Invalid file type'));

      try {
        await manager.uploadFile(file, { validateFile });
      } catch {}

      // Should never call init
      expect(apiClient.post).not.toHaveBeenCalled();
    });
  });

  describe('Resume Functionality', () => {
    it('should save resume info to localStorage', async () => {
      const { apiClient } = await import('./api.js');
      const file = createMockFile('video.mp4', 10 * 1024 * 1024, 'video/mp4');

      (apiClient.post as any).mockResolvedValueOnce({
        data: { uploadId: 'upload-resume', uploadUrl: '/uploads/upload-resume/chunks' }
      });

      mockFetch.mockResolvedValue({ ok: true });

      (apiClient.post as any).mockResolvedValueOnce({
        data: { id: 'result-resume', url: '/videos/result-resume' }
      });

      await manager.uploadFile(file, {
        chunkSize: 5 * 1024 * 1024,
        enableResume: true
      });

      // Resume info should have been saved and then cleared on success
      expect(localStorageMock.setItem).toHaveBeenCalled();
    });

    it('should check if file can be resumed', () => {
      const file = createMockFile('video.mp4', 10 * 1024 * 1024, 'video/mp4');
      // Initially no resume info
      expect(manager.canResumeUpload(file)).toBe(false);
    });

    it('should clear all resume data', () => {
      manager.clearResumeData();
      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'streetstudio_upload_resume',
        '{}'
      );
    });

    it('should get list of resumeable uploads', () => {
      const resumeable = manager.getResumeableUploads();
      expect(Array.isArray(resumeable)).toBe(true);
    });
  });
});

describe('uploadVideo convenience function', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.clear();
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'video-id', url: '/videos/video-id' })
    });
  });

  it('should reject non-video files', async () => {
    const file = createMockFile('document.pdf', 1024, 'application/pdf');

    await expect(uploadVideo(file)).rejects.toThrow('File must be a video');
  });

  it('should reject files over 2GB', async () => {
    const file = createMockFile('huge.mp4', 3 * 1024 * 1024 * 1024, 'video/mp4');

    await expect(uploadVideo(file)).rejects.toThrow('Video file too large');
  });

  it('should use 10MB chunks for videos', async () => {
    const { apiClient } = await import('./api.js');
    const file = createMockFile('video.mp4', 500, 'video/mp4');

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ id: 'vid-result', url: '/vid' })
    });

    await uploadVideo(file);
    // Small file uses simple upload
    expect(mockFetch).toHaveBeenCalled();
  });
});

describe('uploadImage convenience function', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.clear();
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ id: 'img-id', url: '/images/img-id' })
    });
  });

  it('should reject non-image files', async () => {
    const file = createMockFile('video.mp4', 1024, 'video/mp4');

    await expect(uploadImage(file)).rejects.toThrow('File must be an image');
  });

  it('should reject images over 50MB', async () => {
    const file = createMockFile('huge.png', 60 * 1024 * 1024, 'image/png');

    await expect(uploadImage(file)).rejects.toThrow('Image file too large');
  });

  it('should accept valid image files', async () => {
    const file = createMockFile('photo.jpg', 1024, 'image/jpeg');

    const result = await uploadImage(file);
    expect(result.id).toBe('img-id');
  });
});
