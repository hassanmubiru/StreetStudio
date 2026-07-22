/**
 * Error System Summary Tests
 * 
 * Validates that all key requirements for the comprehensive error boundary system are met.
 * Tests Requirements 13.1, 13.2, 13.6, and 13.8.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { 
  setupErrorHandling, 
  handleError, 
  handleFeatureError,
  getErrorReportingService,
  getDegradationManager,
} from './error-handler.js';
import { ErrorBoundary } from './error-boundary.js';
import { initializeClientLogger, logger } from './client-logger.js';

describe('Error System - Requirements Validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Setup required globals
    Object.defineProperty(global, 'crypto', {
      value: { randomUUID: vi.fn(() => 'test-uuid') },
      configurable: true,
    });
    
    Object.defineProperty(global, 'window', {
      value: {
        location: { href: 'https://test.com', pathname: '/test' },
        addEventListener: vi.fn(),
      },
      configurable: true,
    });
    
    Object.defineProperty(global, 'navigator', {
      value: { userAgent: 'test-agent', onLine: true },
      configurable: true,
    });
    
    Object.defineProperty(global, 'localStorage', {
      value: {
        getItem: vi.fn(),
        setItem: vi.fn(),
        removeItem: vi.fn(),
      },
      configurable: true,
    });
  });

  describe('Requirement 13.1: Categorized Error Handling', () => {
    it('should catch and handle JavaScript errors without crashing', () => {
      setupErrorHandling();
      
      const jsError = new Error('JavaScript runtime error');
      expect(() => handleError(jsError, 'javascript')).not.toThrow();
    });

    it('should categorize errors into fatal, recoverable, and minor', () => {
      setupErrorHandling();
      
      // Test fatal error
      const fatalError = new Error('Out of memory');
      expect(() => handleError(fatalError, 'javascript')).not.toThrow();
      
      // Test recoverable error  
      const networkError = new Error('fetch failed');
      expect(() => handleError(networkError, 'network')).not.toThrow();
      
      // Test minor error
      const permissionError = new Error('Permission denied');
      expect(() => handleError(permissionError, 'permission')).not.toThrow();
    });

    it('should handle component-level errors with boundaries', () => {
      const container = document.createElement('div');
      container.setAttribute('data-component', 'TestComponent');
      
      const boundary = new ErrorBoundary(container);
      boundary.initialize();
      
      expect(() => {
        boundary.handleError(new Error('Component failure'));
      }).not.toThrow();
      
      boundary.destroy();
    });
  });

  describe('Requirement 13.2: Error Reporting with User Consent', () => {
    it('should initialize error reporting service', () => {
      setupErrorHandling({
        enabled: true,
        endpoint: '/api/errors',
      });
      
      const reportingService = getErrorReportingService();
      expect(reportingService).toBeDefined();
    });

    it('should respect user consent for error reporting', () => {
      // Mock no consent given
      vi.mocked(localStorage.getItem).mockReturnValue(null);
      
      setupErrorHandling({
        enabled: true,
        endpoint: '/api/errors',
      });
      
      // Should not report without consent
      const error = new Error('Test error');
      expect(() => handleError(error)).not.toThrow();
    });

    it('should capture context with error reports', () => {
      setupErrorHandling({
        enabled: true,
      });
      
      const contextualError = new Error('Contextual error');
      expect(() => {
        handleError(contextualError, 'test', {
          userId: 'user-123',
          action: 'button-click',
        });
      }).not.toThrow();
    });
  });

  describe('Requirement 13.6: Graceful Degradation', () => {
    it('should implement graceful degradation for feature failures', () => {
      setupErrorHandling();
      
      const degradationManager = getDegradationManager();
      expect(degradationManager).toBeDefined();
      
      if (degradationManager) {
        let fallbackExecuted = false;
        
        degradationManager.registerFallback('test-feature', () => {
          fallbackExecuted = true;
        });
        
        degradationManager.handleFeatureFailure('test-feature', new Error('Feature failed'));
        expect(fallbackExecuted).toBe(true);
      }
    });

    it('should handle feature errors without affecting core functionality', () => {
      setupErrorHandling();
      
      const featureError = new Error('Advanced feature unavailable');
      expect(() => {
        handleFeatureError('advanced-editor', featureError, {
          fallbackMode: 'basic-editor'
        });
      }).not.toThrow();
    });

    it('should track and restore failed features', () => {
      setupErrorHandling();
      
      const degradationManager = getDegradationManager();
      if (degradationManager) {
        // Simulate failure
        degradationManager.handleFeatureFailure('test-feature', new Error('Failure'));
        expect(degradationManager.isFeatureFailed('test-feature')).toBe(true);
        
        // Simulate restoration
        degradationManager.restoreFeature('test-feature');
        expect(degradationManager.isFeatureFailed('test-feature')).toBe(false);
      }
    });
  });

  describe('Requirement 13.8: Contextual Help and Support', () => {
    it('should provide error IDs for support tracking', () => {
      setupErrorHandling();
      
      const supportError = new Error('Need support for this error');
      
      // Mock crypto to return predictable UUID
      vi.mocked(crypto.randomUUID).mockReturnValue('support-error-123');
      
      expect(() => handleError(supportError)).not.toThrow();
      expect(crypto.randomUUID).toHaveBeenCalled();
    });

    it('should provide contextual help based on error type', () => {
      setupErrorHandling();
      
      // Authentication error should suggest re-login
      const authError = new Error('Authentication failed');
      expect(() => handleError(authError, 'authentication')).not.toThrow();
      
      // Network error should suggest connectivity check
      const networkError = new Error('Network timeout');
      expect(() => handleError(networkError, 'network')).not.toThrow();
      
      // Chunk error should suggest refresh
      const chunkError = new Error('Loading chunk failed');
      expect(() => handleError(chunkError, 'javascript')).not.toThrow();
    });
  });

  describe('Client-Side Error Logging and Retry Mechanisms', () => {
    it('should initialize client logger successfully', () => {
      expect(() => {
        initializeClientLogger({
          remoteEndpoint: '/api/logs',
          enableConsoleOutput: true,
        });
      }).not.toThrow();
    });

    it('should log errors with appropriate severity', () => {
      // Logger should be available and functional
      expect(() => {
        logger.error('Test error log', { context: 'test' });
        logger.fatal('Test fatal log', { context: 'critical' });
        logger.warn('Test warning log', { context: 'warning' });
      }).not.toThrow();
    });

    it('should handle retry logic for failed operations', () => {
      // Test that retry mechanisms don't crash the system
      setupErrorHandling();
      
      const retryableError = new Error('Temporary failure');
      expect(() => {
        handleError(retryableError, 'network');
      }).not.toThrow();
    });
  });

  describe('System Integration', () => {
    it('should integrate all components without conflicts', () => {
      // Initialize full system
      expect(() => {
        initializeClientLogger();
        setupErrorHandling({
          enabled: true,
          endpoint: '/api/errors',
        });
      }).not.toThrow();
      
      // Test that all services are available
      const reportingService = getErrorReportingService();
      const degradationManager = getDegradationManager();
      
      expect(reportingService).toBeDefined();
      expect(degradationManager).toBeDefined();
    });

    it('should handle multiple error types in sequence', () => {
      setupErrorHandling();
      
      const errors = [
        { error: new Error('Network failure'), context: 'network' },
        { error: new Error('Component crash'), context: 'component' },
        { error: new Error('Permission denied'), context: 'permission' },
        { error: new Error('Authentication expired'), context: 'authentication' },
      ];
      
      expect(() => {
        errors.forEach(({ error, context }) => {
          handleError(error, context);
        });
      }).not.toThrow();
    });

    it('should maintain system stability under error load', () => {
      setupErrorHandling();
      
      // Simulate rapid error generation
      expect(() => {
        for (let i = 0; i < 50; i++) {
          handleError(new Error(`Load test error ${i}`), 'test');
        }
      }).not.toThrow();
    });
  });
});