/**
 * Cache Manager
 *
 * Provides intelligent caching with configurable strategies:
 * - cache-first: Returns cached data immediately, refreshes in background (for static/slow-changing data)
 * - network-first: Tries network first, falls back to cache (for API data requiring freshness)
 * - stale-while-revalidate: Returns cache immediately, revalidates in background
 *
 * Requirements: 12.3, 12.6
 */

import { logger } from '../app/client-logger.js';

export type CacheStrategy = 'cache-first' | 'network-first' | 'stale-while-revalidate';

export interface CacheEntry<T = unknown> {
  data: T;
  timestamp: number;
  expiresAt: number;
  etag?: string;
  strategy: CacheStrategy;
  key: string;
}

export interface CacheConfig {
  /** Default time-to-live in milliseconds */
  defaultTTL: number;
  /** Maximum number of entries in the cache */
  maxEntries: number;
  /** Storage key prefix */
  prefix: string;
  /** Whether to persist cache to localStorage */
  persist: boolean;
  /** Maximum size in bytes for persisted cache (default 2MB) */
  maxPersistSize: number;
}

export interface CacheRequestOptions<T = unknown> {
  /** Cache strategy for this request */
  strategy: CacheStrategy;
  /** TTL override in milliseconds */
  ttl?: number;
  /** Function to fetch fresh data from network */
  fetcher: () => Promise<T>;
  /** ETag for conditional requests */
  etag?: string;
  /** Callback when background revalidation completes */
  onRevalidate?: (data: T) => void;
}

const DEFAULT_CONFIG: CacheConfig = {
  defaultTTL: 5 * 60 * 1000, // 5 minutes
  maxEntries: 500,
  prefix: 'streetstudio_cache_',
  persist: true,
  maxPersistSize: 2 * 1024 * 1024, // 2MB
};

export class CacheManager {
  private memoryCache = new Map<string, CacheEntry>();
  private config: CacheConfig;
  private accessOrder: string[] = [];

  constructor(config: Partial<CacheConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.loadFromStorage();
  }

  /**
   * Get data using the configured cache strategy
   */
  public async get<T>(key: string, options: CacheRequestOptions<T>): Promise<T> {
    const { strategy, fetcher, ttl, onRevalidate } = options;

    switch (strategy) {
      case 'cache-first':
        return this.cacheFirst(key, fetcher, ttl, onRevalidate);
      case 'network-first':
        return this.networkFirst(key, fetcher, ttl);
      case 'stale-while-revalidate':
        return this.staleWhileRevalidate(key, fetcher, ttl, onRevalidate);
      default:
        return fetcher();
    }
  }

  /**
   * Cache-first strategy: returns cached data if available and valid,
   * otherwise fetches from network. Optionally revalidates in background.
   */
  private async cacheFirst<T>(
    key: string,
    fetcher: () => Promise<T>,
    ttl?: number,
    onRevalidate?: (data: T) => void
  ): Promise<T> {
    const cached = this.getEntry<T>(key);

    if (cached && !this.isExpired(cached)) {
      logger.debug('Cache hit (cache-first)', { key });
      this.touchEntry(key);

      // Background revalidation if entry is older than half its TTL
      const halfLife = (cached.expiresAt - cached.timestamp) / 2;
      if (Date.now() - cached.timestamp > halfLife && onRevalidate) {
        this.revalidateInBackground(key, fetcher, ttl, onRevalidate);
      }

      return cached.data;
    }

    logger.debug('Cache miss (cache-first)', { key });
    const data = await fetcher();
    this.setEntry(key, data, 'cache-first', ttl);
    return data;
  }

  /**
   * Network-first strategy: tries network, falls back to cache on failure.
   */
  private async networkFirst<T>(
    key: string,
    fetcher: () => Promise<T>,
    ttl?: number
  ): Promise<T> {
    try {
      const data = await fetcher();
      this.setEntry(key, data, 'network-first', ttl);
      logger.debug('Network success (network-first)', { key });
      return data;
    } catch (error) {
      const cached = this.getEntry<T>(key);
      if (cached) {
        logger.warn('Network failed, using cache (network-first)', {
          key,
          error: (error as Error).message,
          cacheAge: Date.now() - cached.timestamp,
        });
        this.touchEntry(key);
        return cached.data;
      }

      logger.error('Network failed and no cache available', {
        key,
        error: (error as Error).message,
      });
      throw error;
    }
  }

  /**
   * Stale-while-revalidate: returns cached immediately (even if stale),
   * revalidates in background.
   */
  private async staleWhileRevalidate<T>(
    key: string,
    fetcher: () => Promise<T>,
    ttl?: number,
    onRevalidate?: (data: T) => void
  ): Promise<T> {
    const cached = this.getEntry<T>(key);

    if (cached) {
      logger.debug('Returning stale cache, revalidating', { key });
      this.revalidateInBackground(key, fetcher, ttl, onRevalidate);
      return cached.data;
    }

    logger.debug('No cache, fetching (stale-while-revalidate)', { key });
    const data = await fetcher();
    this.setEntry(key, data, 'stale-while-revalidate', ttl);
    return data;
  }

  /**
   * Revalidate cache entry in background without blocking
   */
  private revalidateInBackground<T>(
    key: string,
    fetcher: () => Promise<T>,
    ttl?: number,
    onRevalidate?: (data: T) => void
  ): void {
    fetcher()
      .then((data) => {
        this.setEntry(key, data, 'cache-first', ttl);
        if (onRevalidate) {
          onRevalidate(data);
        }
        logger.debug('Background revalidation complete', { key });
      })
      .catch((error) => {
        logger.warn('Background revalidation failed', {
          key,
          error: (error as Error).message,
        });
      });
  }

  /**
   * Manually set a cache entry
   */
  public set<T>(key: string, data: T, strategy: CacheStrategy = 'cache-first', ttl?: number): void {
    this.setEntry(key, data, strategy, ttl);
  }

  /**
   * Check if a key exists and is not expired
   */
  public has(key: string): boolean {
    const entry = this.getEntry(key);
    return entry !== null && !this.isExpired(entry);
  }

  /**
   * Invalidate a specific cache entry
   */
  public invalidate(key: string): boolean {
    const prefixedKey = this.config.prefix + key;
    const existed = this.memoryCache.has(prefixedKey);
    this.memoryCache.delete(prefixedKey);
    this.accessOrder = this.accessOrder.filter((k) => k !== prefixedKey);
    this.persistToStorage();
    if (existed) {
      logger.debug('Cache entry invalidated', { key });
    }
    return existed;
  }

  /**
   * Invalidate all entries matching a pattern (prefix match)
   */
  public invalidatePattern(pattern: string): number {
    const fullPattern = this.config.prefix + pattern;
    let count = 0;

    for (const key of Array.from(this.memoryCache.keys())) {
      if (key.startsWith(fullPattern)) {
        this.memoryCache.delete(key);
        this.accessOrder = this.accessOrder.filter((k) => k !== key);
        count++;
      }
    }

    if (count > 0) {
      this.persistToStorage();
      logger.debug('Cache entries invalidated by pattern', { pattern, count });
    }
    return count;
  }

  /**
   * Clear the entire cache
   */
  public clear(): void {
    this.memoryCache.clear();
    this.accessOrder = [];
    this.persistToStorage();
    logger.info('Cache cleared');
  }

  /**
   * Get cache statistics
   */
  public getStats(): {
    size: number;
    maxEntries: number;
    oldestEntry: number | null;
    newestEntry: number | null;
  } {
    let oldest: number | null = null;
    let newest: number | null = null;

    for (const entry of this.memoryCache.values()) {
      if (oldest === null || entry.timestamp < oldest) {
        oldest = entry.timestamp;
      }
      if (newest === null || entry.timestamp > newest) {
        newest = entry.timestamp;
      }
    }

    return {
      size: this.memoryCache.size,
      maxEntries: this.config.maxEntries,
      oldestEntry: oldest,
      newestEntry: newest,
    };
  }

  /**
   * Get all cache keys (without prefix)
   */
  public getKeys(): string[] {
    return Array.from(this.memoryCache.keys()).map((k) =>
      k.substring(this.config.prefix.length)
    );
  }

  private getEntry<T>(key: string): CacheEntry<T> | null {
    const prefixedKey = this.config.prefix + key;
    const entry = this.memoryCache.get(prefixedKey) as CacheEntry<T> | undefined;
    return entry ?? null;
  }

  private setEntry<T>(key: string, data: T, strategy: CacheStrategy, ttl?: number): void {
    const prefixedKey = this.config.prefix + key;
    const effectiveTTL = ttl ?? this.config.defaultTTL;
    const now = Date.now();

    const entry: CacheEntry<T> = {
      data,
      timestamp: now,
      expiresAt: now + effectiveTTL,
      strategy,
      key,
    };

    this.memoryCache.set(prefixedKey, entry as CacheEntry<unknown>);
    this.touchEntry(key);
    this.evictIfNeeded();
    this.persistToStorage();
  }

  private touchEntry(key: string): void {
    const prefixedKey = this.config.prefix + key;
    this.accessOrder = this.accessOrder.filter((k) => k !== prefixedKey);
    this.accessOrder.push(prefixedKey);
  }

  private isExpired(entry: CacheEntry): boolean {
    return Date.now() > entry.expiresAt;
  }

  private evictIfNeeded(): void {
    while (this.memoryCache.size > this.config.maxEntries && this.accessOrder.length > 0) {
      const lruKey = this.accessOrder.shift()!;
      this.memoryCache.delete(lruKey);
      logger.debug('Cache eviction (LRU)', { key: lruKey });
    }
  }

  private persistToStorage(): void {
    if (!this.config.persist) return;

    try {
      const entries: Array<[string, CacheEntry]> = [];
      let totalSize = 0;

      // Persist most recently accessed entries up to size limit
      for (let i = this.accessOrder.length - 1; i >= 0; i--) {
        const key = this.accessOrder[i]!;
        const entry = this.memoryCache.get(key);
        if (entry && !this.isExpired(entry)) {
          const serialized = JSON.stringify([key, entry]);
          if (totalSize + serialized.length > this.config.maxPersistSize) break;
          totalSize += serialized.length;
          entries.unshift([key, entry]);
        }
      }

      localStorage.setItem(
        this.config.prefix + '__index',
        JSON.stringify(entries)
      );
    } catch (error) {
      // localStorage might be full or unavailable
      logger.warn('Failed to persist cache', { error: (error as Error).message });
    }
  }

  private loadFromStorage(): void {
    if (!this.config.persist) return;

    try {
      const stored = localStorage.getItem(this.config.prefix + '__index');
      if (!stored) return;

      const entries: Array<[string, CacheEntry]> = JSON.parse(stored);
      const now = Date.now();

      for (const [key, entry] of entries) {
        // Only load non-expired entries
        if (entry.expiresAt > now) {
          this.memoryCache.set(key, entry);
          this.accessOrder.push(key);
        }
      }

      logger.debug('Cache loaded from storage', { entries: this.memoryCache.size });
    } catch (error) {
      logger.warn('Failed to load cache from storage', {
        error: (error as Error).message,
      });
    }
  }
}

// Singleton cache manager instance
let globalCacheManager: CacheManager | null = null;

export function getCacheManager(): CacheManager {
  if (!globalCacheManager) {
    globalCacheManager = new CacheManager();
  }
  return globalCacheManager;
}

export function initializeCacheManager(config: Partial<CacheConfig> = {}): CacheManager {
  globalCacheManager = new CacheManager(config);
  return globalCacheManager;
}
