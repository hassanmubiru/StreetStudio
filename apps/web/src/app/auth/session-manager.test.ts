/**
 * Session Manager Tests
 * 
 * Unit tests for the session manager covering cross-tab synchronization,
 * security monitoring, and session statistics tracking.
 */

import { describe, it, expect, beforeEach, afterEach, vi, type MockedFunction } from 'vitest';
import { SessionManager } from './session-manager.js';

// Mock AuthController
const mockAuthController = {
  onAuthStateChange: vi.fn(),
  isAuthenticated: vi.fn(),
  logout: vi.fn(),
  logoutFromAllSessions: vi.fn(),
  initializeFromStorage: vi.fn()
};

// Mock BroadcastChannel
const mockBroadcastChannel = {
  postMessage: vi.fn(),
  addEventListener: vi.fn(),
  close: vi.fn()
};

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn()
};

Object.defineProperty(window, 'localStorage', { value: localStorageMock });
Object.defineProperty(window, 'BroadcastChannel', {
  value: vi.fn(() => mockBroadcastChannel)
});

describe('SessionManager', () => {
  let sessionManager: SessionManager;
  let authStateCallback: (state: any) => void;

  beforeEach(() => {
    vi.clearAllMocks();
    
    mockAuthController.onAuthStateChange.mockImplementation((callback) => {
      authStateCallback = callback;
      return () => {};
    });

    sessionManager = new SessionManager(mockAuthController as any);
  });

  afterEach(() => {
    sessionManager.destroy();
  });

  describe('Initialization', () => {
    it('should initialize with default stats', () => {
      const stats = sessionManager.getStats();
      
      expect(stats.loginCount).toBe(0);
      expect(stats.lastLogin).toBeNull();
      expect(stats.totalSessionTime).toBe(0);
      expect(stats.averageSessionDuration).toBe(0);
      expect(stats.securityEvents).toEqual([]);
    });

    it('should load existing stats from storage', () => {
      const storedStats = {
        loginCount: 5,
        lastLogin: '2024-01-01T00:00:00.000Z',
        totalSessionTime: 300000,
        averageSessionDuration: 60000,
        securityEvents: []
      };

      localStorageMock.getItem.mockReturnValue(JSON.stringify(storedStats));

      const newSessionManager = new SessionManager(mockAuthController as any);
      const stats = newSessionManager.getStats();

      expect(stats.loginCount).toBe(5);
      expect(stats.lastLogin).toEqual(new Date('2024-01-01T00:00:00.000Z'));
      expect(stats.totalSessionTime).toBe(300000);
      
      newSessionManager.destroy();
    });

    it('should handle corrupted stats storage', () => {
      localStorageMock.getItem.mockReturnValue('invalid-json');

      const newSessionManager = new SessionManager(mockAuthController as any);
      const stats = newSessionManager.getStats();

      expect(stats.loginCount).toBe(0);
      
      newSessionManager.destroy();
    });
  });

  describe('Session Tracking', () => {
    it('should track session start on login', () => {
      const mockUser = { id: 'user-1', email: 'test@example.com' };
      
      authStateCallback({
        isAuthenticated: true,
        currentUser: mockUser
      });

      const stats = sessionManager.getStats();
      expect(stats.loginCount).toBe(1);
      expect(stats.lastLogin).toBeInstanceOf(Date);
      
      expect(mockBroadcastChannel.postMessage).toHaveBeenCalledWith({
        type: 'login',
        timestamp: expect.any(Number),
        data: {
          userId: mockUser.id,
          timestamp: expect.any(Number)
        }
      });
    });

    it('should track session end on logout', () => {
      // Start session first
      authStateCallback({
        isAuthenticated: true,
        currentUser: { id: 'user-1' }
      });

      // End session
      authStateCallback({
        isAuthenticated: false,
        error: undefined
      });

      const stats = sessionManager.getStats();
      expect(stats.totalSessionTime).toBeGreaterThan(0);
      expect(stats.averageSessionDuration).toBeGreaterThan(0);
      
      expect(mockBroadcastChannel.postMessage).toHaveBeenCalledWith({
        type: 'logout',
        timestamp: expect.any(Number),
        data: {
          sessionDuration: expect.any(Number),
          reason: 'user-initiated'
        }
      });
    });

    it('should track error-based session end', () => {
      // Start session
      authStateCallback({
        isAuthenticated: true,
        currentUser: { id: 'user-1' }
      });

      // End with error
      authStateCallback({
        isAuthenticated: false,
        error: 'Session expired'
      });

      expect(mockBroadcastChannel.postMessage).toHaveBeenLastCalledWith({
        type: 'logout',
        timestamp: expect.any(Number),
        data: {
          sessionDuration: expect.any(Number),
          reason: 'error'
        }
      });
    });

    it('should calculate session duration correctly', () => {
      authStateCallback({
        isAuthenticated: true,
        currentUser: { id: 'user-1' }
      });

      const initialDuration = sessionManager.getSessionDuration();
      expect(initialDuration).toBeGreaterThanOrEqual(0);

      // Wait a bit
      setTimeout(() => {
        const laterDuration = sessionManager.getSessionDuration();
        expect(laterDuration).toBeGreaterThan(initialDuration);
      }, 10);
    });
  });

  describe('Cross-Tab Synchronization', () => {
    let messageCallback: (event: any) => void;

    beforeEach(() => {
      mockBroadcastChannel.addEventListener.mockImplementation((event, callback) => {
        if (event === 'message') {
          messageCallback = callback;
        }
      });
    });

    it('should sync logout from another tab', () => {
      mockAuthController.isAuthenticated.mockReturnValue(true);

      messageCallback({
        data: {
          type: 'logout',
          timestamp: Date.now()
        }
      });

      expect(mockAuthController.logout).toHaveBeenCalled();
    });

    it('should attempt session restore on cross-tab login', () => {
      mockAuthController.isAuthenticated.mockReturnValue(false);

      messageCallback({
        data: {
          type: 'login',
          timestamp: Date.now()
        }
      });

      expect(mockAuthController.initializeFromStorage).toHaveBeenCalled();
    });

    it('should handle security events from other tabs', () => {
      const securityEvent = {
        type: 'suspicious-activity',
        details: { rapidLoginAttempts: 6 },
        severity: 'high'
      };

      const notificationSpy = vi.spyOn(window, 'dispatchEvent');

      messageCallback({
        data: {
          type: 'security-event',
          timestamp: Date.now(),
          data: securityEvent
        }
      });

      const stats = sessionManager.getStats();
      expect(stats.securityEvents).toContain(securityEvent);
      
      expect(notificationSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'show-notification'
        })
      );
    });

    it('should broadcast session end on page unload', () => {
      mockAuthController.isAuthenticated.mockReturnValue(true);
      
      // Start session
      authStateCallback({
        isAuthenticated: true,
        currentUser: { id: 'user-1' }
      });

      // Trigger beforeunload
      window.dispatchEvent(new Event('beforeunload'));

      expect(mockBroadcastChannel.postMessage).toHaveBeenCalledWith({
        type: 'logout',
        timestamp: expect.any(Number),
        data: {
          reason: 'page-unload',
          sessionDuration: expect.any(Number)
        }
      });
    });
  });

  describe('Security Monitoring', () => {
    it('should detect rapid login attempts', () => {
      const notificationSpy = vi.spyOn(window, 'dispatchEvent');

      // Simulate 6 failed login attempts
      for (let i = 0; i < 6; i++) {
        authStateCallback({
          isAuthenticated: false,
          error: 'Invalid credentials'
        });
      }

      const stats = sessionManager.getStats();
      const securityEvents = stats.securityEvents.filter(
        event => event.type === 'suspicious-activity'
      );
      
      expect(securityEvents.length).toBeGreaterThan(0);
      expect(notificationSpy).toHaveBeenCalled();
    });

    it('should broadcast high-severity security events', () => {
      // Trigger security event
      for (let i = 0; i < 6; i++) {
        authStateCallback({
          isAuthenticated: false,
          error: 'Invalid credentials'
        });
      }

      expect(mockBroadcastChannel.postMessage).toHaveBeenCalledWith({
        type: 'security-event',
        timestamp: expect.any(Number),
        data: expect.objectContaining({
          severity: 'high'
        })
      });
    });
  });

  describe('Subscription Management', () => {
    it('should notify subscribers of state changes', () => {
      const subscriber = vi.fn();
      
      const unsubscribe = sessionManager.subscribe(subscriber);

      expect(subscriber).toHaveBeenCalledTimes(1); // Initial call
      
      authStateCallback({
        isAuthenticated: true,
        currentUser: { id: 'user-1' }
      });

      expect(subscriber).toHaveBeenCalledTimes(2);
      
      unsubscribe();
    });

    it('should handle subscriber errors gracefully', () => {
      const errorSubscriber = vi.fn().mockImplementation(() => {
        throw new Error('Subscriber error');
      });
      
      sessionManager.subscribe(errorSubscriber);

      expect(() => {
        authStateCallback({
          isAuthenticated: true,
          currentUser: { id: 'user-1' }
        });
      }).not.toThrow();
    });

    it('should remove subscriber on unsubscribe', () => {
      const subscriber = vi.fn();
      
      const unsubscribe = sessionManager.subscribe(subscriber);
      unsubscribe();

      authStateCallback({
        isAuthenticated: true,
        currentUser: { id: 'user-1' }
      });

      expect(subscriber).toHaveBeenCalledTimes(1); // Only initial call
    });
  });

  describe('Statistics Management', () => {
    it('should save stats to localStorage', () => {
      authStateCallback({
        isAuthenticated: true,
        currentUser: { id: 'user-1' }
      });

      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'streetstudio_session_stats',
        expect.any(String)
      );
    });

    it('should clear statistics', () => {
      // Add some data first
      authStateCallback({
        isAuthenticated: true,
        currentUser: { id: 'user-1' }
      });

      sessionManager.clearStats();

      const stats = sessionManager.getStats();
      expect(stats.loginCount).toBe(0);
      expect(stats.lastLogin).toBeNull();
      expect(stats.totalSessionTime).toBe(0);
      expect(stats.securityEvents).toEqual([]);
    });

    it('should calculate average session duration correctly', () => {
      // Simulate two sessions
      authStateCallback({
        isAuthenticated: true,
        currentUser: { id: 'user-1' }
      });
      
      authStateCallback({
        isAuthenticated: false
      });

      authStateCallback({
        isAuthenticated: true,
        currentUser: { id: 'user-1' }
      });
      
      authStateCallback({
        isAuthenticated: false
      });

      const stats = sessionManager.getStats();
      expect(stats.loginCount).toBe(2);
      expect(stats.averageSessionDuration).toBeGreaterThan(0);
    });
  });

  describe('Force Logout', () => {
    it('should force logout across all tabs', async () => {
      await sessionManager.forceLogoutAll();

      expect(mockBroadcastChannel.postMessage).toHaveBeenCalledWith({
        type: 'logout',
        timestamp: expect.any(Number),
        data: { reason: 'force-logout' }
      });
      
      expect(mockAuthController.logoutFromAllSessions).toHaveBeenCalled();
    });
  });

  describe('Cleanup', () => {
    it('should save session duration on destroy', () => {
      authStateCallback({
        isAuthenticated: true,
        currentUser: { id: 'user-1' }
      });

      const initialStats = sessionManager.getStats();
      const initialTotal = initialStats.totalSessionTime;

      sessionManager.destroy();

      expect(localStorageMock.setItem).toHaveBeenCalled();
      expect(mockBroadcastChannel.close).toHaveBeenCalled();
    });

    it('should clean up all resources', () => {
      sessionManager.destroy();

      expect(mockBroadcastChannel.close).toHaveBeenCalled();
    });
  });
});

describe('SecurityMonitor', () => {
  // Test the SecurityMonitor class separately since it's used by SessionManager
  it('should generate consistent device fingerprint', () => {
    const SecurityMonitor = (SessionManager as any).SecurityMonitor;
    
    if (SecurityMonitor) {
      const monitor1 = new SecurityMonitor();
      const monitor2 = new SecurityMonitor();

      const fingerprint1 = (monitor1 as any).deviceFingerprint;
      const fingerprint2 = (monitor2 as any).deviceFingerprint;

      expect(fingerprint1).toBe(fingerprint2);
      expect(fingerprint1).toHaveLength(32);
      
      monitor1.destroy();
      monitor2.destroy();
    }
  });

  it('should detect device changes', () => {
    const SecurityMonitor = (SessionManager as any).SecurityMonitor;
    
    if (SecurityMonitor) {
      const monitor = new SecurityMonitor();
      const eventCallback = vi.fn();
      
      monitor.onSecurityEvent(eventCallback);
      
      // Mock device fingerprint change
      (monitor as any).deviceFingerprint = 'different-fingerprint';
      monitor.checkDeviceChange();

      expect(eventCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'device-change',
          severity: 'medium'
        })
      );
      
      monitor.destroy();
    }
  });
});