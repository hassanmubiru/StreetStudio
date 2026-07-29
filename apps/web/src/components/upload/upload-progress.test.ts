/**
 * Unit Tests for Upload Progress Interface
 * 
 * Tests upload progress visualization, background notifications,
 * upload speed calculation, ETA display, and error handling.
 * 
 * Requirements: 3.7, 3.8, 3.9
 */

// @vitest-environment jsdom

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { UploadProgressInterface, type UploadProgressConfig, type SpeedMetrics, type UploadErrorInfo } from './upload-progress.js';
import type { UploadState, UploadItem } from '../../stores/upload-store.js';

// Mock dependencies
const mockSubscribe = vi.fn((cb: (state: UploadState) => void) => {
  mockSubscribeCallback = cb;
  return () => {};
});

let mockSubscribeCallback: ((state: UploadState) => void) | null = null;

const mockUploadStore = {
  subscribe: mockSubscribe,
  getState: vi.fn(() => createMockState()),
  pauseAllActiveUploads: vi.fn(),
  resumeQueuedUploads: vi.fn(),
  clearCompleted: vi.fn(),
  retryUpload: vi.fn(),
  pauseUpload: vi.fn(),
  resumeUpload: vi.fn(),
  cancelUpload: vi.fn(),
  removeUpload: vi.fn(),
};

vi.mock('../../stores/upload-store.js', () => ({
  getUploadStore: vi.fn(() => mockUploadStore),
}));

vi.mock('../../app/client-logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('./upload-notification.js', () => ({
  UploadNotificationService: vi.fn().mockImplementation(() => ({
    notifyUploadComplete: vi.fn(),
    notifyUploadFailed: vi.fn(),
    notifyBatchComplete: vi.fn(),
    destroy: vi.fn(),
  })),
}));

function createMockFile(name: string, size: number, type = 'video/mp4'): File {
  const content = new Uint8Array(Math.min(size, 100));
  return new File([content], name, { type, lastModified: Date.now() });
}

function createMockUploadItem(overrides: Partial<UploadItem> = {}): UploadItem {
  return {
    id: `upload-${Math.random().toString(36).substr(2, 9)}`,
    file: createMockFile('test-video.mp4', 10 * 1024 * 1024),
    progress: 0,
    speed: 0,
    status: 'queued',
    retryCount: 0,
    ...overrides,
  };
}

function createMockState(overrides: Partial<UploadState> = {}): UploadState {
  return {
    uploads: [],
    isUploading: false,
    totalProgress: 0,
    completedUploads: 0,
    failedUploads: 0,
    queuedUploads: 0,
    totalSpeed: 0,
    ...overrides,
  };
}

describe('UploadProgressInterface', () => {
  let container: HTMLElement;
  let instance: UploadProgressInterface;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    vi.clearAllMocks();
    mockSubscribeCallback = null;
  });

  afterEach(() => {
    if (instance) {
      instance.destroy();
    }
    document.body.removeChild(container);
  });

  describe('Initialization', () => {
    it('should create the upload progress panel in the container', () => {
      instance = new UploadProgressInterface(container);

      const panel = container.querySelector('.upload-progress-panel');
      expect(panel).toBeTruthy();
    });

    it('should set up with default configuration', () => {
      instance = new UploadProgressInterface(container);

      const panel = container.querySelector('.upload-progress-panel') as HTMLElement;
      expect(panel.classList.contains('bottom-right')).toBe(true);
    });

    it('should accept custom configuration', () => {
      const config: Partial<UploadProgressConfig> = {
        position: 'top-left',
        showIndividualProgress: false,
        showBatchProgress: true,
        showSpeed: true,
        showETA: true,
      };

      instance = new UploadProgressInterface(container, config);

      const panel = container.querySelector('.upload-progress-panel') as HTMLElement;
      expect(panel.classList.contains('top-left')).toBe(true);
    });

    it('should hide the panel initially', () => {
      instance = new UploadProgressInterface(container);

      const panel = container.querySelector('.upload-progress-panel') as HTMLElement;
      expect(panel.style.display).toBe('none');
    });

    it('should subscribe to the upload store', () => {
      instance = new UploadProgressInterface(container);
      expect(mockSubscribe).toHaveBeenCalled();
    });

    it('should render batch progress section when enabled', () => {
      instance = new UploadProgressInterface(container, { showBatchProgress: true });

      const batchSection = container.querySelector('.batch-progress-section');
      expect(batchSection).toBeTruthy();
    });

    it('should render upload items list', () => {
      instance = new UploadProgressInterface(container);

      const itemsList = container.querySelector('.upload-items-list');
      expect(itemsList).toBeTruthy();
    });

    it('should set proper ARIA attributes', () => {
      instance = new UploadProgressInterface(container);

      const panel = container.querySelector('.upload-progress-panel');
      expect(panel?.getAttribute('role')).toBe('region');
      expect(panel?.getAttribute('aria-label')).toBe('Upload progress');
    });
  });

  describe('Individual File Progress', () => {
    it('should display individual upload items', () => {
      instance = new UploadProgressInterface(container, { showIndividualProgress: true });

      const uploadingItem = createMockUploadItem({
        status: 'uploading',
        progress: 45,
        speed: 1024 * 1024,
      });

      const state = createMockState({
        uploads: [uploadingItem],
        isUploading: true,
      });

      // Trigger state update
      mockSubscribeCallback?.(state);

      const items = container.querySelectorAll('.upload-item');
      expect(items.length).toBe(1);
    });

    it('should show file name and progress percentage', () => {
      instance = new UploadProgressInterface(container, { showIndividualProgress: true });

      const uploadingItem = createMockUploadItem({
        id: 'item-1',
        file: createMockFile('my-video.mp4', 50 * 1024 * 1024),
        status: 'uploading',
        progress: 67,
        speed: 2 * 1024 * 1024,
      });

      const state = createMockState({
        uploads: [uploadingItem],
        isUploading: true,
      });

      mockSubscribeCallback?.(state);

      const item = container.querySelector('.upload-item');
      expect(item?.textContent).toContain('my-video.mp4');
      expect(item?.textContent).toContain('67%');
    });

    it('should show completed status', () => {
      instance = new UploadProgressInterface(container, { showIndividualProgress: true });

      const completedItem = createMockUploadItem({
        status: 'completed',
        progress: 100,
      });

      const state = createMockState({
        uploads: [completedItem],
        completedUploads: 1,
      });

      mockSubscribeCallback?.(state);

      const item = container.querySelector('.upload-item');
      expect(item?.textContent).toContain('Done');
    });

    it('should show failed status', () => {
      instance = new UploadProgressInterface(container, { showIndividualProgress: true });

      const failedItem = createMockUploadItem({
        status: 'failed',
        progress: 30,
        error: 'Network error',
      });

      const state = createMockState({
        uploads: [failedItem],
        failedUploads: 1,
      });

      mockSubscribeCallback?.(state);

      const item = container.querySelector('.upload-item');
      expect(item?.textContent).toContain('Failed');
    });

    it('should show paused status', () => {
      instance = new UploadProgressInterface(container, { showIndividualProgress: true });

      const pausedItem = createMockUploadItem({
        status: 'paused',
        progress: 50,
      });

      const state = createMockState({ uploads: [pausedItem] });

      mockSubscribeCallback?.(state);

      const item = container.querySelector('.upload-item');
      expect(item?.textContent).toContain('Paused');
    });

    it('should limit visible items based on maxVisibleItems config', () => {
      instance = new UploadProgressInterface(container, {
        showIndividualProgress: true,
        maxVisibleItems: 2,
      });

      const items = [
        createMockUploadItem({ status: 'uploading', progress: 20 }),
        createMockUploadItem({ status: 'uploading', progress: 40 }),
        createMockUploadItem({ status: 'queued', progress: 0 }),
      ];

      const state = createMockState({ uploads: items, isUploading: true });

      mockSubscribeCallback?.(state);

      const visibleItems = container.querySelectorAll('.upload-item');
      expect(visibleItems.length).toBe(2);

      const overflow = container.querySelector('.upload-item-overflow');
      expect(overflow?.textContent).toContain('+1 more');
    });

    it('should show appropriate action buttons for uploading items', () => {
      instance = new UploadProgressInterface(container, { showIndividualProgress: true });

      const uploadingItem = createMockUploadItem({
        status: 'uploading',
        progress: 30,
      });

      const state = createMockState({ uploads: [uploadingItem], isUploading: true });
      mockSubscribeCallback?.(state);

      const actions = container.querySelector('.upload-item-actions');
      expect(actions?.querySelector('[data-action="pause"]')).toBeTruthy();
      expect(actions?.querySelector('[data-action="cancel"]')).toBeTruthy();
    });

    it('should show retry button for failed items', () => {
      instance = new UploadProgressInterface(container, { showIndividualProgress: true });

      const failedItem = createMockUploadItem({
        status: 'failed',
        progress: 20,
        error: 'Server error',
      });

      const state = createMockState({ uploads: [failedItem], failedUploads: 1 });
      mockSubscribeCallback?.(state);

      const actions = container.querySelector('.upload-item-actions');
      expect(actions?.querySelector('[data-action="retry"]')).toBeTruthy();
    });
  });

  describe('Batch Progress', () => {
    it('should display overall batch progress', () => {
      instance = new UploadProgressInterface(container, { showBatchProgress: true });

      const state = createMockState({
        uploads: [
          createMockUploadItem({ status: 'uploading', progress: 60 }),
          createMockUploadItem({ status: 'uploading', progress: 40 }),
        ],
        isUploading: true,
        totalProgress: 50,
      });

      mockSubscribeCallback?.(state);

      const percentage = container.querySelector('.batch-percentage');
      expect(percentage?.textContent).toBe('50%');
    });

    it('should update the progress bar fill width', () => {
      instance = new UploadProgressInterface(container, { showBatchProgress: true });

      const state = createMockState({
        uploads: [createMockUploadItem({ status: 'uploading', progress: 75 })],
        isUploading: true,
        totalProgress: 75,
      });

      mockSubscribeCallback?.(state);

      const fill = container.querySelector('.batch-progress-fill') as HTMLElement;
      expect(fill.style.width).toBe('75%');
      expect(fill.getAttribute('aria-valuenow')).toBe('75');
    });
  });

  describe('Upload Speed Calculation', () => {
    it('should calculate speed metrics correctly', () => {
      instance = new UploadProgressInterface(container);

      const state = createMockState({
        uploads: [
          createMockUploadItem({
            file: createMockFile('video1.mp4', 100 * 1024 * 1024),
            status: 'uploading',
            progress: 50,
            speed: 2 * 1024 * 1024,
          }),
          createMockUploadItem({
            file: createMockFile('video2.mp4', 50 * 1024 * 1024),
            status: 'uploading',
            progress: 25,
            speed: 1 * 1024 * 1024,
          }),
        ],
        isUploading: true,
        totalSpeed: 3 * 1024 * 1024,
      });

      const metrics = instance.calculateSpeedMetrics(state);

      expect(metrics.currentSpeed).toBe(3 * 1024 * 1024);
      expect(metrics.totalBytes).toBeGreaterThan(0);
      expect(metrics.totalBytesUploaded).toBeGreaterThan(0);
      expect(metrics.totalBytesUploaded).toBeLessThan(metrics.totalBytes);
    });

    it('should calculate estimated time remaining', () => {
      instance = new UploadProgressInterface(container);

      const fileSize = 100 * 1024 * 1024; // 100MB
      const state = createMockState({
        uploads: [
          createMockUploadItem({
            file: createMockFile('big-video.mp4', fileSize),
            status: 'uploading',
            progress: 50,
            speed: 10 * 1024 * 1024, // 10MB/s
          }),
        ],
        isUploading: true,
        totalSpeed: 10 * 1024 * 1024,
      });

      const metrics = instance.calculateSpeedMetrics(state);

      // With 50MB remaining at 10MB/s, ETA should be around 5s
      expect(metrics.estimatedTimeRemaining).toBeGreaterThan(0);
    });

    it('should return zero ETA when speed is zero', () => {
      instance = new UploadProgressInterface(container);

      const state = createMockState({
        uploads: [
          createMockUploadItem({
            file: createMockFile('video.mp4', 100 * 1024 * 1024),
            status: 'queued',
            progress: 0,
            speed: 0,
          }),
        ],
      });

      const metrics = instance.calculateSpeedMetrics(state);
      expect(metrics.estimatedTimeRemaining).toBe(0);
    });

    it('should smooth speed measurements over time', () => {
      instance = new UploadProgressInterface(container);

      // First call with high speed
      const state1 = createMockState({
        uploads: [
          createMockUploadItem({
            file: createMockFile('v.mp4', 100 * 1024 * 1024),
            status: 'uploading',
            progress: 25,
            speed: 5 * 1024 * 1024,
          }),
        ],
        isUploading: true,
        totalSpeed: 5 * 1024 * 1024,
      });

      instance.calculateSpeedMetrics(state1);

      // Second call with lower speed
      const state2 = createMockState({
        uploads: [
          createMockUploadItem({
            file: createMockFile('v.mp4', 100 * 1024 * 1024),
            status: 'uploading',
            progress: 30,
            speed: 1 * 1024 * 1024,
          }),
        ],
        isUploading: true,
        totalSpeed: 1 * 1024 * 1024,
      });

      const metrics = instance.calculateSpeedMetrics(state2);

      // Average speed should be between the two values (smoothed)
      expect(metrics.averageSpeed).toBeGreaterThan(1 * 1024 * 1024);
      expect(metrics.averageSpeed).toBeLessThan(5 * 1024 * 1024);
    });
  });

  describe('Formatting Utilities', () => {
    beforeEach(() => {
      instance = new UploadProgressInterface(container);
    });

    it('should format upload speed correctly', () => {
      expect(instance.formatSpeed(0)).toBe('-- /s');
      expect(instance.formatSpeed(512)).toBe('512.0 B/s');
      expect(instance.formatSpeed(1024)).toBe('1.0 KB/s');
      expect(instance.formatSpeed(1024 * 1024)).toBe('1.0 MB/s');
      expect(instance.formatSpeed(1.5 * 1024 * 1024 * 1024)).toBe('1.5 GB/s');
    });

    it('should format time remaining correctly', () => {
      expect(instance.formatTimeRemaining(0)).toBe('--');
      expect(instance.formatTimeRemaining(-1)).toBe('--');
      expect(instance.formatTimeRemaining(Infinity)).toBe('--');
      expect(instance.formatTimeRemaining(30)).toBe('30s remaining');
      expect(instance.formatTimeRemaining(90)).toBe('1m 30s remaining');
      expect(instance.formatTimeRemaining(3661)).toBe('1h 1m remaining');
    });

    it('should format file sizes correctly', () => {
      expect(instance.formatFileSize(0)).toBe('0 B');
      expect(instance.formatFileSize(1024)).toBe('1.0 KB');
      expect(instance.formatFileSize(1024 * 1024)).toBe('1.0 MB');
      expect(instance.formatFileSize(2.5 * 1024 * 1024 * 1024)).toBe('2.5 GB');
    });
  });

  describe('Upload Error Handling', () => {
    beforeEach(() => {
      instance = new UploadProgressInterface(container);
    });

    it('should parse network errors correctly', () => {
      const upload = createMockUploadItem({
        status: 'failed',
        error: 'Network connection lost',
      });

      const errorInfo = instance.parseUploadError(upload);

      expect(errorInfo.errorType).toBe('network');
      expect(errorInfo.retryable).toBe(true);
      expect(errorInfo.suggestion).toContain('internet connection');
    });

    it('should parse server errors correctly', () => {
      const upload = createMockUploadItem({
        status: 'failed',
        error: 'Internal server error 500',
      });

      const errorInfo = instance.parseUploadError(upload);

      expect(errorInfo.errorType).toBe('server');
      expect(errorInfo.retryable).toBe(true);
      expect(errorInfo.suggestion).toContain('server is temporarily unavailable');
    });

    it('should parse validation errors as non-retryable', () => {
      const upload = createMockUploadItem({
        status: 'failed',
        error: 'File too large for upload',
      });

      const errorInfo = instance.parseUploadError(upload);

      expect(errorInfo.errorType).toBe('validation');
      expect(errorInfo.retryable).toBe(false);
      expect(errorInfo.suggestion).toContain('upload requirements');
    });

    it('should parse quota errors as non-retryable', () => {
      const upload = createMockUploadItem({
        status: 'failed',
        error: 'Storage quota exceeded',
      });

      const errorInfo = instance.parseUploadError(upload);

      expect(errorInfo.errorType).toBe('quota');
      expect(errorInfo.retryable).toBe(false);
      expect(errorInfo.suggestion).toContain('Storage quota');
    });

    it('should handle unknown errors gracefully', () => {
      const upload = createMockUploadItem({
        status: 'failed',
        error: 'Something unexpected happened',
      });

      const errorInfo = instance.parseUploadError(upload);

      expect(errorInfo.errorType).toBe('unknown');
      expect(errorInfo.retryable).toBe(true);
      expect(errorInfo.suggestion).toBe('Please try again later.');
    });

    it('should handle uploads with no error message', () => {
      const upload = createMockUploadItem({
        status: 'failed',
        error: undefined,
      });

      const errorInfo = instance.parseUploadError(upload);

      expect(errorInfo.message).toBe('An unknown error occurred');
      expect(errorInfo.errorType).toBe('unknown');
    });

    it('should display error section when uploads fail', () => {
      instance = new UploadProgressInterface(container);

      const failedItem = createMockUploadItem({
        status: 'failed',
        error: 'Network connection failed',
      });

      const state = createMockState({
        uploads: [failedItem],
        failedUploads: 1,
      });

      mockSubscribeCallback?.(state);

      const errorSection = container.querySelector('.upload-errors-section') as HTMLElement;
      expect(errorSection.style.display).toBe('block');
      expect(errorSection.textContent).toContain('Network connection failed');
    });

    it('should show retry button for retryable errors', () => {
      instance = new UploadProgressInterface(container);

      const failedItem = createMockUploadItem({
        status: 'failed',
        error: 'Network timeout',
      });

      const state = createMockState({
        uploads: [failedItem],
        failedUploads: 1,
      });

      mockSubscribeCallback?.(state);

      const retryBtn = container.querySelector('.btn-error-retry');
      expect(retryBtn).toBeTruthy();
    });

    it('should hide error section when no failed uploads', () => {
      instance = new UploadProgressInterface(container);

      const state = createMockState({ uploads: [], failedUploads: 0 });
      mockSubscribeCallback?.(state);

      const errorSection = container.querySelector('.upload-errors-section') as HTMLElement;
      expect(errorSection.style.display).toBe('none');
    });
  });

  describe('Background Upload and Notifications', () => {
    it('should show the panel when uploads start', () => {
      instance = new UploadProgressInterface(container, { enableBackgroundUpload: true });

      const state = createMockState({
        uploads: [createMockUploadItem({ status: 'uploading', progress: 10 })],
        isUploading: true,
      });

      mockSubscribeCallback?.(state);

      expect(instance.getIsVisible()).toBe(true);
    });

    it('should auto-minimize when all uploads complete', () => {
      vi.useFakeTimers();

      instance = new UploadProgressInterface(container, { autoMinimizeOnComplete: true });

      // Start with active uploads
      const activeState = createMockState({
        uploads: [createMockUploadItem({ status: 'uploading', progress: 90 })],
        isUploading: true,
      });
      mockSubscribeCallback?.(activeState);

      // All complete
      const completedState = createMockState({
        uploads: [createMockUploadItem({ status: 'completed', progress: 100 })],
        isUploading: false,
        completedUploads: 1,
      });
      mockSubscribeCallback?.(completedState);

      vi.advanceTimersByTime(2500);
      expect(instance.getIsMinimized()).toBe(true);

      vi.useRealTimers();
    });
  });

  describe('Panel Visibility Controls', () => {
    it('should show the panel', () => {
      instance = new UploadProgressInterface(container);
      instance.show();
      expect(instance.getIsVisible()).toBe(true);
    });

    it('should hide the panel', () => {
      instance = new UploadProgressInterface(container);
      instance.show();
      instance.hide();
      expect(instance.getIsVisible()).toBe(false);
    });

    it('should minimize the panel', () => {
      instance = new UploadProgressInterface(container);
      instance.show();
      instance.minimize();
      expect(instance.getIsMinimized()).toBe(true);
    });

    it('should expand the panel', () => {
      instance = new UploadProgressInterface(container);
      instance.show();
      instance.minimize();
      instance.expand();
      expect(instance.getIsMinimized()).toBe(false);
    });

    it('should toggle minimize state', () => {
      instance = new UploadProgressInterface(container);
      instance.show();
      instance.toggleMinimize();
      expect(instance.getIsMinimized()).toBe(true);
      instance.toggleMinimize();
      expect(instance.getIsMinimized()).toBe(false);
    });
  });

  describe('Upload Count Display', () => {
    it('should show active upload count', () => {
      instance = new UploadProgressInterface(container);

      const state = createMockState({
        uploads: [
          createMockUploadItem({ status: 'uploading', progress: 30 }),
          createMockUploadItem({ status: 'uploading', progress: 60 }),
        ],
        isUploading: true,
        queuedUploads: 0,
      });

      mockSubscribeCallback?.(state);

      const countEl = container.querySelector('.upload-count');
      expect(countEl?.textContent).toContain('2 uploading');
    });

    it('should show queued count alongside active', () => {
      instance = new UploadProgressInterface(container);

      const state = createMockState({
        uploads: [
          createMockUploadItem({ status: 'uploading', progress: 30 }),
          createMockUploadItem({ status: 'queued', progress: 0 }),
          createMockUploadItem({ status: 'queued', progress: 0 }),
        ],
        isUploading: true,
        queuedUploads: 2,
      });

      mockSubscribeCallback?.(state);

      const countEl = container.querySelector('.upload-count');
      expect(countEl?.textContent).toContain('1 uploading');
      expect(countEl?.textContent).toContain('2 queued');
    });
  });

  describe('Cleanup', () => {
    it('should unsubscribe from store on destroy', () => {
      const unsubscribeFn = vi.fn();
      mockSubscribe.mockReturnValue(unsubscribeFn);

      instance = new UploadProgressInterface(container);
      instance.destroy();

      expect(unsubscribeFn).toHaveBeenCalled();
    });

    it('should remove the panel element on destroy', () => {
      instance = new UploadProgressInterface(container);

      expect(container.querySelector('.upload-progress-panel')).toBeTruthy();

      instance.destroy();

      expect(container.querySelector('.upload-progress-panel')).toBeFalsy();
    });
  });
});
