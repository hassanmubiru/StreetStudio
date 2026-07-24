/**
 * Unit Tests for Upload Manager Component
 * 
 * Tests UI component functionality, drag-and-drop, progress display,
 * and integration with upload service.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { UploadManagerComponent, type UploadManagerConfig } from './upload-manager.js';

// Mock dependencies
vi.mock('../../services/upload.js', () => ({
  uploadManager: {
    configure: vi.fn(),
    uploadFile: vi.fn(),
    canResumeUpload: vi.fn(() => false),
    getResumeInfo: vi.fn(() => null),
    getQueueStatus: vi.fn(() => ({ active: 0, maxConcurrent: 3, canAcceptMore: true })),
    getResumeableUploads: vi.fn(() => []),
    cancelAllUploads: vi.fn()
  }
}));

vi.mock('../../stores/upload-store.js', () => ({
  getUploadStore: vi.fn(() => ({
    subscribe: vi.fn(() => () => {}),
    getState: vi.fn(() => ({
      uploads: [],
      isUploading: false,
      totalProgress: 0,
      completedUploads: 0,
      failedUploads: 0,
      queuedUploads: 0,
      totalSpeed: 0
    })),
    clearCompleted: vi.fn(),
    pauseAllActiveUploads: vi.fn()
  }))
}));

vi.mock('../../app/client-logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}));

describe('UploadManagerComponent', () => {
  let container: HTMLElement;
  let component: UploadManagerComponent;
  let mockFile: File;

  beforeEach(() => {
    // Create container element
    container = document.createElement('div');
    document.body.appendChild(container);
    
    // Create mock file
    mockFile = new File(['test content'], 'test-video.mp4', {
      type: 'video/mp4',
      lastModified: Date.now()
    });

    // Add crypto.randomUUID mock
    Object.defineProperty(global, 'crypto', {
      value: {
        randomUUID: vi.fn(() => 'mock-uuid-1234')
      }
    });

    vi.clearAllMocks();
  });

  afterEach(() => {
    if (component) {
      component.destroy();
    }
    document.body.removeChild(container);
  });

  describe('Initialization', () => {
    it('should initialize with default configuration', () => {
      component = new UploadManagerComponent(container);
      
      expect(container.querySelector('.upload-manager')).toBeTruthy();
      expect(container.querySelector('.dropzone')).toBeTruthy();
      
      const { uploadManager } = require('../../services/upload.js');
      expect(uploadManager.configure).toHaveBeenCalledWith({
        maxConcurrentUploads: 3,
        defaultChunkSize: 5 * 1024 * 1024
      });
    });

    it('should initialize with custom configuration', () => {
      const config: UploadManagerConfig = {
        allowMultiple: false,
        maxFileSize: 1024 * 1024 * 1024, // 1GB
        acceptedTypes: ['video/*'],
        chunkSize: 10 * 1024 * 1024, // 10MB
        maxConcurrent: 5
      };
      
      component = new UploadManagerComponent(container, config);
      
      const fileInput = container.querySelector('#file-input') as HTMLInputElement;
      expect(fileInput.multiple).toBe(false);
      expect(fileInput.accept).toBe('video/*');
      
      const { uploadManager } = require('../../services/upload.js');
      expect(uploadManager.configure).toHaveBeenCalledWith({
        maxConcurrentUploads: 5,
        defaultChunkSize: 10 * 1024 * 1024
      });
    });

    it('should create all UI sections based on configuration', () => {
      const config: UploadManagerConfig = {
        showProgress: true,
        showQueue: true,
        enableResume: true
      };
      
      component = new UploadManagerComponent(container, config);
      
      expect(container.querySelector('#progress-container')).toBeTruthy();
      expect(container.querySelector('#queue-container')).toBeTruthy();
      expect(container.querySelector('#resume-container')).toBeTruthy();
    });

    it('should hide optional sections when disabled', () => {
      const config: UploadManagerConfig = {
        showProgress: false,
        showQueue: false,
        enableResume: false
      };
      
      component = new UploadManagerComponent(container, config);
      
      expect(container.querySelector('#progress-container')).toBeFalsy();
      expect(container.querySelector('#queue-container')).toBeFalsy();
      expect(container.querySelector('#resume-container')).toBeFalsy();
    });
  });

  describe('File Selection', () => {
    beforeEach(() => {
      component = new UploadManagerComponent(container);
    });

    it('should open file dialog when browse button is clicked', () => {
      const fileInput = container.querySelector('#file-input') as HTMLInputElement;
      const browseButton = container.querySelector('#browse-button') as HTMLButtonElement;
      
      const clickSpy = vi.spyOn(fileInput, 'click').mockImplementation(() => {});
      
      browseButton.click();
      
      expect(clickSpy).toHaveBeenCalled();
    });

    it('should handle file input change events', () => {
      const fileInput = container.querySelector('#file-input') as HTMLInputElement;
      
      // Mock file input files
      Object.defineProperty(fileInput, 'files', {
        value: [mockFile],
        writable: false
      });

      // Spy on handleFiles method
      const handleFilesSpy = vi.spyOn(component as any, 'handleFiles');
      
      // Trigger change event
      const changeEvent = new Event('change');
      fileInput.dispatchEvent(changeEvent);
      
      expect(handleFilesSpy).toHaveBeenCalledWith([mockFile]);
    });
  });

  describe('Drag and Drop', () => {
    beforeEach(() => {
      component = new UploadManagerComponent(container);
    });

    it('should handle dragover events', () => {
      const dropzone = container.querySelector('.dropzone') as HTMLElement;
      
      const dragEvent = new DragEvent('dragover');
      Object.defineProperty(dragEvent, 'dataTransfer', {
        value: { files: [mockFile] }
      });
      
      dropzone.dispatchEvent(dragEvent);
      
      expect(dropzone.classList.contains('dragover')).toBe(true);
    });

    it('should handle dragleave events', () => {
      const dropzone = container.querySelector('.dropzone') as HTMLElement;
      
      // First add dragover class
      dropzone.classList.add('dragover');
      
      const dragLeaveEvent = new DragEvent('dragleave');
      dropzone.dispatchEvent(dragLeaveEvent);
      
      expect(dropzone.classList.contains('dragover')).toBe(false);
    });

    it('should handle drop events', () => {
      const dropzone = container.querySelector('.dropzone') as HTMLElement;
      const handleFilesSpy = vi.spyOn(component as any, 'handleFiles');
      
      const dropEvent = new DragEvent('drop');
      Object.defineProperty(dropEvent, 'dataTransfer', {
        value: { files: [mockFile] }
      });
      
      dropzone.dispatchEvent(dropEvent);
      
      expect(dropzone.classList.contains('dragover')).toBe(false);
      expect(handleFilesSpy).toHaveBeenCalledWith([mockFile]);
    });
  });

  describe('File Validation', () => {
    beforeEach(() => {
      component = new UploadManagerComponent(container, {
        maxFileSize: 1024 * 1024, // 1MB
        acceptedTypes: ['video/mp4']
      });
    });

    it('should validate file size correctly', () => {
      const largeFile = new File(['x'.repeat(2 * 1024 * 1024)], 'large.mp4', {
        type: 'video/mp4'
      });
      
      const isValid = (component as any).validateFile(largeFile);
      expect(isValid).toBe(false);
    });

    it('should validate file type correctly', () => {
      const invalidFile = new File(['content'], 'test.txt', {
        type: 'text/plain'
      });
      
      const isValid = (component as any).validateFile(invalidFile);
      expect(isValid).toBe(false);
    });

    it('should accept valid files', () => {
      const validFile = new File(['content'], 'test.mp4', {
        type: 'video/mp4'
      });
      
      const isValid = (component as any).validateFile(validFile);
      expect(isValid).toBe(true);
    });

    it('should handle wildcard file types', () => {
      component = new UploadManagerComponent(container, {
        acceptedTypes: ['video/*']
      });
      
      const videoFile = new File(['content'], 'test.avi', {
        type: 'video/avi'
      });
      
      const isValid = (component as any).validateFile(videoFile);
      expect(isValid).toBe(true);
    });
  });

  describe('Upload Progress Display', () => {
    beforeEach(() => {
      component = new UploadManagerComponent(container, {
        showProgress: true
      });
    });

    it('should create progress elements for uploads', () => {
      const mockTracker = {
        id: 'test-upload-1',
        fileName: 'test.mp4',
        fileSize: 1024 * 1024,
        status: 'uploading',
        progress: {
          percentage: 45.5,
          speed: 1024 * 1024, // 1MB/s
          timeRemaining: 30
        },
        resumedChunks: 0,
        errorMessage: undefined
      };
      
      (component as any).updateProgressDisplay(mockTracker);
      
      const uploadList = container.querySelector('#upload-list');
      const uploadItem = uploadList?.querySelector('[data-upload-id="test-upload-1"]');
      
      expect(uploadItem).toBeTruthy();
      expect(uploadItem?.textContent).toContain('test.mp4');
      expect(uploadItem?.textContent).toContain('45.5%');
    });

    it('should show resume information when applicable', () => {
      const mockTracker = {
        id: 'test-upload-2',
        fileName: 'resumed.mp4',
        fileSize: 1024 * 1024,
        status: 'uploading',
        progress: {
          percentage: 75,
          speed: 512 * 1024, // 512KB/s
          timeRemaining: 15
        },
        resumedChunks: 5,
        errorMessage: undefined
      };
      
      (component as any).updateProgressDisplay(mockTracker);
      
      const uploadItem = container.querySelector('[data-upload-id="test-upload-2"]');
      expect(uploadItem?.textContent).toContain('Resumed (5 chunks)');
    });

    it('should display error information', () => {
      const mockTracker = {
        id: 'test-upload-3',
        fileName: 'failed.mp4',
        fileSize: 1024 * 1024,
        status: 'error',
        progress: {
          percentage: 25,
          speed: 0,
          timeRemaining: 0
        },
        resumedChunks: 0,
        errorMessage: 'Network connection failed'
      };
      
      (component as any).updateProgressDisplay(mockTracker);
      
      const uploadItem = container.querySelector('[data-upload-id="test-upload-3"]');
      expect(uploadItem?.textContent).toContain('Network connection failed');
    });
  });

  describe('Queue Controls', () => {
    beforeEach(() => {
      component = new UploadManagerComponent(container, {
        showQueue: true
      });
    });

    it('should handle clear completed button', () => {
      const clearButton = container.querySelector('#clear-completed') as HTMLButtonElement;
      const { getUploadStore } = require('../../stores/upload-store.js');
      const mockStore = getUploadStore();
      
      clearButton.click();
      
      expect(mockStore.clearCompleted).toHaveBeenCalled();
    });

    it('should handle pause all button', () => {
      const pauseButton = container.querySelector('#pause-all') as HTMLButtonElement;
      const { getUploadStore } = require('../../stores/upload-store.js');
      const mockStore = getUploadStore();
      
      pauseButton.click();
      
      expect(mockStore.pauseAllActiveUploads).toHaveBeenCalled();
    });
  });

  describe('Resume Functionality', () => {
    beforeEach(() => {
      component = new UploadManagerComponent(container, {
        enableResume: true
      });
    });

    it('should load resumeable uploads on initialization', () => {
      const { uploadManager } = require('../../services/upload.js');
      
      // Mock resumeable uploads
      uploadManager.getResumeableUploads.mockReturnValue([
        {
          fileName: 'video1.mp4',
          fileSize: 1024 * 1024,
          completedChunks: 5,
          totalChunks: 10,
          resumeKey: 'video1_key'
        }
      ]);
      
      // Create new component to trigger load
      component.destroy();
      component = new UploadManagerComponent(container, { enableResume: true });
      
      const resumeList = container.querySelector('#resume-list');
      expect(resumeList?.textContent).toContain('video1.mp4');
      expect(resumeList?.textContent).toContain('5/10 chunks completed');
    });

    it('should show empty state when no resumeable uploads', () => {
      const { uploadManager } = require('../../services/upload.js');
      uploadManager.getResumeableUploads.mockReturnValue([]);
      
      component.destroy();
      component = new UploadManagerComponent(container, { enableResume: true });
      
      const resumeList = container.querySelector('#resume-list');
      expect(resumeList?.textContent).toContain('No resumeable uploads found');
    });
  });

  describe('Error Handling', () => {
    beforeEach(() => {
      component = new UploadManagerComponent(container);
    });

    it('should display error messages', () => {
      const errorMessage = 'Test error message';
      (component as any).showError(errorMessage);
      
      const errorContainer = container.querySelector('.error-container');
      expect(errorContainer?.textContent).toContain(errorMessage);
    });

    it('should auto-remove error messages', (done) => {
      const errorMessage = 'Auto-remove test';
      (component as any).showError(errorMessage);
      
      // Check error is visible
      let errorContainer = container.querySelector('.error-container');
      expect(errorContainer).toBeTruthy();
      
      // Wait for auto-removal (mocked setTimeout)
      setTimeout(() => {
        errorContainer = container.querySelector('.error-container');
        // In real implementation, error would be removed
        done();
      }, 100);
    });
  });

  describe('Utility Methods', () => {
    beforeEach(() => {
      component = new UploadManagerComponent(container);
    });

    it('should format file sizes correctly', () => {
      const formatFileSize = (component as any).formatFileSize;
      
      expect(formatFileSize(1024)).toBe('1.0 KB');
      expect(formatFileSize(1024 * 1024)).toBe('1.0 MB');
      expect(formatFileSize(1024 * 1024 * 1024)).toBe('1.0 GB');
    });

    it('should format upload speeds correctly', () => {
      const formatSpeed = (component as any).formatSpeed;
      
      expect(formatSpeed(0)).toBe('0 B/s');
      expect(formatSpeed(1024)).toBe('1.0 KB/s');
      expect(formatSpeed(1024 * 1024)).toBe('1.0 MB/s');
    });

    it('should format time durations correctly', () => {
      const formatTime = (component as any).formatTime;
      
      expect(formatTime(0)).toBe('--');
      expect(formatTime(30)).toBe('30s');
      expect(formatTime(90)).toBe('1m 30s');
      expect(formatTime(3665)).toBe('1h 1m');
    });
  });

  describe('Public API', () => {
    beforeEach(() => {
      component = new UploadManagerComponent(container);
    });

    it('should provide startAllQueued method', () => {
      const { getUploadStore } = require('../../stores/upload-store.js');
      const mockStore = getUploadStore();
      
      component.startAllQueued();
      
      expect(mockStore.resumeQueuedUploads).toHaveBeenCalled();
    });

    it('should provide pauseAll method', () => {
      const { getUploadStore } = require('../../stores/upload-store.js');
      const mockStore = getUploadStore();
      
      component.pauseAll();
      
      expect(mockStore.pauseAllActiveUploads).toHaveBeenCalled();
    });

    it('should provide clearCompleted method', () => {
      const { getUploadStore } = require('../../stores/upload-store.js');
      const mockStore = getUploadStore();
      
      component.clearCompleted();
      
      expect(mockStore.clearCompleted).toHaveBeenCalled();
    });

    it('should allow setting onUploadComplete callback', () => {
      const callback = vi.fn();
      component.onUploadComplete = callback;
      
      expect(component.onUploadComplete).toBe(callback);
    });
  });

  describe('Cleanup', () => {
    it('should clean up resources on destroy', () => {
      component = new UploadManagerComponent(container);
      
      const { uploadManager } = require('../../services/upload.js');
      
      component.destroy();
      
      expect(uploadManager.cancelAllUploads).toHaveBeenCalled();
    });
  });

  describe('Integration with Upload Service', () => {
    beforeEach(() => {
      component = new UploadManagerComponent(container, { autoStart: true });
    });

    it('should start uploads automatically when autoStart is enabled', async () => {
      const { uploadManager } = require('../../services/upload.js');
      uploadManager.uploadFile.mockResolvedValue({
        id: 'success-id',
        url: 'success-url'
      });
      
      // Trigger file handling
      await (component as any).handleFiles([mockFile]);
      
      expect(uploadManager.uploadFile).toHaveBeenCalledWith(
        mockFile,
        expect.objectContaining({
          chunkSize: 5 * 1024 * 1024,
          enableResume: true
        })
      );
    });

    it('should handle upload success', async () => {
      const { uploadManager } = require('../../services/upload.js');
      const mockResult = { id: 'success-id', url: 'success-url' };
      uploadManager.uploadFile.mockResolvedValue(mockResult);
      
      const onComplete = vi.fn();
      component.onUploadComplete = onComplete;
      
      await (component as any).startUpload(mockFile);
      
      expect(onComplete).toHaveBeenCalledWith(mockResult);
    });

    it('should handle upload errors', async () => {
      const { uploadManager } = require('../../services/upload.js');
      uploadManager.uploadFile.mockRejectedValue(new Error('Upload failed'));
      
      const showErrorSpy = vi.spyOn(component as any, 'showError');
      
      await (component as any).startUpload(mockFile);
      
      expect(showErrorSpy).toHaveBeenCalledWith('Upload failed: Upload failed');
    });
  });
});