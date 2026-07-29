/**
 * Unit tests for Editing Preview and Export System
 * 
 * Tests real-time preview system, export manager with quality options
 * and progress tracking, background processing integration, and
 * export history management.
 * 
 * Requirements: 6.6, 6.7
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  EditingPreviewSystem,
  ExportManager,
  BackgroundProcessingManager,
  ExportHistoryManager,
  generateExportId,
  estimateFileSize,
  formatFileSize,
  formatDuration,
  getQualityOption,
  estimateExportTime,
  QUALITY_OPTIONS,
  MAX_CONCURRENT_EXPORTS,
  MAX_EXPORT_HISTORY,
} from './editing-preview-export';
import type {
  ExportJob,
  ExportOptions,
  ExportProgress,
  EditOperation,
  PreviewCallbacks,
  ExportCallbacks,
  BackgroundProcessCallbacks,
} from './editing-preview-export';

// ─── Utility Function Tests ───────────────────────────────────────────────────

describe('generateExportId', () => {
  it('generates a string starting with "export-"', () => {
    const id = generateExportId();
    expect(id).toMatch(/^export-\d+-[a-z0-9]+$/);
  });

  it('generates unique IDs', () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateExportId()));
    expect(ids.size).toBe(100);
  });
});

describe('estimateFileSize', () => {
  it('calculates file size in bytes from bitrate and duration', () => {
    // 1000 kbps * 1000 = 1,000,000 bps; 10 seconds = 10,000,000 bits / 8 = 1,250,000 bytes
    expect(estimateFileSize(1000, 10)).toBe(1250000);
  });

  it('returns 0 for zero bitrate', () => {
    expect(estimateFileSize(0, 10)).toBe(0);
  });

  it('returns 0 for zero duration', () => {
    expect(estimateFileSize(3000, 0)).toBe(0);
  });

  it('returns 0 for negative values', () => {
    expect(estimateFileSize(-100, 10)).toBe(0);
    expect(estimateFileSize(100, -5)).toBe(0);
  });
});

describe('formatFileSize', () => {
  it('formats bytes correctly', () => {
    expect(formatFileSize(500)).toBe('500 B');
  });

  it('formats kilobytes correctly', () => {
    expect(formatFileSize(1024)).toBe('1.0 KB');
  });

  it('formats megabytes correctly', () => {
    expect(formatFileSize(1048576)).toBe('1.0 MB');
  });

  it('formats gigabytes correctly', () => {
    expect(formatFileSize(1073741824)).toBe('1.0 GB');
  });

  it('returns "0 B" for zero or negative', () => {
    expect(formatFileSize(0)).toBe('0 B');
    expect(formatFileSize(-100)).toBe('0 B');
  });

  it('formats fractional values', () => {
    expect(formatFileSize(1536)).toBe('1.5 KB');
  });
});

describe('formatDuration', () => {
  it('formats seconds', () => {
    expect(formatDuration(5000)).toBe('5s');
  });

  it('formats minutes and seconds', () => {
    expect(formatDuration(90000)).toBe('1m 30s');
  });

  it('formats exact minutes', () => {
    expect(formatDuration(120000)).toBe('2m');
  });

  it('formats hours and minutes', () => {
    expect(formatDuration(3900000)).toBe('1h 5m');
  });

  it('returns "0s" for zero or negative', () => {
    expect(formatDuration(0)).toBe('0s');
    expect(formatDuration(-100)).toBe('0s');
  });
});

describe('getQualityOption', () => {
  it('returns the correct option for low quality', () => {
    const opt = getQualityOption('low');
    expect(opt).toBeDefined();
    expect(opt!.resolution.width).toBe(854);
    expect(opt!.resolution.height).toBe(480);
  });

  it('returns the correct option for high quality', () => {
    const opt = getQualityOption('high');
    expect(opt).toBeDefined();
    expect(opt!.resolution.width).toBe(1920);
    expect(opt!.resolution.height).toBe(1080);
  });

  it('returns undefined for invalid quality', () => {
    expect(getQualityOption('ultra' as any)).toBeUndefined();
  });

  it('QUALITY_OPTIONS has 4 entries', () => {
    expect(QUALITY_OPTIONS).toHaveLength(4);
  });
});

describe('estimateExportTime', () => {
  it('returns higher estimate for higher quality', () => {
    const low = estimateExportTime(60, 'low');
    const high = estimateExportTime(60, 'high');
    expect(high).toBeGreaterThan(low);
  });

  it('scales with duration', () => {
    const short = estimateExportTime(30, 'medium');
    const long = estimateExportTime(60, 'medium');
    expect(long).toBe(short * 2);
  });

  it('returns 0 for zero duration', () => {
    expect(estimateExportTime(0, 'high')).toBe(0);
  });
});

// ─── EditingPreviewSystem Tests ───────────────────────────────────────────────

describe('EditingPreviewSystem', () => {
  let preview: EditingPreviewSystem;
  let callbacks: PreviewCallbacks;

  beforeEach(() => {
    callbacks = {
      onPreviewReady: vi.fn(),
      onPreviewUpdate: vi.fn(),
      onPreviewError: vi.fn(),
      onBufferingChange: vi.fn(),
    };
    preview = new EditingPreviewSystem('https://example.com/video.mp4', callbacks);
  });

  afterEach(() => {
    preview.destroy();
  });

  describe('initialization', () => {
    it('starts inactive', () => {
      expect(preview.isActive()).toBe(false);
    });

    it('has correct original URL', () => {
      expect(preview.getOriginalUrl()).toBe('https://example.com/video.mp4');
    });

    it('preview URL defaults to original', () => {
      expect(preview.getPreviewUrl()).toBe('https://example.com/video.mp4');
    });

    it('starts with no operations', () => {
      expect(preview.getOperationCount()).toBe(0);
    });
  });

  describe('activation', () => {
    it('activates with default mode', () => {
      preview.activate();
      expect(preview.isActive()).toBe(true);
      expect(preview.getState().mode).toBe('realtime');
    });

    it('activates with specified mode', () => {
      preview.activate('draft');
      expect(preview.getState().mode).toBe('draft');
    });

    it('deactivates without clearing edits', () => {
      preview.activate();
      preview.addEditOperation({
        type: 'trim',
        timestamp: Date.now(),
        data: { clipId: 'c1', mode: 'in', originalFrame: 0, newFrame: 10 },
      });
      preview.deactivate();
      expect(preview.isActive()).toBe(false);
      expect(preview.getOperationCount()).toBe(1);
    });

    it('calls onPreviewReady on activation', () => {
      preview.activate();
      expect(callbacks.onPreviewReady).toHaveBeenCalled();
    });
  });

  describe('edit operations', () => {
    it('adds an edit operation', () => {
      const op: EditOperation = {
        type: 'trim',
        timestamp: Date.now(),
        data: { clipId: 'c1', mode: 'in', originalFrame: 0, newFrame: 30 },
      };
      preview.addEditOperation(op);
      expect(preview.getOperationCount()).toBe(1);
    });

    it('removes last operation', () => {
      preview.addEditOperation({
        type: 'trim',
        timestamp: 1,
        data: { clipId: 'c1', mode: 'in', originalFrame: 0, newFrame: 10 },
      });
      preview.addEditOperation({
        type: 'split',
        timestamp: 2,
        data: { clipId: 'c1', splitFrame: 50, leftClipId: 'l', rightClipId: 'r' },
      });
      const removed = preview.removeLastOperation();
      expect(removed?.type).toBe('split');
      expect(preview.getOperationCount()).toBe(1);
    });

    it('returns undefined when removing from empty list', () => {
      expect(preview.removeLastOperation()).toBeUndefined();
    });

    it('clears all operations', () => {
      preview.addEditOperation({
        type: 'trim',
        timestamp: 1,
        data: { clipId: 'c1', mode: 'in', originalFrame: 0, newFrame: 10 },
      });
      preview.clearOperations();
      expect(preview.getOperationCount()).toBe(0);
    });
  });

  describe('time management', () => {
    it('sets current time', () => {
      preview.setDuration(100);
      preview.setCurrentTime(50);
      expect(preview.getState().currentTime).toBe(50);
      expect(callbacks.onPreviewUpdate).toHaveBeenCalledWith(50);
    });

    it('clamps current time to duration', () => {
      preview.setDuration(100);
      preview.setCurrentTime(200);
      expect(preview.getState().currentTime).toBe(100);
    });

    it('clamps current time to zero', () => {
      preview.setDuration(100);
      preview.setCurrentTime(-10);
      expect(preview.getState().currentTime).toBe(0);
    });

    it('sets duration', () => {
      preview.setDuration(300);
      expect(preview.getState().duration).toBe(300);
    });

    it('ignores negative duration', () => {
      preview.setDuration(100);
      preview.setDuration(-5);
      expect(preview.getState().duration).toBe(100);
    });
  });

  describe('buffering state', () => {
    it('toggles buffering and fires callback', () => {
      preview.setBuffering(true);
      expect(preview.getState().isBuffering).toBe(true);
      expect(callbacks.onBufferingChange).toHaveBeenCalledWith(true);
    });

    it('does not fire callback if state unchanged', () => {
      preview.setBuffering(false);
      (callbacks.onBufferingChange as ReturnType<typeof vi.fn>).mockClear();
      preview.setBuffering(false);
      expect(callbacks.onBufferingChange).not.toHaveBeenCalled();
    });
  });

  describe('effective duration', () => {
    it('returns full duration with no edits', () => {
      preview.setDuration(300);
      expect(preview.getEffectiveDuration()).toBe(300);
    });

    it('reduces duration with trim operations', () => {
      preview.setDuration(300);
      preview.addEditOperation({
        type: 'trim',
        timestamp: 1,
        data: { clipId: 'c1', mode: 'in', originalFrame: 0, newFrame: 30 },
      });
      expect(preview.getEffectiveDuration()).toBe(270);
    });

    it('does not go below zero', () => {
      preview.setDuration(10);
      preview.addEditOperation({
        type: 'trim',
        timestamp: 1,
        data: { clipId: 'c1', mode: 'in', originalFrame: 0, newFrame: 50 },
      });
      expect(preview.getEffectiveDuration()).toBe(0);
    });
  });

  describe('original video preservation', () => {
    it('original URL never changes after edit operations', () => {
      preview.activate();
      preview.addEditOperation({
        type: 'trim',
        timestamp: 1,
        data: { clipId: 'c1', mode: 'in', originalFrame: 0, newFrame: 30 },
      });
      expect(preview.getOriginalUrl()).toBe('https://example.com/video.mp4');
    });
  });

  describe('destroy', () => {
    it('deactivates and clears operations', () => {
      preview.activate();
      preview.addEditOperation({
        type: 'trim',
        timestamp: 1,
        data: { clipId: 'c1', mode: 'in', originalFrame: 0, newFrame: 10 },
      });
      preview.destroy();
      expect(preview.isActive()).toBe(false);
      expect(preview.getOperationCount()).toBe(0);
    });

    it('does not respond to operations after destroy', () => {
      preview.destroy();
      preview.addEditOperation({
        type: 'split',
        timestamp: 1,
        data: { clipId: 'c1', splitFrame: 50, leftClipId: 'l', rightClipId: 'r' },
      });
      expect(preview.getOperationCount()).toBe(0);
    });
  });
});

// ─── ExportManager Tests ──────────────────────────────────────────────────────

describe('ExportManager', () => {
  let manager: ExportManager;
  let callbacks: ExportCallbacks;

  const createExportOptions = (
    overrides: Partial<ExportOptions> = {}
  ): ExportOptions => ({
    videoId: 'video-1',
    quality: 'high',
    format: 'mp4',
    clips: [],
    editOperations: [],
    includeOverlays: true,
    includeCaptions: true,
    ...overrides,
  });

  beforeEach(() => {
    callbacks = {
      onExportStart: vi.fn(),
      onExportProgress: vi.fn(),
      onExportComplete: vi.fn(),
      onExportError: vi.fn(),
      onExportCancelled: vi.fn(),
    };
    manager = new ExportManager(callbacks);
  });

  afterEach(() => {
    manager.destroy();
  });

  describe('starting exports', () => {
    it('creates an export job with queued then processing status', () => {
      const job = manager.startExport(createExportOptions());
      expect(job.id).toMatch(/^export-/);
      expect(job.status).toBe('processing');
      expect(job.videoId).toBe('video-1');
      expect(job.quality).toBe('high');
    });

    it('fires onExportStart callback', () => {
      manager.startExport(createExportOptions());
      expect(callbacks.onExportStart).toHaveBeenCalled();
    });

    it('uses correct resolution for quality', () => {
      const job = manager.startExport(createExportOptions({ quality: 'low' }));
      expect(job.resolution).toEqual({ width: 854, height: 480 });
    });

    it('limits concurrent exports', () => {
      for (let i = 0; i < MAX_CONCURRENT_EXPORTS + 2; i++) {
        manager.startExport(createExportOptions({ videoId: `v-${i}` }));
      }
      expect(manager.getActiveCount()).toBe(MAX_CONCURRENT_EXPORTS);
      expect(manager.getQueuedCount()).toBeGreaterThan(0);
    });
  });

  describe('progress tracking', () => {
    it('updates job progress', () => {
      const job = manager.startExport(createExportOptions());
      const progress: ExportProgress = {
        exportId: job.id,
        status: 'encoding',
        percent: 50,
        currentStep: 'Encoding video',
        elapsedMs: 5000,
        estimatedRemainingMs: 5000,
        bytesProcessed: 5000000,
        totalBytes: 10000000,
      };
      manager.updateProgress(job.id, progress);
      const updated = manager.getJob(job.id);
      expect(updated?.progress).toBe(50);
      expect(updated?.status).toBe('encoding');
      expect(callbacks.onExportProgress).toHaveBeenCalledWith(progress);
    });

    it('clamps progress to 0-100', () => {
      const job = manager.startExport(createExportOptions());
      manager.updateProgress(job.id, {
        exportId: job.id,
        status: 'encoding',
        percent: 150,
        currentStep: 'Over',
        elapsedMs: 0,
        estimatedRemainingMs: 0,
        bytesProcessed: 0,
        totalBytes: 0,
      });
      expect(manager.getJob(job.id)?.progress).toBe(100);
    });

    it('completes job on completed status', () => {
      const job = manager.startExport(createExportOptions());
      manager.updateProgress(job.id, {
        exportId: job.id,
        status: 'completed',
        percent: 100,
        currentStep: 'Done',
        elapsedMs: 10000,
        estimatedRemainingMs: 0,
        bytesProcessed: 10000000,
        totalBytes: 10000000,
      });
      expect(manager.getJob(job.id)?.status).toBe('completed');
      expect(callbacks.onExportComplete).toHaveBeenCalled();
    });

    it('fails job on failed status', () => {
      const job = manager.startExport(createExportOptions());
      manager.updateProgress(job.id, {
        exportId: job.id,
        status: 'failed',
        percent: 30,
        currentStep: 'Encoding error',
        elapsedMs: 5000,
        estimatedRemainingMs: 0,
        bytesProcessed: 3000000,
        totalBytes: 10000000,
      });
      expect(manager.getJob(job.id)?.status).toBe('failed');
      expect(callbacks.onExportError).toHaveBeenCalled();
    });
  });

  describe('cancellation', () => {
    it('cancels an active export', () => {
      const job = manager.startExport(createExportOptions());
      const cancelled = manager.cancelExport(job.id);
      expect(cancelled).toBe(true);
      expect(callbacks.onExportCancelled).toHaveBeenCalled();
    });

    it('returns false for non-existent job', () => {
      expect(manager.cancelExport('non-existent')).toBe(false);
    });

    it('returns false for already completed jobs', () => {
      const job = manager.startExport(createExportOptions());
      manager.completeJob(job, 'https://download.com/file.mp4');
      expect(manager.cancelExport(job.id)).toBe(false);
    });
  });

  describe('job retrieval', () => {
    it('gets a job by ID', () => {
      const job = manager.startExport(createExportOptions());
      expect(manager.getJob(job.id)).toBeDefined();
      expect(manager.getJob(job.id)?.id).toBe(job.id);
    });

    it('returns undefined for unknown ID', () => {
      expect(manager.getJob('unknown')).toBeUndefined();
    });

    it('gets active jobs', () => {
      manager.startExport(createExportOptions({ videoId: 'v1' }));
      manager.startExport(createExportOptions({ videoId: 'v2' }));
      expect(manager.getActiveJobs()).toHaveLength(2);
    });
  });

  describe('export history', () => {
    it('adds completed jobs to history', () => {
      const job = manager.startExport(createExportOptions());
      manager.completeJob(job, 'https://download.com/file.mp4');
      expect(manager.getHistory()).toHaveLength(1);
      expect(manager.getHistory()[0].status).toBe('completed');
    });

    it('adds failed jobs to history', () => {
      const job = manager.startExport(createExportOptions());
      manager.failJob(job, new Error('Network error'));
      expect(manager.getHistory()).toHaveLength(1);
      expect(manager.getHistory()[0].status).toBe('failed');
    });

    it('clears history', () => {
      const job = manager.startExport(createExportOptions());
      manager.completeJob(job);
      manager.clearHistory();
      expect(manager.getHistory()).toHaveLength(0);
    });

    it('removes specific entry from history', () => {
      const job = manager.startExport(createExportOptions());
      manager.completeJob(job);
      const removed = manager.removeFromHistory(job.id);
      expect(removed).toBe(true);
      expect(manager.getHistory()).toHaveLength(0);
    });
  });

  describe('retry', () => {
    it('retries a failed export', () => {
      const job = manager.startExport(createExportOptions());
      manager.failJob(job, new Error('Timeout'));
      expect(manager.canRetry(job.id)).toBe(true);
      const retried = manager.retryExport(job.id);
      expect(retried).not.toBeNull();
      expect(retried?.status).toBe('processing');
    });

    it('cannot retry a completed export', () => {
      const job = manager.startExport(createExportOptions());
      manager.completeJob(job);
      expect(manager.canRetry(job.id)).toBe(false);
      expect(manager.retryExport(job.id)).toBeNull();
    });

    it('returns null for non-existent job', () => {
      expect(manager.retryExport('non-existent')).toBeNull();
    });
  });

  describe('completion', () => {
    it('sets download URL on completion', () => {
      const job = manager.startExport(createExportOptions());
      manager.completeJob(job, 'https://cdn.example.com/video.mp4');
      expect(manager.getJob(job.id)?.downloadUrl).toBe(
        'https://cdn.example.com/video.mp4'
      );
    });

    it('sets completedAt timestamp', () => {
      const job = manager.startExport(createExportOptions());
      manager.completeJob(job);
      expect(manager.getJob(job.id)?.completedAt).toBeDefined();
    });

    it('decrements active count', () => {
      manager.startExport(createExportOptions({ videoId: 'v1' }));
      const job2 = manager.startExport(createExportOptions({ videoId: 'v2' }));
      expect(manager.getActiveCount()).toBe(2);
      manager.completeJob(job2);
      expect(manager.getActiveCount()).toBe(1);
    });
  });

  describe('destroy', () => {
    it('cancels active jobs and clears queue', () => {
      manager.startExport(createExportOptions({ videoId: 'v1' }));
      manager.destroy();
      expect(manager.getActiveCount()).toBe(0);
      expect(manager.getQueuedCount()).toBe(0);
    });
  });
});
