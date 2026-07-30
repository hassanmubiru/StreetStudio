/**
 * Unit Tests: Code Splitting Utilities
 * 
 * Tests for dynamic import wrappers, route-based code splitting,
 * retry logic, timeout handling, and module caching.
 * 
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createLazyModule,
  RouteSplitManager,
  ModuleLoadError,
  clearModuleCache,
} from './code-splitting.js';

describe('Code Splitting', () => {
  beforeEach(() => {
    clearModuleCache();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('createLazyModule', () => {
    it('should load a module successfully', async () => {
      const mockModule = { default: 'TestComponent' };
      const factory = vi.fn().mockResolvedValue(mockModule);

      const loader = createLazyModule(factory);
      const result = await loader();

      expect(result).toBe(mockModule);
      expect(factory).toHaveBeenCalledTimes(1);
    });

    it('should cache loaded modules and not re-fetch', async () => {
      const mockModule = { default: 'TestComponent' };
      const factory = vi.fn().mockResolvedValue(mockModule);

      const loader = createLazyModule(factory);
      const result1 = await loader();
      const result2 = await loader();

      expect(result1).toBe(result2);
      expect(factory).toHaveBeenCalledTimes(1);
    });

    it('should call onLoadStart callback', async () => {
      const onLoadStart = vi.fn();
      const factory = vi.fn().mockResolvedValue({ default: 'Component' });

      const loader = createLazyModule(factory, { onLoadStart });
      await loader();

      expect(onLoadStart).toHaveBeenCalledTimes(1);
    });

    it('should call onLoadComplete callback with loaded module', async () => {
      const mockModule = { default: 'Component' };
      const onLoadComplete = vi.fn();
      const factory = vi.fn().mockResolvedValue(mockModule);

      const loader = createLazyModule(factory, { onLoadComplete });
      await loader();

      expect(onLoadComplete).toHaveBeenCalledWith(mockModule);
    });

    it('should retry on failure according to retry count', async () => {
      vi.useRealTimers();
      const factory = vi.fn()
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValue({ default: 'Component' });

      const loader = createLazyModule(factory, { retries: 2, retryDelay: 10 });

      const result = await loader();

      expect(result).toEqual({ default: 'Component' });
      expect(factory).toHaveBeenCalledTimes(3);
    });

    it('should throw ModuleLoadError after exhausting retries', async () => {
      vi.useRealTimers();
      const factory = vi.fn().mockRejectedValue(new Error('Network error'));

      const loader = createLazyModule(factory, { retries: 1, retryDelay: 10 });

      await expect(loader()).rejects.toThrow(ModuleLoadError);
      expect(factory).toHaveBeenCalledTimes(2); // initial + 1 retry
    });

    it('should call onLoadError when all retries fail', async () => {
      vi.useRealTimers();
      const onLoadError = vi.fn();
      const factory = vi.fn().mockRejectedValue(new Error('Failed'));

      const loader = createLazyModule(factory, { retries: 0, onLoadError });

      await expect(loader()).rejects.toThrow();
      expect(onLoadError).toHaveBeenCalled();
    });

    it('should timeout if module takes too long', async () => {
      vi.useRealTimers();
      const factory = vi.fn(() => new Promise((_, reject) => {
        // Will be rejected by the timeout wrapper
        setTimeout(() => reject(new Error('manual timeout')), 5000);
      }));

      const loader = createLazyModule(factory, { timeout: 50, retries: 0 });

      await expect(loader()).rejects.toThrow('Failed to load module');
    });

    it('should deduplicate concurrent requests for the same module', async () => {
      vi.useRealTimers();
      const mockModule = { default: 'Component' };
      let callCount = 0;
      const factory = vi.fn(() => {
        callCount++;
        return new Promise(resolve => setTimeout(() => resolve(mockModule), 50));
      });

      const loader = createLazyModule(factory);
      const promise1 = loader();
      const promise2 = loader();

      const [result1, result2] = await Promise.all([promise1, promise2]);

      expect(result1).toBe(result2);
      expect(factory).toHaveBeenCalledTimes(1);
    });
  });

  describe('ModuleLoadError', () => {
    it('should have correct name and message', () => {
      const error = new ModuleLoadError('Test error');
      expect(error.name).toBe('ModuleLoadError');
      expect(error.message).toBe('Test error');
    });

    it('should preserve cause error', () => {
      const cause = new Error('Root cause');
      const error = new ModuleLoadError('Wrapper', cause);
      expect(error.cause).toBe(cause);
    });
  });

  describe('RouteSplitManager', () => {
    let manager: RouteSplitManager;

    beforeEach(() => {
      manager = new RouteSplitManager();
    });

    it('should register and load a route module', async () => {
      const mockModule = { default: 'DashboardPage' };
      manager.registerRoute({
        path: '/dashboard',
        factory: () => Promise.resolve(mockModule),
      });

      const result = await manager.loadRoute('/dashboard');
      expect(result).toBe(mockModule);
    });

    it('should match parameterized routes', async () => {
      const mockModule = { default: 'ProjectPage' };
      manager.registerRoute({
        path: '/projects/:id',
        factory: () => Promise.resolve(mockModule),
      });

      const result = await manager.loadRoute('/projects/abc-123');
      expect(result).toBe(mockModule);
    });

    it('should throw for unregistered routes', async () => {
      await expect(manager.loadRoute('/unknown')).rejects.toThrow(
        'No route configuration found for path: /unknown'
      );
    });

    it('should return registered route paths', () => {
      manager.registerRoute({ path: '/dashboard', factory: () => Promise.resolve({}) });
      manager.registerRoute({ path: '/settings', factory: () => Promise.resolve({}) });

      const routes = manager.getRegisteredRoutes();
      expect(routes).toContain('/dashboard');
      expect(routes).toContain('/settings');
    });

    it('should preload routes marked for preloading', () => {
      const factory = vi.fn().mockResolvedValue({ default: 'Page' });
      manager.registerRoute({
        path: '/dashboard',
        factory,
        preload: true,
        priority: 'high',
      });

      // Mock requestIdleCallback
      vi.stubGlobal('requestIdleCallback', (cb: Function) => { cb(); return 1; });

      manager.startPreloading();
      // Preloading is async, verify factory was eventually called
      expect(factory).toHaveBeenCalled();

      vi.unstubAllGlobals();
    });

    it('should silently handle preload failures', async () => {
      const factory = vi.fn().mockRejectedValue(new Error('Preload failed'));
      manager.registerRoute({
        path: '/heavy-page',
        factory,
        preload: true,
      });

      vi.stubGlobal('requestIdleCallback', (cb: Function) => { cb(); return 1; });

      // Should not throw
      manager.startPreloading();

      vi.unstubAllGlobals();
    });

    it('should clear module cache', async () => {
      const factory = vi.fn().mockResolvedValue({ default: 'Page' });
      manager.registerRoute({ path: '/test', factory });

      await manager.loadRoute('/test');
      expect(factory).toHaveBeenCalledTimes(1);

      manager.clearCache();

      // After clearing, factory should be called again
      await manager.loadRoute('/test');
      expect(factory).toHaveBeenCalledTimes(2);
    });

    it('should preload a specific route', async () => {
      const factory = vi.fn().mockResolvedValue({ default: 'Page' });
      manager.registerRoute({ path: '/dashboard', factory });

      await manager.preloadRoute('/dashboard');
      expect(factory).toHaveBeenCalledTimes(1);
    });

    it('should ignore preload for unknown routes', async () => {
      // Should not throw
      await manager.preloadRoute('/unknown');
    });
  });

  describe('clearModuleCache', () => {
    it('should clear all cached modules', async () => {
      const factory = vi.fn().mockResolvedValue({ default: 'Module' });
      const loader = createLazyModule(factory);

      await loader();
      expect(factory).toHaveBeenCalledTimes(1);

      clearModuleCache();

      // Create a new loader since the cache key is based on factory.toString()
      const loader2 = createLazyModule(factory);
      await loader2();
      expect(factory).toHaveBeenCalledTimes(2);
    });
  });
});
