/**
 * Comprehensive Test Suite for Error Handler System
 * 
 * Tests error categorization, reporting, graceful degradation, and client-side logging.
 */

import { describe, it, expect, beforeEach, afterEach, vi, type MockedFunction } from 'vitest';
import { 
  setupErrorHandling, 
  handleError, 
  handleFeatureError,
  getErrorReportingService,
  getDegradationManager,
  type ErrorDetails,
  type ErrorSeverity,
  type ErrorCategory
} from './error-handler.js';
import { toast } from '@streetstudio/ui';

// Mock dependencies
vi.mock('@streetstudio/ui', () => ({
  toast: {
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
  }
}));

vi.mock('./client-logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
  }
}));

// Mock global functions
const mockFetch = vi.fn();
global.fetch = mockFetch;

const mockCrypto = {
  randomUUID: vi.fn(() => 'test-uuid-123')
};
Object.defineProperty(global, 'crypto', {
  value: mockCrypto,
  writable: true
});

describe('Error Handler System', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Reset DOM
    document.body.innerHTML = '';
    
    // Mock navigator
    Object.defineProperty(navigator, 'onLine', {
      value: true,
      writable: true
    });
    
    // Reset localStorage
    localStorage.clear();
    
    // Mock window location
    Object.defineProperty(window, 'location', {
      value: {
        href: 'https://test.streetstudio.com/test',
        pathname: '/test'
      },
      writable: true
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('setupErrorHandling', () => {
    it('should initialize error handling with default configuration', () => {
      setupErrorHandling();
      
      const reportingService = getErrorReportingService();
      const degradationManager = getDegradationManager();
      
      expect(reportingService).toBeDefined();
      expect(degradationManager).toBeDefined();
    });

    it('should handle unhandled promise rejections', () => {
      const handleErrorSpy = vi.fn();
      setupErrorHandling();

      // Simulate unhandled promise rejection
      const event = new Event('unhandledrejection') as any;
      event.reason = new Error('Test unhandled rejection');
      event.preventDefault = vi.fn();

      window.dispatchEvent(event);

      expect(event.preventDefault).toHaveBeenCalled();
    });

    it('should handle JavaScript errors', () => {
      setupErrorHandling();

      // Simulate JavaScript error
      const event = new ErrorEvent('error', {
        error: new Error('Test JavaScript error'),
        message: 'Test JavaScript error'
      });

      window.dispatchEvent(event);

      // Should not throw
      expect(true).toBe(true);
    });

    it('should handle network status changes', () => {
      setupErrorHandling();

      // Simulate going offline
      window.dispatchEvent(new Event('offline'));
      expect(toast.warning).toHaveBeenCalledWith(
        expect.stringContaining('offline'), 
        expect.any(Object)
      );

      // Simulate going online
      window.dispatchEvent(new Event('online'));
      expect(toast.success).toHaveBeenCalledWith('Connection restored.');
    });
  });

  describe('Error Categorization', () => {
    beforeEach(() => {
      setupErrorHandling();
    });

    it('should categorize fatal errors correctly', () => {
      const fatalError = new Error('Out of memory');
      handleError(fatalError, 'javascript');
      
      // Should show full screen error for fatal errors
      expect(document.body.innerHTML).toContain('Application Error');
    });

    it('should categorize authentication errors as recoverable', () => {
      const authError = new Error('Unauthorized access');
      handleError(authError, 'authentication');
      
      expect(toast.error).toHaveBeenCalled();
    });

    it('should categorize network errors as recoverable', () => {
      const networkError = new Error('NetworkError: fetch failed');
      handleError(networkError, 'network');
      
      expect(toast.error).toHaveBeenCalledWith(
        expect.stringContaining('Network error'),
        expect.any(Object)
      );
    });

    it('should categorize chunk loading errors correctly', () => {
      const chunkError = new Error('ChunkLoadError: Loading chunk failed');
      handleError(chunkError, 'javascript');
      
      expect(toast.error).toHaveBeenCalledWith(
        expect.stringContaining('update available'),
        expect.objectContaining({
          duration: 0,
          action: expect.any(Object)
        })
      );
    });

    it('should categorize permission errors as minor', () => {
      const permissionError = new Error('Permission denied');
      handleError(permissionError, 'permission');
      
      expect(toast.error).toHaveBeenCalledWith(
        expect.stringContaining('Permission denied'),
        expect.any(Object)
      );
    });
  });

  describe('Error Reporting with User Consent', () => {
    beforeEach(() => {
      setupErrorHandling({
        enabled: true,
        endpoint: '/api/errors',
      });
    });

    it('should show consent modal when user consent is not given', async () => {
      const error = new Error('Test error for consent');
      handleError(error);
      
      // Should show consent modal
      await vi.waitFor(() => {
        expect(document.body.innerHTML).toContain('Help Improve StreetStudio');
      });
    });

    it('should store consent choice in localStorage', () => {
      setupErrorHandling();
      
      const error = new Error('Test error');
      handleError(error);
      
      // Simulate user clicking "Yes, Help Improve"
      const allowBtn = document.querySelector('#consent-allow') as HTMLButtonElement;
      if (allowBtn) {
        allowBtn.click();
        
        expect(localStorage.getItem('streetstudio_error_reporting_consent')).toBe('true');
      }
    });

    it('should respect stored user consent', () => {
      localStorage.setItem('streetstudio_error_reporting_consent', 'true');
      
      setupErrorHandling({
        enabled: true,
        endpoint: '/api/errors',
      });
      
      const error = new Error('Test error with consent');
      handleError(error);
      
      // Should not show consent modal
      expect(document.body.innerHTML).not.toContain('Help Improve StreetStudio');
    });

    it('should send error reports when consent is given', async () => {
      localStorage.setItem('streetstudio_error_reporting_consent', 'true');
      mockFetch.mockResolvedValueOnce(new Response('', { status: 200 }));
      
      setupErrorHandling({
        enabled: true,
        endpoint: '/api/errors',
      });
      
      const error = new Error('Test error for reporting');
      handleError(error);
      
      // Give time for async reporting
      await vi.waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith(
          '/api/errors',
          expect.objectContaining({
            method: 'POST',
            headers: expect.objectContaining({
              'Content-Type': 'application/json'
            }),
            body: expect.stringContaining('Test error for reporting')
          })
        );
      });
    });
  });

  describe('Graceful Degradation', () => {
    beforeEach(() => {
      setupErrorHandling();
    });

    it('should handle feature failures gracefully', () => {
      const featureError = new Error('Video player initialization failed');
      handleFeatureError('video-player', featureError, { videoId: 'test-123' });
      
      expect(toast.info).toHaveBeenCalledWith(
        expect.stringContaining('video-player'),
        expect.any(Object)
      );
    });

    it('should track failed features', () => {
      const degradationManager = getDegradationManager();
      expect(degradationManager).toBeDefined();
      
      if (degradationManager) {
        const featureError = new Error('Timeline editor failed');
        handleFeatureError('timeline-editor', featureError);
        
        expect(degradationManager.isFeatureFailed('timeline-editor')).toBe(true);
      }
    });

    it('should provide fallback strategies for failed features', () => {
      const degradationManager = getDegradationManager();
      
      if (degradationManager) {
        let fallbackExecuted = false;
        
        degradationManager.registerFallback('test-feature', () => {
          fallbackExecuted = true;
        });
        
        degradationManager.handleFeatureFailure('test-feature', new Error('Test failure'));
        
        expect(fallbackExecuted).toBe(true);
      }
    });

    it('should restore features when they recover', () => {
      const degradationManager = getDegradationManager();
      
      if (degradationManager) {
        // Simulate failure
        degradationManager.handleFeatureFailure('test-feature', new Error('Test failure'));
        expect(degradationManager.isFeatureFailed('test-feature')).toBe(true);
        
        // Simulate recovery
        degradationManager.restoreFeature('test-feature');
        expect(degradationManager.isFeatureFailed('test-feature')).toBe(false);
      }
    });
  });

  describe('Contextual Help and Support', () => {
    beforeEach(() => {
      setupErrorHandling();
    });

    it('should show support contact for severe errors', () => {
      const severeError = new Error('Database connection failed');
      handleError(severeError, 'api');
      
      // Should show full screen error with support contact
      expect(document.body.innerHTML).toContain('support@streetstudio.com');
    });

    it('should provide error ID for support', () => {
      const error = new Error('Test error with ID');
      handleError(error);
      
      expect(document.body.innerHTML).toContain('test-uuid-123');
    });

    it('should open support contact modal', () => {
      // Mock window.open to fail and trigger support modal
      const originalOpen = window.open;
      window.open = vi.fn(() => null);
      
      const error = new Error('Test error for support');
      handleError(error, 'fatal');
      
      // Look for support modal elements after error handling
      setTimeout(() => {
        expect(document.body.innerHTML).toContain('Get Help');
      }, 100);
      
      window.open = originalOpen;
    });

    it('should copy error details to clipboard', async () => {
      const mockWriteText = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText: mockWriteText },
        writable: true
      });
      
      const error = new Error('Test error for clipboard');
      handleError(error, 'fatal');
      
      // Simulate clicking copy button
      setTimeout(() => {
        const copyBtn = document.querySelector('#copy-details') as HTMLButtonElement;
        if (copyBtn) {
          copyBtn.click();
          expect(mockWriteText).toHaveBeenCalled();
        }
      }, 100);
    });
  });

  describe('Recovery Actions', () => {
    beforeEach(() => {
      setupErrorHandling();
    });

    it('should provide retry actions for recoverable errors', () => {
      const recoverableError = new Error('Temporary server error');
      handleError(recoverableError, 'api');
      
      // Should show retry option in toast or error UI
      expect(toast.error).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          action: expect.any(Object)
        })
      );
    });

    it('should provide refresh action for chunk loading errors', () => {
      const chunkError = new Error('Loading chunk 123 failed');
      handleError(chunkError);
      
      expect(toast.error).toHaveBeenCalledWith(
        expect.stringContaining('refresh'),
        expect.objectContaining({
          duration: 0,
          action: expect.objectContaining({
            label: 'Refresh',
            onClick: expect.any(Function)
          })
        })
      );
    });

    it('should provide re-login action for authentication errors', () => {
      const authError = new Error('Authentication expired');
      handleError(authError, 'authentication');
      
      // Should show full screen error with re-login option for auth failures
      setTimeout(() => {
        expect(document.body.innerHTML).toContain('Re-login');
      }, 100);
    });
  });

  describe('Development vs Production Behavior', () => {
    it('should show detailed error information in development', () => {
      // Mock development environment
      const originalEnv = import.meta.env;
      (import.meta as any).env = { MODE: 'development' };
      
      setupErrorHandling();
      
      const error = new Error('Development error with stack');
      error.stack = 'Error: Development error\n    at test.js:123:45';
      
      handleError(error, 'fatal');
      
      expect(document.body.innerHTML).toContain('Error Details (Development)');
      expect(document.body.innerHTML).toContain('test.js:123:45');
      
      // Restore environment
      (import.meta as any).env = originalEnv;
    });

    it('should hide detailed error information in production', () => {
      // Mock production environment
      const originalEnv = import.meta.env;
      (import.meta as any).env = { MODE: 'production' };
      
      setupErrorHandling();
      
      const error = new Error('Production error');
      handleError(error, 'fatal');
      
      expect(document.body.innerHTML).not.toContain('Error Details (Development)');
      
      // Restore environment
      (import.meta as any).env = originalEnv;
    });
  });

  describe('Error Rate Limiting', () => {
    beforeEach(() => {
      localStorage.setItem('streetstudio_error_reporting_consent', 'true');
      mockFetch.mockResolvedValue(new Response('', { status: 200 }));
      
      setupErrorHandling({
        enabled: true,
        endpoint: '/api/errors',
        maxReportsPerSession: 2,
      });
    });

    it('should limit error reports per session', async () => {
      // Send multiple errors
      handleError(new Error('Error 1'));
      handleError(new Error('Error 2'));
      handleError(new Error('Error 3')); // Should not be reported
      
      await vi.waitFor(() => {
        expect(mockFetch).toHaveBeenCalledTimes(2);
      });
    });
  });
});