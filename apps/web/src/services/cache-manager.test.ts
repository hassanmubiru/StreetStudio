/**
 * Cache Manager Tests
 *
 * Tests for intelligent caching strategies, LRU eviction, and persistence.
 */

// @vitest-environment jsdom

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CacheManager } from './cache-manager.js';

describe('CacheManager', () => {
  let cacheManager: CacheManager;

  beforeEach(() => {
    localStorage.clear();
    cacheManager = new CacheManager({ persist: false });
  });

  describe('cache-first strategy', () => {
    it('returns cached data on cache hit', async () => {
      const fetcher = vi.fn().mockResolvedValue({ name: 'test' });

      // First call populates the cache
      const result1 = await cacheManager.get('test-key', {
        strategy: 'cache-first',
        fetcher,
      });

      // Second call should use cache
      const result2 = await cacheManager.get('test-key', {
        strategy: 'cache-first',
        fetcher,
      });

      expect(result1).toEqual({ name: 'test' });
      expect(result2).toEqual({ name: 'test' });
      expect(fetcher).toHaveBeenCalledTimes(1);
    });

    it('calls fetcher on cache miss', async () => {
      const fetcher = vi.fn().mockResolvedValue({ id: 1 });

      const result = await cacheManager.get('missing-key', {
        strategy: 'cache-first',
        fetcher,
      });

      expect(result).toEqual({ id: 1 });
      expect(fetcher).toHaveBeenCalledTimes(1);
    });

    it('respects TTL expiration', async () => {
      const fetcher = vi.fn()
        .mockResolvedValueOnce({ version: 1 })
        .mockResolvedValueOnce({ version: 2 });

      await cacheManager.get('ttl-key', {
        strategy: 'cache-first',
        fetcher,
        ttl: 50, // 50ms TTL
      });

      // Wait for expiration
      await new Promise((resolve) => setTimeout(resolve, 60));

      const result = await cacheManager.get('ttl-key', {
        strategy: 'cache-first',
        fetcher,
      });

      expect(result).toEqual({ version: 2 });
      expect(fetcher).toHaveBeenCalledTimes(2);
    });
  });

  describe('network-first strategy', () => {
    it('returns network data when available', async () => {
      const fetcher = vi.fn().mockResolvedValue({ fresh: true });

      const result = await cacheManager.get('net-key', {
        strategy: 'network-first',
        fetcher,
      });

      expect(result).toEqual({ fresh: true });
      expect(fetcher).toHaveBeenCalledTimes(1);
    });

    it('falls back to cache when network fails', async () => {
      const freshFetcher = vi.fn().mockResolvedValue({ data: 'cached' });
      const failingFetcher = vi.fn().mockRejectedValue(new Error('Network error'));

      // Populate cache
      await cacheManager.get('fallback-key', {
        strategy: 'network-first',
        fetcher: freshFetcher,
      });

      // Network fails, should use cache
      const result = await cacheManager.get('fallback-key', {
        strategy: 'network-first',
        fetcher: failingFetcher,
      });

      expect(result).toEqual({ data: 'cached' });
    });

    it('throws when network fails and no cache exists', async () => {
      const fetcher = vi.fn().mockRejectedValue(new Error('Network error'));

      await expect(
        cacheManager.get('no-cache-key', {
          strategy: 'network-first',
          fetcher,
        })
      ).rejects.toThrow('Network error');
    });
  });

  describe('stale-while-revalidate strategy', () => {
    it('returns stale data immediately and revalidates in background', async () => {
      const onRevalidate = vi.fn();
      const fetcher1 = vi.fn().mockResolvedValue({ version: 1 });
      const fetcher2 = vi.fn().mockResolvedValue({ version: 2 });

      // Populate cache
      await cacheManager.get('swr-key', {
        strategy: 'stale-while-revalidate',
        fetcher: fetcher1,
      });

      // Returns stale, revalidates in background
      const result = await cacheManager.get('swr-key', {
        strategy: 'stale-while-revalidate',
        fetcher: fetcher2,
        onRevalidate,
      });

      expect(result).toEqual({ version: 1 }); // Stale data returned immediately

      // Wait for background revalidation
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(onRevalidate).toHaveBeenCalledWith({ version: 2 });
    });

    it('fetches from network when no cache exists', async () => {
      const fetcher = vi.fn().mockResolvedValue({ data: 'new' });

      const result = await cacheManager.get('new-swr-key', {
        strategy: 'stale-while-revalidate',
        fetcher,
      });

      expect(result).toEqual({ data: 'new' });
      expect(fetcher).toHaveBeenCalledTimes(1);
    });
  });

  describe('cache management', () => {
    it('manually sets cache entries', () => {
      cacheManager.set('manual-key', { manual: true });
      expect(cacheManager.has('manual-key')).toBe(true);
    });

    it('invalidates specific entries', async () => {
      const fetcher = vi.fn().mockResolvedValue('data');

      await cacheManager.get('inv-key', { strategy: 'cache-first', fetcher });
      expect(cacheManager.has('inv-key')).toBe(true);

      const existed = cacheManager.invalidate('inv-key');
      expect(existed).toBe(true);
      expect(cacheManager.has('inv-key')).toBe(false);
    });

    it('invalidates entries by pattern', async () => {
      cacheManager.set('project:1:videos', ['v1']);
      cacheManager.set('project:1:members', ['m1']);
      cacheManager.set('project:2:videos', ['v2']);

      const count = cacheManager.invalidatePattern('project:1:');
      expect(count).toBe(2);
      expect(cacheManager.has('project:1:videos')).toBe(false);
      expect(cacheManager.has('project:1:members')).toBe(false);
      expect(cacheManager.has('project:2:videos')).toBe(true);
    });

    it('evicts LRU entries when max size is reached', () => {
      const smallCache = new CacheManager({ maxEntries: 3, persist: false });

      smallCache.set('a', 1);
      smallCache.set('b', 2);
      smallCache.set('c', 3);
      smallCache.set('d', 4); // Should evict 'a'

      expect(smallCache.has('a')).toBe(false);
      expect(smallCache.has('b')).toBe(true);
      expect(smallCache.has('d')).toBe(true);
    });

    it('clears all cache entries', () => {
      cacheManager.set('k1', 'v1');
      cacheManager.set('k2', 'v2');

      cacheManager.clear();

      expect(cacheManager.has('k1')).toBe(false);
      expect(cacheManager.has('k2')).toBe(false);
      expect(cacheManager.getStats().size).toBe(0);
    });

    it('returns correct stats', () => {
      cacheManager.set('s1', 'data1');
      cacheManager.set('s2', 'data2');

      const stats = cacheManager.getStats();
      expect(stats.size).toBe(2);
      expect(stats.oldestEntry).toBeLessThanOrEqual(Date.now());
      expect(stats.newestEntry).toBeLessThanOrEqual(Date.now());
    });

    it('returns cache keys without prefix', () => {
      cacheManager.set('key-one', 1);
      cacheManager.set('key-two', 2);

      const keys = cacheManager.getKeys();
      expect(keys).toContain('key-one');
      expect(keys).toContain('key-two');
    });
  });

  describe('persistence', () => {
    it('persists cache to localStorage and loads on init', () => {
      const persistentCache = new CacheManager({
        persist: true,
        prefix: 'test_persist_',
        defaultTTL: 60000,
      });

      persistentCache.set('persisted', { value: 42 });

      // Create new instance that should load from storage
      const newCache = new CacheManager({
        persist: true,
        prefix: 'test_persist_',
        defaultTTL: 60000,
      });

      expect(newCache.has('persisted')).toBe(true);
    });
  });
});
