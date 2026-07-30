/**
 * Comprehensive Network Error Handler
 * 
 * Intercepts fetch failures, categorizes errors (timeout, offline, server error,
 * auth expired), and provides automatic retry with configurable exponential backoff
 * for transient errors.
 * 
 * Implements Requirements 13.2 and 13.7.
 */

import { logger } from '../../app/client-logger.js';

export type NetworkErrorCategory =
  | 'timeout'
  | 'offline'
  | 'server-error'
  | 'auth-expired'
  | 'rate-limited'
  | 'client-error'
  | 'cors'
  | 'dns'
  | 'connection-refused'
  | 'unknown';

export interface RetryConfig {
  maxRetries: number;
  initialDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
  jitterFactor: number;
  retryableCategories: NetworkErrorCategory[];
}

export interface NetworkErrorInfo {
  category: NetworkErrorCategory;
  message: string;
  status?: number;
  retryable: boolean;
  userMessage: string;
  suggestedAction: string;
  originalError: Error;
  timestamp: string;
  endpoint?: string;
  attemptsMade: number;
}

export interface NetworkErrorHandlerConfig {
  retry: RetryConfig;
  onError?: (info: NetworkErrorInfo) => void;
  onRetry?: (info: NetworkErrorInfo, attempt: number, delay: number) => void;
  onRecovery?: (info: NetworkErrorInfo) => void;
  onAuthExpired?: () => void;
  onOffline?: () => void;
  onOnline?: () => void;
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialDelay: 1000,
  maxDelay: 30000,
  backoffMultiplier: 2,
  jitterFactor: 0.1,
  retryableCategories: ['timeout', 'offline', 'server-error', 'rate-limited', 'connection-refused'],
};

const DEFAULT_CONFIG: NetworkErrorHandlerConfig = {
  retry: DEFAULT_RETRY_CONFIG,
};

export class NetworkErrorHandler {
  private config: NetworkErrorHandlerConfig;
  private isOnline: boolean = typeof navigator !== 'undefined' ? navigator.onLine : true;
  private pendingRetries: Map<string, AbortController> = new Map();
  private errorHistory: NetworkErrorInfo[] = [];
  private maxHistorySize = 50;

  constructor(config: Partial<NetworkErrorHandlerConfig> = {}) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
      retry: { ...DEFAULT_RETRY_CONFIG, ...config.retry },
    };

    this.setupConnectivityListeners();
  }

  private setupConnectivityListeners(): void {
    if (typeof window === 'undefined') return;

    window.addEventListener('online', () => {
      this.isOnline = true;
      logger.info('Network connectivity restored');
      this.config.onOnline?.();
    });

    window.addEventListener('offline', () => {
      this.isOnline = false;
      logger.warn('Network connectivity lost');
      this.config.onOffline?.();
    });
  }

  /**
   * Categorize a network error based on its characteristics
   */
  public categorizeError(error: Error, status?: number): NetworkErrorCategory {
    const message = error.message.toLowerCase();

    if (!this.isOnline || message.includes('offline') || message.includes('no network')) {
      return 'offline';
    }

    if (message.includes('timeout') || message.includes('timed out') || message.includes('aborted')) {
      return 'timeout';
    }

    if (message.includes('cors') || message.includes('cross-origin')) {
      return 'cors';
    }

    if (message.includes('dns') || message.includes('name not resolved') || message.includes('getaddrinfo')) {
      return 'dns';
    }

    if (message.includes('connection refused') || message.includes('econnrefused')) {
      return 'connection-refused';
    }

    if (status) {
      if (status === 401 || status === 403) {
        return 'auth-expired';
      }
      if (status === 429) {
        return 'rate-limited';
      }
      if (status >= 500) {
        return 'server-error';
      }
      if (status >= 400) {
        return 'client-error';
      }
    }

    if (message.includes('fetch') || message.includes('network')) {
      return 'offline';
    }

    return 'unknown';
  }

  /**
   * Get user-friendly message for a network error category
   */
  public getUserMessage(category: NetworkErrorCategory): string {
    switch (category) {
      case 'timeout':
        return 'The request took too long to complete. Please try again.';
      case 'offline':
        return 'You appear to be offline. Please check your internet connection.';
      case 'server-error':
        return 'Our servers are experiencing issues. Please try again in a moment.';
      case 'auth-expired':
        return 'Your session has expired. Please log in again.';
      case 'rate-limited':
        return 'Too many requests. Please wait a moment before trying again.';
      case 'client-error':
        return 'The request could not be processed. Please verify your input.';
      case 'cors':
        return 'A security restriction prevented this request. Please contact support.';
      case 'dns':
        return 'Unable to reach the server. Please check your connection.';
      case 'connection-refused':
        return 'Unable to connect to the server. The service may be temporarily unavailable.';
      default:
        return 'An unexpected network error occurred. Please try again.';
    }
  }

  /**
   * Get a suggested action for the user
   */
  public getSuggestedAction(category: NetworkErrorCategory): string {
    switch (category) {
      case 'timeout':
        return 'Try again or check if you have a stable connection.';
      case 'offline':
        return 'Connect to the internet and try again.';
      case 'server-error':
        return 'Wait a few moments and retry. If the problem persists, contact support.';
      case 'auth-expired':
        return 'Log in again to continue.';
      case 'rate-limited':
        return 'Wait 30 seconds before trying again.';
      case 'client-error':
        return 'Check your input and try again.';
      case 'cors':
        return 'Contact support for assistance.';
      case 'dns':
        return 'Check your network settings or try again later.';
      case 'connection-refused':
        return 'Try again in a few minutes.';
      default:
        return 'Try refreshing the page or contact support if the issue persists.';
    }
  }

  /**
   * Create a NetworkErrorInfo from an error
   */
  public createErrorInfo(error: Error, status?: number, endpoint?: string, attemptsMade = 1): NetworkErrorInfo {
    const category = this.categorizeError(error, status);

    return {
      category,
      message: error.message,
      status,
      retryable: this.config.retry.retryableCategories.includes(category),
      userMessage: this.getUserMessage(category),
      suggestedAction: this.getSuggestedAction(category),
      originalError: error,
      timestamp: new Date().toISOString(),
      endpoint,
      attemptsMade,
    };
  }

  /**
   * Execute a fetch operation with automatic retry logic
   */
  public async fetchWithRetry<T>(
    url: string,
    options: RequestInit = {},
    retryConfig?: Partial<RetryConfig>
  ): Promise<Response> {
    const config = { ...this.config.retry, ...retryConfig };
    const requestId = crypto.randomUUID();
    const abortController = new AbortController();
    this.pendingRetries.set(requestId, abortController);

    let lastError: Error | undefined;
    let lastStatus: number | undefined;

    for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
      // Check if cancelled
      if (abortController.signal.aborted) {
        throw new Error('Request was cancelled');
      }

      // Check connectivity before attempting
      if (!this.isOnline && attempt > 0) {
        const offlineError = new Error('Device is offline');
        const info = this.createErrorInfo(offlineError, undefined, url, attempt + 1);
        this.recordError(info);
        this.config.onError?.(info);
        throw offlineError;
      }

      try {
        const timeoutMs = options.signal ? undefined : 30000;
        const response = await this.executeWithTimeout(
          fetch(url, {
            ...options,
            signal: abortController.signal,
          }),
          timeoutMs
        );

        // Handle HTTP error responses
        if (!response.ok) {
          lastStatus = response.status;

          const category = this.categorizeError(
            new Error(`HTTP ${response.status}`),
            response.status
          );

          // Don't retry non-retryable errors
          if (!config.retryableCategories.includes(category)) {
            const error = new Error(`HTTP ${response.status}: ${response.statusText}`);
            const info = this.createErrorInfo(error, response.status, url, attempt + 1);
            this.recordError(info);
            this.config.onError?.(info);

            if (category === 'auth-expired') {
              this.config.onAuthExpired?.();
            }

            this.pendingRetries.delete(requestId);
            throw error;
          }

          // Retryable HTTP error
          lastError = new Error(`HTTP ${response.status}: ${response.statusText}`);

          if (attempt < config.maxRetries) {
            const delay = this.calculateDelay(attempt, config);
            const info = this.createErrorInfo(lastError, response.status, url, attempt + 1);
            this.config.onRetry?.(info, attempt + 1, delay);
            logger.warn(`Request failed (attempt ${attempt + 1}/${config.maxRetries + 1}), retrying in ${delay}ms`, {
              url,
              status: response.status,
            });
            await this.sleep(delay);
            continue;
          }
        } else {
          // Success - notify recovery if there were previous failures
          if (attempt > 0) {
            const info = this.createErrorInfo(
              lastError || new Error('recovered'),
              lastStatus,
              url,
              attempt + 1
            );
            this.config.onRecovery?.(info);
          }

          this.pendingRetries.delete(requestId);
          return response;
        }
      } catch (error) {
        if ((error as Error).message === 'Request was cancelled') {
          this.pendingRetries.delete(requestId);
          throw error;
        }

        lastError = error as Error;
        const category = this.categorizeError(lastError, lastStatus);

        if (!config.retryableCategories.includes(category) || attempt >= config.maxRetries) {
          const info = this.createErrorInfo(lastError, lastStatus, url, attempt + 1);
          this.recordError(info);
          this.config.onError?.(info);
          this.pendingRetries.delete(requestId);
          throw lastError;
        }

        const delay = this.calculateDelay(attempt, config);
        const info = this.createErrorInfo(lastError, lastStatus, url, attempt + 1);
        this.config.onRetry?.(info, attempt + 1, delay);

        logger.warn(`Request failed (attempt ${attempt + 1}/${config.maxRetries + 1}), retrying in ${delay}ms`, {
          url,
          error: lastError.message,
        });

        await this.sleep(delay);
      }
    }

    // All retries exhausted
    const finalError = lastError || new Error('Request failed after all retries');
    const info = this.createErrorInfo(finalError, lastStatus, url, config.maxRetries + 1);
    this.recordError(info);
    this.config.onError?.(info);
    this.pendingRetries.delete(requestId);
    throw finalError;
  }

  /**
   * Calculate delay with exponential backoff and jitter
   */
  public calculateDelay(attempt: number, config: RetryConfig = this.config.retry): number {
    const exponentialDelay = config.initialDelay * Math.pow(config.backoffMultiplier, attempt);
    const clampedDelay = Math.min(exponentialDelay, config.maxDelay);

    // Add jitter to prevent thundering herd
    const jitter = clampedDelay * config.jitterFactor * (Math.random() * 2 - 1);
    return Math.max(0, Math.round(clampedDelay + jitter));
  }

  /**
   * Execute a promise with a timeout
   */
  private async executeWithTimeout<T>(promise: Promise<T>, timeoutMs?: number): Promise<T> {
    if (!timeoutMs) return promise;

    return Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error(`Request timed out after ${timeoutMs}ms`)), timeoutMs);
      }),
    ]);
  }

  /**
   * Cancel all pending retries
   */
  public cancelAllRetries(): void {
    for (const [id, controller] of this.pendingRetries) {
      controller.abort();
      this.pendingRetries.delete(id);
    }
  }

  /**
   * Get error history
   */
  public getErrorHistory(): NetworkErrorInfo[] {
    return [...this.errorHistory];
  }

  /**
   * Clear error history
   */
  public clearErrorHistory(): void {
    this.errorHistory = [];
  }

  /**
   * Check if the device is currently online
   */
  public getOnlineStatus(): boolean {
    return this.isOnline;
  }

  private recordError(info: NetworkErrorInfo): void {
    this.errorHistory.push(info);
    if (this.errorHistory.length > this.maxHistorySize) {
      this.errorHistory = this.errorHistory.slice(-this.maxHistorySize);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Singleton instance
let networkErrorHandler: NetworkErrorHandler | null = null;

export function initializeNetworkErrorHandler(config?: Partial<NetworkErrorHandlerConfig>): NetworkErrorHandler {
  networkErrorHandler = new NetworkErrorHandler(config);
  return networkErrorHandler;
}

export function getNetworkErrorHandler(): NetworkErrorHandler {
  if (!networkErrorHandler) {
    networkErrorHandler = new NetworkErrorHandler();
  }
  return networkErrorHandler;
}
