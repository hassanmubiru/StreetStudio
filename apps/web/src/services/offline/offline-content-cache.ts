/**
 * Offline Content Cache
 * 
 * Manages local storage of recently viewed content for offline access.
 * Uses IndexedDB for structured data and provides content prioritization
 * based on recency and frequency of access.
 * 
 * Requirements: 10.7
 */

export interface CachedContent {
  id: string;
  type: ContentType;
  title: string;
  description?: string;
  thumbnailUrl?: string;
  data: unknown;
  cachedAt: number;
  lastAccessedAt: number;
  accessCount: number;
  sizeBytes: number;
  expiresAt?: number;
}

export type ContentType = 'video' | 'project' | 'comment-thread' | 'notification' | 'user-profile';

export interface OfflineCacheOptions {
  dbName?: string;
  dbVersion?: number;
  maxEntries?: number;
  maxSizeBytes?: number;
  defaultTtlMs?: number;
}

export interface CacheStats {
  totalEntries: number;
  totalSizeBytes: number;
  entriesByType: Record<ContentType, number>;
  oldestEntry?: number;
  newestEntry?: number;
}

const DEFAULT_OPTIONS: Required<OfflineCacheOptions> = {
  dbName: 'streetstudio-offline-content',
  dbVersion: 1,
  maxEntries: 100,
  maxSizeBytes: 25 * 1024 * 1024, // 25MB
  defaultTtlMs: 7 * 24 * 60 * 60 * 1000, // 7 days
};

const CONTENT_STORE = 'content';
const META_STORE = 'metadata';

/**
 * OfflineContentCache provides IndexedDB-backed storage for recently viewed content
 */
export class OfflineContentCache {
  private options: Required<OfflineCacheOptions>;
  private db: IDBDatabase | null = null;
  private isInitialized = false;

  constructor(options: OfflineCacheOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Initialize the IndexedDB database
   */
  public async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    if (typeof indexedDB === 'undefined' || !indexedDB) {
      throw new Error('IndexedDB is not available in this environment');
    }

    this.db = await this.openDatabase();
    this.isInitialized = true;

    // Run cleanup on initialization
    await this.cleanup();
  }

  /**
   * Store content for offline access
   */
  public async cacheContent(
    id: string,
    type: ContentType,
    title: string,
    data: unknown,
    options?: { description?: string; thumbnailUrl?: string; ttlMs?: number }
  ): Promise<void> {
    await this.ensureInitialized();

    const serializedData = JSON.stringify(data);
    const sizeBytes = new Blob([serializedData]).size;

    const existing = await this.getContentById(id);
    const now = Date.now();
    const ttl = options?.ttlMs ?? this.options.defaultTtlMs;

    const entry: CachedContent = {
      id,
      type,
      title,
      description: options?.description,
      thumbnailUrl: options?.thumbnailUrl,
      data,
      cachedAt: existing?.cachedAt ?? now,
      lastAccessedAt: now,
      accessCount: (existing?.accessCount ?? 0) + 1,
      sizeBytes,
      expiresAt: ttl > 0 ? now + ttl : undefined,
    };

    // Ensure we have space
    await this.ensureCapacity(sizeBytes, id);

    const db = this.getDb();
    const tx = db.transaction(CONTENT_STORE, 'readwrite');
    const store = tx.objectStore(CONTENT_STORE);

    return new Promise((resolve, reject) => {
      const request = store.put(entry);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Retrieve cached content by ID
   */
  public async getContent(id: string): Promise<CachedContent | null> {
    await this.ensureInitialized();

    const entry = await this.getContentById(id);
    if (!entry) {
      return null;
    }

    // Check expiration
    if (entry.expiresAt && entry.expiresAt < Date.now()) {
      await this.removeContent(id);
      return null;
    }

    // Update access metadata
    entry.lastAccessedAt = Date.now();
    entry.accessCount += 1;
    await this.updateEntry(entry);

    return entry;
  }

  /**
   * Get all cached content of a specific type
   */
  public async getContentByType(type: ContentType): Promise<CachedContent[]> {
    await this.ensureInitialized();

    const db = this.getDb();
    const tx = db.transaction(CONTENT_STORE, 'readonly');
    const store = tx.objectStore(CONTENT_STORE);
    const index = store.index('type');

    return new Promise((resolve, reject) => {
      const request = index.getAll(type);
      request.onsuccess = () => {
        const results = (request.result || []).filter((entry: CachedContent) => {
          return !entry.expiresAt || entry.expiresAt > Date.now();
        });
        resolve(results);
      };
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get recently accessed content ordered by last access time
   */
  public async getRecentContent(limit = 20): Promise<CachedContent[]> {
    await this.ensureInitialized();

    const db = this.getDb();
    const tx = db.transaction(CONTENT_STORE, 'readonly');
    const store = tx.objectStore(CONTENT_STORE);
    const index = store.index('lastAccessedAt');

    return new Promise((resolve, reject) => {
      const results: CachedContent[] = [];
      const request = index.openCursor(null, 'prev');

      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor && results.length < limit) {
          const entry = cursor.value as CachedContent;
          if (!entry.expiresAt || entry.expiresAt > Date.now()) {
            results.push(entry);
          }
          cursor.continue();
        } else {
          resolve(results);
        }
      };
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Remove specific content from cache
   */
  public async removeContent(id: string): Promise<void> {
    await this.ensureInitialized();

    const db = this.getDb();
    const tx = db.transaction(CONTENT_STORE, 'readwrite');
    const store = tx.objectStore(CONTENT_STORE);

    return new Promise((resolve, reject) => {
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Clear all cached content
   */
  public async clearAll(): Promise<void> {
    await this.ensureInitialized();

    const db = this.getDb();
    const tx = db.transaction(CONTENT_STORE, 'readwrite');
    const store = tx.objectStore(CONTENT_STORE);

    return new Promise((resolve, reject) => {
      const request = store.clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Check if specific content is cached
   */
  public async hasContent(id: string): Promise<boolean> {
    await this.ensureInitialized();
    const entry = await this.getContentById(id);
    if (!entry) return false;
    if (entry.expiresAt && entry.expiresAt < Date.now()) return false;
    return true;
  }

  /**
   * Get cache statistics
   */
  public async getStats(): Promise<CacheStats> {
    await this.ensureInitialized();

    const db = this.getDb();
    const tx = db.transaction(CONTENT_STORE, 'readonly');
    const store = tx.objectStore(CONTENT_STORE);

    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => {
        const entries = (request.result || []) as CachedContent[];
        const now = Date.now();
        const validEntries = entries.filter((e) => !e.expiresAt || e.expiresAt > now);

        const entriesByType: Record<ContentType, number> = {
          video: 0,
          project: 0,
          'comment-thread': 0,
          notification: 0,
          'user-profile': 0,
        };

        let totalSize = 0;
        let oldest = Infinity;
        let newest = 0;

        for (const entry of validEntries) {
          entriesByType[entry.type] = (entriesByType[entry.type] || 0) + 1;
          totalSize += entry.sizeBytes;
          if (entry.cachedAt < oldest) oldest = entry.cachedAt;
          if (entry.cachedAt > newest) newest = entry.cachedAt;
        }

        resolve({
          totalEntries: validEntries.length,
          totalSizeBytes: totalSize,
          entriesByType,
          oldestEntry: oldest === Infinity ? undefined : oldest,
          newestEntry: newest === 0 ? undefined : newest,
        });
      };
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Close the database connection
   */
  public close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
      this.isInitialized = false;
    }
  }

  // === Private Methods ===

  private async openDatabase(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.options.dbName, this.options.dbVersion);

      request.onupgradeneeded = () => {
        const db = request.result;

        if (!db.objectStoreNames.contains(CONTENT_STORE)) {
          const store = db.createObjectStore(CONTENT_STORE, { keyPath: 'id' });
          store.createIndex('type', 'type', { unique: false });
          store.createIndex('lastAccessedAt', 'lastAccessedAt', { unique: false });
          store.createIndex('cachedAt', 'cachedAt', { unique: false });
          store.createIndex('expiresAt', 'expiresAt', { unique: false });
        }

        if (!db.objectStoreNames.contains(META_STORE)) {
          db.createObjectStore(META_STORE, { keyPath: 'key' });
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

  private async getContentById(id: string): Promise<CachedContent | null> {
    const db = this.getDb();
    const tx = db.transaction(CONTENT_STORE, 'readonly');
    const store = tx.objectStore(CONTENT_STORE);

    return new Promise((resolve, reject) => {
      const request = store.get(id);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  private async updateEntry(entry: CachedContent): Promise<void> {
    const db = this.getDb();
    const tx = db.transaction(CONTENT_STORE, 'readwrite');
    const store = tx.objectStore(CONTENT_STORE);

    return new Promise((resolve, reject) => {
      const request = store.put(entry);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  private async ensureCapacity(newItemSize: number, excludeId?: string): Promise<void> {
    const stats = await this.getStats();

    // Check entry limit
    if (stats.totalEntries >= this.options.maxEntries) {
      await this.evictOldest(1, excludeId);
    }

    // Check size limit
    if (stats.totalSizeBytes + newItemSize > this.options.maxSizeBytes) {
      await this.evictUntilSpace(newItemSize, excludeId);
    }
  }

  private async evictOldest(count: number, excludeId?: string): Promise<void> {
    const db = this.getDb();
    const tx = db.transaction(CONTENT_STORE, 'readwrite');
    const store = tx.objectStore(CONTENT_STORE);
    const index = store.index('lastAccessedAt');

    return new Promise((resolve, reject) => {
      let evicted = 0;
      const request = index.openCursor(null, 'next');

      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor && evicted < count) {
          const entry = cursor.value as CachedContent;
          if (entry.id !== excludeId) {
            cursor.delete();
            evicted++;
          }
          cursor.continue();
        } else {
          resolve();
        }
      };
      request.onerror = () => reject(request.error);
    });
  }

  private async evictUntilSpace(requiredBytes: number, excludeId?: string): Promise<void> {
    const db = this.getDb();
    const tx = db.transaction(CONTENT_STORE, 'readwrite');
    const store = tx.objectStore(CONTENT_STORE);
    const index = store.index('lastAccessedAt');

    const stats = await this.getStats();
    let currentSize = stats.totalSizeBytes;
    const targetSize = this.options.maxSizeBytes - requiredBytes;

    return new Promise((resolve, reject) => {
      const request = index.openCursor(null, 'next');

      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor && currentSize > targetSize) {
          const entry = cursor.value as CachedContent;
          if (entry.id !== excludeId) {
            currentSize -= entry.sizeBytes;
            cursor.delete();
          }
          cursor.continue();
        } else {
          resolve();
        }
      };
      request.onerror = () => reject(request.error);
    });
  }

  private async cleanup(): Promise<void> {
    const db = this.getDb();
    const tx = db.transaction(CONTENT_STORE, 'readwrite');
    const store = tx.objectStore(CONTENT_STORE);
    const now = Date.now();

    return new Promise((resolve, reject) => {
      const request = store.openCursor();

      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor) {
          const entry = cursor.value as CachedContent;
          if (entry.expiresAt && entry.expiresAt < now) {
            cursor.delete();
          }
          cursor.continue();
        } else {
          resolve();
        }
      };
      request.onerror = () => reject(request.error);
    });
  }
}

// === Singleton Instance ===

let offlineContentCache: OfflineContentCache | null = null;

/**
 * Get the shared offline content cache instance
 */
export function getOfflineContentCache(options?: OfflineCacheOptions): OfflineContentCache {
  if (!offlineContentCache) {
    offlineContentCache = new OfflineContentCache(options);
  }
  return offlineContentCache;
}

/**
 * Cache a video for offline viewing
 */
export async function cacheVideoForOffline(video: {
  id: string;
  title: string;
  description?: string;
  thumbnailUrl?: string;
  data: unknown;
}): Promise<void> {
  const cache = getOfflineContentCache();
  await cache.cacheContent(video.id, 'video', video.title, video.data, {
    description: video.description,
    thumbnailUrl: video.thumbnailUrl,
  });
}

/**
 * Cache a project for offline viewing
 */
export async function cacheProjectForOffline(project: {
  id: string;
  title: string;
  description?: string;
  data: unknown;
}): Promise<void> {
  const cache = getOfflineContentCache();
  await cache.cacheContent(project.id, 'project', project.title, project.data, {
    description: project.description,
  });
}

/**
 * Get recently viewed content for offline access
 */
export async function getRecentOfflineContent(limit?: number): Promise<CachedContent[]> {
  const cache = getOfflineContentCache();
  return cache.getRecentContent(limit);
}
