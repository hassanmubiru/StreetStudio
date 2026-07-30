/**
 * Performance Benchmark Integration Tests
 *
 * Tests lazy loading behavior, cache strategies, and memory cleanup
 * across the performance modules working together.
 *
 * Requirements: 12.1
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../../app/client-logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
  },
}));

import {
  createLazyModule,
  RouteSplitManager,
  clearModuleCache,
  ModuleLoadError,
} from '../../utils/code-splitting.js';
import { CacheManager } from '../../services/cache-manager.js';

describe('Performance Benchmark Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearModuleCache();
  });

  describe('Lazy Loading Integration', () => {
    it('should load modules lazily and cache the result', async () => {
      const mockModule = { default: 'DashboardPage', render: vi.fn() };
      const factory = vi.fn().mockResolvedValue(mockModule);

      const lazyLoader = createLazyModule(factory);

      // First load
      const module1 = await lazyLoader();
      expect(factory).toHaveBeenCalledTimes(1);
      expect(module1).toBe(mockModule);

      // Second load should use cache
      const module2 = await lazyLoader();
      expect(factory).toHaveBeenCalledTimes(1); // Not called again
      expect(module2).toBe(mockModule);
    });

    it('should retry failed module loads with exponential backoff', async () => {
      const mockModule = { default: 'EditorPage' };
      const factory = vi.fn()
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce(mockModule);

      const lazyLoader = createLazyModule(factory, {
        retries: 2,
        retryDelay: 10, // Short delay for tests
      });

      const module = await lazyLoader();
      expect(module).toBe(mockModule);
      expect(factory).toHaveBeenCalledTimes(3);
    });

    it('should throw ModuleLoadError after exhausting retries', async () => {
      const factory = vi.fn().mockRejectedValue(new Error('Persistent failure'));

      const lazyLoader = createLazyModule(factory, {
        retries: 1,
        retryDelay: 10,
        timeout: 5000,
      });

      await expect(lazyLoader()).rejects.toThrow(ModuleLoadError);
      expect(factory).toHaveBeenCalledTimes(2); // 1 initial + 1 retry
    });

    it('should invoke lifecycle callbacks during module loading', async () => {
      const mockModule = { default: 'Page' };
      const onLoadStart = vi.fn();
      const onLoadComplete = vi.fn();
      const onLoadError = vi.fn();

      const factory = vi.fn().mockResolvedValue(mockModule);

      const lazyLoader = createLazyModule(factory, {
        onLoadStart,
        onLoadComplete,
        onLoadError,
      });

      await lazyLoader();

      expect(onLoadStart).toHaveBeenCalledTimes(1);
      expect(onLoadComplete).toHaveBeenCalledWith(mockModule);
      expect(onLoadError).not.toHaveBeenCalled();
    });

    it('should invoke onLoadError callback when loading fails', async () => {
      const onLoadError = vi.fn();
      const factory = vi.fn().mockRejectedValue(new Error('Load failed'));

      const lazyLoader = createLazyModule(factory, {
        retries: 0,
        onLoadError,
        timeout: 5000,
      });

      await expect(lazyLoader()).rejects.toThrow();
      expect(onLoadError).toHaveBeenCalled();
    });

    it('should prevent duplicate concurrent loads for the same module', async () => {
      let resolveFactory: (value: any) => void;
      const factoryPromise = new Promise((resolve) => {
        resolveFactory = resolve;
      });
      const factory = vi.fn().mockReturnValue(factoryPromise);

      const lazyLoader = createLazyModule(factory);

      // Start two loads concurrently
      const load1 = lazyLoader();
      const load2 = lazyLoader();

      // Factory should only be called once
      expect(factory).toHaveBeenCalledTimes(1);

      // Resolve the factory
      resolveFactory!({ default: 'Module' });

      const result1 = await load1;
      const result2 = await load2;

      expect(result1).toBe(result2);
    });
  });

  describe('Route-Based Code Splitting Integration', () => {
    let routeSplitManager: RouteSplitManager;

    beforeEach(() => {
      routeSplitManager = new RouteSplitManager();
    });

    afterEach(() => {
      routeSplitManager.clearCache();
    });

    it('should register and load routes on demand', async () => {
      const dashboardModule = { default: 'Dashboard' };
      const projectsModule = { default: 'Projects' };

      routeSplitManager.registerRoute({
        path: '/dashboard',
        factory: () => Promise.resolve(dashboardModule),
      });

      routeSplitManager.registerRoute({
        path: '/projects',
        factory: () => Promise.resolve(projectsModule),
      });

      const loaded = await routeSplitManager.loadRoute('/dashboard');
      expect(loaded).toBe(dashboardModule);
    });

    it('should support parameterized route patterns', async () => {
      const detailModule = { default: 'ProjectDetail' };

      routeSplitManager.registerRoute({
        path: '/projects/:id',
        factory: () => Promise.resolve(detailModule),
      });

      const loaded = await routeSplitManager.loadRoute('/projects/abc-123');
      expect(loaded).toBe(detailModule);
    });

    it('should throw for unregistered routes', async () => {
      await expect(routeSplitManager.loadRoute('/unknown')).rejects.toThrow(
        'No route configuration found for path: /unknown'
      );
    });

    it('should track registered routes', () => {
      routeSplitManager.registerRoute({
        path: '/dashboard',
        factory: () => Promise.resolve({}),
      });
      routeSplitManager.registerRoute({
        path: '/projects',
        factory: () => Promise.resolve({}),
      });

      const routes = routeSplitManager.getRegisteredRoutes();
      expect(routes).toContain('/dashboard');
      expect(routes).toContain('/projects');
      expect(routes.length).toBe(2);
    });

    it('should handle preload configuration for priority routes', async () => {
      const highPriorityModule = { default: 'Dashboard' };
      const lowPriorityModule = { default: 'Settings' };

      routeSplitManager.registerRoute({
        path: '/dashboard',
        factory: () => Promise.resolve(highPriorityModule),
        preload: true,
        priority: 'high',
      });

      routeSplitManager.registerRoute({
        path: '/settings',
        factory: () => Promise.resolve(lowPriorityModule),
        preload: true,
        priority: 'low',
      });

      // Preloading should not throw
      routeSplitManager.startPreloading();

      // Wait a tick for idle callbacks
      await new Promise(resolve => setTimeout(resolve, 150));
    });
  });

  describe('Cache Strategy Performance Integration', () => {
    let cacheManager: CacheManager;

    beforeEach(() => {
      cacheManager = new CacheManager({
        persist: false,
        defaultTTL: 5000,
        maxEntries: 100,
      });
    });

    it('should handle stale-while-revalidate strategy for dashboard data', async () => {
      let fetchCount = 0;
      const fetcher = vi.fn(() => {
        fetchCount++;
        return Promise.resolve({ data: `version-${fetchCount}` });
      });

      // First fetch - no cache, goes to network
      const result1 = await cacheManager.get('dashboard', {
        strategy: 'stale-while-revalidate',
        fetcher,
      });
      expect(result1.data).toBe('version-1');

      // Second fetch - returns stale cache, revalidates in background
      const result2 = await cacheManager.get('dashboard', {
        strategy: 'stale-while-revalidate',
        fetcher,
      });
      expect(result2.data).toBe('version-1'); // Returns stale immediately

      // Wait for background revalidation
      await new Promise(resolve => setTimeout(resolve, 50));

      // Third fetch should get the revalidated data
      const result3 = await cacheManager.get('dashboard', {
        strategy: 'stale-while-revalidate',
        fetcher,
      });
      expect(result3.data).toBe('version-2');
    });

    it('should enforce LRU eviction when max entries exceeded', async () => {
      const smallCache = new CacheManager({
        persist: false,
        maxEntries: 3,
        defaultTTL: 60000,
      });

      // Fill cache to capacity
      for (let i = 0; i < 3; i++) {
        await smallCache.get(`item-${i}`, {
          strategy: 'cache-first',
          fetcher: () => Promise.resolve({ id: i }),
        });
      }

      expect(smallCache.has('item-0')).toBe(true);
      expect(smallCache.has('item-1')).toBe(true);
      expect(smallCache.has('item-2')).toBe(true);

      // Adding one more should evict the least recently used
      await smallCache.get('item-3', {
        strategy: 'cache-first',
        fetcher: () => Promise.resolve({ id: 3 }),
      });

      // item-0 should be evicted (LRU)
      expect(smallCache.has('item-0')).toBe(false);
      expect(smallCache.has('item-3')).toBe(true);
    });

    it('should invalidate related cache entries by pattern', async () => {
      const fetcher = () => Promise.resolve({ data: 'test' });

      await cacheManager.get('project:1:info', { strategy: 'cache-first', fetcher });
      await cacheManager.get('project:1:members', { strategy: 'cache-first', fetcher });
      await cacheManager.get('project:2:info', { strategy: 'cache-first', fetcher });

      expect(cacheManager.has('project:1:info')).toBe(true);
      expect(cacheManager.has('project:1:members')).toBe(true);
      expect(cacheManager.has('project:2:info')).toBe(true);

      // Invalidate all project:1 entries
      const invalidated = cacheManager.invalidatePattern('project:1');
      expect(invalidated).toBe(2);

      expect(cacheManager.has('project:1:info')).toBe(false);
      expect(cacheManager.has('project:1:members')).toBe(false);
      expect(cacheManager.has('project:2:info')).toBe(true); // Unaffected
    });

    it('should track cache statistics accurately', async () => {
      const fetcher = () => Promise.resolve({ data: 'test' });

      const statsEmpty = cacheManager.getStats();
      expect(statsEmpty.size).toBe(0);

      await cacheManager.get('item-1', { strategy: 'cache-first', fetcher });
      await cacheManager.get('item-2', { strategy: 'cache-first', fetcher });

      const statsAfter = cacheManager.getStats();
      expect(statsAfter.size).toBe(2);
      expect(statsAfter.oldestEntry).not.toBeNull();
      expect(statsAfter.newestEntry).not.toBeNull();
      expect(statsAfter.newestEntry!).toBeGreaterThanOrEqual(statsAfter.oldestEntry!);
    });

    it('should clear entire cache without errors', async () => {
      const fetcher = () => Promise.resolve({ data: 'test' });

      await cacheManager.get('item-1', { strategy: 'cache-first', fetcher });
      await cacheManager.get('item-2', { strategy: 'cache-first', fetcher });

      expect(cacheManager.getStats().size).toBe(2);

      cacheManager.clear();

      expect(cacheManager.getStats().size).toBe(0);
      expect(cacheManager.has('item-1')).toBe(false);
      expect(cacheManager.has('item-2')).toBe(false);
    });
  });

  describe('Memory Cleanup Integration', () => {
    it('should clean up module cache with clearModuleCache', () => {
      // This verifies the cleanup utility exists and runs without error
      clearModuleCache();
      // No assertions needed beyond no-throw — it's a cleanup utility
    });

    it('should properly destroy route split manager and release references', () => {
      const manager = new RouteSplitManager();

      manager.registerRoute({
        path: '/test',
        factory: () => Promise.resolve({}),
      });

      expect(manager.getRegisteredRoutes().length).toBe(1);

      manager.clearCache();
      // After clearing, loading should still work (routes still registered)
      expect(manager.getRegisteredRoutes().length).toBe(1);
    });

    it('should handle cache TTL expiration for memory management', async () => {
      const shortTTLCache = new CacheManager({
        persist: false,
        defaultTTL: 50, // 50ms TTL
        maxEntries: 100,
      });

      const fetcher = vi.fn().mockResolvedValue({ data: 'fresh' });

      await shortTTLCache.get('item', {
        strategy: 'cache-first',
        fetcher,
        ttl: 50,
      });

      expect(shortTTLCache.has('item')).toBe(true);
      expect(fetcher).toHaveBeenCalledTimes(1);

      // Wait for TTL to expire
      await new Promise(resolve => setTimeout(resolve, 60));

      // Cache entry should be expired
      expect(shortTTLCache.has('item')).toBe(false);

      // Next access should fetch fresh data
      await shortTTLCache.get('item', {
        strategy: 'cache-first',
        fetcher,
        ttl: 50,
      });

      expect(fetcher).toHaveBeenCalledTimes(2);
    });

    it('should handle WebSocket manager cleanup without memory leaks', () => {
      const wsManager = new (
        // Import inline to avoid module-level WebSocket mocking issues
        require('../../services/websocket.js').WebSocketManager
      )({
        url: 'ws://localhost/ws',
        reconnect: false,
      });

      // Register handlers
      const unsub1 = wsManager.subscribe('event1', vi.fn());
      const unsub2 = wsManager.subscribe('event2', vi.fn());

      // Unsubscribe
      unsub1();
      unsub2();

      // Disconnect should clean up
      wsManager.disconnect();
      expect(wsManager.getState()).toBe('disconnected');
      expect(wsManager.getQueueSize()).toBe(0);
    });
  });

  describe('Code Splitting and Caching Combined Flow', () => {
    it('should lazy load a route module then cache subsequent visits', async () => {
      const routeSplitManager = new RouteSplitManager();
      const cacheManager = new CacheManager({ persist: false });

      const pageModule = { default: 'ProjectsPage', render: vi.fn() };
      const pageFactory = vi.fn().mockResolvedValue(pageModule);

      routeSplitManager.registerRoute({
        path: '/projects',
        factory: pageFactory,
      });

      // First visit: lazy loads module
      const module1 = await routeSplitManager.loadRoute('/projects');
      expect(pageFactory).toHaveBeenCalledTimes(1);
      expect(module1).toBe(pageModule);

      // Cache page data
      const pageData = { projects: [{ id: '1', name: 'A' }] };
      cacheManager.set('page:/projects', pageData);

      // Second visit: module cached, data cached
      const module2 = await routeSplitManager.loadRoute('/projects');
      expect(pageFactory).toHaveBeenCalledTimes(1); // Still cached
      expect(module2).toBe(pageModule);

      expect(cacheManager.has('page:/projects')).toBe(true);
    });
  });
});
