/**
 * Composable HTTP transport for the StreetStudio SDK.
 *
 * Wraps the SDK's fetch-based transport with three cross-cutting concerns that
 * the hand-rolled `ApiClient` (services/api.ts) used to provide:
 *
 *  - **Timeout** — aborts the underlying fetch after `timeoutMs`.
 *  - **Retry with exponential backoff** — retries on retryable HTTP status
 *    codes and network errors, doubling the delay each attempt.
 *  - **Offline awareness** — checks `navigator.onLine` before each attempt
 *    and fails fast when offline.
 *
 * In addition, `adaptSdkError` maps `AppError` (the SDK's shared taxonomy)
 * into the existing `handleError` / `getDegradationManager` calls so error
 * reporting and graceful degradation are retained without the bespoke client.
 */

import type { HttpTransport, HttpRequest, HttpResponse, FetchLike } from '@streetstudio/sdk';
import { AppError } from '@streetstudio/shared';
import { handleError, getDegradationManager } from '../app/error-handler.js';

/* --------------------------------------------------------------------------
 * Internal helpers
 * ------------------------------------------------------------------------ */

/** Retryable HTTP status codes (mirrors ApiClient.isRetryableStatus). */
const RETRYABLE_STATUS_CODES = new Set([408, 429, 502, 503, 504]);

/** Maximum retry delay cap in milliseconds. */
const MAX_RETRY_DELAY_MS = 10_000;

function clampDelay(ms: number): number {
  return Math.min(ms, MAX_RETRY_DELAY_MS);
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** Extract a feature name from a URL path, mirroring ApiClient.getFeatureFromEndpoint. */
function getFeatureFromUrl(url: string): string {
  try {
    // Extract the pathname from either a relative or absolute URL.
    // For relative URLs (e.g. "/api/videos/123") just use the string directly.
    let pathname: string;
    try {
      pathname = new URL(url).pathname;
    } catch {
      pathname = (url.split('?')[0]) ?? url;
    }
    const parts = pathname.split('/').filter(Boolean);
    if (parts.includes('videos')) return 'video-player';
    if (parts.includes('comments')) return 'realtime-collaboration';
    if (parts.includes('uploads')) return 'chunked-upload';
    if (parts.includes('editor')) return 'timeline-editor';
    return parts[0] ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

/* --------------------------------------------------------------------------
 * ResilientHttpTransport
 * ------------------------------------------------------------------------ */

export interface ResilientHttpTransportOptions {
  /** Request timeout in milliseconds. Defaults to 10 000. */
  timeoutMs?: number;
  /** Maximum number of retry attempts (not counting the first try). Defaults to 2. */
  maxRetries?: number;
  /** Initial retry delay in milliseconds. Doubled each attempt, capped at 10 s. Defaults to 1 000. */
  retryDelayMs?: number;
}

/**
 * An {@link HttpTransport} that wraps `globalThis.fetch` directly (rather than
 * going through the SDK's `fetchTransport`) so it can inject an `AbortSignal`
 * for timeout control — the SDK's `HttpRequest` interface has no `signal` field.
 *
 * Cross-cutting behaviors added on top of the bare fetch:
 * - Timeout via `AbortController`.
 * - Retry on retryable status codes / network errors with exponential backoff.
 * - Offline rejection via `navigator.onLine`.
 */
export class ResilientHttpTransport implements HttpTransport {
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly retryDelayMs: number;

  constructor(options: ResilientHttpTransportOptions = {}) {
    this.timeoutMs = options.timeoutMs ?? 10_000;
    this.maxRetries = options.maxRetries ?? 2;
    this.retryDelayMs = options.retryDelayMs ?? 1_000;
  }

  async send(request: HttpRequest): Promise<HttpResponse> {
    let lastError: unknown;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      // Offline check before each attempt (do not count as a retry).
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        throw new Error('Network request failed: device is offline');
      }

      const abortController = new AbortController();
      const timeoutHandle = setTimeout(
        () => abortController.abort(),
        this.timeoutMs,
      );

      try {
        const fetchLike = this._getFetch();
        const init: Parameters<FetchLike>[1] & { signal: AbortSignal } = {
          method: request.method,
          headers: { ...request.headers },
          signal: abortController.signal,
        };
        if (request.body !== undefined) {
          init.body = request.body;
        }

        const res = await (fetchLike as (url: string, init: typeof init) => Promise<Response>)(
          request.url,
          init,
        );

        clearTimeout(timeoutHandle);

        const body = await res.text();
        const response: HttpResponse = { status: res.status, body };

        // Retry on retryable status codes.
        if (RETRYABLE_STATUS_CODES.has(res.status) && attempt < this.maxRetries) {
          lastError = new Error(`HTTP ${res.status}`);
          await delay(clampDelay(this.retryDelayMs * Math.pow(2, attempt)));
          continue;
        }

        return response;
      } catch (err) {
        clearTimeout(timeoutHandle);

        // AbortError means the timeout fired — surface a clear message.
        if (err instanceof Error && err.name === 'AbortError') {
          throw new Error(`Request timed out after ${this.timeoutMs}ms`);
        }

        lastError = err;

        // Network errors are retryable.
        if (attempt < this.maxRetries) {
          await delay(clampDelay(this.retryDelayMs * Math.pow(2, attempt)));
          continue;
        }
      }
    }

    // All attempts exhausted.
    throw lastError instanceof Error
      ? lastError
      : new Error('Network request failed after retries');
  }

  /**
   * Resolve the global fetch. Extracted so tests can override `globalThis.fetch`.
   * @internal
   */
  protected _getFetch(): typeof globalThis.fetch {
    const f = (globalThis as { fetch?: typeof globalThis.fetch }).fetch;
    if (typeof f !== 'function') {
      throw new Error(
        'ResilientHttpTransport: no global fetch is available and no transport was provided.',
      );
    }
    return f;
  }
}

/* --------------------------------------------------------------------------
 * adaptSdkError
 * ------------------------------------------------------------------------ */

/**
 * Adapt an error thrown by the SDK into the existing `handleError` /
 * `getDegradationManager` calls so error reporting and graceful degradation
 * are preserved without the bespoke `ApiClient`.
 *
 * @param error    The value thrown by the SDK (may be any type).
 * @param endpoint The URL or endpoint path (used to extract the feature name).
 * @param method   The HTTP method string (for context).
 */
export function adaptSdkError(error: unknown, endpoint: string, method: string): void {
  const feature = getFeatureFromUrl(endpoint);

  if (error instanceof AppError) {
    // Map the SDK's AppError code to an error-handler category.
    let category: 'authentication' | 'api' | 'network';

    switch (error.code) {
      case 'AUTHENTICATION_FAILED':
      case 'AUTHENTICATION_REQUIRED':
        // Also treat SESSION_EXPIRED as authentication if it ever becomes a code.
        category = 'authentication';
        break;
      case 'RATE_LIMITED':
      case 'SHARE_LINK_LOCKED':
        category = 'api';
        break;
      default:
        // 5xx-like capability / upstream errors
        if (error.status >= 500) {
          category = 'api';
        } else if (
          error.message.toLowerCase().includes('network') ||
          error.message.toLowerCase().includes('offline') ||
          error.message.toLowerCase().includes('timeout')
        ) {
          category = 'network';
        } else {
          category = 'api';
        }
    }

    const context: Record<string, unknown> = {
      endpoint,
      method,
      sdkCode: error.code,
      sdkCategory: error.category,
      status: error.status,
      feature,
    };

    // Trigger graceful degradation for the affected feature.
    const degradation = getDegradationManager();
    if (degradation && feature !== 'unknown') {
      degradation.handleFeatureFailure(feature, error);
    }

    handleError(error, category, context);
  } else {
    // Plain / unknown error — treat as network if it looks like a connectivity
    // failure, otherwise general API.
    const msg = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
    const category: 'network' | 'api' =
      msg.includes('offline') || msg.includes('network') || msg.includes('timeout') || msg.includes('fetch')
        ? 'network'
        : 'api';

    const wrappedError = error instanceof Error ? error : new Error(String(error));
    const context: Record<string, unknown> = { endpoint, method, feature };

    const degradation = getDegradationManager();
    if (degradation && feature !== 'unknown') {
      degradation.handleFeatureFailure(feature, wrappedError);
    }

    handleError(wrappedError, category, context);
  }
}

/* --------------------------------------------------------------------------
 * createResilientTransport
 * ------------------------------------------------------------------------ */

/**
 * Factory that returns a {@link ResilientHttpTransport} with default options.
 * Pass the result as `transport:` to `DashboardSession` / `StreetStudioClient`.
 *
 * @example
 * ```ts
 * const session = new DashboardSession({
 *   baseUrl: '/api',
 *   transport: createResilientTransport(),
 * });
 * ```
 */
export function createResilientTransport(
  options?: ResilientHttpTransportOptions,
): ResilientHttpTransport {
  return new ResilientHttpTransport(options);
}
