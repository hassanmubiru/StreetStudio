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
