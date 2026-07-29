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
