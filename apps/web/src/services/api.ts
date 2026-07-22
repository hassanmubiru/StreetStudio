/**
 * API Client Service
 * 
 * Provides a centralized API client with comprehensive error handling,
 * retry logic, and graceful degradation for network issues.
 */

import { handleError, getErrorReportingService, getDegradationManager } from '../app/error-handler.js';
import { logger } from '../app/client-logger.js';

export interface ApiError extends Error {
  status?: number;
  code?: string;
  details?: any;
  retryable?: boolean;
}

export interface ApiRequestConfig {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  headers?: Record<string, string>;
  body?: any;
  timeout?: number;
  retries?: number;
  retryDelay?: number;
  skipErrorHandling?: boolean;
}

export interface ApiResponse<T = any> {
  data: T;
  status: number;
  headers: Headers;
  success: boolean;
}

class NetworkMonitor {
  private isOnline = navigator.onLine;
  private listeners: Array<(online: boolean) => void> = [];

  constructor() {
    window.addEventListener('online', () => {
      this.isOnline = true;
      this.notifyListeners(true);
    });

    window.addEventListener('offline', () => {
      this.isOnline = false;
      this.notifyListeners(false);
    });
  }

  public onStatusChange(listener: (online: boolean) => void): void {
    this.listeners.push(listener);
  }

  public isNetworkOnline(): boolean {
    return this.isOnline;
  }

  private notifyListeners(online: boolean): void {
    this.listeners.forEach(listener => listener(online));
  }
}

export class ApiClient {
  private baseUrl: string;
  private defaultHeaders: Record<string, string> = {};
  private authToken: string | null = null;
  private networkMonitor = new NetworkMonitor();
  private pendingRequests = new Map<string, AbortController>();

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/$/, ''); // Remove trailing slash

    // Monitor network status
    this.networkMonitor.onStatusChange((online) => {
      logger.info(`Network status changed: ${online ? 'online' : 'offline'}`);
    });
  }

  /**
   * Set authentication token
   */
  public setAuthToken(token: string | null): void {
    this.authToken = token;
    if (token) {
      this.defaultHeaders['Authorization'] = `Bearer ${token}`;
    } else {
      delete this.defaultHeaders['Authorization'];
    }
  }

  /**
   * Set default headers
   */
  public setDefaultHeaders(headers: Record<string, string>): void {
    this.defaultHeaders = { ...this.defaultHeaders, ...headers };
  }

  /**
   * Make API request with error handling and retry logic
   */
  public async request<T = any>(
    endpoint: string,
    config: ApiRequestConfig = {}
  ): Promise<ApiResponse<T>> {
    const {
      method = 'GET',
      headers = {},
      body,
      timeout = 10000,
      retries = 2,
      retryDelay = 1000,
      skipErrorHandling = false,
    } = config;

    const url = `${this.baseUrl}${endpoint}`;
    const requestId = crypto.randomUUID();

    // Check network connectivity
    if (!this.networkMonitor.isNetworkOnline()) {
      const networkError = new Error('No network connection') as ApiError;
      networkError.retryable = true;
      
      if (!skipErrorHandling) {
        handleError(networkError, 'network', { endpoint, method });
      }
      
      throw networkError;
    }

    let lastError: ApiError;

    for (let attempt = 0; attempt <= retries; attempt++) {
      const abortController = new AbortController();
      this.pendingRequests.set(requestId, abortController);

      try {
        const response = await this.executeRequest<T>(
          url,
          {
            method,
            headers: { ...this.defaultHeaders, ...headers },
            body: body ? JSON.stringify(body) : undefined,
            signal: abortController.signal,
          },
          timeout
        );

        // Remove from pending requests
        this.pendingRequests.delete(requestId);

        // Log successful request
        logger.debug(`API request successful: ${method} ${endpoint}`, {
          status: response.status,
          attempt: attempt + 1,
          duration: Date.now(),
        });

        return response;

      } catch (error) {
        this.pendingRequests.delete(requestId);
        lastError = this.processApiError(error as Error, endpoint, method, attempt + 1);

        // Don't retry if not retryable or last attempt
        if (!lastError.retryable || attempt === retries) {
          break;
        }

        // Wait before retry
        if (attempt < retries) {
          logger.warn(`API request failed, retrying in ${retryDelay}ms: ${method} ${endpoint}`, {
            attempt: attempt + 1,
            error: lastError.message,
          });
          
          await this.delay(retryDelay * Math.pow(2, attempt)); // Exponential backoff
        }
      }
    }

    // Handle final error
    if (!skipErrorHandling) {
      this.handleApiError(lastError, endpoint, method);
    }

    throw lastError;
  }

  /**
   * Execute the actual HTTP request
   */
  private async executeRequest<T>(
    url: string,
    init: RequestInit,
    timeout: number
  ): Promise<ApiResponse<T>> {
    // Setup timeout
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Request timeout after ${timeout}ms`));
      }, timeout);
    });

    try {
      const response = await Promise.race([
        fetch(url, {
          ...init,
          headers: {
            'Content-Type': 'application/json',
            ...init.headers,
          },
        }),
        timeoutPromise,
      ]);

      // Handle different response types
      let data: T;
      const contentType = response.headers.get('content-type') || '';
      
      if (contentType.includes('application/json')) {
        data = await response.json();
      } else if (contentType.includes('text/')) {
        data = await response.text() as unknown as T;
      } else {
        data = await response.blob() as unknown as T;
      }

      // Check if response is successful
      if (!response.ok) {
        const error = new Error(`HTTP ${response.status}: ${response.statusText}`) as ApiError;
        error.status = response.status;
        error.details = data;
        error.retryable = this.isRetryableStatus(response.status);
        throw error;
      }

      return {
        data,
        status: response.status,
        headers: response.headers,
        success: true,
      };

    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        const abortError = new Error('Request was aborted') as ApiError;
        abortError.retryable = false;
        throw abortError;
      }
      throw error;
    }
  }

  /**
   * Process and categorize API errors
   */
  private processApiError(error: Error, endpoint: string, method: string, attempt: number): ApiError {
    const apiError = error as ApiError;

    // Set retryable flag based on error type
    if (!('retryable' in apiError)) {
      if (error.message.includes('timeout')) {
        apiError.retryable = true;
      } else if (error.message.includes('network') || error.message.includes('fetch')) {
        apiError.retryable = true;
      } else if (apiError.status) {
        apiError.retryable = this.isRetryableStatus(apiError.status);
      } else {
        apiError.retryable = false;
      }
    }

    return apiError;
  }

  /**
   * Determine if HTTP status is retryable
   */
  private isRetryableStatus(status: number): boolean {
    return (
      status === 408 || // Request Timeout
      status === 429 || // Too Many Requests
      status === 502 || // Bad Gateway
      status === 503 || // Service Unavailable
      status === 504    // Gateway Timeout
    );
  }

  /**
   * Handle API errors through the error handling system
   */
  private handleApiError(error: ApiError, endpoint: string, method: string): void {
    const context = {
      endpoint,
      method,
      status: error.status,
      retryable: error.retryable,
      feature: this.getFeatureFromEndpoint(endpoint),
    };

    if (error.status === 401) {
      handleError(error, 'authentication', context);
    } else if (error.status && error.status >= 500) {
      handleError(error, 'api', context);
    } else if (error.message.includes('network') || error.message.includes('timeout')) {
      handleError(error, 'network', context);
    } else {
      handleError(error, 'api', context);
    }
  }

  /**
   * Extract feature name from endpoint for graceful degradation
   */
  private getFeatureFromEndpoint(endpoint: string): string {
    const pathParts = endpoint.split('/').filter(Boolean);
    
    if (pathParts.includes('videos')) return 'video-player';
    if (pathParts.includes('comments')) return 'realtime-collaboration';
    if (pathParts.includes('uploads')) return 'chunked-upload';
    if (pathParts.includes('editor')) return 'timeline-editor';
    
    return pathParts[0] || 'unknown';
  }

  /**
   * Utility method for delays
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Convenience methods for common HTTP verbs
   */
  public async get<T = any>(endpoint: string, config: Omit<ApiRequestConfig, 'method'> = {}): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { ...config, method: 'GET' });
  }

  public async post<T = any>(endpoint: string, data: any, config: Omit<ApiRequestConfig, 'method' | 'body'> = {}): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { ...config, method: 'POST', body: data });
  }

  public async put<T = any>(endpoint: string, data: any, config: Omit<ApiRequestConfig, 'method' | 'body'> = {}): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { ...config, method: 'PUT', body: data });
  }

  public async patch<T = any>(endpoint: string, data: any, config: Omit<ApiRequestConfig, 'method' | 'body'> = {}): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { ...config, method: 'PATCH', body: data });
  }

  public async delete<T = any>(endpoint: string, config: Omit<ApiRequestConfig, 'method'> = {}): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { ...config, method: 'DELETE' });
  }

  /**
   * Cancel all pending requests
   */
  public cancelAllRequests(): void {
    this.pendingRequests.forEach((controller, id) => {
      controller.abort();
      logger.debug(`Cancelled API request: ${id}`);
    });
    this.pendingRequests.clear();
  }

  /**
   * Cancel specific request
   */
  public cancelRequest(requestId: string): void {
    const controller = this.pendingRequests.get(requestId);
    if (controller) {
      controller.abort();
      this.pendingRequests.delete(requestId);
      logger.debug(`Cancelled API request: ${requestId}`);
    }
  }

  /**
   * Get network status
   */
  public isOnline(): boolean {
    return this.networkMonitor.isNetworkOnline();
  }
}

// Create and export default API client instance
export const apiClient = new ApiClient('/api');

// Helper function to handle API errors in components
export function withApiErrorHandling<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  feature?: string
): T {
  return (async (...args: any[]) => {
    try {
      return await fn(...args);
    } catch (error) {
      if (feature) {
        const degradationManager = getDegradationManager();
        if (degradationManager && error instanceof Error) {
          degradationManager.handleFeatureFailure(feature, error);
        }
      }
      throw error;
    }
  }) as T;
}