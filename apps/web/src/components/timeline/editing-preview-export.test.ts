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
