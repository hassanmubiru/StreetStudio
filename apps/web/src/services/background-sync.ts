/**
 * Background Sync Service
 *
 * Queues failed or offline operations and retries them when connectivity returns.
 * Provides reliable offline-to-online transition with conflict detection and
 * configurable retry policies.
 *
 * Requirements: 12.3, 12.6
 */

import { logger } from '../app/client-logger.js';

export type SyncOperationType = 'create' | 'update' | 'delete' | 'action';

export interface SyncOperation {
  id: string;
  type: SyncOperationType;
  /** Resource type (e.g., 'comment', 'reaction', 'video') */
  resource: string;
  /** Endpoint to call */
  endpoint: string;
  /** HTTP method */
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  /** Request body payload */
  payload?: unknown;
  /** Additional request headers */
  headers?: Record<string, string>;
  /** Timestamp when the operation was queued */
  createdAt: number;
  /** Number of retry attempts so far */
  attempts: number;
  /** Last error message */
  lastError?: string;
  /** Priority: lower number = higher priority */
  priority: number;
  /** Maximum number of retries before giving up */
  maxRetries: number;
  /** Metadata for UI display */
  description?: string;
}

export type SyncStatus = 'idle' | 'syncing' | 'offline' | 'error';

export interface SyncResult {
  operationId: string;
  success: boolean;
  error?: string;
  response?: unknown;
}

export type SyncEventListener = (event: SyncEvent) => void;

export interface SyncEvent {
  type: 'queued' | 'started' | 'success' | 'failed' | 'exhausted' | 'online' | 'offline';
  operation?: SyncOperation;
  result?: SyncResult;
  queueSize: number;
}

export interface BackgroundSyncConfig {
  /** Storage key for persisting the queue */
  storageKey: string;
  /** Maximum number of operations in the queue */
  maxQueueSize: number;
  /** Default max retries per operation */
  defaultMaxRetries: number;
  /** Base delay between retries in ms */
  retryBaseDelay: number;
  /** Maximum delay between retries in ms */
  retryMaxDelay: number;
  /** Number of concurrent operations to process */
  concurrency: number;
  /** Whether to automatically start syncing when online */
  autoSync: boolean;
  /** Function to execute operations (defaults to fetch) */
  executor?: (operation: SyncOperation) => Promise<unknown>;
}

const DEFAULT_CONFIG: BackgroundSyncConfig = {
  storageKey: 'streetstudio_sync_queue',
  maxQueueSize: 200,
  defaultMaxRetries: 5,
  retryBaseDelay: 2000,
  retryMaxDelay: 60000,
  concurrency: 3,
  autoSync: true,
};

export class BackgroundSyncManager {
  private queue: SyncOperation[] = [];
  private config: BackgroundSyncConfig;
  private status: SyncStatus = 'idle';
  private isOnline = navigator.onLine;
  private isSyncing = false;
  private listeners = new Set<SyncEventListener>();
  private syncTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(config: Partial<BackgroundSyncConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.loadQueue();
    this.setupConnectivityListeners();

    if (this.isOnline && this.queue.length > 0 && this.config.autoSync) {
      this.scheduleSync(0);
    }
  }

  /**
   * Add an operation to the sync queue
   */
  public enqueue(
    operation: Omit<SyncOperation, 'id' | 'createdAt' | 'attempts' | 'maxRetries' | 'priority'> & {
      priority?: number;
      maxRetries?: number;
    }
  ): string {
    if (this.queue.length >= this.config.maxQueueSize) {
      // Remove oldest low-priority completed operations to make room
      this.pruneQueue();

      if (this.queue.length >= this.config.maxQueueSize) {
        logger.warn('Sync queue is full, dropping operation', {
          endpoint: operation.endpoint,
          queueSize: this.queue.length,
        });
        throw new Error('Sync queue is full');
      }
    }

    const syncOp: SyncOperation = {
      id: crypto.randomUUID(),
      createdAt: Date.now(),
      attempts: 0,
      priority: operation.priority ?? 5,
      maxRetries: operation.maxRetries ?? this.config.defaultMaxRetries,
      ...operation,
    };

    this.queue.push(syncOp);
    this.sortQueue();
    this.persistQueue();

    this.emit({
      type: 'queued',
      operation: syncOp,
      queueSize: this.queue.length,
    });

    logger.debug('Operation queued for sync', {
      id: syncOp.id,
      resource: syncOp.resource,
      endpoint: syncOp.endpoint,
      queueSize: this.queue.length,
    });

    // Try to sync immediately if online
    if (this.isOnline && this.config.autoSync && !this.isSyncing) {
      this.scheduleSync(100);
    }

    return syncOp.id;
  }

  /**
   * Process the sync queue
   */
  public async processQueue(): Promise<SyncResult[]> {
    if (this.isSyncing) {
      logger.debug('Sync already in progress');
      return [];
    }

    if (!this.isOnline) {
      this.status = 'offline';
      logger.debug('Cannot sync - offline');
      return [];
    }

    if (this.queue.length === 0) {
      this.status = 'idle';
      return [];
    }

    this.isSyncing = true;
    this.status = 'syncing';
    const results: SyncResult[] = [];

    try {
      // Take a snapshot of operations to process in this pass
      const operationsToProcess = [...this.queue];

      // Process in batches respecting concurrency
      for (let offset = 0; offset < operationsToProcess.length && this.isOnline; offset += this.config.concurrency) {
        const batch = operationsToProcess.slice(offset, offset + this.config.concurrency);
        const batchResults = await Promise.allSettled(
          batch.map((op) => this.executeOperation(op))
        );

        for (let i = 0; i < batchResults.length; i++) {
          const result = batchResults[i];
          const operation = batch[i];

          if (!result || !operation) continue;

          if (result.status === 'fulfilled') {
            results.push(result.value);
            if (result.value.success) {
              this.removeFromQueue(operation.id);
            }
          } else {
            results.push({
              operationId: operation.id,
              success: false,
              error: result.reason?.message ?? 'Unknown error',
            });
          }
        }
      }
    } finally {
      this.isSyncing = false;
      this.status = this.queue.length > 0 ? 'error' : 'idle';
      this.persistQueue();
    }

    return results;
  }

  /**
   * Get the current sync status
   */
  public getStatus(): SyncStatus {
    return this.status;
  }

  /**
   * Get the current queue contents
   */
  public getQueue(): ReadonlyArray<SyncOperation> {
    return [...this.queue];
  }

  /**
   * Get queue size
   */
  public getQueueSize(): number {
    return this.queue.length;
  }

  /**
   * Remove a specific operation from the queue
   */
  public cancel(operationId: string): boolean {
    const index = this.queue.findIndex((op) => op.id === operationId);
    if (index === -1) return false;

    this.queue.splice(index, 1);
    this.persistQueue();
    logger.debug('Operation cancelled', { operationId });
    return true;
  }

  /**
   * Clear the entire queue
   */
  public clearQueue(): void {
    this.queue = [];
    this.persistQueue();
    this.status = 'idle';
    logger.info('Sync queue cleared');
  }

  /**
   * Subscribe to sync events
   */
  public onEvent(listener: SyncEventListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Check if online
   */
  public getIsOnline(): boolean {
    return this.isOnline;
  }

  /**
   * Retry a specific failed operation immediately
   */
  public async retry(operationId: string): Promise<SyncResult | null> {
    const operation = this.queue.find((op) => op.id === operationId);
    if (!operation) return null;

    if (!this.isOnline) {
      return { operationId, success: false, error: 'Offline' };
    }

    return this.executeOperation(operation);
  }

  /**
   * Destroy the manager and clean up timers
   */
  public destroy(): void {
    if (this.syncTimer) {
      clearTimeout(this.syncTimer);
      this.syncTimer = null;
    }
    window.removeEventListener('online', this.handleOnline);
    window.removeEventListener('offline', this.handleOffline);
  }

  private async executeOperation(operation: SyncOperation): Promise<SyncResult> {
    operation.attempts++;

    this.emit({
      type: 'started',
      operation,
      queueSize: this.queue.length,
    });

    try {
      let response: unknown;

      if (this.config.executor) {
        response = await this.config.executor(operation);
      } else {
        response = await this.defaultExecutor(operation);
      }

      const result: SyncResult = {
        operationId: operation.id,
        success: true,
        response,
      };

      this.emit({
        type: 'success',
        operation,
        result,
        queueSize: this.queue.length - 1,
      });

      logger.debug('Sync operation succeeded', {
        id: operation.id,
        resource: operation.resource,
        attempts: operation.attempts,
      });

      return result;
    } catch (error) {
      const errorMessage = (error as Error).message;
      operation.lastError = errorMessage;

      if (operation.attempts >= operation.maxRetries) {
        // Exhausted all retries
        this.emit({
          type: 'exhausted',
          operation,
          result: { operationId: operation.id, success: false, error: errorMessage },
          queueSize: this.queue.length,
        });

        this.removeFromQueue(operation.id);
        logger.warn('Sync operation exhausted retries', {
          id: operation.id,
          resource: operation.resource,
          attempts: operation.attempts,
          error: errorMessage,
        });
      } else {
        this.emit({
          type: 'failed',
          operation,
          result: { operationId: operation.id, success: false, error: errorMessage },
          queueSize: this.queue.length,
        });

        // Schedule retry with exponential backoff
        const delay = Math.min(
          this.config.retryBaseDelay * Math.pow(2, operation.attempts - 1),
          this.config.retryMaxDelay
        );
        this.scheduleSync(delay);

        logger.debug('Sync operation failed, will retry', {
          id: operation.id,
          attempts: operation.attempts,
          nextRetryIn: delay,
          error: errorMessage,
        });
      }

      this.persistQueue();

      return {
        operationId: operation.id,
        success: false,
        error: errorMessage,
      };
    }
  }

  private async defaultExecutor(operation: SyncOperation): Promise<unknown> {
    const response = await fetch(operation.endpoint, {
      method: operation.method,
      headers: {
        'Content-Type': 'application/json',
        ...operation.headers,
      },
      body: operation.payload ? JSON.stringify(operation.payload) : undefined,
    });

    if (!response.ok) {
      const isRetryable = response.status >= 500 || response.status === 429;
      const error = new Error(
        `HTTP ${response.status}: ${response.statusText}`
      ) as Error & { retryable: boolean };
      error.retryable = isRetryable;

      // Non-retryable errors (4xx) should stop retries
      if (!isRetryable && response.status >= 400) {
        // Set attempts to max to stop retrying
        const op = this.queue.find((o) => o.id === operation.id);
        if (op) op.maxRetries = op.attempts;
      }

      throw error;
    }

    const contentType = response.headers.get('content-type') ?? '';
    if (contentType.includes('application/json')) {
      return response.json();
    }
    return response.text();
  }

  private removeFromQueue(operationId: string): void {
    this.queue = this.queue.filter((op) => op.id !== operationId);
  }

  private sortQueue(): void {
    this.queue.sort((a, b) => {
      // Higher priority (lower number) first
      if (a.priority !== b.priority) return a.priority - b.priority;
      // Then oldest first
      return a.createdAt - b.createdAt;
    });
  }

  private pruneQueue(): void {
    // Remove operations that have exhausted retries
    this.queue = this.queue.filter((op) => op.attempts < op.maxRetries);
  }

  private scheduleSync(delay: number): void {
    if (this.syncTimer) {
      clearTimeout(this.syncTimer);
    }
    this.syncTimer = setTimeout(() => {
      this.syncTimer = null;
      this.processQueue().catch((error) => {
        logger.error('Queue processing failed', {
          error: (error as Error).message,
        });
      });
    }, delay);
  }

  private persistQueue(): void {
    try {
      localStorage.setItem(this.config.storageKey, JSON.stringify(this.queue));
    } catch (error) {
      logger.warn('Failed to persist sync queue', {
        error: (error as Error).message,
      });
    }
  }

  private loadQueue(): void {
    try {
      const stored = localStorage.getItem(this.config.storageKey);
      if (stored) {
        this.queue = JSON.parse(stored);
        this.sortQueue();
        logger.debug('Sync queue loaded', { size: this.queue.length });
      }
    } catch (error) {
      logger.warn('Failed to load sync queue', {
        error: (error as Error).message,
      });
      this.queue = [];
    }
  }

  private setupConnectivityListeners(): void {
    this.handleOnline = this.handleOnline.bind(this);
    this.handleOffline = this.handleOffline.bind(this);
    window.addEventListener('online', this.handleOnline);
    window.addEventListener('offline', this.handleOffline);
  }

  private handleOnline(): void {
    this.isOnline = true;
    this.status = this.queue.length > 0 ? 'syncing' : 'idle';

    this.emit({
      type: 'online',
      queueSize: this.queue.length,
    });

    logger.info('Network online, processing sync queue', {
      queueSize: this.queue.length,
    });

    if (this.queue.length > 0 && this.config.autoSync) {
      this.scheduleSync(500);
    }
  }

  private handleOffline(): void {
    this.isOnline = false;
    this.status = 'offline';

    this.emit({
      type: 'offline',
      queueSize: this.queue.length,
    });

    logger.info('Network offline, sync paused');
  }

  private emit(event: SyncEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (error) {
        logger.error('Sync event listener error', {
          eventType: event.type,
          error: (error as Error).message,
        });
      }
    }
  }
}

// Singleton instance
let globalSyncManager: BackgroundSyncManager | null = null;

export function getBackgroundSyncManager(): BackgroundSyncManager {
  if (!globalSyncManager) {
    globalSyncManager = new BackgroundSyncManager();
  }
  return globalSyncManager;
}

export function initializeBackgroundSync(
  config: Partial<BackgroundSyncConfig> = {}
): BackgroundSyncManager {
  if (globalSyncManager) {
    globalSyncManager.destroy();
  }
  globalSyncManager = new BackgroundSyncManager(config);
  return globalSyncManager;
}
