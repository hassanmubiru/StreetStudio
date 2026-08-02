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
import { AppError } from '@streetstudio/shared';
import type { HttpRequest } from '@streetstudio/sdk';

// ── Module-level mocks (must be hoisted before any imports of the tested module) ──

vi.mock('../app/error-handler.js', () => ({
  handleError: vi.fn(),
  getDegradationManager: vi.fn(() => ({
    handleFeatureFailure: vi.fn(),
  })),
}));

// Now import the module under test — it will pick up the mocked error-handler.
import {
  ResilientHttpTransport,
  adaptSdkError,
  createResilientTransport,
} from './sdk-transport.js';
import { handleError, getDegradationManager } from '../app/error-handler.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeRequest(overrides: Partial<HttpRequest> = {}): HttpRequest {
  return {
    method: 'GET',
    url: 'http://localhost/api/test',
    headers: { Accept: 'application/json' },
    ...overrides,
  };
}

function makeOkResponse(status: number, body = ''): Response {
  return {
    status,
    text: async () => body,
  } as unknown as Response;
}

// ── ResilientHttpTransport: timeout ───────────────────────────────────────────

describe('ResilientHttpTransport – timeout', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('throws a clear timeout error when the fetch does not resolve within timeoutMs', async () => {
    // A fetch that resolves only after a long delay, simulating a hanging network call.
    // We give the transport a very short timeoutMs so the AbortController fires first.
    const hangingFetch = vi.fn(
      (_url: string, init: { signal?: AbortSignal }) =>
        new Promise<Response>((_resolve, reject) => {
          // Reject when the signal aborts.
          init.signal?.addEventListener('abort', () => {
            const err = new Error('The operation was aborted.');
            err.name = 'AbortError';
            reject(err);
          });
        }),
    );

    class TestTransport extends ResilientHttpTransport {
      protected override _getFetch() {
        return hangingFetch as unknown as typeof globalThis.fetch;
      }
    }

    // timeoutMs=50 will fire the AbortController after 50ms in real time.
    const transport = new TestTransport({ timeoutMs: 50, maxRetries: 0 });
    await expect(transport.send(makeRequest())).rejects.toThrow(/timed out/i);
  }, 3_000);
});

// ── ResilientHttpTransport: retry with exponential backoff ────────────────────

describe('ResilientHttpTransport – retry/backoff', () => {
  beforeEach(() => {
    // Stub navigator.onLine to be online.
    vi.spyOn(globalThis, 'navigator', 'get').mockReturnValue({
      onLine: true,
    } as Navigator);
  });

  afterEach(() => {
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

    // Use very short retry delays so the test doesn't take seconds.
    const transport = new TestTransport({
      timeoutMs: 5_000,
      maxRetries: 2,
      retryDelayMs: 5, // 5ms, 10ms — negligible
    });

    const result = await transport.send(makeRequest());

    expect(result.status).toBe(200);
    // fetch should have been called 3 times: initial + 2 retries.
    expect(mockFetch).toHaveBeenCalledTimes(3);
  }, 3_000);

  it('applies exponential backoff delays between retry attempts', async () => {
    // Record delay values passed to setTimeout by wrapping it.
    const delaysSeen: number[] = [];
    const originalSetTimeout = globalThis.setTimeout;

    // Spy on the global setTimeout to record delays *without* breaking the timer behavior.
    vi.spyOn(globalThis, 'setTimeout').mockImplementation(
      (fn: TimerHandler, ms?: number, ...args: unknown[]) => {
        if (ms !== undefined && ms > 0) {
          delaysSeen.push(ms);
        }
        return originalSetTimeout(fn as TimerHandler, ms, ...args) as ReturnType<typeof setTimeout>;
      },
    );

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

    // retryDelayMs=100; backoff: 100ms, 200ms
    const transport = new TestTransport({
      timeoutMs: 10_000, // generous to avoid timeout interference
      maxRetries: 2,
      retryDelayMs: 100,
    });

    await transport.send(makeRequest());

    // Filter out the AbortController timeout (10_000ms) and any timers from
    // the test setup, keeping only the retry delays (100ms and 200ms).
    const retryDelays = delaysSeen.filter(d => d >= 100 && d <= 300);
    expect(retryDelays).toEqual([100, 200]);
  }, 3_000);
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
  beforeEach(() => {
    vi.mocked(handleError).mockClear();
    // Ensure getDegradationManager returns a fresh mock each test.
    vi.mocked(getDegradationManager).mockReturnValue({
      handleFeatureFailure: vi.fn(),
    } as unknown as ReturnType<typeof getDegradationManager>);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('maps AppError with AUTHENTICATION_FAILED to the "authentication" category via handleError', () => {
    const error = new AppError('AUTHENTICATION_FAILED');
    adaptSdkError(error, '/api/auth/login', 'POST');

    expect(handleError).toHaveBeenCalledOnce();
    const [passedError, category] = vi.mocked(handleError).mock.calls[0] as [Error, string, Record<string, unknown>];
    expect(passedError).toBe(error);
    expect(category).toBe('authentication');
  });

  it('maps AppError with AUTHENTICATION_REQUIRED to the "authentication" category', () => {
    const error = new AppError('AUTHENTICATION_REQUIRED');
    adaptSdkError(error, '/api/auth/me', 'GET');

    const [, category] = vi.mocked(handleError).mock.calls[0] as [Error, string];
    expect(category).toBe('authentication');
  });

  it('maps AppError with RATE_LIMITED to the "api" category', () => {
    const error = new AppError('RATE_LIMITED');
    adaptSdkError(error, '/api/videos', 'GET');

    expect(handleError).toHaveBeenCalledOnce();
    const [, category] = vi.mocked(handleError).mock.calls[0] as [Error, string];
    expect(category).toBe('api');
  });

  it('maps a 5xx AppError to the "api" category', () => {
    const error = new AppError('CAPABILITY_UNAVAILABLE'); // status 503
    adaptSdkError(error, '/api/videos', 'GET');

    const [, category] = vi.mocked(handleError).mock.calls[0] as [Error, string];
    expect(category).toBe('api');
  });

  it('maps a plain offline error to the "network" category', () => {
    const error = new Error('Network request failed: device is offline');
    adaptSdkError(error, '/api/videos', 'GET');

    expect(handleError).toHaveBeenCalledOnce();
    const [, category] = vi.mocked(handleError).mock.calls[0] as [Error, string];
    expect(category).toBe('network');
  });

  it('extracts the video-player feature from a /videos endpoint and calls handleFeatureFailure', () => {
    const degradation = { handleFeatureFailure: vi.fn() };
    vi.mocked(getDegradationManager).mockReturnValue(degradation as unknown as ReturnType<typeof getDegradationManager>);

    const error = new AppError('CAPABILITY_UNAVAILABLE');
    adaptSdkError(error, '/api/videos/abc123', 'GET');

    expect(degradation.handleFeatureFailure).toHaveBeenCalledWith('video-player', error);
  });
});

// ── createResilientTransport factory ─────────────────────────────────────────

describe('createResilientTransport', () => {
  it('returns a ResilientHttpTransport instance', () => {
    const transport = createResilientTransport();
    expect(transport).toBeInstanceOf(ResilientHttpTransport);
  });
});
