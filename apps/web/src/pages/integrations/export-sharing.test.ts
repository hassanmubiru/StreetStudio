/**
 * Export and Sharing Functionality Tests
 *
 * Tests for video export interface, batch export, embed code generation,
 * and sharing controls with permission management.
 *
 * Validates: Requirements 15.3, 15.5
 */

// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  ExportSharingPage,
  formatEta,
  calculateBatchProgress,
  getCompletedCount,
  getFailedCount,
  generateIframeEmbed,
  generateScriptEmbed,
  validateExpirationDate,
  validateSharePassword,
  getPermissionLabel,
  formatExpiration,
  FORMAT_OPTIONS,
  QUALITY_OPTIONS,
  RESOLUTION_OPTIONS,
  DEFAULT_EMBED_OPTIONS,
  DEFAULT_BASE_EMBED_URL,
  type ExportJob,
  type ShareLink,
  type VideoForExport,
  type ExportSharingCallbacks,
  type EmbedOptions,
  type ExportOptions,
} from './export-sharing.js';

// --- Test Helpers ---

function createTestVideo(overrides?: Partial<VideoForExport>): VideoForExport {
  return {
    id: 'video-1',
    title: 'Test Video',
    duration: 125,
    thumbnail: '/thumb/video-1.jpg',
    ...overrides,
  };
}

function createTestJob(overrides?: Partial<ExportJob>): ExportJob {
  return {
    id: 'job-1',
    videoId: 'video-1',
    videoTitle: 'Test Video',
    options: { format: 'mp4', quality: 'high', resolution: '1080p' },
    status: 'processing',
    progress: 45,
    estimatedTimeRemaining: 120,
    createdAt: '2024-01-15T10:00:00Z',
    ...overrides,
  };
}

function createTestShareLink(overrides?: Partial<ShareLink>): ShareLink {
  return {
    id: 'link-1',
    videoId: 'video-1',
    url: 'https://share.streetstudio.io/abc123',
    permission: 'public',
    createdAt: '2024-01-15T10:00:00Z',
    viewCount: 42,
    isActive: true,
    ...overrides,
  };
}

function createMockCallbacks(): ExportSharingCallbacks {
  return {
    onStartExport: vi.fn().mockResolvedValue(createTestJob({ id: 'new-job-1' })),
    onStartBatchExport: vi.fn().mockResolvedValue([
      createTestJob({ id: 'batch-job-1', videoTitle: 'Video 1' }),
      createTestJob({ id: 'batch-job-2', videoTitle: 'Video 2' }),
    ]),
    onCancelExport: vi.fn().mockResolvedValue(true),
    onGenerateShareLink: vi.fn().mockResolvedValue(createTestShareLink({ id: 'new-link-1' })),
    onRevokeShareLink: vi.fn().mockResolvedValue(true),
    onGetShareLinks: vi.fn().mockResolvedValue([createTestShareLink()]),
  };
}

// --- Utility Function Tests ---

describe('Utility Functions', () => {
  describe('formatEta', () => {
    it('should return "Calculating..." for undefined', () => {
      expect(formatEta(undefined)).toBe('Calculating...');
    });

    it('should return "Almost done" for 0 seconds', () => {
      expect(formatEta(0)).toBe('Almost done');
    });

    it('should format seconds', () => {
      expect(formatEta(30)).toBe('30s remaining');
    });

    it('should format minutes and seconds', () => {
      expect(formatEta(90)).toBe('1m 30s remaining');
    });

    it('should format hours and minutes', () => {
      expect(formatEta(3720)).toBe('1h 2m remaining');
    });

    it('should return "Calculating..." for negative', () => {
      expect(formatEta(-5)).toBe('Calculating...');
    });
  });

  describe('calculateBatchProgress', () => {
    it('should return 0 for empty array', () => {
      expect(calculateBatchProgress([])).toBe(0);
    });

    it('should calculate average progress', () => {
      const jobs = [
        createTestJob({ progress: 50 }),
        createTestJob({ progress: 100 }),
      ];
      expect(calculateBatchProgress(jobs)).toBe(75);
    });

    it('should handle single job', () => {
      expect(calculateBatchProgress([createTestJob({ progress: 60 })])).toBe(60);
    });
  });

  describe('getCompletedCount', () => {
    it('should count completed jobs', () => {
      const jobs = [
        createTestJob({ status: 'completed' }),
        createTestJob({ status: 'processing' }),
        createTestJob({ status: 'completed' }),
      ];
      expect(getCompletedCount(jobs)).toBe(2);
    });
  });

  describe('getFailedCount', () => {
    it('should count failed jobs', () => {
      const jobs = [
        createTestJob({ status: 'failed' }),
        createTestJob({ status: 'processing' }),
        createTestJob({ status: 'failed' }),
      ];
      expect(getFailedCount(jobs)).toBe(2);
    });
  });
