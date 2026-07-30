/**
 * Offline Comment Queue
 * 
 * Manages comment composition and queuing when offline, with automatic
 * synchronization when connectivity is restored. Uses IndexedDB for
 * persistent storage and Background Sync API when available.
 * 
 * Requirements: 10.7, 7.10
 */

export interface QueuedComment {
  id: string;
  videoId: string;
  body: string;
  timestampSeconds?: number;
  parentCommentId?: string;
  mentions: string[];
  createdAt: number;
  status: CommentSyncStatus;
  retryCount: number;
  lastAttemptAt?: number;
  error?: string;
}

export type CommentSyncStatus = 'pending' | 'syncing' | 'synced' | 'failed';

export interface CommentQueueCallbacks {
  onCommentQueued?: (comment: QueuedComment) => void;
  onCommentSynced?: (comment: QueuedComment) => void;
  onCommentFailed?: (comment: QueuedComment, error: string) => void;
  onQueueProcessingStart?: () => void;
  onQueueProcessingComplete?: (results: SyncResults) => void;
}

export interface SyncResults {
  total: number;
  synced: number;
  failed: number;
  pending: number;
}

export interface OfflineCommentQueueOptions {
  dbName?: string;
  dbVersion?: number;
  maxRetries?: number;
  retryDelayMs?: number;
  apiBaseUrl?: string;
  getAuthToken?: () => string | null;
  callbacks?: CommentQueueCallbacks;
}

const DEFAULT_OPTIONS: Required<Omit<OfflineCommentQueueOptions, 'callbacks' | 'getAuthToken'>> & {
  callbacks: CommentQueueCallbacks;
  getAuthToken: () => string | null;
} = {
  dbName: 'streetstudio-comment-queue',
  dbVersion: 1,
  maxRetries: 5,
  retryDelayMs: 5000,
  apiBaseUrl: '/api',
  callbacks: {},
  getAuthToken: () => null,
};

const QUEUE_STORE = 'comments';

/**
 * OfflineCommentQueue manages offline comment composition and sync
 */
export class OfflineCommentQueue {
  private options: Required<Omit<OfflineCommentQueueOptions, 'callbacks' | 'getAuthToken'>> & {
    callbacks: CommentQueueCallbacks;
    getAuthToken: () => string | null;
  };
  private db: IDBDatabase | null = null;
  private isInitialized = false;
  private isSyncing = false;
  private syncTimer: ReturnType<typeof setTimeout> | null = null;
  private onlineListener: (() => void) | null = null;
  private swSyncListener: ((event: Event) => void) | null = null;

  constructor(options: OfflineCommentQueueOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Initialize the comment queue
   */
  public async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    if (typeof indexedDB === 'undefined' || !indexedDB) {
      throw new Error('IndexedDB is not available');
    }

    this.db = await this.openDatabase();
    this.isInitialized = true;

    // Listen for online events to trigger sync
    this.onlineListener = () => {
      this.processQueue();
    };
    window.addEventListener('online', this.onlineListener);

    // Listen for service worker sync events
    this.swSyncListener = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (detail?.type === 'COMMENT_SYNCED') {
        this.handleSyncSuccess(detail.payload.id);
      } else if (detail?.type === 'COMMENT_SYNC_FAILED') {
        this.handleSyncFailure(detail.payload.id, 'Server rejected the comment');
      }
    };
    window.addEventListener('sw-sync-event', this.swSyncListener);
  }

  /**
   * Queue a comment for later sync
   */
  public async queueComment(comment: {
    videoId: string;
    body: string;
    timestampSeconds?: number;
    parentCommentId?: string;
    mentions?: string[];
  }): Promise<QueuedComment> {
    await this.ensureInitialized();

    const queuedComment: QueuedComment = {
      id: generateId(),
      videoId: comment.videoId,
      body: comment.body,
      timestampSeconds: comment.timestampSeconds,
      parentCommentId: comment.parentCommentId,
      mentions: comment.mentions || [],
      createdAt: Date.now(),
      status: 'pending',
      retryCount: 0,
    };

    await this.saveComment(queuedComment);
    this.options.callbacks.onCommentQueued?.(queuedComment);

    // Try immediate sync if online
    if (navigator.onLine) {
      this.scheduleSyncAttempt();
    } else {
      // Register background sync if supported
      this.registerBackgroundSync();
    }

    return queuedComment;
  }

  /**
   * Get all queued comments
   */
  public async getQueuedComments(): Promise<QueuedComment[]> {
    await this.ensureInitialized();

    const db = this.getDb();
    const tx = db.transaction(QUEUE_STORE, 'readonly');
    const store = tx.objectStore(QUEUE_STORE);

    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get queued comments for a specific video
   */
  public async getCommentsForVideo(videoId: string): Promise<QueuedComment[]> {
    await this.ensureInitialized();

    const db = this.getDb();
    const tx = db.transaction(QUEUE_STORE, 'readonly');
    const store = tx.objectStore(QUEUE_STORE);
    const index = store.index('videoId');

    return new Promise((resolve, reject) => {
      const request = index.getAll(videoId);
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get pending comment count
   */
  public async getPendingCount(): Promise<number> {
    const comments = await this.getQueuedComments();
    return comments.filter((c) => c.status === 'pending' || c.status === 'syncing').length;
  }

  /**
   * Remove a queued comment
   */
  public async removeComment(id: string): Promise<void> {
    await this.ensureInitialized();

    const db = this.getDb();
    const tx = db.transaction(QUEUE_STORE, 'readwrite');
    const store = tx.objectStore(QUEUE_STORE);

    return new Promise((resolve, reject) => {
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Update a queued comment's body (before sync)
   */
  public async updateComment(id: string, updates: { body?: string; mentions?: string[] }): Promise<QueuedComment | null> {
    await this.ensureInitialized();

    const comment = await this.getCommentById(id);
    if (!comment || comment.status === 'synced') {
      return null;
    }

    if (updates.body !== undefined) {
      comment.body = updates.body;
    }
    if (updates.mentions !== undefined) {
      comment.mentions = updates.mentions;
    }

    await this.saveComment(comment);
    return comment;
  }

  /**
   * Process the sync queue - attempt to send pending comments
   */
  public async processQueue(): Promise<SyncResults> {
    if (this.isSyncing || !navigator.onLine) {
      return { total: 0, synced: 0, failed: 0, pending: 0 };
    }

    this.isSyncing = true;
    this.options.callbacks.onQueueProcessingStart?.();

    const comments = await this.getQueuedComments();
    const pendingComments = comments.filter(
      (c) => c.status === 'pending' || (c.status === 'failed' && c.retryCount < this.options.maxRetries)
    );

    const results: SyncResults = {
      total: pendingComments.length,
      synced: 0,
      failed: 0,
      pending: 0,
    };

    for (const comment of pendingComments) {
      try {
        comment.status = 'syncing';
        comment.lastAttemptAt = Date.now();
        await this.saveComment(comment);

        await this.syncComment(comment);

        comment.status = 'synced';
        await this.saveComment(comment);
        results.synced++;
        this.options.callbacks.onCommentSynced?.(comment);

        // Remove synced comment after brief delay
        setTimeout(() => this.removeComment(comment.id), 5000);
      } catch (error) {
        comment.status = 'failed';
        comment.retryCount++;
        comment.error = (error as Error).message;
        await this.saveComment(comment);

        if (comment.retryCount >= this.options.maxRetries) {
          results.failed++;
          this.options.callbacks.onCommentFailed?.(comment, comment.error);
        } else {
          results.pending++;
        }
      }
    }

    this.isSyncing = false;
    this.options.callbacks.onQueueProcessingComplete?.(results);

    // Schedule retry for pending items
    if (results.pending > 0) {
      this.scheduleSyncAttempt();
    }

    return results;
  }

  /**
   * Retry a specific failed comment
   */
  public async retryComment(id: string): Promise<boolean> {
    const comment = await this.getCommentById(id);
    if (!comment || comment.status !== 'failed') {
      return false;
    }

    comment.status = 'pending';
    comment.error = undefined;
    await this.saveComment(comment);

    if (navigator.onLine) {
      this.scheduleSyncAttempt();
    }

    return true;
  }

  /**
   * Clear all synced comments from queue
   */
  public async clearSynced(): Promise<void> {
    const comments = await this.getQueuedComments();
    const synced = comments.filter((c) => c.status === 'synced');

    for (const comment of synced) {
      await this.removeComment(comment.id);
    }
  }

  /**
   * Clear all comments from queue
   */
  public async clearAll(): Promise<void> {
    await this.ensureInitialized();

    const db = this.getDb();
    const tx = db.transaction(QUEUE_STORE, 'readwrite');
    const store = tx.objectStore(QUEUE_STORE);

    return new Promise((resolve, reject) => {
      const request = store.clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Destroy the queue and clean up resources
   */
  public destroy(): void {
    if (this.onlineListener) {
      window.removeEventListener('online', this.onlineListener);
      this.onlineListener = null;
    }
    if (this.swSyncListener) {
      window.removeEventListener('sw-sync-event', this.swSyncListener);
      this.swSyncListener = null;
    }
    if (this.syncTimer) {
      clearTimeout(this.syncTimer);
      this.syncTimer = null;
    }
    if (this.db) {
      this.db.close();
      this.db = null;
    }
    this.isInitialized = false;
  }

  // === Private Methods ===

  private async openDatabase(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.options.dbName, this.options.dbVersion);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(QUEUE_STORE)) {
          const store = db.createObjectStore(QUEUE_STORE, { keyPath: 'id' });
          store.createIndex('videoId', 'videoId', { unique: false });
          store.createIndex('status', 'status', { unique: false });
          store.createIndex('createdAt', 'createdAt', { unique: false });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  private getDb(): IDBDatabase {
    if (!this.db) {
      throw new Error('Database not initialized. Call initialize() first.');
    }
    return this.db;
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }
  }

  private async getCommentById(id: string): Promise<QueuedComment | null> {
    const db = this.getDb();
    const tx = db.transaction(QUEUE_STORE, 'readonly');
    const store = tx.objectStore(QUEUE_STORE);

    return new Promise((resolve, reject) => {
      const request = store.get(id);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  private async saveComment(comment: QueuedComment): Promise<void> {
    const db = this.getDb();
    const tx = db.transaction(QUEUE_STORE, 'readwrite');
    const store = tx.objectStore(QUEUE_STORE);

    return new Promise((resolve, reject) => {
      const request = store.put(comment);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  private async syncComment(comment: QueuedComment): Promise<void> {
    const authToken = this.options.getAuthToken();
    const url = `${this.options.apiBaseUrl}/videos/${comment.videoId}/comments`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (authToken) {
      headers['Authorization'] = `Bearer ${authToken}`;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        body: comment.body,
        timestampSeconds: comment.timestampSeconds,
        parentCommentId: comment.parentCommentId,
        mentions: comment.mentions,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new Error(`Failed to sync comment: ${response.status} ${errorText}`);
    }
  }

  private scheduleSyncAttempt(): void {
    if (this.syncTimer) {
      return;
    }

    this.syncTimer = setTimeout(() => {
      this.syncTimer = null;
      this.processQueue();
    }, this.options.retryDelayMs);
  }

  private async registerBackgroundSync(): Promise<void> {
    try {
      if ('serviceWorker' in navigator) {
        const registration = await navigator.serviceWorker.ready;
        if ('sync' in registration) {
          await (registration as any).sync.register('streetstudio-comment-sync');
        }
      }
    } catch {
      // Background sync not available - will rely on online event
    }
  }

  private async handleSyncSuccess(id: string): Promise<void> {
    const comment = await this.getCommentById(id);
    if (comment) {
      comment.status = 'synced';
      await this.saveComment(comment);
      this.options.callbacks.onCommentSynced?.(comment);
    }
  }

  private async handleSyncFailure(id: string, error: string): Promise<void> {
    const comment = await this.getCommentById(id);
    if (comment) {
      comment.status = 'failed';
      comment.error = error;
      comment.retryCount++;
      await this.saveComment(comment);
      this.options.callbacks.onCommentFailed?.(comment, error);
    }
  }
}

// === Utility Functions ===

function generateId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

// === Singleton Instance ===

let commentQueue: OfflineCommentQueue | null = null;

/**
 * Get the shared offline comment queue instance
 */
export function getOfflineCommentQueue(options?: OfflineCommentQueueOptions): OfflineCommentQueue {
  if (!commentQueue) {
    commentQueue = new OfflineCommentQueue(options);
  }
  return commentQueue;
}

/**
 * Queue a comment for offline sync
 */
export async function queueCommentOffline(comment: {
  videoId: string;
  body: string;
  timestampSeconds?: number;
  parentCommentId?: string;
  mentions?: string[];
}): Promise<QueuedComment> {
  const queue = getOfflineCommentQueue();
  return queue.queueComment(comment);
}
