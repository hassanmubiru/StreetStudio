/**
 * Unit Tests: Cache Manager
 *
 * Tests for cache-first / network-first / stale-while-revalidate strategies,
 * TTL expiration, LRU eviction, invalidation, and persistence.
 *
 * Validates: Requirements 12.3
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CacheManager, type CacheStrategy } from './cache-manager.js';

// Mock the client-logger to avoid side effects
vi.mock('../app/client-logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('CacheManager', () => {
  let cache: CacheManager;

  beforeEach(() => {
    localStorage.clear();
    cache = new CacheManager({
      defaultTTL: 5000,
      maxEntries: 10,
      prefix: 'test_cache_',
      persist: false,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('cache-first strategy', () => {
    it('returns cached data when cache is valid', async () => {
      const fetcher = vi.fn().mockResolvedValue('network-data');

      // First call populates cache
      const result1 = await cache.get('key1', { strategy: 'cache-first', fetcher });
      expect(result1).toBe('network-data');
      expect(fetcher).toHaveBeenCalledTimes(1);

      // Second call returns cached data without calling fetcher
      fetcher.mockResolvedValue('new-network-data');
      const result2 = await cache.get('key1', { strategy: 'cache-first', fetcher });
      expect(result2).toBe('network-data');
      expect(fetcher).toHaveBeenCalledTimes(1);
    });

    it('fetches from network on cache miss', async () => {
      const fetcher = vi.fn().mockResolvedValue('fresh-data');

      const result = await cache.get('missing-key', { strategy: 'cache-first', fetcher });

      expect(result).toBe('fresh-data');
      expect(fetcher).toHaveBeenCalledTimes(1);
    });

    it('triggers background revalidation when entry exceeds half its TTL', async () => {
      vi.useFakeTimers();
      const onRevalidate = vi.fn();
      const fetcher = vi.fn().mockResolvedValue('data-v1');

      // Populate cache with TTL of 1000ms
      await cache.get('revalidate-key', {
        strategy: 'cache-first',
        fetcher,
        ttl: 1000,
        onRevalidate,
      });

      // Advance past half-life (500ms)
      vi.advanceTimersByTime(600);

      fetcher.mockResolvedValue('data-v2');
      await cache.get('revalidate-key', {
        strategy: 'cache-first',
        fetcher,
        ttl: 1000,
        onRevalidate,
      });

      // Allow background revalidation to complete
      await vi.runAllTimersAsync();

      expect(onRevalidate).toHaveBeenCalledWith('data-v2');
      vi.useRealTimers();
    });
  });

  describe('network-first strategy', () => {
    it('returns network data on success and caches it', async () => {
      const fetcher = vi.fn().mockResolvedValue('network-result');

      const result = await cache.get('nf-key', { strategy: 'network-first', fetcher });

      expect(result).toBe('network-result');
      expect(cache.has('nf-key')).toBe(true);
    });

    it('falls back to cache when network fails', async () => {
      const fetcher = vi.fn().mockResolvedValue('cached-data');
      await cache.get('fallback-key', { strategy: 'network-first', fetcher });

      // Now network fails
      fetcher.mockRejectedValue(new Error('Network error'));
      const result = await cache.get('fallback-key', { strategy: 'network-first', fetcher });

      expect(result).toBe('cached-data');
    });

    it('throws when network fails and no cache exists', async () => {
      const fetcher = vi.fn().mockRejectedValue(new Error('Network error'));

      await expect(
        cache.get('no-cache-key', { strategy: 'network-first', fetcher })
      ).rejects.toThrow('Network error');
    });
  });

  describe('stale-while-revalidate strategy', () => {
    it('returns stale cache immediately and revalidates in background', async () => {
      const onRevalidate = vi.fn();
      const fetcher = vi.fn().mockResolvedValue('data-v1');

      // Populate cache
      await cache.get('swr-key', {
        strategy: 'stale-while-revalidate',
        fetcher,
        onRevalidate,
      });

      // Change what fetcher returns
      fetcher.mockResolvedValue('data-v2');

      const result = await cache.get('swr-key', {
        strategy: 'stale-while-revalidate',
        fetcher,
        onRevalidate,
      });

      // Returns stale data immediately
      expect(result).toBe('data-v1');

      // Background revalidation fires
      await new Promise(resolve => setTimeout(resolve, 10));
      expect(onRevalidate).toHaveBeenCalledWith('data-v2');
    });

    it('fetches from network when no cache exists', async () => {
      const fetcher = vi.fn().mockResolvedValue('fresh');

      const result = await cache.get('swr-miss', {
        strategy: 'stale-while-revalidate',
        fetcher,
      });

      expect(result).toBe('fresh');
    });
  });

  describe('TTL expiration', () => {
    it('returns false for has() when entry has expired', () => {
      vi.useFakeTimers();

      cache.set('ttl-key', 'value', 'cache-first', 100);
      expect(cache.has('ttl-key')).toBe(true);

      vi.advanceTimersByTime(150);
      expect(cache.has('ttl-key')).toBe(false);

      vi.useRealTimers();
    });

    it('fetches fresh data when cached entry has expired', async () => {
      vi.useFakeTimers();

      const fetcher = vi.fn().mockResolvedValue('fresh');
      cache.set('expire-key', 'stale', 'cache-first', 100);

      vi.advanceTimersByTime(150);

      const result = await cache.get('expire-key', { strategy: 'cache-first', fetcher });
      expect(result).toBe('fresh');
      expect(fetcher).toHaveBeenCalled();

      vi.useRealTimers();
    });

    it('uses custom TTL when provided', () => {
      vi.useFakeTimers();

      cache.set('custom-ttl', 'data', 'cache-first', 2000);

      vi.advanceTimersByTime(1500);
      expect(cache.has('custom-ttl')).toBe(true);

      vi.advanceTimersByTime(600);
      expect(cache.has('custom-ttl')).toBe(false);

      vi.useRealTimers();
    });
  });

  describe('LRU eviction', () => {
    it('evicts least recently used entries when maxEntries is exceeded', () => {
      const smallCache = new CacheManager({
        maxEntries: 3,
        persist: false,
        prefix: 'lru_test_',
        defaultTTL: 60000,
        maxPersistSize: 0,
      });

      smallCache.set('a', 'data-a', 'cache-first');
      smallCache.set('b', 'data-b', 'cache-first');
      smallCache.set('c', 'data-c', 'cache-first');

      // All three should exist
      expect(smallCache.has('a')).toBe(true);
      expect(smallCache.has('b')).toBe(true);
      expect(smallCache.has('c')).toBe(true);

      // Adding a fourth entry should evict 'a' (oldest)
      smallCache.set('d', 'data-d', 'cache-first');

      expect(smallCache.has('a')).toBe(false);
      expect(smallCache.has('b')).toBe(true);
      expect(smallCache.has('c')).toBe(true);
      expect(smallCache.has('d')).toBe(true);
    });

    it('setting an entry again refreshes its LRU position', () => {
      const smallCache = new CacheManager({
        maxEntries: 3,
        persist: false,
        prefix: 'lru_access_',
        defaultTTL: 60000,
        maxPersistSize: 0,
      });

      smallCache.set('a', 'data-a', 'cache-first');
      smallCache.set('b', 'data-b', 'cache-first');
      smallCache.set('c', 'data-c', 'cache-first');

      // Re-set 'a' to refresh its LRU position
      smallCache.set('a', 'data-a-updated', 'cache-first');

      // Adding a fourth entry should evict 'b' (least recently accessed)
      smallCache.set('d', 'data-d', 'cache-first');

      expect(smallCache.has('a')).toBe(true);
      expect(smallCache.has('b')).toBe(false);
      expect(smallCache.has('c')).toBe(true);
      expect(smallCache.has('d')).toBe(true);
    });
  });

  describe('invalidation', () => {
    it('invalidates a specific key', () => {
      cache.set('inv-key', 'data', 'cache-first');
      expect(cache.has('inv-key')).toBe(true);

      const result = cache.invalidate('inv-key');
      expect(result).toBe(true);
      expect(cache.has('inv-key')).toBe(false);
    });

    it('returns false when invalidating non-existent key', () => {
      const result = cache.invalidate('non-existent');
      expect(result).toBe(false);
    });

    it('invalidates entries matching a pattern', () => {
      cache.set('project:1:videos', 'videos', 'cache-first');
      cache.set('project:1:settings', 'settings', 'cache-first');
      cache.set('project:2:videos', 'other-videos', 'cache-first');

      const count = cache.invalidatePattern('project:1:');

      expect(count).toBe(2);
      expect(cache.has('project:1:videos')).toBe(false);
      expect(cache.has('project:1:settings')).toBe(false);
      expect(cache.has('project:2:videos')).toBe(true);
    });

    it('returns 0 when no entries match the pattern', () => {
      cache.set('key1', 'data', 'cache-first');
      const count = cache.invalidatePattern('non-matching:');
      expect(count).toBe(0);
    });
  });

  describe('clear', () => {
    it('removes all entries from cache', () => {
      cache.set('k1', 'v1', 'cache-first');
      cache.set('k2', 'v2', 'cache-first');

      cache.clear();

      expect(cache.has('k1')).toBe(false);
      expect(cache.has('k2')).toBe(false);
      expect(cache.getStats().size).toBe(0);
    });
  });

  describe('statistics and keys', () => {
    it('reports correct cache size', () => {
      cache.set('s1', 'data', 'cache-first');
      cache.set('s2', 'data', 'cache-first');

      const stats = cache.getStats();
      expect(stats.size).toBe(2);
      expect(stats.maxEntries).toBe(10);
    });

    it('returns all cache keys without prefix', () => {
      cache.set('alpha', 'a', 'cache-first');
      cache.set('beta', 'b', 'cache-first');

      const keys = cache.getKeys();
      expect(keys).toContain('alpha');
      expect(keys).toContain('beta');
    });
  });

  describe('persistence', () => {
    it('persists cache entries to localStorage', () => {
      const persistentCache = new CacheManager({
        defaultTTL: 60000,
        maxEntries: 10,
        prefix: 'persist_test_',
        persist: true,
        maxPersistSize: 2 * 1024 * 1024,
      });

      persistentCache.set('persisted-key', { name: 'test' }, 'cache-first');

      const stored = localStorage.getItem('persist_test___index');
      expect(stored).not.toBeNull();
      expect(stored).toContain('persisted-key');
    });

    it('loads entries from localStorage on construction', () => {
      // Pre-populate localStorage
      const entry = {
        data: 'loaded-value',
        timestamp: Date.now(),
        expiresAt: Date.now() + 60000,
        strategy: 'cache-first',
        key: 'loaded-key',
      };
      localStorage.setItem(
        'load_test___index',
        JSON.stringify([['load_test_loaded-key', entry]])
      );

      const loadedCache = new CacheManager({
        defaultTTL: 60000,
        maxEntries: 10,
        prefix: 'load_test_',
        persist: true,
        maxPersistSize: 2 * 1024 * 1024,
      });

      expect(loadedCache.has('loaded-key')).toBe(true);
    });

    it('does not load expired entries from localStorage', () => {
      const entry = {
        data: 'expired-value',
        timestamp: Date.now() - 120000,
        expiresAt: Date.now() - 60000, // expired
        strategy: 'cache-first',
        key: 'expired-key',
      };
      localStorage.setItem(
        'expired_test___index',
        JSON.stringify([['expired_test_expired-key', entry]])
      );

      const loadedCache = new CacheManager({
        defaultTTL: 60000,
        maxEntries: 10,
        prefix: 'expired_test_',
        persist: true,
        maxPersistSize: 2 * 1024 * 1024,
      });

      expect(loadedCache.has('expired-key')).toBe(false);
    });
  });
});
