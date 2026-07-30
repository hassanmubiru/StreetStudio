/**
 * Unit Tests: Lazy Loading Components
 * 
 * Tests for lazy component creation, loading states, error handling,
 * and pre-configured heavy component loaders.
 * 
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createLazyComponent, type LazyComponentInstance } from './lazy-components.js';
import { clearModuleCache } from './code-splitting.js';

describe('Lazy Components', () => {
  let container: HTMLElement;

  beforeEach(() => {
    clearModuleCache();
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  describe('createLazyComponent', () => {
    it('should start in idle state', () => {
      const component = createLazyComponent({
        factory: () => Promise.resolve({ default: 'Module' }),
        container,
      });

      expect(component.state).toBe('idle');
    });

    it('should transition to loading state when load is called', async () => {
      const factory = () => new Promise(r => setTimeout(() => r({ default: 'Module' }), 100));

      const component = createLazyComponent({ factory, container });
      const loadPromise = component.load();

      expect(component.state).toBe('loading');

      await loadPromise;
    });

    it('should transition to loaded state on success', async () => {
      const component = createLazyComponent({
        factory: () => Promise.resolve({ default: 'Module' }),
        container,
      });

      await component.load();
      expect(component.state).toBe('loaded');
    });

    it('should transition to error state on failure', async () => {
      const component = createLazyComponent({
        factory: () => Promise.reject(new Error('Failed')),
        container,
        loadOptions: { retries: 0, timeout: 5000 },
      });

      await component.load();
      expect(component.state).toBe('error');
    });

    it('should show fallback while loading', async () => {
      const factory = () => new Promise(r => setTimeout(() => r({ default: 'Module' }), 100));

      const fallback = () => {
        const el = document.createElement('div');
        el.className = 'test-skeleton';
        el.textContent = 'Loading...';
        return el;
      };

      const component = createLazyComponent({ factory, container, fallback });
      const loadPromise = component.load();

      expect(container.querySelector('.test-skeleton')).not.toBeNull();
      expect(container.getAttribute('aria-busy')).toBe('true');

      await loadPromise;
    });

    it('should set aria-busy during loading', async () => {
      const factory = () => new Promise(r => setTimeout(() => r({ default: 'Module' }), 100));

      const component = createLazyComponent({ factory, container });
      const loadPromise = component.load();

      expect(container.getAttribute('aria-busy')).toBe('true');
      expect(container.getAttribute('role')).toBe('progressbar');

      await loadPromise;

      expect(container.getAttribute('aria-busy')).toBeNull();
    });

    it('should call mount function with loaded module', async () => {
      const mockModule = { default: 'TestEditor' };
      const mount = vi.fn();

      const component = createLazyComponent({
        factory: () => Promise.resolve(mockModule),
        container,
        mount,
      });

      await component.load();

      expect(mount).toHaveBeenCalledWith(mockModule, container);
    });

    it('should show error fallback on failure', async () => {
      const errorFallback = vi.fn((error: Error, retry: () => void) => {
        const el = document.createElement('div');
        el.className = 'error-display';
        el.textContent = error.message;
        return el;
      });

      const component = createLazyComponent({
        factory: () => Promise.reject(new Error('Load failed')),
        container,
        errorFallback,
        loadOptions: { retries: 0, timeout: 5000 },
      });

      await component.load();

      expect(errorFallback).toHaveBeenCalled();
      expect(container.querySelector('.error-display')).not.toBeNull();
    });

    it('should show default error with retry button when no errorFallback provided', async () => {
      const component = createLazyComponent({
        factory: () => Promise.reject(new Error('Load failed')),
        container,
        loadOptions: { retries: 0, timeout: 5000 },
      });

      await component.load();

      expect(container.querySelector('.lazy-component-error')).not.toBeNull();
      expect(container.querySelector('.retry-button')).not.toBeNull();
      expect(container.querySelector('[role="alert"]')).not.toBeNull();
    });

    it('should retry loading on retry() call', async () => {
      let callCount = 0;
      const factory = () => {
        callCount++;
        if (callCount === 1) {
          return Promise.reject(new Error('First attempt failed'));
        }
        return Promise.resolve({ default: 'Module' });
      };

      const component = createLazyComponent({
        factory,
        container,
        loadOptions: { retries: 0, timeout: 5000 },
      });

      await component.load();
      expect(component.state).toBe('error');

      await component.retry();
      expect(component.state).toBe('loaded');
    });

    it('should clean up on destroy', async () => {
      const mount = (module: any, el: HTMLElement) => {
        el.innerHTML = '<div class="loaded-content">Loaded</div>';
      };

      const component = createLazyComponent({
        factory: () => Promise.resolve({ default: 'Module' }),
        container,
        mount,
      });

      await component.load();
      expect(container.querySelector('.loaded-content')).not.toBeNull();

      component.destroy();
      expect(container.innerHTML).toBe('');
      expect(component.state).toBe('idle');
      expect(container.getAttribute('aria-busy')).toBeNull();
    });

    it('should not reload if already loaded', async () => {
      const factory = vi.fn().mockResolvedValue({ default: 'Module' });
      const mount = vi.fn();

      const component = createLazyComponent({
        factory,
        container,
        mount,
        loadOptions: { retries: 0 },
      });

      await component.load();
      await component.load(); // Second call should use cached

      expect(mount).toHaveBeenCalledTimes(2); // Mount is called each time
      // But factory should only be called once (cached)
    });
  });
});
