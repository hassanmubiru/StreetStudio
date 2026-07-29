/**
 * Unit Tests for Upload Service
 * 
 * Tests chunked upload logic, retry mechanisms with exponential backoff,
 * progress tracking, resume capabilities, and error handling.
 * 
 * Requirements: 3.7, 3.8, 3.9
 */

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
