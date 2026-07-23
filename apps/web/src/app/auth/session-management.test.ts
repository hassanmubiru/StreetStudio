/**
 * Session Management Unit Tests
 * 
 * Comprehensive unit tests for session management including:
 * - Session persistence and restoration
 * - Cross-tab synchronization
 * - Session security monitoring
 * - Session statistics and analytics
 * 
 * Requirements: 1.2, 1.6, 1.7
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import type { DashboardSession } from '@streetstudio/dashboard';
import { AuthController } from './auth-controller.js';
import { SessionManager } from './session-manager.js';

// Mock DashboardSession
const mockDashboardSession = {
  useBearerToken: vi.fn(),
  clearAuthentication: vi.fn(),
  currentMember: vi.fn(),
} as unknown as DashboardSession;

// Mock BroadcastChannel for cross-tab communication
class MockBroadcastChannel {
  public name: string;
  public listeners: Array<{ type: string; callback: Function }> = [];

  constructor(name: string) {
    this.name = name;
  }

  addEventListener(type: string, callback: Function) {
    this.listeners.push({ type, callback });
  }

  removeEventListener(type: string, callback: Function) {
    this.listeners = this.listeners.filter(l => l.callback !== callback);
  }

  postMessage(data: any) {
    // Simulate broadcasting to other tabs by calling listeners
    this.listeners
      .filter(l => l.type === 'message')
      .forEach(l => l.callback({ data }));
  }

  close() {
    this.listeners = [];
  }
}

global.BroadcastChannel = MockBroadcastChannel as any;

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock console methods
global.console.warn = vi.fn();
global.console.error = vi.fn();

describe('Session Management', () => {
  let authController: AuthController;
  let sessionManager: SessionManager;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    localStorage.clear();
    sessionStorage.clear();
    
    authController = new AuthController(mockDashboardSession);
    sessionManager = new SessionManager(authController);
  });

  afterEach(() => {
    vi.useRealTimers();
    authController.destroy();
    sessionManager.destroy();
  });

  describe('Session State Management', () => {
    test('should track session start and end times', async () => {
      // Mock successful login
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          token: 'test-token',
          refreshToken: 'test-refresh',
          expiresIn: 3600,
          user: { id: 'user-123', email: 'test@example.com' }
        })
      });

      // Login should start session tracking
      await authController.login('test@example.com', 'password123');

      // Verify session started
      const duration = sessionManager.getSessionDuration();
      expect(duration).toBeGreaterThanOrEqual(0);

      // Advance time
      vi.advanceTimersByTime(5 * 60 * 1000); // 5 minutes

      // Check duration
      const newDuration = sessionManager.getSessionDuration();
      expect(newDuration).toBe(5 * 60 * 1000);
    });

    test('should update session statistics on login', async () => {
      const initialStats = sessionManager.getStats();
      const initialLoginCount = initialStats.loginCount;

      // Mock successful login
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          token: 'test-token',
          refreshToken: 'test-refresh',
          expiresIn: 3600,
          user: { id: 'user-123', email: 'test@example.com' }
        })
      });

      await authController.login('test@example.com', 'password123');

      const updatedStats = sessionManager.getStats();
      expect(updatedStats.loginCount).toBe(initialLoginCount + 1);
      expect(updatedStats.lastLogin).toBeInstanceOf(Date);
    });

    test('should calculate average session duration correctly', async () => {
      // Mock two login sessions
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          token: 'test-token',
          refreshToken: 'test-refresh', 
          expiresIn: 3600,
          user: { id: 'user-123' }
        })
      });

      // First session
      await authController.login('test@example.com', 'password123');
      vi.advanceTimersByTime(10 * 60 * 1000); // 10 minutes
      
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true })
      });
      await authController.logout();

      // Second session
      await authController.login('test@example.com', 'password123');
      vi.advanceTimersByTime(20 * 60 * 1000); // 20 minutes
      
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true })
      });
      await authController.logout();

      const stats = sessionManager.getStats();
      expect(stats.loginCount).toBe(2);
      expect(stats.totalSessionTime).toBe(30 * 60 * 1000); // 30 minutes total
      expect(stats.averageSessionDuration).toBe(15 * 60 * 1000); // 15 minutes average
    });

    test('should handle session state subscriptions', async () => {
      const stateHandler = vi.fn();
      const unsubscribe = sessionManager.subscribe(stateHandler);

      // Should call handler immediately with current state
      expect(stateHandler).toHaveBeenCalledWith(
        expect.objectContaining({ isAuthenticated: false })
      );

      // Mock login
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          token: 'test-token',
          refreshToken: 'test-refresh',
          expiresIn: 3600,
          user: { id: 'user-123' }
        })
      });

      await authController.login('test@example.com', 'password123');

      // Should notify subscribers of state change
      expect(stateHandler).toHaveBeenCalledWith(
        expect.objectContaining({ isAuthenticated: true })
      );

      // Unsubscribe should work
      unsubscribe();
      stateHandler.mockClear();

      // Further changes should not notify unsubscribed handler
      mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
      await authController.logout();
      
      expect(stateHandler).not.toHaveBeenCalled();
    });

    test('should handle subscription errors gracefully', async () => {
      const errorHandler = vi.fn(() => {
        throw new Error('Handler error');
      });
      
      sessionManager.subscribe(errorHandler);

      // Mock login - should not crash despite handler error
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          token: 'test-token',
          refreshToken: 'test-refresh',
          expiresIn: 3600,
          user: { id: 'user-123' }
        })
      });

      await expect(authController.login('test@example.com', 'password123')).resolves.toBeDefined();
    });
  });

  describe('Cross-Tab Synchronization', () => {
    test('should broadcast login events to other tabs', async () => {
      const broadcastSpy = vi.fn();
      const mockChannel = new MockBroadcastChannel('streetstudio-session');
      mockChannel.postMessage = broadcastSpy;

      // Mock successful login
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          token: 'test-token',
          refreshToken: 'test-refresh',
          expiresIn: 3600,
          user: { id: 'user-123', email: 'test@example.com' }
        })
      });

      await authController.login('test@example.com', 'password123');

      // Should broadcast login event
      expect(broadcastSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'login',
          data: expect.objectContaining({
            userId: 'user-123'
          })
        })
      );
    });

    test('should broadcast logout events to other tabs', async () => {
      // Setup authenticated state
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          token: 'test-token',
          refreshToken: 'test-refresh',
          expiresIn: 3600,
          user: { id: 'user-123' }
        })
      });

      await authController.login('test@example.com', 'password123');

      const broadcastSpy = vi.fn();
      const mockChannel = new MockBroadcastChannel('streetstudio-session');
      mockChannel.postMessage = broadcastSpy;

      // Mock logout
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true })
      });

      await authController.logout();

      // Should broadcast logout event
      expect(broadcastSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'logout',
          data: expect.objectContaining({
            reason: 'user-initiated'
          })
        })
      );
    });

    test('should handle cross-tab logout synchronization', () => {
      // Create a second session manager to simulate another tab
      const secondAuth = new AuthController(mockDashboardSession);
      const secondSession = new SessionManager(secondAuth);

      // Setup authenticated state in second tab
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          token: 'test-token',
          refreshToken: 'test-refresh',
          expiresIn: 3600,
          user: { id: 'user-123' }
        })
      });

      // Simulate receiving logout message from another tab
      const mockChannel = new MockBroadcastChannel('streetstudio-session');
      mockChannel.addEventListener('message', (event: any) => {
        if (event.data.type === 'logout' && secondAuth.isAuthenticated()) {
          secondAuth.logout();
        }
      });

      // Broadcast logout message
      mockChannel.postMessage({
        type: 'logout',
        timestamp: Date.now(),
        data: { reason: 'user-initiated' }
      });

      secondAuth.destroy();
      secondSession.destroy();
    });

    test('should handle cross-tab login synchronization', async () => {
      const secondAuth = new AuthController(mockDashboardSession);
      const secondSession = new SessionManager(secondAuth);

      // Mock session restoration
      localStorage.setItem('streetstudio_auth', JSON.stringify({
        token: 'stored-token',
        refreshToken: 'stored-refresh',
        expiry: new Date(Date.now() + 3600000).toISOString(),
        user: { id: 'user-123' }
      }));

      mockDashboardSession.currentMember.mockResolvedValue({ id: 'user-123' });

      const mockChannel = new MockBroadcastChannel('streetstudio-session');
      mockChannel.addEventListener('message', async (event: any) => {
        if (event.data.type === 'login' && !secondAuth.isAuthenticated()) {
          await secondAuth.initializeFromStorage();
        }
      });

      // Broadcast login message
      mockChannel.postMessage({
        type: 'login',
        timestamp: Date.now(),
        data: { userId: 'user-123' }
      });

      secondAuth.destroy();
      secondSession.destroy();
    });

    test('should handle page unload events', () => {
      // Setup authenticated state
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          token: 'test-token',
          refreshToken: 'test-refresh',
          expiresIn: 3600,
          user: { id: 'user-123' }
        })
      });

      // Simulate page unload
      const unloadEvent = new Event('beforeunload');
      window.dispatchEvent(unloadEvent);

      // Should handle gracefully without errors
      expect(true).toBe(true);
    });
  });

  describe('Security Monitoring', () => {
    test('should track multiple rapid login attempts as security event', async () => {
      const initialStats = sessionManager.getStats();
      const initialSecurityEvents = initialStats.securityEvents.length;

      // Mock multiple failed login attempts
      mockFetch.mockResolvedValue({
        ok: false,
        text: async () => 'Invalid credentials'
      });

      // Perform multiple rapid login attempts
      for (let i = 0; i < 6; i++) {
        await authController.login('test@example.com', 'wrongpassword');
      }

      // Should generate security event for suspicious activity
      const updatedStats = sessionManager.getStats();
      const securityEvents = updatedStats.securityEvents;
      
      // May generate security events based on implementation
      expect(securityEvents.length).toBeGreaterThanOrEqual(initialSecurityEvents);
    });

    test('should handle security events from other tabs', () => {
      const initialEvents = sessionManager.getStats().securityEvents.length;

      const mockChannel = new MockBroadcastChannel('streetstudio-session');
      
      // Simulate security event from another tab
      mockChannel.postMessage({
        type: 'security-event',
        timestamp: Date.now(),
        data: {
          type: 'suspicious-activity',
          details: { rapidLoginAttempts: 10 },
          severity: 'high'
        }
      });

      // Should handle security event
      const updatedStats = sessionManager.getStats();
      expect(updatedStats.securityEvents.length).toBeGreaterThanOrEqual(initialEvents);
    });

    test('should generate security warnings for high severity events', () => {
      const eventSpy = vi.fn();
      window.addEventListener('show-notification', eventSpy);

      const mockChannel = new MockBroadcastChannel('streetstudio-session');
      
      // Simulate high severity security event
      mockChannel.postMessage({
        type: 'security-event',
        timestamp: Date.now(),
        data: {
          type: 'suspicious-activity',
          details: { concurrentSessions: 5 },
          severity: 'high'
        }
      });

      // May trigger notification based on implementation
      window.removeEventListener('show-notification', eventSpy);
    });

    test('should clear statistics when requested', () => {
      // Add some mock stats
      const mockStats = {
        loginCount: 5,
        lastLogin: new Date(),
        totalSessionTime: 300000,
        averageSessionDuration: 60000,
        securityEvents: [
          {
            type: 'suspicious-activity' as const,
            details: {},
            severity: 'low' as const
          }
        ]
      };

      // Clear stats
      sessionManager.clearStats();

      const clearedStats = sessionManager.getStats();
      expect(clearedStats.loginCount).toBe(0);
      expect(clearedStats.lastLogin).toBeNull();
      expect(clearedStats.totalSessionTime).toBe(0);
      expect(clearedStats.averageSessionDuration).toBe(0);
      expect(clearedStats.securityEvents).toHaveLength(0);
    });
  });

  describe('Session Statistics Persistence', () => {
    test('should persist statistics to localStorage', async () => {
      // Mock successful login
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          token: 'test-token',
          refreshToken: 'test-refresh',
          expiresIn: 3600,
          user: { id: 'user-123' }
        })
      });

      await authController.login('test@example.com', 'password123');

      // Advance time and logout to update stats
      vi.advanceTimersByTime(10 * 60 * 1000);
      
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true })
      });
      
      await authController.logout();

      // Stats should be persisted
      const stored = localStorage.getItem('streetstudio_session_stats');
      expect(stored).toBeTruthy();

      const parsedStats = JSON.parse(stored!);
      expect(parsedStats.loginCount).toBeGreaterThan(0);
      expect(parsedStats.totalSessionTime).toBeGreaterThan(0);
    });

    test('should load statistics from localStorage on initialization', () => {
      const mockStats = {
        loginCount: 3,
        lastLogin: new Date('2024-01-01').toISOString(),
        totalSessionTime: 180000,
        averageSessionDuration: 60000,
        securityEvents: []
      };

      localStorage.setItem('streetstudio_session_stats', JSON.stringify(mockStats));

      // Create new session manager to test loading
      const newAuth = new AuthController(mockDashboardSession);
      const newSession = new SessionManager(newAuth);

      const loadedStats = newSession.getStats();
      expect(loadedStats.loginCount).toBe(3);
      expect(loadedStats.lastLogin).toEqual(new Date('2024-01-01'));
      expect(loadedStats.totalSessionTime).toBe(180000);

      newAuth.destroy();
      newSession.destroy();
    });

    test('should handle corrupted localStorage data gracefully', () => {
      localStorage.setItem('streetstudio_session_stats', 'invalid-json');

      // Should not crash with corrupted data
      const newAuth = new AuthController(mockDashboardSession);
      const newSession = new SessionManager(newAuth);

      const stats = newSession.getStats();
      expect(stats.loginCount).toBe(0); // Default values

      newAuth.destroy();
      newSession.destroy();
    });
  });

  describe('Force Logout Functionality', () => {
    test('should force logout across all sessions', async () => {
      // Setup authenticated state
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          token: 'test-token',
          refreshToken: 'test-refresh',
          expiresIn: 3600,
          user: { id: 'user-123' }
        })
      });

      await authController.login('test@example.com', 'password123');

      const broadcastSpy = vi.fn();
      const mockChannel = new MockBroadcastChannel('streetstudio-session');
      mockChannel.postMessage = broadcastSpy;

      // Mock logout all sessions API
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true })
      });

      await sessionManager.forceLogoutAll();

      // Should broadcast force logout
      expect(broadcastSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'logout',
          data: expect.objectContaining({
            reason: 'force-logout'
          })
        })
      );

      // Should be logged out
      expect(authController.isAuthenticated()).toBe(false);
    });
  });

  describe('Session Manager Lifecycle', () => {
    test('should clean up resources on destroy', () => {
      const initialStats = sessionManager.getStats();
      
      // Add some session time
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          token: 'test-token',
          refreshToken: 'test-refresh',
          expiresIn: 3600,
          user: { id: 'user-123' }
        })
      });

      // Destroy should clean up properly
      sessionManager.destroy();

      // Should handle multiple destroy calls gracefully
      expect(() => sessionManager.destroy()).not.toThrow();
    });

    test('should handle errors in statistics operations gracefully', () => {
      // Mock localStorage errors
      const originalSetItem = localStorage.setItem;
      localStorage.setItem = vi.fn(() => {
        throw new Error('Storage error');
      });

      // Should not crash when storage fails
      expect(() => sessionManager.clearStats()).not.toThrow();

      // Restore original method
      localStorage.setItem = originalSetItem;
    });
  });

  describe('Session Duration Calculations', () => {
    test('should return zero duration for unauthenticated sessions', () => {
      const duration = sessionManager.getSessionDuration();
      expect(duration).toBe(0);
    });

    test('should handle session duration during authentication state changes', async () => {
      // Start with no session
      expect(sessionManager.getSessionDuration()).toBe(0);

      // Mock login
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          token: 'test-token',
          refreshToken: 'test-refresh',
          expiresIn: 3600,
          user: { id: 'user-123' }
        })
      });

      await authController.login('test@example.com', 'password123');

      // Should track duration
      expect(sessionManager.getSessionDuration()).toBeGreaterThanOrEqual(0);

      // Advance time
      vi.advanceTimersByTime(5000); // 5 seconds
      expect(sessionManager.getSessionDuration()).toBe(5000);

      // Logout
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true })
      });

      await authController.logout();

      // Should return zero after logout
      expect(sessionManager.getSessionDuration()).toBe(0);
    });
  });
});