/**
 * Unit Tests: Network Error Handler
 * 
 * Tests comprehensive network error handling with retry logic,
 * error categorization, and configurable exponential backoff.
 */

// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock logger before importing module
vi.mock('../../app/client-logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    fatal: vi.fn(),
  },
}));

import { NetworkErrorHandler, type NetworkErrorCategory, type RetryConfig } from './network-error-handler.js';

// Mock fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('NetworkErrorHandler', () => {
  let handler: NetworkErrorHandler;

  beforeEach(() => {
    vi.useFakeTimers();
    mockFetch.mockReset();
    
    // Default navigator.onLine to true
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
    
    handler = new NetworkErrorHandler({
      retry: {
        maxRetries: 2,
        initialDelay: 100,
        maxDelay: 5000,
        backoffMultiplier: 2,
        jitterFactor: 0, // Disable jitter for deterministic tests
        retryableCategories: ['timeout', 'offline', 'server-error', 'rate-limited', 'connection-refused'],
      },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('categorizeError', () => {
    it('categorizes timeout errors', () => {
      const error = new Error('Request timed out');
      expect(handler.categorizeError(error)).toBe('timeout');
    });

    it('categorizes offline errors when navigator is offline', () => {
      Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
      const offlineHandler = new NetworkErrorHandler();
      const error = new Error('Some error');
      expect(offlineHandler.categorizeError(error)).toBe('offline');
    });

    it('categorizes CORS errors', () => {
      const error = new Error('CORS policy blocked');
      expect(handler.categorizeError(error)).toBe('cors');
    });

    it('categorizes DNS errors', () => {
      const error = new Error('DNS name not resolved');
      expect(handler.categorizeError(error)).toBe('dns');
    });

    it('categorizes connection refused errors', () => {
      const error = new Error('connection refused');
      expect(handler.categorizeError(error)).toBe('connection-refused');
    });

    it('categorizes 401 as auth-expired', () => {
      const error = new Error('HTTP 401');
      expect(handler.categorizeError(error, 401)).toBe('auth-expired');
    });

    it('categorizes 403 as auth-expired', () => {
      const error = new Error('HTTP 403');
      expect(handler.categorizeError(error, 403)).toBe('auth-expired');
    });

    it('categorizes 429 as rate-limited', () => {
      const error = new Error('HTTP 429');
      expect(handler.categorizeError(error, 429)).toBe('rate-limited');
    });

    it('categorizes 500+ as server-error', () => {
      const error = new Error('HTTP 500');
      expect(handler.categorizeError(error, 500)).toBe('server-error');
      expect(handler.categorizeError(error, 502)).toBe('server-error');
      expect(handler.categorizeError(error, 503)).toBe('server-error');
    });

    it('categorizes 400-499 as client-error', () => {
      const error = new Error('HTTP 400');
      expect(handler.categorizeError(error, 400)).toBe('client-error');
      expect(handler.categorizeError(error, 404)).toBe('client-error');
      expect(handler.categorizeError(error, 422)).toBe('client-error');
    });

    it('categorizes network/fetch errors as offline', () => {
      const error = new Error('Failed to fetch');
      expect(handler.categorizeError(error)).toBe('offline');
    });

    it('returns unknown for unrecognized errors', () => {
      const error = new Error('Something weird happened');
      expect(handler.categorizeError(error)).toBe('unknown');
    });
  });

  describe('getUserMessage', () => {
    it('returns appropriate message for each category', () => {
      const categories: NetworkErrorCategory[] = [
        'timeout', 'offline', 'server-error', 'auth-expired',
        'rate-limited', 'client-error', 'cors', 'dns', 'connection-refused', 'unknown',
      ];

      categories.forEach(category => {
        const message = handler.getUserMessage(category);
        expect(message).toBeTruthy();
        expect(typeof message).toBe('string');
        expect(message.length).toBeGreaterThan(10);
      });
    });
  });

  describe('getSuggestedAction', () => {
    it('returns appropriate action for each category', () => {
      const categories: NetworkErrorCategory[] = [
        'timeout', 'offline', 'server-error', 'auth-expired',
        'rate-limited', 'client-error', 'cors', 'dns', 'connection-refused', 'unknown',
      ];

      categories.forEach(category => {
        const action = handler.getSuggestedAction(category);
        expect(action).toBeTruthy();
        expect(typeof action).toBe('string');
      });
    });
  });

  describe('createErrorInfo', () => {
    it('creates error info with correct categorization', () => {
      const error = new Error('Request timed out');
      const info = handler.createErrorInfo(error, undefined, '/api/videos', 1);

      expect(info.category).toBe('timeout');
      expect(info.retryable).toBe(true);
      expect(info.endpoint).toBe('/api/videos');
      expect(info.attemptsMade).toBe(1);
      expect(info.timestamp).toBeTruthy();
      expect(info.userMessage).toBeTruthy();
      expect(info.suggestedAction).toBeTruthy();
    });

    it('marks non-retryable errors correctly', () => {
      const error = new Error('HTTP 401');
      const info = handler.createErrorInfo(error, 401);

      expect(info.category).toBe('auth-expired');
      expect(info.retryable).toBe(false);
    });
  });

  describe('calculateDelay', () => {
    it('calculates exponential backoff', () => {
      const config: RetryConfig = {
        maxRetries: 3,
        initialDelay: 1000,
        maxDelay: 30000,
        backoffMultiplier: 2,
        jitterFactor: 0,
        retryableCategories: [],
      };

      expect(handler.calculateDelay(0, config)).toBe(1000);
      expect(handler.calculateDelay(1, config)).toBe(2000);
      expect(handler.calculateDelay(2, config)).toBe(4000);
      expect(handler.calculateDelay(3, config)).toBe(8000);
    });

    it('clamps delay to maxDelay', () => {
      const config: RetryConfig = {
        maxRetries: 3,
        initialDelay: 1000,
        maxDelay: 5000,
        backoffMultiplier: 2,
        jitterFactor: 0,
        retryableCategories: [],
      };

      expect(handler.calculateDelay(10, config)).toBe(5000);
    });

    it('applies jitter when configured', () => {
      const config: RetryConfig = {
        maxRetries: 3,
        initialDelay: 1000,
        maxDelay: 30000,
        backoffMultiplier: 2,
        jitterFactor: 0.5,
        retryableCategories: [],
      };

      // With 50% jitter, result should be between 500 and 1500 for attempt 0
      const delay = handler.calculateDelay(0, config);
      expect(delay).toBeGreaterThanOrEqual(500);
      expect(delay).toBeLessThanOrEqual(1500);
    });
  });

  describe('fetchWithRetry', () => {
    it('returns response on successful fetch', async () => {
      const mockResponse = new Response(JSON.stringify({ ok: true }), { status: 200 });
      mockFetch.mockResolvedValueOnce(mockResponse);

      const response = await handler.fetchWithRetry('/api/test');
      expect(response.status).toBe(200);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('retries on server error and succeeds', async () => {
      // First call: 500 error
      mockFetch.mockResolvedValueOnce(new Response('', { status: 500, statusText: 'Internal Server Error' }));
      // Second call: success
      mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));

      const responsePromise = handler.fetchWithRetry('/api/test');
      
      // Advance timers to process retry delay
      await vi.advanceTimersByTimeAsync(200);

      const response = await responsePromise;
      expect(response.status).toBe(200);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('exhausts retries and throws on persistent errors', async () => {
      // All calls fail with 500
      mockFetch.mockResolvedValue(new Response('', { status: 500, statusText: 'Internal Server Error' }));

      const responsePromise = handler.fetchWithRetry('/api/test');
      
      // Attach rejection handler immediately to prevent unhandled rejection
      const errorPromise = responsePromise.catch(e => e);
      
      // Advance through all retry delays
      await vi.advanceTimersByTimeAsync(10000);

      const error = await errorPromise;
      expect(error).toBeInstanceOf(Error);
      expect(error.message).toContain('HTTP 500');
      expect(mockFetch).toHaveBeenCalledTimes(3); // initial + 2 retries
    });

    it('does not retry non-retryable errors (401)', async () => {
      mockFetch.mockResolvedValue(new Response('', { status: 401, statusText: 'Unauthorized' }));

      await expect(
        handler.fetchWithRetry('/api/test')
      ).rejects.toThrow('HTTP 401');
      
      expect(mockFetch).toHaveBeenCalledTimes(1); // No retries
    });

    it('does not retry client errors (404)', async () => {
      mockFetch.mockResolvedValue(new Response('', { status: 404, statusText: 'Not Found' }));

      await expect(
        handler.fetchWithRetry('/api/test')
      ).rejects.toThrow('HTTP 404');
      
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('retries on network errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Failed to fetch'));
      mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));

      const responsePromise = handler.fetchWithRetry('/api/test');
      await vi.advanceTimersByTimeAsync(200);

      const response = await responsePromise;
      expect(response.status).toBe(200);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('calls onError callback when all retries fail', async () => {
      const onError = vi.fn();
      const handlerWithCallback = new NetworkErrorHandler({
        retry: { maxRetries: 1, initialDelay: 50, maxDelay: 100, backoffMultiplier: 2, jitterFactor: 0, retryableCategories: ['server-error'] },
        onError,
      });

      mockFetch.mockResolvedValue(new Response('', { status: 500, statusText: 'Error' }));

      const promise = handlerWithCallback.fetchWithRetry('/api/test');
      
      // Attach rejection handler immediately to prevent unhandled rejection
      const errorPromise = promise.catch(e => e);
      
      await vi.advanceTimersByTimeAsync(5000);

      const error = await errorPromise;
      expect(error).toBeInstanceOf(Error);
      expect(error.message).toContain('HTTP 500');
      expect(onError).toHaveBeenCalled();
      expect(onError.mock.calls[0]![0].category).toBe('server-error');
    });

    it('calls onRetry callback on each retry attempt', async () => {
      const onRetry = vi.fn();
      const handlerWithCallback = new NetworkErrorHandler({
        retry: { maxRetries: 2, initialDelay: 50, maxDelay: 1000, backoffMultiplier: 2, jitterFactor: 0, retryableCategories: ['server-error'] },
        onRetry,
      });

      mockFetch.mockResolvedValueOnce(new Response('', { status: 500, statusText: 'Error' }));
      mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));

      const promise = handlerWithCallback.fetchWithRetry('/api/test');
      await vi.advanceTimersByTimeAsync(5000);

      await promise;
      expect(onRetry).toHaveBeenCalledTimes(1);
    });

    it('calls onAuthExpired when auth error occurs', async () => {
      const onAuthExpired = vi.fn();
      const handlerWithCallback = new NetworkErrorHandler({
        retry: { maxRetries: 0, initialDelay: 50, maxDelay: 100, backoffMultiplier: 2, jitterFactor: 0, retryableCategories: ['server-error'] },
        onAuthExpired,
      });

      mockFetch.mockResolvedValueOnce(new Response('', { status: 401, statusText: 'Unauthorized' }));

      await expect(handlerWithCallback.fetchWithRetry('/api/test')).rejects.toThrow();
      expect(onAuthExpired).toHaveBeenCalled();
    });

    it('calls onRecovery callback after successful retry', async () => {
      const onRecovery = vi.fn();
      const handlerWithCallback = new NetworkErrorHandler({
        retry: { maxRetries: 2, initialDelay: 50, maxDelay: 1000, backoffMultiplier: 2, jitterFactor: 0, retryableCategories: ['server-error'] },
        onRecovery,
      });

      mockFetch.mockResolvedValueOnce(new Response('', { status: 500, statusText: 'Error' }));
      mockFetch.mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));

      const promise = handlerWithCallback.fetchWithRetry('/api/test');
      await vi.advanceTimersByTimeAsync(5000);

      await promise;
      expect(onRecovery).toHaveBeenCalled();
    });

    it('respects custom retry config', async () => {
      mockFetch.mockResolvedValue(new Response('', { status: 500, statusText: 'Error' }));

      const promise = handler.fetchWithRetry('/api/test', {}, { maxRetries: 0 });
      
      await expect(promise).rejects.toThrow();
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('cancelAllRetries', () => {
    it('aborts pending retries', () => {
      // Start a request (but don't await it)
      handler.fetchWithRetry('/api/test').catch(() => {});
      
      // Cancel should not throw
      handler.cancelAllRetries();
    });
  });

  describe('error history', () => {
    it('records errors in history', async () => {
      mockFetch.mockResolvedValue(new Response('', { status: 404, statusText: 'Not Found' }));

      try {
        await handler.fetchWithRetry('/api/test');
      } catch {}

      const history = handler.getErrorHistory();
      expect(history.length).toBe(1);
      expect(history[0]!.category).toBe('client-error');
    });

    it('clears error history', async () => {
      mockFetch.mockResolvedValue(new Response('', { status: 404, statusText: 'Not Found' }));

      try {
        await handler.fetchWithRetry('/api/test');
      } catch {}

      handler.clearErrorHistory();
      expect(handler.getErrorHistory()).toHaveLength(0);
    });
  });

  describe('getOnlineStatus', () => {
    it('returns current online status', () => {
      expect(handler.getOnlineStatus()).toBe(true);
    });
  });
});
