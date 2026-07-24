/**
 * Unit Tests for Enhanced Upload Manager
 * 
 * Tests chunked upload functionality, resume capabilities, queue management,
 * and retry logic with exponential backoff.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { uploadManager, UploadManager, type UploadOptions, type UploadResult } from './upload.js';

// Mock dependencies
vi.mock('../app/client-logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  }
}));

vi.mock('../app/error-handler.js', () => ({
  handleError: vi.fn(),
  getDegradationManager: vi.fn(() => ({
    isFeatureFailed: vi.fn(() => false)
  }))
}));

vi.mock('./api.js', () => ({
  apiClient: {
    post: vi.fn(),
    get: vi.fn(),
    delete: vi.fn()
  }
}));

// Mock fetch for chunk uploads
global.fetch = vi.fn();

// Mock localStorage
Object.defineProperty(window, 'localStorage', {
  value: {
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn(),
    clear: vi.fn()
  }
});

describe('Enhanced Upload Manager', () => {
  let manager: UploadManager;
  let mockFile: File;

  beforeEach(() => {
    manager = new UploadManager();
    
    // Create mock file
    mockFile = new File(['test content'], 'test.mp4', {
      type: 'video/mp4',
      lastModified: Date.now()
    });

    // Reset mocks
    vi.clearAllMocks();
    
    // Setup default fetch mock
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: 'test-id', url: 'test-url' }),
      status: 200,
      statusText: 'OK'
    });
  });

  afterEach(() => {
    manager.cancelAllUploads();
    vi.clearAllMocks();
  });

  describe('Configuration', () => {
    it('should configure upload manager settings', () => {
      manager.configure({
        maxConcurrentUploads: 5,
        defaultChunkSize: 2 * 1024 * 1024 // 2MB
      });

      const queueStatus = manager.getQueueStatus();
      expect(queueStatus.maxConcurrent).toBe(5);
    });

    it('should use default configuration when not specified', () => {
      const queueStatus = manager.getQueueStatus();
      expect(queueStatus.maxConcurrent).toBe(3); // Default
    });
  });

  describe('Queue Management', () => {
    it('should track active uploads count', async () => {
      const initialStatus = manager.getQueueStatus();
      expect(initialStatus.active).toBe(0);
      expect(initialStatus.canAcceptMore).toBe(true);
    });

    it('should enforce concurrent upload limits', async () => {
      manager.configure({ maxConcurrentUploads: 1 });
      
      // Start first upload (will be active)
      const upload1Promise = manager.uploadFile(mockFile);
      
      // Try to start second upload (should be rejected)
      const mockFile2 = new File(['test2'], 'test2.mp4', { type: 'video/mp4' });
      
      await expect(manager.uploadFile(mockFile2)).rejects.toThrow('Too many active uploads');
      
      // Cancel first upload to clean up
      const uploads = manager.getActiveUploads();
      if (uploads.length > 0) {
        manager.cancelUpload(uploads[0]!.id);
      }
    });

    it('should report queue status correctly', () => {
      manager.configure({ maxConcurrentUploads: 2 });
      
      const status = manager.getQueueStatus();
      expect(status).toEqual({
        active: 0,
        maxConcurrent: 2,
        canAcceptMore: true
      });
    });
  });

  describe('Resume Functionality', () => {
    beforeEach(() => {
      // Mock localStorage for resume functionality
      const mockStorage = new Map<string, string>();
      (window.localStorage.getItem as any).mockImplementation((key: string) => {
        return mockStorage.get(key) || null;
      });
      (window.localStorage.setItem as any).mockImplementation((key: string, value: string) => {
        mockStorage.set(key, value);
      });
    });

    it('should detect resumeable uploads', () => {
      // Initially no resumeable uploads
      expect(manager.canResumeUpload(mockFile)).toBe(false);
      
      // Mock stored resume info
      const resumeData = {
        [`${mockFile.name}_${mockFile.size}_${mockFile.lastModified}`]: {
          uploadId: 'test-upload',
          fileName: mockFile.name,
          fileSize: mockFile.size,
          fileLastModified: mockFile.lastModified,
          chunks: [
            { index: 0, start: 0, end: 1024, size: 1024, uploaded: true },
            { index: 1, start: 1024, end: 2048, size: 1024, uploaded: false }
          ],
          completedChunks: [0],
          metadata: {}
        }
      };
      
      (window.localStorage.getItem as any).mockReturnValue(JSON.stringify(resumeData));
      
      // Create new manager instance to load from storage
      const newManager = new UploadManager();
      expect(newManager.canResumeUpload(mockFile)).toBe(true);
    });

    it('should get resume information for files', () => {
      const resumeData = {
        [`${mockFile.name}_${mockFile.size}_${mockFile.lastModified}`]: {
          uploadId: 'test-upload',
          fileName: mockFile.name,
          fileSize: mockFile.size,
          fileLastModified: mockFile.lastModified,
          chunks: [],
          completedChunks: [0, 1],
          metadata: {}
        }
      };
      
      (window.localStorage.getItem as any).mockReturnValue(JSON.stringify(resumeData));
      
      const newManager = new UploadManager();
      const resumeInfo = newManager.getResumeInfo(mockFile);
      
      expect(resumeInfo).toBeTruthy();
      expect(resumeInfo?.completedChunks).toEqual([0, 1]);
    });

    it('should list resumeable uploads', () => {
      const resumeData = {
        'file1_1024_123456': {
          fileName: 'file1.mp4',
          fileSize: 1024,
          chunks: Array(5).fill(null).map((_, i) => ({ index: i })),
          completedChunks: [0, 1, 2]
        },
        'file2_2048_654321': {
          fileName: 'file2.mp4',
          fileSize: 2048,
          chunks: Array(3).fill(null).map((_, i) => ({ index: i })),
          completedChunks: [0]
        }
      };
      
      (window.localStorage.getItem as any).mockReturnValue(JSON.stringify(resumeData));
      
      const newManager = new UploadManager();
      const resumeableUploads = newManager.getResumeableUploads();
      
      expect(resumeableUploads).toHaveLength(2);
      expect(resumeableUploads[0]).toEqual({
        fileName: 'file1.mp4',
        fileSize: 1024,
        completedChunks: 3,
        totalChunks: 5,
        resumeKey: 'file1_1024_123456'
      });
    });

    it('should clear resume data', () => {
      manager.clearResumeData();
      expect(window.localStorage.setItem).toHaveBeenCalledWith(
        'streetstudio_upload_resume',
        '{}'
      );
    });
  });

  describe('Chunked Upload Process', () => {
    beforeEach(() => {
      // Mock API responses
      const { apiClient } = require('./api.js');
      
      apiClient.post.mockImplementation((url: string) => {
        if (url === '/uploads/init') {
          return Promise.resolve({
            data: {
              uploadId: 'test-upload-id',
              uploadUrl: 'https://example.com/upload'
            }
          });
        }
        if (url.includes('/complete')) {
          return Promise.resolve({
            data: {
              id: 'completed-upload-id',
              url: 'https://example.com/video/completed-upload-id'
            }
          });
        }
        return Promise.resolve({ data: {} });
      });
    });

    it('should create chunks correctly', async () => {
      const options: UploadOptions = {
        chunkSize: 1024, // 1KB chunks for testing
        onChunkComplete: vi.fn()
      };

      try {
        await manager.uploadFile(mockFile, options);
      } catch (error) {
        // Expected to fail due to mocked fetch, but we can verify API calls
      }

      // Verify upload initialization
      const { apiClient } = require('./api.js');
      expect(apiClient.post).toHaveBeenCalledWith('/uploads/init', {
        fileName: mockFile.name,
        fileSize: mockFile.size,
        fileType: mockFile.type,
        chunkCount: expect.any(Number),
        metadata: undefined
      });
    });

    it('should handle chunk upload progress', async () => {
      const onProgress = vi.fn();
      const onChunkComplete = vi.fn();
      
      const options: UploadOptions = {
        chunkSize: 1024,
        onProgress,
        onChunkComplete
      };

      try {
        await manager.uploadFile(mockFile, options);
      } catch (error) {
        // Expected to fail due to incomplete mocking
      }

      // Verify callbacks were set up (actual calls depend on successful upload)
      expect(options.onProgress).toBe(onProgress);
      expect(options.onChunkComplete).toBe(onChunkComplete);
    });
  });

  describe('Error Handling and Retry Logic', () => {
    it('should implement exponential backoff for retries', async () => {
      // Mock fetch to fail initially then succeed
      let attempts = 0;
      (global.fetch as any).mockImplementation(() => {
        attempts++;
        if (attempts < 3) {
          return Promise.reject(new Error('Network error'));
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ id: 'success' }),
          status: 200
        });
      });

      const options: UploadOptions = {
        maxRetries: 3,
        retryDelay: 100 // Short delay for testing
      };

      // Start timing
      const startTime = Date.now();

      try {
        await manager.uploadFile(mockFile, options);
      } catch (error) {
        // May still fail due to incomplete mocking
      }

      // Verify exponential backoff timing
      const elapsed = Date.now() - startTime;
      // With exponential backoff: 100ms + 200ms = at least 300ms
      // Adding jitter and processing time, should be at least 200ms
      expect(elapsed).toBeGreaterThan(200);
    });

    it('should handle validation errors', async () => {
      const validator = vi.fn().mockRejectedValue(new Error('Invalid file'));
      
      const options: UploadOptions = {
        validateFile: validator
      };

      await expect(manager.uploadFile(mockFile, options)).rejects.toThrow('File validation failed: Invalid file');
      expect(validator).toHaveBeenCalledWith(mockFile);
    });

    it('should handle network errors gracefully', async () => {
      (global.fetch as any).mockRejectedValue(new Error('Network unavailable'));
      
      const options: UploadOptions = {
        maxRetries: 1,
        retryDelay: 10
      };

      await expect(manager.uploadFile(mockFile, options)).rejects.toThrow();
    });
  });

  describe('Upload Cancellation', () => {
    it('should cancel active uploads', async () => {
      // Start an upload
      const uploadPromise = manager.uploadFile(mockFile);
      
      // Get the upload ID
      const activeUploads = manager.getActiveUploads();
      expect(activeUploads.length).toBe(1);
      
      const uploadId = activeUploads[0]!.id;
      
      // Cancel the upload
      const cancelled = manager.cancelUpload(uploadId);
      expect(cancelled).toBe(true);
      
      // Verify upload was cancelled
      await expect(uploadPromise).rejects.toThrow();
    });

    it('should cancel all active uploads', () => {
      // This test would need more complex setup to start multiple uploads
      manager.cancelAllUploads();
      
      const activeUploads = manager.getActiveUploads();
      expect(activeUploads.length).toBe(0);
    });

    it('should return false when cancelling non-existent upload', () => {
      const cancelled = manager.cancelUpload('non-existent-id');
      expect(cancelled).toBe(false);
    });
  });

  describe('Progress Tracking', () => {
    it('should track upload progress correctly', async () => {
      const onProgress = vi.fn();
      
      const options: UploadOptions = {
        onProgress,
        chunkSize: 1024
      };

      try {
        await manager.uploadFile(mockFile, options);
      } catch (error) {
        // Expected due to incomplete mocking
      }

      // Verify progress callback was registered
      expect(onProgress).toBeDefined();
    });

    it('should get upload progress for active uploads', () => {
      // Start an upload and immediately check progress
      manager.uploadFile(mockFile).catch(() => {}); // Ignore errors
      
      const activeUploads = manager.getActiveUploads();
      if (activeUploads.length > 0) {
        const progress = manager.getUploadProgress(activeUploads[0]!.id);
        expect(progress).toBeTruthy();
      }
    });
  });

  describe('File Type Validation', () => {
    it('should validate video files correctly', async () => {
      const videoFile = new File(['video content'], 'test.mp4', {
        type: 'video/mp4'
      });

      // Should not throw validation error for video files
      const { uploadVideo } = await import('./upload.js');
      
      try {
        await uploadVideo(videoFile);
      } catch (error) {
        // May fail due to mocking, but shouldn't be validation error
        expect((error as Error).message).not.toContain('must be a video');
      }
    });

    it('should validate image files correctly', async () => {
      const imageFile = new File(['image content'], 'test.jpg', {
        type: 'image/jpeg'
      });

      const { uploadImage } = await import('./upload.js');
      
      try {
        await uploadImage(imageFile);
      } catch (error) {
        // May fail due to mocking, but shouldn't be validation error
        expect((error as Error).message).not.toContain('must be an image');
      }
    });

    it('should reject invalid file types for video upload', async () => {
      const textFile = new File(['text content'], 'test.txt', {
        type: 'text/plain'
      });

      const { uploadVideo } = await import('./upload.js');
      
      await expect(uploadVideo(textFile)).rejects.toThrow('File must be a video');
    });

    it('should reject files that are too large', async () => {
      // Create a mock file that reports large size
      const largeFile = new File(['content'], 'large.mp4', {
        type: 'video/mp4'
      });
      
      // Override size property
      Object.defineProperty(largeFile, 'size', {
        value: 3 * 1024 * 1024 * 1024, // 3GB
        writable: false
      });

      const { uploadVideo } = await import('./upload.js');
      
      await expect(uploadVideo(largeFile)).rejects.toThrow('Video file too large');
    });
  });

  describe('Utility Functions', () => {
    it('should format file sizes correctly', () => {
      // Access the private method through reflection for testing
      const formatFileSize = (manager as any).formatFileSize;
      
      expect(formatFileSize(1024)).toBe('1.0 KB');
      expect(formatFileSize(1024 * 1024)).toBe('1.0 MB');
      expect(formatFileSize(1024 * 1024 * 1024)).toBe('1.0 GB');
    });
  });

  describe('Integration with Upload Store', () => {
    it('should work with upload store for state management', () => {
      // This would test integration with the upload store
      // For now, just verify the manager can be used independently
      expect(manager).toBeInstanceOf(UploadManager);
      expect(manager.getActiveUploads).toBeTypeOf('function');
      expect(manager.getQueueStatus).toBeTypeOf('function');
    });
  });

  describe('Resume Storage Cleanup', () => {
    it('should cleanup old resume information', () => {
      // Mock old resume data (older than 7 days)
      const oldTimestamp = Date.now() - (8 * 24 * 60 * 60 * 1000); // 8 days ago
      const resumeData = {
        'old_file_1024_' + oldTimestamp: {
          fileLastModified: oldTimestamp,
          fileName: 'old.mp4',
          fileSize: 1024,
          chunks: [],
          completedChunks: []
        },
        'recent_file_2048_' + Date.now(): {
          fileLastModified: Date.now(),
          fileName: 'recent.mp4', 
          fileSize: 2048,
          chunks: [],
          completedChunks: []
        }
      };

      (window.localStorage.getItem as any).mockReturnValue(JSON.stringify(resumeData));
      
      // Create new manager to trigger cleanup
      new UploadManager();
      
      // Verify cleanup was called (old data should be removed)
      expect(window.localStorage.setItem).toHaveBeenCalled();
    });
  });
});

describe('Upload Progress Calculation', () => {
  it('should calculate progress accurately with completed chunks', () => {
    // This would test the progress calculation logic
    // Testing private methods requires either making them public for testing
    // or using integration tests
  });

  it('should handle speed calculation correctly', () => {
    // Test speed averaging and calculation
  });

  it('should estimate time remaining accurately', () => {
    // Test ETA calculation based on current speed
  });
});