/**
 * Data Import Functionality Tests
 *
 * Tests for platform validation, import source scanning,
 * item selection, and import job management.
 *
 * Validates: Requirements 15.9
 */

// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  DataImportPage,
  validatePlatformUrl,
  validateImportFile,
  calculateImportProgress,
  getImportStatusColor,
  getImportPlatformInfo,
  formatFileSize,
  formatImportDuration,
  SUPPORTED_IMPORT_FILE_TYPES,
  MAX_IMPORT_FILE_SIZE_MB,
  MAX_IMPORT_ITEMS,
  type ImportJob,
  type ImportableItem,
  type DataImportCallbacks,
} from './data-import.js';

// --- Test Helpers ---

function createTestImportJob(overrides?: Partial<ImportJob>): ImportJob {
  return {
    id: 'job-1',
    platform: 'youtube',
    status: 'importing',
    totalItems: 5,
    completedItems: 3,
    failedItems: 0,
    items: [],
    startedAt: '2024-01-15T10:00:00Z',
    ...overrides,
  };
}

function createTestItem(overrides?: Partial<ImportableItem>): ImportableItem {
  return {
    id: 'item-1',
    externalId: 'ext-1',
    title: 'Test Video',
    type: 'video',
    duration: 120,
    platform: 'youtube',
    size: 1024000,
    selected: true,
    ...overrides,
  };
}

function createMockCallbacks(): DataImportCallbacks {
  return {
    onValidateSource: vi.fn().mockResolvedValue({
      valid: true,
      items: [createTestItem(), createTestItem({ id: 'item-2', externalId: 'ext-2', title: 'Video 2' })],
    }),
    onStartImport: vi.fn().mockResolvedValue(createTestImportJob()),
    onCancelImport: vi.fn().mockResolvedValue(true),
    onRetryItem: vi.fn().mockResolvedValue({ id: 'item-1', externalId: 'ext-1', title: 'Test', type: 'video', status: 'importing', progress: 0 }),
    onFetchJobStatus: vi.fn().mockResolvedValue(createTestImportJob({ completedItems: 4 })),
  };
}

// --- Utility Function Tests ---

describe('validatePlatformUrl', () => {
  it('rejects empty URL', () => {
    expect(validatePlatformUrl('youtube', '').valid).toBe(false);
  });

  it('rejects invalid URL format', () => {
    expect(validatePlatformUrl('youtube', 'not-a-url').valid).toBe(false);
  });

  it('rejects URL from wrong platform', () => {
    const result = validatePlatformUrl('youtube', 'https://vimeo.com/video/123');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('YouTube');
  });

  it('accepts valid YouTube URL', () => {
    expect(validatePlatformUrl('youtube', 'https://www.youtube.com/watch?v=abc123').valid).toBe(true);
  });

  it('accepts valid Vimeo URL', () => {
    expect(validatePlatformUrl('vimeo', 'https://vimeo.com/123456').valid).toBe(true);
  });

  it('accepts valid Loom URL', () => {
    expect(validatePlatformUrl('loom', 'https://www.loom.com/share/abc123').valid).toBe(true);
  });
});

describe('validateImportFile', () => {
  it('accepts supported file types', () => {
    expect(validateImportFile('data.json', 1000).valid).toBe(true);
    expect(validateImportFile('export.csv', 1000).valid).toBe(true);
    expect(validateImportFile('archive.zip', 1000).valid).toBe(true);
  });

  it('rejects unsupported file types', () => {
    const result = validateImportFile('video.mp4', 1000);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Unsupported');
  });

  it('rejects files exceeding size limit', () => {
    const oversizedBytes = (MAX_IMPORT_FILE_SIZE_MB + 1) * 1024 * 1024;
    const result = validateImportFile('data.json', oversizedBytes);
    expect(result.valid).toBe(false);
    expect(result.error).toContain(`${MAX_IMPORT_FILE_SIZE_MB}MB`);
  });
});

describe('calculateImportProgress', () => {
  it('returns 0 for empty job', () => {
    const job = createTestImportJob({ totalItems: 0, completedItems: 0 });
    expect(calculateImportProgress(job)).toBe(0);
  });

  it('calculates correct percentage', () => {
    const job = createTestImportJob({ totalItems: 10, completedItems: 5 });
    expect(calculateImportProgress(job)).toBe(50);
  });

  it('returns 100 when all items are complete', () => {
    const job = createTestImportJob({ totalItems: 5, completedItems: 5 });
    expect(calculateImportProgress(job)).toBe(100);
  });
});
