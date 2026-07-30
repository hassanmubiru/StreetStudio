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

  describe('generateIframeEmbed', () => {
    it('should generate responsive iframe by default', () => {
      const code = generateIframeEmbed('vid-1', DEFAULT_EMBED_OPTIONS);
      expect(code).toContain('position:relative');
      expect(code).toContain('padding-bottom:56.25%');
      expect(code).toContain('src="https://embed.streetstudio.io/v/vid-1"');
      expect(code).toContain('allowfullscreen');
      expect(code).toContain('title="StreetStudio Video"');
    });

    it('should generate fixed-size iframe when not responsive', () => {
      const opts: EmbedOptions = { ...DEFAULT_EMBED_OPTIONS, responsive: false, width: 800, height: 450 };
      const code = generateIframeEmbed('vid-1', opts);
      expect(code).toContain('width="800"');
      expect(code).toContain('height="450"');
      expect(code).not.toContain('position:relative');
    });

    it('should include autoplay param', () => {
      const opts: EmbedOptions = { ...DEFAULT_EMBED_OPTIONS, autoplay: true };
      const code = generateIframeEmbed('vid-1', opts);
      expect(code).toContain('autoplay=1');
    });

    it('should include controls=0 when disabled', () => {
      const opts: EmbedOptions = { ...DEFAULT_EMBED_OPTIONS, controls: false };
      const code = generateIframeEmbed('vid-1', opts);
      expect(code).toContain('controls=0');
    });

    it('should include loop param', () => {
      const opts: EmbedOptions = { ...DEFAULT_EMBED_OPTIONS, loop: true };
      const code = generateIframeEmbed('vid-1', opts);
      expect(code).toContain('loop=1');
    });

    it('should include muted param', () => {
      const opts: EmbedOptions = { ...DEFAULT_EMBED_OPTIONS, muted: true };
      const code = generateIframeEmbed('vid-1', opts);
      expect(code).toContain('muted=1');
    });

    it('should include branding=0 when disabled', () => {
      const opts: EmbedOptions = { ...DEFAULT_EMBED_OPTIONS, showBranding: false };
      const code = generateIframeEmbed('vid-1', opts);
      expect(code).toContain('branding=0');
    });

    it('should include start time', () => {
      const opts: EmbedOptions = { ...DEFAULT_EMBED_OPTIONS, startTime: 30 };
      const code = generateIframeEmbed('vid-1', opts);
      expect(code).toContain('t=30');
    });

    it('should use custom base URL', () => {
      const code = generateIframeEmbed('vid-1', DEFAULT_EMBED_OPTIONS, 'https://custom.embed.com');
      expect(code).toContain('https://custom.embed.com/v/vid-1');
    });
  });

  describe('generateScriptEmbed', () => {
    it('should generate script embed with config', () => {
      const code = generateScriptEmbed('vid-1', DEFAULT_EMBED_OPTIONS);
      expect(code).toContain('ss-player-vid-1');
      expect(code).toContain('player.js');
      expect(code).toContain('data-config');
      expect(code).toContain('"videoId"');
    });

    it('should use responsive style when responsive', () => {
      const code = generateScriptEmbed('vid-1', DEFAULT_EMBED_OPTIONS);
      expect(code).toContain('width:100%');
      expect(code).toContain('aspect-ratio:16/9');
    });

    it('should use fixed dimensions when not responsive', () => {
      const opts: EmbedOptions = { ...DEFAULT_EMBED_OPTIONS, responsive: false, width: 800, height: 450 };
      const code = generateScriptEmbed('vid-1', opts);
      expect(code).toContain('width:800px');
      expect(code).toContain('height:450px');
    });
  });

  describe('validateExpirationDate', () => {
    it('should accept undefined (no expiration)', () => {
      expect(validateExpirationDate(undefined).valid).toBe(true);
    });

    it('should reject invalid date string', () => {
      const result = validateExpirationDate('not-a-date');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid');
    });

    it('should reject past dates', () => {
      const past = new Date(Date.now() - 86400000).toISOString();
      const result = validateExpirationDate(past);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('future');
    });

    it('should accept future dates', () => {
      const future = new Date(Date.now() + 86400000).toISOString();
      expect(validateExpirationDate(future).valid).toBe(true);
    });
  });

  describe('validateSharePassword', () => {
    it('should accept any password for non-password permissions', () => {
      expect(validateSharePassword(undefined, 'public').valid).toBe(true);
      expect(validateSharePassword(undefined, 'organization').valid).toBe(true);
    });

    it('should require password for password permission', () => {
      const result = validateSharePassword(undefined, 'password');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('required');
    });

    it('should reject short passwords', () => {
      const result = validateSharePassword('ab', 'password');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('4 characters');
    });

    it('should reject overly long passwords', () => {
      const result = validateSharePassword('a'.repeat(129), 'password');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('128');
    });

    it('should accept valid passwords', () => {
      expect(validateSharePassword('mypassword', 'password').valid).toBe(true);
    });
  });

  describe('getPermissionLabel', () => {
    it('should return correct labels', () => {
      expect(getPermissionLabel('public')).toBe('Anyone with the link');
      expect(getPermissionLabel('password')).toBe('Password protected');
      expect(getPermissionLabel('organization')).toBe('Organization members only');
      expect(getPermissionLabel('members')).toBe('Specific members only');
    });
  });

  describe('formatExpiration', () => {
    it('should return "Never expires" for undefined', () => {
      expect(formatExpiration(undefined)).toBe('Never expires');
    });

    it('should return "Expired" for past dates', () => {
      const past = new Date(Date.now() - 86400000).toISOString();
      expect(formatExpiration(past)).toBe('Expired');
    });

    it('should return "Expires today" for date expiring within 24 hours', () => {
      const soon = new Date(Date.now() + 3600000).toISOString();
      expect(formatExpiration(soon)).toBe('Expires today');
    });

    it('should show days for date within a week', () => {
      const days3 = new Date(Date.now() + 3 * 86400000).toISOString();
      expect(formatExpiration(days3)).toContain('Expires in');
      expect(formatExpiration(days3)).toContain('days');
    });
  });
});

// --- Component Tests ---

describe('ExportSharingPage', () => {
  let page: ExportSharingPage;
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    page?.destroy();
    if (container.parentNode) {
      document.body.removeChild(container);
    }
  });

  describe('Initialization', () => {
    it('should create page element with correct attributes', () => {
      page = new ExportSharingPage();
      const el = page.getElement();
      expect(el).toBeInstanceOf(HTMLElement);
      expect(el.getAttribute('data-page')).toBe('export-sharing');
      expect(el.getAttribute('data-main-content')).toBe('');
    });

    it('should display heading', () => {
      page = new ExportSharingPage();
      const el = page.getElement();
      expect(el.querySelector('h1')?.textContent).toContain('Export & Sharing');
    });

    it('should render New Export button', () => {
      page = new ExportSharingPage();
      const el = page.getElement();
      const btn = el.querySelector('#btn-new-export') as HTMLButtonElement;
      expect(btn).toBeTruthy();
      expect(btn.textContent).toContain('New Export');
      expect(btn.getAttribute('aria-label')).toContain('export');
    });
  });

  describe('Export Form - Video Selection', () => {
    it('should show export form when New Export is clicked', () => {
      const videos = [createTestVideo()];
      page = new ExportSharingPage({ videos });
      const el = page.getElement();
      container.appendChild(el);

      el.querySelector('#btn-new-export')!.dispatchEvent(new Event('click'));
      expect(page.isExportFormVisible()).toBe(true);
      expect(el.querySelector('#export-form')).toBeTruthy();
    });

    it('should display video list with checkboxes', () => {
      const videos = [
        createTestVideo({ id: 'v1', title: 'Video One' }),
        createTestVideo({ id: 'v2', title: 'Video Two' }),
      ];
      page = new ExportSharingPage({ videos });
      page.showExport();
      const el = page.getElement();
      container.appendChild(el);

      const checkboxes = el.querySelectorAll('.video-select-checkbox');
      expect(checkboxes.length).toBe(2);
      expect(el.textContent).toContain('Video One');
      expect(el.textContent).toContain('Video Two');
    });

    it('should show video duration formatted', () => {
      const videos = [createTestVideo({ duration: 125 })];
      page = new ExportSharingPage({ videos });
      page.showExport();
      const el = page.getElement();
      container.appendChild(el);

      expect(el.textContent).toContain('2:05');
    });

    it('should select and deselect videos', () => {
      const videos = [createTestVideo({ id: 'v1' }), createTestVideo({ id: 'v2' })];
      page = new ExportSharingPage({ videos });
      page.showExport();

      page.selectVideo('v1');
      expect(page.getSelectedVideoIds()).toContain('v1');

      page.deselectVideo('v1');
      expect(page.getSelectedVideoIds()).not.toContain('v1');
    });

    it('should select all videos', () => {
      const videos = [createTestVideo({ id: 'v1' }), createTestVideo({ id: 'v2' }), createTestVideo({ id: 'v3' })];
      page = new ExportSharingPage({ videos });
      page.showExport();

      page.selectAllVideos();
      expect(page.getSelectedVideoIds().length).toBe(3);
    });

    it('should deselect all videos', () => {
      const videos = [createTestVideo({ id: 'v1' }), createTestVideo({ id: 'v2' })];
      page = new ExportSharingPage({ videos });
      page.showExport();
      page.selectAllVideos();
      page.deselectAllVideos();
      expect(page.getSelectedVideoIds().length).toBe(0);
    });

    it('should hide form when Cancel is clicked', () => {
      page = new ExportSharingPage({ videos: [createTestVideo()] });
      page.showExport();
      const el = page.getElement();
      container.appendChild(el);

      el.querySelector('#btn-cancel-export')!.dispatchEvent(new Event('click'));
      expect(page.isExportFormVisible()).toBe(false);
    });
  });

  describe('Export Form - Format and Quality', () => {
    it('should display format radio buttons', () => {
      page = new ExportSharingPage({ videos: [createTestVideo()] });
      page.showExport();
      const el = page.getElement();
      container.appendChild(el);

      const radios = el.querySelectorAll('.format-radio');
      expect(radios.length).toBe(FORMAT_OPTIONS.length);
    });

    it('should display quality select', () => {
      page = new ExportSharingPage({ videos: [createTestVideo()] });
      page.showExport();
      const el = page.getElement();
      container.appendChild(el);

      const select = el.querySelector('#export-quality') as HTMLSelectElement;
      expect(select).toBeTruthy();
      expect(select.options.length).toBe(QUALITY_OPTIONS.length);
    });

    it('should display resolution select', () => {
      page = new ExportSharingPage({ videos: [createTestVideo()] });
      page.showExport();
      const el = page.getElement();
      container.appendChild(el);

      const select = el.querySelector('#export-resolution') as HTMLSelectElement;
      expect(select).toBeTruthy();
      expect(select.options.length).toBe(RESOLUTION_OPTIONS.length);
    });

    it('should update export format', () => {
      page = new ExportSharingPage({ videos: [createTestVideo()] });
      page.showExport();
      page.setExportFormat('webm');
      expect(page.getExportOptions().format).toBe('webm');
    });

    it('should update export quality', () => {
      page = new ExportSharingPage({ videos: [createTestVideo()] });
      page.showExport();
      page.setExportQuality('low');
      expect(page.getExportOptions().quality).toBe('low');
    });

    it('should update export resolution', () => {
      page = new ExportSharingPage({ videos: [createTestVideo()] });
      page.showExport();
      page.setExportResolution('4k');
      expect(page.getExportOptions().resolution).toBe('4k');
    });
  });

  describe('Export Execution', () => {
    it('should call onStartExport for single video', async () => {
      const callbacks = createMockCallbacks();
      const videos = [createTestVideo({ id: 'v1' })];
      page = new ExportSharingPage({ videos, callbacks });
      page.showExport();
      page.selectVideo('v1');

      await page.startExport();

      expect(callbacks.onStartExport).toHaveBeenCalledWith('v1', {
        format: 'mp4',
        quality: 'high',
        resolution: '1080p',
      });
    });

    it('should call onStartBatchExport for multiple videos', async () => {
      const callbacks = createMockCallbacks();
      const videos = [createTestVideo({ id: 'v1' }), createTestVideo({ id: 'v2' })];
      page = new ExportSharingPage({ videos, callbacks });
      page.showExport();
      page.selectVideo('v1');
      page.selectVideo('v2');

      await page.startExport();

      expect(callbacks.onStartBatchExport).toHaveBeenCalledWith(
        expect.arrayContaining(['v1', 'v2']),
        expect.objectContaining({ format: 'mp4' })
      );
    });

    it('should add job to exportJobs after single export', async () => {
      const callbacks = createMockCallbacks();
      const videos = [createTestVideo({ id: 'v1' })];
      page = new ExportSharingPage({ videos, callbacks });
      page.showExport();
      page.selectVideo('v1');

      await page.startExport();

      expect(page.getExportJobs().length).toBe(1);
      expect(page.getExportJobs()[0]!.id).toBe('new-job-1');
    });

    it('should add multiple jobs after batch export', async () => {
      const callbacks = createMockCallbacks();
      const videos = [createTestVideo({ id: 'v1' }), createTestVideo({ id: 'v2' })];
      page = new ExportSharingPage({ videos, callbacks });
      page.showExport();
      page.selectVideo('v1');
      page.selectVideo('v2');

      await page.startExport();

      expect(page.getExportJobs().length).toBe(2);
    });

    it('should hide export form after successful export', async () => {
      const callbacks = createMockCallbacks();
      const videos = [createTestVideo({ id: 'v1' })];
      page = new ExportSharingPage({ videos, callbacks });
      page.showExport();
      page.selectVideo('v1');

      await page.startExport();

      expect(page.isExportFormVisible()).toBe(false);
    });

    it('should not start export when no videos selected', async () => {
      const callbacks = createMockCallbacks();
      page = new ExportSharingPage({ videos: [createTestVideo()], callbacks });
      page.showExport();

      await page.startExport();

      expect(callbacks.onStartExport).not.toHaveBeenCalled();
      expect(callbacks.onStartBatchExport).not.toHaveBeenCalled();
    });
  });

  describe('Export Progress Tracking', () => {
    it('should render export progress section when jobs exist', () => {
      const jobs = [createTestJob()];
      page = new ExportSharingPage({ exportJobs: jobs });
      const el = page.getElement();
      container.appendChild(el);

      expect(el.querySelector('#export-progress')).toBeTruthy();
    });

    it('should display progress bar for each job', () => {
      const jobs = [createTestJob({ progress: 45 })];
      page = new ExportSharingPage({ exportJobs: jobs });
      const el = page.getElement();
      container.appendChild(el);

      const progressBar = el.querySelector('[role="progressbar"]');
      expect(progressBar).toBeTruthy();
      expect(progressBar?.getAttribute('aria-valuenow')).toBe('45');
    });

    it('should display ETA for processing jobs', () => {
      const jobs = [createTestJob({ status: 'processing', estimatedTimeRemaining: 120 })];
      page = new ExportSharingPage({ exportJobs: jobs });
      const el = page.getElement();
      container.appendChild(el);

      expect(el.textContent).toContain('2m');
      expect(el.textContent).toContain('remaining');
    });

    it('should display error for failed jobs', () => {
      const jobs = [createTestJob({ status: 'failed', error: 'Encoding error' })];
      page = new ExportSharingPage({ exportJobs: jobs });
      const el = page.getElement();
      container.appendChild(el);

      expect(el.textContent).toContain('Encoding error');
    });

    it('should display download link for completed jobs', () => {
      const jobs = [createTestJob({ status: 'completed', progress: 100, downloadUrl: '/dl/video.mp4' })];
      page = new ExportSharingPage({ exportJobs: jobs });
      const el = page.getElement();
      container.appendChild(el);

      const link = el.querySelector('a[download]') as HTMLAnchorElement;
      expect(link).toBeTruthy();
      expect(link.href).toContain('/dl/video.mp4');
    });

    it('should update progress on updateExportProgress', () => {
      const jobs = [createTestJob({ id: 'job-1', progress: 20 })];
      page = new ExportSharingPage({ exportJobs: jobs });

      page.updateExportProgress('job-1', 75, 30);

      const updatedJob = page.getExportJobs().find(j => j.id === 'job-1');
      expect(updatedJob?.progress).toBe(75);
      expect(updatedJob?.estimatedTimeRemaining).toBe(30);
    });

    it('should mark job as completed', () => {
      const jobs = [createTestJob({ id: 'job-1' })];
      page = new ExportSharingPage({ exportJobs: jobs });

      page.completeExport('job-1', '/dl/result.mp4');

      const job = page.getExportJobs().find(j => j.id === 'job-1');
      expect(job?.status).toBe('completed');
      expect(job?.progress).toBe(100);
      expect(job?.downloadUrl).toBe('/dl/result.mp4');
    });

    it('should mark job as failed', () => {
      const jobs = [createTestJob({ id: 'job-1' })];
      page = new ExportSharingPage({ exportJobs: jobs });

      page.failExport('job-1', 'Server error');

      const job = page.getExportJobs().find(j => j.id === 'job-1');
      expect(job?.status).toBe('failed');
      expect(job?.error).toBe('Server error');
    });

    it('should cancel export job', async () => {
      const callbacks = createMockCallbacks();
      const jobs = [createTestJob({ id: 'job-1' })];
      page = new ExportSharingPage({ exportJobs: jobs, callbacks });

      await page.cancelExport('job-1');

      expect(callbacks.onCancelExport).toHaveBeenCalledWith('job-1');
      expect(page.getExportJobs().find(j => j.id === 'job-1')).toBeUndefined();
    });

    it('should display batch progress summary', () => {
      const jobs = [
        createTestJob({ id: 'j1', status: 'completed', progress: 100 }),
        createTestJob({ id: 'j2', status: 'processing', progress: 50 }),
        createTestJob({ id: 'j3', status: 'failed', progress: 0 }),
      ];
      page = new ExportSharingPage({ exportJobs: jobs });
      const el = page.getElement();
      container.appendChild(el);

      expect(el.textContent).toContain('1 completed');
      expect(el.textContent).toContain('1 failed');
      expect(el.textContent).toContain('1 active');
    });
  });

  describe('Embed Code Generation', () => {
    it('should show embed panel for a video', () => {
      page = new ExportSharingPage();
      page.showEmbed('vid-1');
      const el = page.getElement();
      container.appendChild(el);

      expect(page.isEmbedPanelVisible()).toBe(true);
      expect(el.querySelector('#embed-panel')).toBeTruthy();
    });

    it('should hide embed panel', () => {
      page = new ExportSharingPage();
      page.showEmbed('vid-1');
      page.hideEmbed();

      expect(page.isEmbedPanelVisible()).toBe(false);
    });

    it('should display embed type radio buttons', () => {
      page = new ExportSharingPage();
      page.showEmbed('vid-1');
      const el = page.getElement();
      container.appendChild(el);

      const radios = el.querySelectorAll('.embed-type-radio');
      expect(radios.length).toBe(2);
    });

    it('should display embed option checkboxes', () => {
      page = new ExportSharingPage();
      page.showEmbed('vid-1');
      const el = page.getElement();
      container.appendChild(el);

      const checkboxes = el.querySelectorAll('.embed-option-checkbox');
      expect(checkboxes.length).toBe(6); // autoplay, controls, loop, muted, branding, responsive
    });

    it('should generate iframe code by default', () => {
      page = new ExportSharingPage();
      page.showEmbed('vid-1');

      const code = page.getEmbedCode();
      expect(code).toContain('iframe');
      expect(code).toContain('vid-1');
    });

    it('should switch to script embed type', () => {
      page = new ExportSharingPage();
      page.showEmbed('vid-1');
      page.setEmbedType('script');

      const code = page.getEmbedCode();
      expect(code).toContain('script');
      expect(code).toContain('player.js');
    });

    it('should update embed options', () => {
      page = new ExportSharingPage();
      page.showEmbed('vid-1');
      page.setEmbedOption('autoplay', true);
      page.setEmbedOption('loop', true);

      const opts = page.getEmbedOptions();
      expect(opts.autoplay).toBe(true);
      expect(opts.loop).toBe(true);
    });

    it('should show width/height inputs when not responsive', () => {
      page = new ExportSharingPage();
      page.showEmbed('vid-1');
      page.setEmbedOption('responsive', false);
      const el = page.getElement();
      container.appendChild(el);

      expect(el.querySelector('#embed-width')).toBeTruthy();
      expect(el.querySelector('#embed-height')).toBeTruthy();
    });

    it('should hide width/height inputs when responsive', () => {
      page = new ExportSharingPage();
      page.showEmbed('vid-1');
      // responsive is true by default
      const el = page.getElement();
      container.appendChild(el);

      expect(el.querySelector('#embed-width')).toBeFalsy();
      expect(el.querySelector('#embed-height')).toBeFalsy();
    });

    it('should display generated code in textarea', () => {
      page = new ExportSharingPage();
      page.showEmbed('vid-1');
      const el = page.getElement();
      container.appendChild(el);

      const textarea = el.querySelector('#embed-code-output') as HTMLTextAreaElement;
      expect(textarea).toBeTruthy();
      expect(textarea.value).toContain('vid-1');
    });

    it('should use custom base embed URL', () => {
      page = new ExportSharingPage({ baseEmbedUrl: 'https://my.embed.io' });
      page.showEmbed('vid-1');

      const code = page.getEmbedCode();
      expect(code).toContain('https://my.embed.io');
    });
  });

  describe('Sharing Controls', () => {
    it('should show share form for a video', () => {
      page = new ExportSharingPage();
      page.showShare('vid-1');
      const el = page.getElement();
      container.appendChild(el);

      expect(page.isShareFormVisible()).toBe(true);
      expect(el.querySelector('#share-form')).toBeTruthy();
    });

    it('should hide share form', () => {
      page = new ExportSharingPage();
      page.showShare('vid-1');
      page.hideShare();

      expect(page.isShareFormVisible()).toBe(false);
    });

    it('should display permission radio buttons', () => {
      page = new ExportSharingPage();
      page.showShare('vid-1');
      const el = page.getElement();
      container.appendChild(el);

      const radios = el.querySelectorAll('.permission-radio');
      expect(radios.length).toBe(4);
    });

    it('should show password input when password permission selected', () => {
      page = new ExportSharingPage();
      page.showShare('vid-1');
      page.setSharePermission('password');
      const el = page.getElement();
      container.appendChild(el);

      expect(el.querySelector('#share-password')).toBeTruthy();
    });

    it('should show members input when members permission selected', () => {
      page = new ExportSharingPage();
      page.showShare('vid-1');
      page.setSharePermission('members');
      const el = page.getElement();
      container.appendChild(el);

      expect(el.querySelector('#share-members')).toBeTruthy();
    });

    it('should display expiration input', () => {
      page = new ExportSharingPage();
      page.showShare('vid-1');
      const el = page.getElement();
      container.appendChild(el);

      expect(el.querySelector('#share-expiration')).toBeTruthy();
    });

    it('should track share form state', () => {
      page = new ExportSharingPage();
      page.showShare('vid-1');
      page.setSharePermission('password');
      page.setSharePassword('secret123');
      page.setShareExpiration('2025-06-01T00:00');

      const state = page.getShareFormState();
      expect(state.videoId).toBe('vid-1');
      expect(state.permission).toBe('password');
      expect(state.password).toBe('secret123');
      expect(state.expiration).toBe('2025-06-01T00:00');
    });
  });

  describe('Share Link Creation', () => {
    it('should call onGenerateShareLink with correct params', async () => {
      const callbacks = createMockCallbacks();
      page = new ExportSharingPage({ callbacks });
      page.showShare('vid-1');
      page.setSharePermission('public');

      await page.createShareLink();

      expect(callbacks.onGenerateShareLink).toHaveBeenCalledWith(
        'vid-1',
        'public',
        expect.objectContaining({ password: undefined, allowedMembers: undefined })
      );
    });

    it('should include password for password-protected links', async () => {
      const callbacks = createMockCallbacks();
      page = new ExportSharingPage({ callbacks });
      page.showShare('vid-1');
      page.setSharePermission('password');
      page.setSharePassword('mysecret');

      await page.createShareLink();

      expect(callbacks.onGenerateShareLink).toHaveBeenCalledWith(
        'vid-1',
        'password',
        expect.objectContaining({ password: 'mysecret' })
      );
    });

    it('should include members for member-specific links', async () => {
      const callbacks = createMockCallbacks();
      page = new ExportSharingPage({ callbacks });
      page.showShare('vid-1');
      page.setSharePermission('members');
      page.setShareMembers(['user1@test.com', 'user2@test.com']);

      await page.createShareLink();

      expect(callbacks.onGenerateShareLink).toHaveBeenCalledWith(
        'vid-1',
        'members',
        expect.objectContaining({ allowedMembers: ['user1@test.com', 'user2@test.com'] })
      );
    });

    it('should add new link to shareLinks list', async () => {
      const callbacks = createMockCallbacks();
      page = new ExportSharingPage({ callbacks });
      page.showShare('vid-1');

      await page.createShareLink();

      expect(page.getShareLinks().length).toBe(1);
      expect(page.getShareLinks()[0]!.id).toBe('new-link-1');
    });

    it('should hide share form after successful creation', async () => {
      const callbacks = createMockCallbacks();
      page = new ExportSharingPage({ callbacks });
      page.showShare('vid-1');

      await page.createShareLink();

      expect(page.isShareFormVisible()).toBe(false);
    });

    it('should not create link when password validation fails', async () => {
      const callbacks = createMockCallbacks();
      page = new ExportSharingPage({ callbacks });
      page.showShare('vid-1');
      page.setSharePermission('password');
      page.setSharePassword('ab'); // too short

      await page.createShareLink();

      expect(callbacks.onGenerateShareLink).not.toHaveBeenCalled();
    });
  });

  describe('Share Links Display', () => {
    it('should render share links section when links exist', () => {
      const links = [createTestShareLink()];
      page = new ExportSharingPage({ shareLinks: links });
      const el = page.getElement();
      container.appendChild(el);

      expect(el.querySelector('#share-links-list')).toBeTruthy();
    });

    it('should display link URL', () => {
      const links = [createTestShareLink({ url: 'https://share.streetstudio.io/xyz' })];
      page = new ExportSharingPage({ shareLinks: links });
      const el = page.getElement();
      container.appendChild(el);

      expect(el.textContent).toContain('https://share.streetstudio.io/xyz');
    });

    it('should display permission label', () => {
      const links = [createTestShareLink({ permission: 'organization' })];
      page = new ExportSharingPage({ shareLinks: links });
      const el = page.getElement();
      container.appendChild(el);

      expect(el.textContent).toContain('Organization members only');
    });

    it('should display view count', () => {
      const links = [createTestShareLink({ viewCount: 42 })];
      page = new ExportSharingPage({ shareLinks: links });
      const el = page.getElement();
      container.appendChild(el);

      expect(el.textContent).toContain('42 views');
    });

    it('should show revoke button for active links', () => {
      const links = [createTestShareLink({ isActive: true })];
      page = new ExportSharingPage({ shareLinks: links });
      const el = page.getElement();
      container.appendChild(el);

      expect(el.querySelector('.btn-revoke-link')).toBeTruthy();
    });

    it('should not show revoke button for revoked links', () => {
      const links = [createTestShareLink({ isActive: false })];
      page = new ExportSharingPage({ shareLinks: links });
      const el = page.getElement();
      container.appendChild(el);

      expect(el.querySelector('.btn-revoke-link')).toBeFalsy();
    });

    it('should show "Revoked" label for inactive links', () => {
      const links = [createTestShareLink({ isActive: false })];
      page = new ExportSharingPage({ shareLinks: links });
      const el = page.getElement();
      container.appendChild(el);

      expect(el.textContent).toContain('Revoked');
    });
  });

  describe('Share Link Revocation', () => {
    it('should call onRevokeShareLink callback', async () => {
      const callbacks = createMockCallbacks();
      const links = [createTestShareLink({ id: 'link-1', isActive: true })];
      page = new ExportSharingPage({ shareLinks: links, callbacks });

      await page.revokeShareLink('link-1');

      expect(callbacks.onRevokeShareLink).toHaveBeenCalledWith('link-1');
    });

    it('should mark link as inactive after revocation', async () => {
      const callbacks = createMockCallbacks();
      const links = [createTestShareLink({ id: 'link-1', isActive: true })];
      page = new ExportSharingPage({ shareLinks: links, callbacks });

      await page.revokeShareLink('link-1');

      const link = page.getShareLinks().find(l => l.id === 'link-1');
      expect(link?.isActive).toBe(false);
    });
  });

  describe('Accessibility', () => {
    it('should have aria-label on export progress bars', () => {
      const jobs = [createTestJob({ videoTitle: 'My Video' })];
      page = new ExportSharingPage({ exportJobs: jobs });
      const el = page.getElement();
      container.appendChild(el);

      const progressBars = el.querySelectorAll('[role="progressbar"]');
      const jobBar = Array.from(progressBars).find(bar =>
        bar.getAttribute('aria-label')?.includes('My Video')
      );
      expect(jobBar).toBeTruthy();
      expect(jobBar?.getAttribute('aria-label')).toContain('My Video');
    });

    it('should have aria-label on video selection checkboxes', () => {
      const videos = [createTestVideo({ id: 'v1', title: 'Demo Video' })];
      page = new ExportSharingPage({ videos });
      page.showExport();
      const el = page.getElement();
      container.appendChild(el);

      const cb = el.querySelector('.video-select-checkbox');
      expect(cb?.getAttribute('aria-label')).toContain('Demo Video');
    });

    it('should have role=group on video selection area', () => {
      const videos = [createTestVideo()];
      page = new ExportSharingPage({ videos });
      page.showExport();
      const el = page.getElement();
      container.appendChild(el);

      const group = el.querySelector('#video-selection');
      expect(group?.getAttribute('role')).toBe('group');
    });

    it('should have role=radiogroup on embed type selection', () => {
      page = new ExportSharingPage();
      page.showEmbed('vid-1');
      const el = page.getElement();
      container.appendChild(el);

      const group = el.querySelector('[role="radiogroup"]');
      expect(group).toBeTruthy();
      expect(group?.getAttribute('aria-label')).toContain('Embed type');
    });

    it('should have aria-label on embed code textarea', () => {
      page = new ExportSharingPage();
      page.showEmbed('vid-1');
      const el = page.getElement();
      container.appendChild(el);

      const textarea = el.querySelector('#embed-code-output');
      expect(textarea?.getAttribute('aria-label')).toContain('embed code');
    });

    it('should have role=radiogroup on permission selection', () => {
      page = new ExportSharingPage();
      page.showShare('vid-1');
      const el = page.getElement();
      container.appendChild(el);

      const group = el.querySelector('[role="radiogroup"]');
      expect(group).toBeTruthy();
      expect(group?.getAttribute('aria-label')).toContain('permission');
    });

    it('should have aria-label on cancel export buttons', () => {
      const jobs = [createTestJob({ videoTitle: 'My Vid', status: 'processing' })];
      page = new ExportSharingPage({ exportJobs: jobs });
      const el = page.getElement();
      container.appendChild(el);

      const cancelBtn = el.querySelector('.btn-cancel-job');
      expect(cancelBtn?.getAttribute('aria-label')).toContain('My Vid');
    });
  });
});
