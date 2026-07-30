/**
 * Unit Tests: Error Feedback Service
 * 
 * Tests user feedback collection, context capture,
 * and consent-based submission.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ErrorFeedbackService, type FeedbackReport } from './error-feedback.js';

// Mock toast
vi.mock('../../utils/toast.js', () => ({
  toast: {
    warning: vi.fn(),
    success: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock logger
vi.mock('../../app/client-logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Mock crypto.randomUUID
vi.stubGlobal('crypto', {
  randomUUID: () => 'test-uuid-1234',
});

describe('ErrorFeedbackService', () => {
  let service: ErrorFeedbackService;

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Mock localStorage
    const store: Record<string, string> = {};
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store[key] || null,
      setItem: (key: string, value: string) => { store[key] = value; },
      removeItem: (key: string) => { delete store[key]; },
    });

    // Mock performance.memory
    Object.defineProperty(performance, 'memory', {
      value: { usedJSHeapSize: 50 * 1024 * 1024 },
      configurable: true,
    });

    service = new ErrorFeedbackService({
      endpoint: '/api/feedback/errors',
      maxDescriptionLength: 2000,
      categories: ['Bug', 'Performance', 'Other'],
      collectContactEmail: true,
      requireConsent: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    // Clean up any DOM elements
    document.body.innerHTML = '';
  });

  describe('recordAction', () => {
    it('records user actions for context', () => {
      service.recordAction('Clicked upload button');
      service.recordAction('Selected video file');
      
      const context = service.captureContext();
      expect(context.recentActions).toHaveLength(2);
      expect(context.recentActions[0]).toContain('Clicked upload button');
      expect(context.recentActions[1]).toContain('Selected video file');
    });

    it('limits recent actions to max size', () => {
      for (let i = 0; i < 25; i++) {
        service.recordAction(`Action ${i}`);
      }

      const context = service.captureContext();
      expect(context.recentActions.length).toBeLessThanOrEqual(20);
    });
  });

  describe('captureContext', () => {
    it('captures current page and browser info', () => {
      const context = service.captureContext();

      expect(context.currentPage).toBeTruthy();
      expect(context.browserInfo).toBeDefined();
      expect(context.browserInfo.userAgent).toBeTruthy();
      expect(context.browserInfo.platform).toBeTruthy();
      expect(context.browserInfo.language).toBeTruthy();
      expect(context.browserInfo.screenResolution).toBeTruthy();
      expect(context.browserInfo.viewportSize).toBeTruthy();
      expect(context.timestamp).toBeTruthy();
      expect(context.sessionDuration).toBeGreaterThanOrEqual(0);
    });

    it('captures error info when error is provided', () => {
      const error = new Error('Test error');
      const context = service.captureContext(error);

      expect(context.errorMessage).toBe('Test error');
      expect(context.errorStack).toBeTruthy();
    });

    it('captures memory usage when available', () => {
      const context = service.captureContext();
      expect(context.browserInfo.memoryUsage).toBe(50); // 50 MB
    });

    it('works without error parameter', () => {
      const context = service.captureContext();
      expect(context.errorMessage).toBeUndefined();
      expect(context.errorStack).toBeUndefined();
    });
  });

  describe('showFeedbackForm', () => {
    it('creates and appends form to document body', () => {
      service.showFeedbackForm();

      const overlay = document.querySelector('.error-feedback-overlay');
      expect(overlay).toBeTruthy();
    });

    it('includes error message when provided', () => {
      const error = new Error('Something failed');
      service.showFeedbackForm(error);

      const errorText = document.body.textContent;
      expect(errorText).toContain('Something failed');
    });

    it('does not show multiple forms simultaneously', () => {
      service.showFeedbackForm();
      service.showFeedbackForm();

      const overlays = document.querySelectorAll('.error-feedback-overlay');
      expect(overlays).toHaveLength(1);
    });

    it('form has required fields', () => {
      service.showFeedbackForm();

      expect(document.querySelector('#feedback-category')).toBeTruthy();
      expect(document.querySelector('#feedback-description')).toBeTruthy();
      expect(document.querySelector('#feedback-include-context')).toBeTruthy();
      expect(document.querySelector('#feedback-consent')).toBeTruthy();
      expect(document.querySelector('#feedback-submit')).toBeTruthy();
      expect(document.querySelector('#feedback-cancel')).toBeTruthy();
    });

    it('form includes email field when configured', () => {
      service.showFeedbackForm();
      expect(document.querySelector('#feedback-email')).toBeTruthy();
    });

    it('form does not include email field when not configured', () => {
      const serviceNoEmail = new ErrorFeedbackService({ collectContactEmail: false });
      serviceNoEmail.showFeedbackForm();
      expect(document.querySelector('#feedback-email')).toBeFalsy();
    });

    it('cancel button closes the form', () => {
      service.showFeedbackForm();
      
      const cancelBtn = document.querySelector('#feedback-cancel') as HTMLButtonElement;
      cancelBtn.click();

      expect(document.querySelector('.error-feedback-overlay')).toBeFalsy();
    });

    it('calls onCancel callback when cancelled', () => {
      const onCancel = vi.fn();
      const serviceWithCancel = new ErrorFeedbackService({ onCancel });
      serviceWithCancel.showFeedbackForm();

      const cancelBtn = document.querySelector('#feedback-cancel') as HTMLButtonElement;
      cancelBtn.click();

      expect(onCancel).toHaveBeenCalled();
    });

    it('closes form on Escape key', () => {
      service.showFeedbackForm();
      
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      expect(document.querySelector('.error-feedback-overlay')).toBeFalsy();
    });
  });

  describe('getPendingReports', () => {
    it('returns empty array when no pending reports', () => {
      expect(service.getPendingReports()).toEqual([]);
    });

    it('returns stored pending reports', () => {
      const reports: FeedbackReport[] = [{
        id: 'report-1',
        context: {
          currentPage: 'http://localhost/',
          browserInfo: { userAgent: '', platform: '', language: 'en', screenResolution: '1920x1080', viewportSize: '1024x768', cookiesEnabled: true, onlineStatus: true },
          timestamp: new Date().toISOString(),
          sessionDuration: 60,
          recentActions: [],
        },
        userDescription: 'Test report',
        severity: 'medium',
        category: 'Bug',
        consentGiven: true,
        includeContext: true,
        submittedAt: new Date().toISOString(),
      }];

      localStorage.setItem('streetstudio_pending_feedback', JSON.stringify(reports));
      expect(service.getPendingReports()).toHaveLength(1);
    });
  });

  describe('retryPendingReports', () => {
    it('returns 0 when no pending reports', async () => {
      const submitted = await service.retryPendingReports();
      expect(submitted).toBe(0);
    });

    it('submits pending reports and returns count', async () => {
      const mockFetch = vi.fn().mockResolvedValue({ ok: true });
      vi.stubGlobal('fetch', mockFetch);

      const reports: FeedbackReport[] = [{
        id: 'report-1',
        context: {
          currentPage: 'http://localhost/',
          browserInfo: { userAgent: '', platform: '', language: 'en', screenResolution: '1920x1080', viewportSize: '1024x768', cookiesEnabled: true, onlineStatus: true },
          timestamp: new Date().toISOString(),
          sessionDuration: 60,
          recentActions: [],
        },
        userDescription: 'Test report',
        severity: 'medium',
        category: 'Bug',
        consentGiven: true,
        includeContext: true,
        submittedAt: new Date().toISOString(),
      }];

      localStorage.setItem('streetstudio_pending_feedback', JSON.stringify(reports));

      const submitted = await service.retryPendingReports();
      expect(submitted).toBe(1);
      expect(mockFetch).toHaveBeenCalled();
    });
  });

  describe('accessibility', () => {
    it('form overlay has dialog role', () => {
      service.showFeedbackForm();
      const overlay = document.querySelector('.error-feedback-overlay');
      expect(overlay?.getAttribute('role')).toBe('dialog');
      expect(overlay?.getAttribute('aria-modal')).toBe('true');
    });

    it('form has labeled title', () => {
      service.showFeedbackForm();
      const overlay = document.querySelector('.error-feedback-overlay');
      expect(overlay?.getAttribute('aria-labelledby')).toBe('feedback-title');
      expect(document.querySelector('#feedback-title')).toBeTruthy();
    });
  });
});
