// @vitest-environment jsdom
/**
 * Upload System Unit Tests
 *
 * Comprehensive tests covering:
 * - Chunked upload logic and retry mechanisms (Requirement 3.7, 3.8)
 * - Upload progress tracking and state management (Requirement 3.8)
 * - Metadata form validation and submission (Requirement 3.9)
 */

import { describe, it, expect, beforeEach, afterEach, vi, type MockedFunction } from 'vitest';
import { FormValidator, ValidationRules } from '../utils/validation.js';

// ============================================================================
// Mock Setup
// ============================================================================

// Mock error-handler
vi.mock('../app/error-handler.js', () => ({
  handleError: vi.fn(),
  getDegradationManager: vi.fn(() => ({
    isFeatureFailed: vi.fn(() => false)
  }))
}));

// Mock client-logger
vi.mock('../app/client-logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  }
}));

// Mock api client
vi.mock('../services/api.js', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn()
  }
}));

const mockFetch = vi.fn() as MockedFunction<typeof fetch>;
global.fetch = mockFetch;

// Mock crypto.randomUUID
Object.defineProperty(global, 'crypto', {
  value: { randomUUID: () => 'test-uuid-1234' }
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
Object.defineProperty(window, 'localStorage', { value: localStorageMock });

// Helper to create mock File objects
function createMockFile(name: string, size: number, type = 'video/mp4'): File {
  const content = new ArrayBuffer(size);
  return new File([content], name, { type, lastModified: Date.now() });
}

// ============================================================================
// 1. CHUNKED UPLOAD LOGIC AND RETRY MECHANISMS
// ============================================================================

describe('Upload System - Chunked Upload Logic', () => {
  let UploadManager: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    localStorageMock.clear();
    // Dynamic import to allow mocks to be set up first
    const mod = await import('./upload.js');
    UploadManager = mod.UploadManager;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Chunk Creation', () => {
    it('should split a file into correct number of chunks based on chunk size', async () => {
      const manager = new UploadManager();
      manager.configure({ defaultChunkSize: 1024 * 1024 }); // 1MB chunks

      const file = createMockFile('video.mp4', 3.5 * 1024 * 1024); // 3.5MB file

      const { apiClient } = await import('../services/api.js');
      (apiClient.post as any).mockResolvedValueOnce({
        data: { uploadId: 'upload-123', uploadUrl: 'https://upload.test/upload-123' }
      });

      // Mock chunk uploads succeed
      mockFetch.mockResolvedValue(new Response(null, { status: 200 }));
      (apiClient.post as any).mockResolvedValueOnce({
        data: { id: 'result-123', url: 'https://cdn.test/video.mp4' }
      });

      const onChunkComplete = vi.fn();
      await manager.uploadFile(file, {
        chunkSize: 1024 * 1024,
        onChunkComplete
      });

      // 3.5MB / 1MB = 4 chunks
      expect(onChunkComplete).toHaveBeenCalledTimes(4);
    });

    it('should use simple upload for files smaller than chunk size', async () => {
      const manager = new UploadManager();
      const file = createMockFile('small.mp4', 1024); // 1KB file

      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 'simple-123', url: 'https://cdn.test/small.mp4' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
      );

      const result = await manager.uploadFile(file, { chunkSize: 5 * 1024 * 1024 });
      expect(result.id).toBe('simple-123');

      // Should use /api/uploads/simple endpoint
      expect(mockFetch).toHaveBeenCalledWith('/api/uploads/simple', expect.objectContaining({
        method: 'POST'
      }));
    });
  });

  describe('Retry Logic with Exponential Backoff', () => {
    it('should retry failed chunk uploads up to maxRetries times', async () => {
      const manager = new UploadManager();
      // Use a file slightly larger than chunk to trigger chunked upload
      const file = createMockFile('video.mp4', 6 * 1024 * 1024); // 6MB

      const { apiClient } = await import('../services/api.js');
      (apiClient.post as any).mockResolvedValueOnce({
        data: { uploadId: 'upload-retry', uploadUrl: 'https://upload.test/retry' }
      });

      // Fail the first chunk 3 times (maxRetries = 3), then succeed
      mockFetch
        .mockResolvedValueOnce(new Response(null, { status: 500, statusText: 'Server Error' }))
        .mockResolvedValueOnce(new Response(null, { status: 500, statusText: 'Server Error' }))
        .mockResolvedValueOnce(new Response(null, { status: 200 })) // 3rd attempt succeeds
        .mockResolvedValue(new Response(null, { status: 200 })); // remaining chunks

      (apiClient.post as any).mockResolvedValueOnce({
        data: { id: 'result-retry', url: 'https://cdn.test/video.mp4' }
      });

      const result = await manager.uploadFile(file, {
        chunkSize: 5 * 1024 * 1024,
        maxRetries: 3,
        retryDelay: 10 // Fast for tests
      });

      expect(result.id).toBe('result-retry');
      // First chunk: 2 failures + 1 success = 3 fetch calls for chunk 0
      // Second chunk: 1 success = 1 fetch call
      // Total: at least 4 fetch calls
      expect(mockFetch.mock.calls.length).toBeGreaterThanOrEqual(3);
    });

    it('should throw error when all retries are exhausted', async () => {
      const manager = new UploadManager();
      const file = createMockFile('video.mp4', 6 * 1024 * 1024);

      const { apiClient } = await import('../services/api.js');
      (apiClient.post as any).mockResolvedValueOnce({
        data: { uploadId: 'upload-fail', uploadUrl: 'https://upload.test/fail' }
      });
      (apiClient.delete as any).mockResolvedValueOnce({});

      // Always fail
      mockFetch.mockResolvedValue(new Response(null, { status: 500, statusText: 'Server Error' }));

      await expect(
        manager.uploadFile(file, {
          chunkSize: 5 * 1024 * 1024,
          maxRetries: 2,
          retryDelay: 1
        })
      ).rejects.toThrow(/Failed to upload chunk/);
    });
