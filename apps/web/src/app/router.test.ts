/**
 * Router Tests
 * 
 * Basic tests for router functionality including route guards and lazy loading.
 */

import { vi, describe, test, expect, beforeEach, afterEach } from 'vitest';
import { Router } from './router.js';

// Mock DOM methods
Object.defineProperty(window, 'location', {
  value: {
    pathname: '/',
    search: '',
    hash: ''
  },
  writable: true
});

Object.defineProperty(window, 'history', {
  value: {
    pushState: vi.fn(),
    replaceState: vi.fn()
  },
  writable: true
});

describe('Router', () => {
  let router: Router;
  let mockContainer: HTMLElement;

  beforeEach(() => {
    // Reset DOM
    document.body.innerHTML = '<div data-router-view></div>';
    mockContainer = document.querySelector('[data-router-view]')!;
    
    // Create router instance
    router = new Router({
      enableTransitions: false // Disable transitions for tests
    });

    // Clear mocks
    vi.clearAllMocks();
  });

  afterEach(() => {
    router.destroy();
  });

  describe('Route Registration', () => {
    test('should register regular routes', () => {
      const handler = vi.fn();
      router.addRoute('/test', handler);

      expect(router.isProtectedRoute('/test')).toBe(false);
    });

    test('should register protected routes', () => {
      const handler = vi.fn();
      router.addProtectedRoute('/dashboard', handler);

      expect(router.isProtectedRoute('/dashboard')).toBe(true);
    });
  });

  describe('Authentication Guards', () => {
    test('should allow access to public routes without authentication', async () => {
      const handler = vi.fn();
      router.addRoute('/public', handler);
      
      // No auth check set, should allow access
      await router.navigate('/public');
      
      expect(handler).toHaveBeenCalled();
    });

    test('should block protected routes without authentication', async () => {
      const handler = vi.fn();
      const authCheck = vi.fn(() => false); // Not authenticated
      
      router.addProtectedRoute('/protected', handler);
      router.setAuthenticationCheck(authCheck);
      
      await router.navigate('/protected');
      
      // Should not call protected handler
      expect(handler).not.toHaveBeenCalled();
    });

    test('should allow protected routes with authentication', async () => {
      const handler = vi.fn();
      const authCheck = vi.fn(() => true); // Authenticated
      
      router.addProtectedRoute('/protected', handler);
      router.setAuthenticationCheck(authCheck);
      
      await router.navigate('/protected');
      
      expect(handler).toHaveBeenCalled();
    });
  });

  describe('Route Parameters', () => {
    test('should extract route parameters', async () => {
      const handler = vi.fn();
      router.addRoute('/user/:id/posts/:postId', handler);
      
      await router.navigate('/user/123/posts/456');
      
      expect(handler).toHaveBeenCalledWith({
        id: '123',
        postId: '456'
      });
    });
  });

  describe('Navigation', () => {
    test('should navigate to valid routes', async () => {
      const handler = vi.fn();
      router.addRoute('/test', handler);
      
      await router.navigate('/test');
      
      expect(handler).toHaveBeenCalled();
      expect(router.getCurrentPath()).toBe('/test');
    });

    test('should normalize paths correctly', async () => {
      const handler = vi.fn();
      router.addRoute('/test', handler);
      
      await router.navigate('test/');
      
      expect(router.getCurrentPath()).toBe('/test');
    });
  });

  describe('Error Handling', () => {
    test('should handle 404 routes with not found handler', async () => {
      const notFoundHandler = vi.fn();
      router.setNotFoundHandler(notFoundHandler);
      
      await router.navigate('/nonexistent');
      
      expect(notFoundHandler).toHaveBeenCalled();
    });
  });

  describe('Route Guards', () => {
    test('should respect custom route guards', async () => {
      const handler = vi.fn();
      const routeGuard = vi.fn(() => false);
      
      router.addRoute('/test', handler);
      router.setRouteGuard(routeGuard);
      
      await router.navigate('/test');
      
      expect(routeGuard).toHaveBeenCalledWith('/test');
      expect(handler).not.toHaveBeenCalled();
    });
  });
});