/**
 * Unit tests for sdk-transport.ts
 *
 * Tests cover:
 *  - ResilientHttpTransport: timeout fires and throws
 *  - ResilientHttpTransport: retry on retryable status (503) with exponential backoff
 *  - ResilientHttpTransport: offline rejection
 *  - adaptSdkError: AppError with AUTHENTICATION_FAILED maps to 'authentication' category
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ResilientHttpTransport, adaptSdkError, createResilientTransport } from './sdk-transport.js';
import { AppError } from '@streetstudio/shared';
import type { HttpRequest } from '@streetstudio/sdk';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeRequest(overrides: Partial<HttpRequest> = {}): HttpRequest {
  return {
    method: 'GET',
    url: 'http://localhost/api/test',
    headers: { Accept: 'application/json' },
    ...overrides,
  };
}

/** A mock response factory that plays back an array of response values per call. */
function buildFetchMock(
  responses: Array<() => Promise<Response> | never>,
): jest.Mock {
  let call = 0;
  return vi.fn(async () => {
    const fn = responses[call++];
    if (!fn) throw new Error('Unexpected extra fetch call');
    return fn();
  });
}

function makeOkResponse(status: number, body = ''): Response {
  return {
    status,
    text: async () => body,
  } as unknown as Response;
}

// ── ResilientHttpTransport: timeout ───────────────────────────────────────────

describe('ResilientHttpTransport – timeout', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('throws a clear timeout error when the fetch does not resolve within timeoutMs', async () => {
    // Fetch that never resolves
    const hangingFetch = vi.fn(
      () => new Promise<Response>(() => { /* intentionally never resolves */ }),
    );

    class TestTransport extends ResilientHttpTransport {
      protected override _getFetch() {
        return hangingFetch as unknown as typeof globalThis.fetch;
      }
    }

    const transport = new TestTransport({ timeoutMs: 100, maxRetries: 0 });
    const sendPromise = transport.send(makeRequest());

    // Advance timers past the timeout threshold to trigger the AbortController.
    vi.advanceTimersByTime(200);

    await expect(sendPromise).rejects.toThrow(/timed out/i);
  });
});

// ── ResilientHttpTransport: retry with exponential backoff ────────────────────

describe('ResilientHttpTransport – retry/backoff', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(globalThis, 'navigator', 'get').mockReturnValue({
      onLine: true,
    } as Navigator);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('retries on 503 twice and succeeds on the third attempt', async () => {
    let call = 0;
    const mockFetch = vi.fn(async () => {
      const attempt = call++;
      if (attempt < 2) {
        return makeOkResponse(503, '');
      }
      return makeOkResponse(200, '{"ok":true}');
    });

    class TestTransport extends ResilientHttpTransport {
      protected override _getFetch() {
        return mockFetch as unknown as typeof globalThis.fetch;
      }
    }

    const transport = new TestTransport({
      timeoutMs: 5_000,
      maxRetries: 2,
      retryDelayMs: 1_000,
    });

    const resultPromise = transport.send(makeRequest());

    // Let the first delay (1000ms) elapse.
    await vi.runAllTimersAsync();

    const result = await resultPromise;
    expect(result.status).toBe(200);
    // fetch should have been called 3 times: initial + 2 retries.
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it('applies exponential backoff between retry attempts', async () => {
    const delaysSeen: number[] = [];
    const originalSetTimeout = globalThis.setTimeout;

    // Spy on setTimeout to capture delay values used between retries.
    vi.spyOn(globalThis, 'setTimeout').mockImplementation((fn: TimerHandler, ms?: number) => {
      if (ms !== undefined && ms > 0) {
        delaysSeen.push(ms as number);
      }
      return originalSetTimeout(fn as TimerHandler, 0);
    });

    let call = 0;
    const mockFetch = vi.fn(async () => {
      const attempt = call++;
      if (attempt < 2) return makeOkResponse(503, '');
      return makeOkResponse(200, '');
    });

    class TestTransport extends ResilientHttpTransport {
      protected override _getFetch() {
        return mockFetch as unknown as typeof globalThis.fetch;
      }
    }

    const transport = new TestTransport({
      timeoutMs: 5_000,
      maxRetries: 2,
      retryDelayMs: 1_000,
    });

    await transport.send(makeRequest());

    // We expect: 1000ms for first retry, 2000ms for second retry.
    // Filter only the retry-related delays (> 100ms to exclude timeout timers).
    const retryDelays = delaysSeen.filter(d => d >= 1_000);
    expect(retryDelays).toEqual([1_000, 2_000]);
  });
});

// ── ResilientHttpTransport: offline ───────────────────────────────────────────

describe('ResilientHttpTransport – offline awareness', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('throws immediately when navigator.onLine is false', async () => {
    vi.spyOn(globalThis, 'navigator', 'get').mockReturnValue({
      onLine: false,
    } as Navigator);

    const transport = new ResilientHttpTransport({ maxRetries: 0 });
    await expect(transport.send(makeRequest())).rejects.toThrow(/offline/i);
  });
});

// ── adaptSdkError ─────────────────────────────────────────────────────────────

describe('adaptSdkError', () => {
  let mockHandleError: ReturnType<typeof vi.fn>;
  let mockDegradationManager: { handleFeatureFailure: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    mockHandleError = vi.fn();
    mockDegradationManager = { handleFeatureFailure: vi.fn() };

    // Inject mocks by replacing module-level references via vi.mock.
    // Because we are in the same test file we use vi.doMock with dynamic import.
    vi.doMock('../app/error-handler.js', () => ({
      handleError: mockHandleError,
      getDegradationManager: () => mockDegradationManager,
    }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('maps AppError with code AUTHENTICATION_FAILED to the "authentication" category via handleError', async () => {
    // Re-import the module under test so it picks up the mocked error-handler.
    const { adaptSdkError: adaptFn } = await import('./sdk-transport.js');

    const error = new AppError('AUTHENTICATION_FAILED');
    adaptFn(error, '/api/auth/login', 'POST');

    expect(mockHandleError).toHaveBeenCalledOnce();
    const [passedError, category] = mockHandleError.mock.calls[0] as [Error, string, Record<string, unknown>];
    expect(passedError).toBe(error);
    expect(category).toBe('authentication');
  });

  it('maps AppError with code RATE_LIMITED to the "api" category', async () => {
    const { adaptSdkError: adaptFn } = await import('./sdk-transport.js');

    const error = new AppError('RATE_LIMITED');
    adaptFn(error, '/api/videos', 'GET');

    expect(mockHandleError).toHaveBeenCalledOnce();
    const [, category] = mockHandleError.mock.calls[0] as [Error, string];
    expect(category).toBe('api');
  });

  it('maps a plain network error to the "network" category', async () => {
    const { adaptSdkError: adaptFn } = await import('./sdk-transport.js');

    const error = new Error('Network request failed: device is offline');
    adaptFn(error, '/api/videos', 'GET');

    expect(mockHandleError).toHaveBeenCalledOnce();
    const [, category] = mockHandleError.mock.calls[0] as [Error, string];
    expect(category).toBe('network');
  });

  it('extracts the video-player feature from a /videos endpoint', async () => {
    const { adaptSdkError: adaptFn } = await import('./sdk-transport.js');

    const error = new AppError('CAPABILITY_UNAVAILABLE');
    adaptFn(error, '/api/videos/abc123', 'GET');

    expect(mockDegradationManager.handleFeatureFailure).toHaveBeenCalledWith(
      'video-player',
      error,
    );
  });
});

// ── createResilientTransport factory ─────────────────────────────────────────

describe('createResilientTransport', () => {
  it('returns a ResilientHttpTransport instance', () => {
    const transport = createResilientTransport();
    expect(transport).toBeInstanceOf(ResilientHttpTransport);
  });
});
