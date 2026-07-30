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

describe('getImportStatusColor', () => {
  it('returns correct colors', () => {
    expect(getImportStatusColor('pending')).toContain('gray');
    expect(getImportStatusColor('validating')).toContain('blue');
    expect(getImportStatusColor('importing')).toContain('yellow');
    expect(getImportStatusColor('completed')).toContain('green');
    expect(getImportStatusColor('failed')).toContain('red');
  });
});

describe('getImportPlatformInfo', () => {
  it('returns correct info for known platforms', () => {
    expect(getImportPlatformInfo('youtube').label).toBe('YouTube');
    expect(getImportPlatformInfo('vimeo').label).toBe('Vimeo');
    expect(getImportPlatformInfo('loom').label).toBe('Loom');
  });
});

describe('formatFileSize', () => {
  it('formats bytes correctly', () => {
    expect(formatFileSize(500)).toBe('500 B');
    expect(formatFileSize(1024)).toBe('1.0 KB');
    expect(formatFileSize(1048576)).toBe('1.0 MB');
    expect(formatFileSize(1073741824)).toBe('1.0 GB');
  });
});

describe('formatImportDuration', () => {
  it('formats seconds correctly', () => {
    expect(formatImportDuration(30)).toBe('30s');
    expect(formatImportDuration(60)).toBe('1m');
    expect(formatImportDuration(90)).toBe('1m 30s');
    expect(formatImportDuration(3600)).toBe('1h 0m');
    expect(formatImportDuration(3661)).toBe('1h 1m');
  });
});

// --- Component Tests ---

describe('DataImportPage', () => {
  let page: DataImportPage;
  let callbacks: DataImportCallbacks;

  beforeEach(() => {
    callbacks = createMockCallbacks();
  });

  it('renders with default empty state', () => {
    page = new DataImportPage();
    const el = page.getElement();
    expect(el.getAttribute('data-page')).toBe('data-import');
    expect(page.getImportJobs()).toEqual([]);
    expect(page.getDiscoveredItems()).toEqual([]);
  });

  it('renders with initial import jobs', () => {
    const job = createTestImportJob();
    page = new DataImportPage({ importJobs: [job] });
    expect(page.getImportJobs()).toHaveLength(1);
  });

  it('shows and hides source form', () => {
    page = new DataImportPage();
    expect(page.isSourceFormVisible()).toBe(false);
    page.showSource();
    expect(page.isSourceFormVisible()).toBe(true);
    page.hideSource();
    expect(page.isSourceFormVisible()).toBe(false);
  });

  it('selects a platform', () => {
    page = new DataImportPage();
    page.showSource();
    page.selectPlatform('youtube');
    expect(page.getSourceFormData().platform).toBe('youtube');
  });

  it('validates a source and discovers items', async () => {
    page = new DataImportPage({ callbacks });
    page.showSource();
    page.selectPlatform('youtube');
    (page as any).sourceFormData.url = 'https://www.youtube.com/playlist?list=abc';

    await page.validateSource();
    expect(callbacks.onValidateSource).toHaveBeenCalled();
    expect(page.getDiscoveredItems()).toHaveLength(2);
    expect(page.getIsValidating()).toBe(false);
  });

  it('toggles item selection', async () => {
    page = new DataImportPage({ callbacks });
    page.showSource();
    page.selectPlatform('youtube');
    (page as any).sourceFormData.url = 'https://www.youtube.com/playlist?list=abc';
    await page.validateSource();

    const items = page.getDiscoveredItems();
    expect(items[0].selected).toBe(true);

    page.toggleItemSelection(items[0].id);
    expect(page.getDiscoveredItems()[0].selected).toBe(false);
  });

  it('select all / deselect all items', async () => {
    page = new DataImportPage({ callbacks });
    page.showSource();
    page.selectPlatform('youtube');
    (page as any).sourceFormData.url = 'https://www.youtube.com/playlist?list=abc';
    await page.validateSource();

    page.deselectAllItems();
    expect(page.getSelectedItemCount()).toBe(0);

    page.selectAllItems();
    expect(page.getSelectedItemCount()).toBe(2);
  });

  it('starts an import', async () => {
    page = new DataImportPage({ callbacks });
    page.showSource();
    page.selectPlatform('youtube');
    (page as any).sourceFormData.url = 'https://www.youtube.com/playlist?list=abc';
    await page.validateSource();

    await page.startImport();
    expect(callbacks.onStartImport).toHaveBeenCalled();
    expect(page.getImportJobs()).toHaveLength(1);
    expect(page.isSourceFormVisible()).toBe(false);
  });

  it('cancels an import', async () => {
    const job = createTestImportJob();
    page = new DataImportPage({ importJobs: [job], callbacks });
    await page.cancelImport(job.id);
    expect(callbacks.onCancelImport).toHaveBeenCalledWith(job.id);
    const updated = page.getImportJobs().find(j => j.id === job.id);
    expect(updated?.status).toBe('failed');
  });

  it('refreshes job status', async () => {
    const job = createTestImportJob({ completedItems: 2 });
    page = new DataImportPage({ importJobs: [job], callbacks });
    await page.refreshJobStatus(job.id);
    expect(callbacks.onFetchJobStatus).toHaveBeenCalledWith(job.id);
    const updated = page.getImportJobs().find(j => j.id === job.id);
    expect(updated?.completedItems).toBe(4);
  });

  it('destroy cleans up state', () => {
    const job = createTestImportJob();
    page = new DataImportPage({ importJobs: [job] });
    page.destroy();
    expect(page.getImportJobs()).toHaveLength(0);
    expect(page.getDiscoveredItems()).toHaveLength(0);
  });
});
