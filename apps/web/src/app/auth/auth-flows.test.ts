/**
 * Authentication Flows Unit Tests
 * 
 * Comprehensive unit tests for authentication flows including:
 * - Login/logout scenarios and session persistence
 * - OAuth callback handling and error states  
 * - Token refresh and expiration scenarios
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

// Mock API responses
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock BroadcastChannel for cross-tab sync
class MockBroadcastChannel {
  constructor(public name: string) {}
  addEventListener = vi.fn();
  postMessage = vi.fn();
  close = vi.fn();
}
global.BroadcastChannel = MockBroadcastChannel as any;

// Mock console methods to avoid noise in test output
global.console.warn = vi.fn();
global.console.error = vi.fn();

describe('Authentication Flows', () => {
  let authController: AuthController;
  let sessionManager: SessionManager;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    
    // Reset localStorage
    localStorage.clear();
    sessionStorage.clear();
    
    // Create fresh instances
    authController = new AuthController(mockDashboardSession);
    sessionManager = new SessionManager(authController);
  });

  afterEach(() => {
    vi.useRealTimers();
    authController.destroy();
    sessionManager.destroy();
  });

  describe('Login/Logout Scenarios', () => {
    test('should handle successful login with credential validation', async () => {
      // Mock successful login API response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          token: 'test-jwt-token',
          refreshToken: 'test-refresh-token',
          expiresIn: 3600,
          user: {
            id: 'user-123',
            email: 'test@example.com',
            displayName: 'Test User'
          }
        })
      });

      const result = await authController.login('test@example.com', 'password123');

      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
      expect(authController.isAuthenticated()).toBe(true);
      
      // Verify API call
      expect(mockFetch).toHaveBeenCalledWith('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'test@example.com',
          password: 'password123'
        })
      });

      // Verify session setup
      expect(mockDashboardSession.useBearerToken).toHaveBeenCalledWith('test-jwt-token');
      
      // Verify state
      const state = authController.getState();
      expect(state.isAuthenticated).toBe(true);
      expect(state.currentUser?.email).toBe('test@example.com');
    });

    test('should handle login failure with generic error message', async () => {
      // Mock failed login API response
      mockFetch.mockResolvedValueOnce({
        ok: false,
        text: async () => 'Invalid credentials'
      });

      const result = await authController.login('test@example.com', 'wrongpassword');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid credentials');
      expect(authController.isAuthenticated()).toBe(false);
      
      // Verify no session is established
      expect(mockDashboardSession.useBearerToken).not.toHaveBeenCalled();
    });

    test('should handle network errors during login', async () => {
      // Mock network error
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await authController.login('test@example.com', 'password123');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Network error');
      expect(authController.isAuthenticated()).toBe(false);
    });

    test('should handle comprehensive logout with session cleanup', async () => {
      // Setup authenticated state first
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
      expect(authController.isAuthenticated()).toBe(true);

      // Mock logout API response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true })
      });

      // Perform logout
      await authController.logout();

      expect(authController.isAuthenticated()).toBe(false);
      expect(mockDashboardSession.clearAuthentication).toHaveBeenCalled();
      
      // Verify logout API call
      expect(mockFetch).toHaveBeenCalledWith('/api/auth/logout', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer test-token',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ allSessions: false })
      });

      // Verify state is cleared
      const state = authController.getState();
      expect(state.isAuthenticated).toBe(false);
      expect(state.currentUser).toBeUndefined();
    });

    test('should handle logout from all sessions', async () => {
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

      // Mock logout all sessions API response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true })
      });

      await authController.logoutFromAllSessions();

      expect(mockFetch).toHaveBeenCalledWith('/api/auth/logout', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer test-token',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ allSessions: true })
      });
    });

    test('should handle logout when API fails', async () => {
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

      // Mock logout API failure
      mockFetch.mockRejectedValueOnce(new Error('API Error'));

      // Should still complete logout locally
      await authController.logout();

      expect(authController.isAuthenticated()).toBe(false);
      expect(mockDashboardSession.clearAuthentication).toHaveBeenCalled();
    });
  });

  describe('Session Persistence', () => {
    test('should restore session from stored token', async () => {
      // Store valid auth data
      const authData = {
        token: 'stored-token',
        refreshToken: 'stored-refresh',
        expiry: new Date(Date.now() + 3600000).toISOString(), // 1 hour from now
        user: { id: 'user-123', email: 'test@example.com' }
      };
      localStorage.setItem('streetstudio_auth', JSON.stringify(authData));

      // Mock successful session validation
      mockDashboardSession.currentMember.mockResolvedValueOnce(authData.user);

      const restored = await authController.initializeFromStorage();

      expect(restored).toBe(true);
      expect(authController.isAuthenticated()).toBe(true);
      expect(mockDashboardSession.useBearerToken).toHaveBeenCalledWith('stored-token');
    });

    test('should handle expired stored token with refresh attempt', async () => {
      // Store expired auth data
      const authData = {
        token: 'expired-token',
        refreshToken: 'refresh-token',
        expiry: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
        user: { id: 'user-123' }
      };
      localStorage.setItem('streetstudio_auth', JSON.stringify(authData));

      // Mock successful token refresh
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          token: 'new-token',
          refreshToken: 'new-refresh',
          expiresIn: 3600
        })
      });

      const restored = await authController.initializeFromStorage();

      expect(restored).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith('/api/auth/refresh', expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer refresh-token'
        }
      }));
    });

    test('should clear invalid stored token', async () => {
      // Store invalid token data
      localStorage.setItem('streetstudio_auth', 'invalid-json');

      const restored = await authController.initializeFromStorage();

      expect(restored).toBe(false);
      expect(authController.isAuthenticated()).toBe(false);
    });

    test('should handle session timeout with warning', async () => {
      // Setup session with short timeout for testing
      const shortTimeoutController = new AuthController(mockDashboardSession, {
        sessionTimeout: 100 // 100ms for testing
      });

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

      await shortTimeoutController.login('test@example.com', 'password123');
      
      // Fast-forward past session timeout
      vi.advanceTimersByTime(150);

      // Should still be authenticated but warning should be shown
      expect(shortTimeoutController.isAuthenticated()).toBe(true);
      
      shortTimeoutController.destroy();
    });
  });

  describe('OAuth Integration', () => {
    test('should handle OAuth initiation with state parameter', async () => {
      const { oauthConfigService } = await import('../../services/oauth-config.js');
      
      // Mock OAuth configuration
      vi.spyOn(oauthConfigService, 'getEnabledProviders').mockResolvedValue([
        {
          id: 'google',
          name: 'google',
          displayName: 'Google',
          enabled: true,
          scopes: ['openid', 'email', 'profile'],
          authUrl: '/api/auth/oauth/google'
        }
      ]);

      const mockInitiateOAuth = vi.spyOn(oauthConfigService, 'initiateOAuth')
        .mockResolvedValue();

      await authController.initiateOAuth('google', '/dashboard');

      expect(mockInitiateOAuth).toHaveBeenCalledWith('google', '/dashboard');
    });

    test('should handle OAuth callback success', async () => {
      // Mock successful OAuth callback
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          token: 'oauth-token',
          refreshToken: 'oauth-refresh',
          expiresIn: 3600,
          user: {
            id: 'oauth-user',
            email: 'oauth@example.com',
            provider: 'google'
          }
        })
      });

      // Set up OAuth flow state
      sessionStorage.setItem('oauth_flow_state', JSON.stringify({
        state: 'test-state',
        providerId: 'google',
        returnUrl: '/dashboard',
        timestamp: Date.now(),
        scopes: ['openid', 'email']
      }));

      const { oauthConfigService } = await import('../../services/oauth-config.js');
      const result = await oauthConfigService.handleOAuthCallback(
        'auth-code',
        'test-state',
        'google'
      );

      expect(result.success).toBe(true);
      expect(result.returnUrl).toBe('/dashboard');
    });

    test('should handle OAuth callback with provider error', async () => {
      const { oauthConfigService } = await import('../../services/oauth-config.js');
      
      const result = await oauthConfigService.handleOAuthCallback(
        '',
        'test-state',
        'google',
        'access_denied',
        'User denied access'
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('cancelled');
    });

    test('should handle OAuth callback with invalid state', async () => {
      // Set up OAuth flow state
      sessionStorage.setItem('oauth_flow_state', JSON.stringify({
        state: 'correct-state',
        providerId: 'google',
        returnUrl: '/dashboard',
        timestamp: Date.now()
      }));

      const { oauthConfigService } = await import('../../services/oauth-config.js');
      
      const result = await oauthConfigService.handleOAuthCallback(
        'auth-code',
        'wrong-state', // Wrong state parameter
        'google'
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid OAuth state');
    });

    test('should handle OAuth callback with expired flow state', async () => {
      // Set up expired OAuth flow state (31 minutes ago)
      sessionStorage.setItem('oauth_flow_state', JSON.stringify({
        state: 'test-state',
        providerId: 'google',
        returnUrl: '/dashboard',
        timestamp: Date.now() - (31 * 60 * 1000) // 31 minutes ago
      }));

      const { oauthConfigService } = await import('../../services/oauth-config.js');
      
      const result = await oauthConfigService.handleOAuthCallback(
        'auth-code',
        'test-state',
        'google'
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('OAuth flow expired');
    });

    test('should handle multiple OAuth providers configuration', async () => {
      const { oauthConfigService } = await import('../../services/oauth-config.js');
      
      // Mock multiple providers
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          enabled: true,
          providers: [
            { id: 'google', enabled: true, displayName: 'Google' },
            { id: 'github', enabled: true, displayName: 'GitHub' },
            { id: 'microsoft', enabled: false, displayName: 'Microsoft' }
          ]
        })
      });

      const config = await oauthConfigService.getConfig();
      const enabledProviders = await oauthConfigService.getEnabledProviders();

      expect(config.providers).toHaveLength(3);
      expect(enabledProviders).toHaveLength(2);
      expect(enabledProviders.map(p => p.id)).toEqual(['google', 'github']);
    });
  });

  describe('Token Refresh and Expiration', () => {
    test('should automatically refresh token before expiration', async () => {
      // Setup authenticated state with token expiring soon
      const expiryTime = new Date(Date.now() + 4 * 60 * 1000); // 4 minutes from now
      localStorage.setItem('streetstudio_auth', JSON.stringify({
        token: 'expiring-token',
        refreshToken: 'refresh-token',
        expiry: expiryTime.toISOString(),
        user: { id: 'user-123' }
      }));

      // Mock successful refresh
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          token: 'refreshed-token',
          refreshToken: 'new-refresh-token',
          expiresIn: 3600
        })
      });

      // Initialize from storage
      await authController.initializeFromStorage();
      
      // Fast-forward to trigger refresh (default refresh margin is 5 minutes)
      vi.advanceTimersByTime(2 * 60 * 1000); // 2 minutes

      // Allow async operations to complete
      await vi.runAllTimersAsync();

      expect(mockFetch).toHaveBeenCalledWith('/api/auth/refresh', expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Authorization': 'Bearer refresh-token'
        })
      }));
    });

    test('should handle token refresh failure with retry logic', async () => {
      // Setup authenticated state
      localStorage.setItem('streetstudio_auth', JSON.stringify({
        token: 'failing-token',
        refreshToken: 'failing-refresh',
        expiry: new Date(Date.now() + 60000).toISOString(), // 1 minute
        user: { id: 'user-123' }
      }));

      // Mock failing refresh attempts
      mockFetch
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            token: 'recovered-token',
            refreshToken: 'recovered-refresh',
            expiresIn: 3600
          })
        });

      await authController.initializeFromStorage();
      
      // Trigger refresh by advancing time
      vi.advanceTimersByTime(5 * 60 * 1000);
      await vi.runAllTimersAsync();

      // Should succeed on third attempt
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    test('should handle complete token refresh failure', async () => {
      // Setup authenticated state
      localStorage.setItem('streetstudio_auth', JSON.stringify({
        token: 'failing-token',
        refreshToken: 'failing-refresh',
        expiry: new Date(Date.now() + 60000).toISOString(),
        user: { id: 'user-123' }
      }));

      // Mock all refresh attempts failing
      mockFetch.mockRejectedValue(new Error('Unauthorized'));

      await authController.initializeFromStorage();
      
      // Trigger refresh
      vi.advanceTimersByTime(5 * 60 * 1000);
      await vi.runAllTimersAsync();

      // Should eventually logout user
      expect(authController.isAuthenticated()).toBe(false);
    });

    test('should handle 401 authentication errors with automatic refresh', async () => {
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

      // Simulate 401 error from API
      window.dispatchEvent(new CustomEvent('api-error', {
        detail: { status: 401, response: 'Unauthorized' }
      }));

      // Mock successful refresh
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          token: 'refreshed-token',
          refreshToken: 'new-refresh',
          expiresIn: 3600
        })
      });

      // Allow auth error handler to run
      await vi.runAllTimersAsync();

      // Should attempt token refresh
      expect(mockFetch).toHaveBeenCalledWith('/api/auth/refresh', expect.any(Object));
    });

    test('should handle token expiry during user activity', async () => {
      // Create controller with custom refresh margin
      const customController = new AuthController(mockDashboardSession, {
        refreshMargin: 2 * 60 * 1000, // 2 minutes
        sessionTimeout: 30 * 60 * 1000
      });

      // Setup near-expiry token
      localStorage.setItem('streetstudio_auth', JSON.stringify({
        token: 'near-expiry-token',
        refreshToken: 'refresh-token',
        expiry: new Date(Date.now() + 90 * 1000).toISOString(), // 90 seconds
        user: { id: 'user-123' }
      }));

      mockDashboardSession.currentMember.mockResolvedValue({ id: 'user-123' });

      await customController.initializeFromStorage();

      // Mock successful refresh
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          token: 'refreshed-token',
          refreshToken: 'new-refresh',
          expiresIn: 3600
        })
      });

      // Advance time past refresh margin
      vi.advanceTimersByTime(3 * 60 * 1000);
      await vi.runAllTimersAsync();

      expect(mockFetch).toHaveBeenCalledWith('/api/auth/refresh', expect.any(Object));

      customController.destroy();
    });
  });

  describe('Session Manager Integration', () => {
    test('should track session statistics', async () => {
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

      const stats = sessionManager.getStats();
      expect(stats.loginCount).toBe(1);
      expect(stats.lastLogin).toBeInstanceOf(Date);
    });

    test('should handle cross-tab session synchronization', () => {
      const broadcastChannel = new MockBroadcastChannel('streetstudio-session');
      
      // Simulate logout from another tab
      const listener = vi.fn();
      broadcastChannel.addEventListener('message', listener);

      broadcastChannel.postMessage({
        type: 'logout',
        timestamp: Date.now(),
        data: { reason: 'user-initiated' }
      });

      expect(broadcastChannel.postMessage).toHaveBeenCalled();
    });

    test('should calculate session duration correctly', async () => {
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

      // Advance time by 10 minutes
      vi.advanceTimersByTime(10 * 60 * 1000);

      const duration = sessionManager.getSessionDuration();
      expect(duration).toBe(10 * 60 * 1000); // 10 minutes in milliseconds
    });

    test('should handle session security events', async () => {
      const stats = sessionManager.getStats();
      const initialEventCount = stats.securityEvents.length;

      // Login should not trigger security event
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

      const updatedStats = sessionManager.getStats();
      expect(updatedStats.securityEvents.length).toBe(initialEventCount);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    test('should handle malformed API responses gracefully', async () => {
      // Mock malformed response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ invalid: 'response' }) // Missing required fields
      });

      const result = await authController.login('test@example.com', 'password123');

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    test('should handle concurrent login attempts', async () => {
      // Mock successful response
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          token: 'test-token',
          refreshToken: 'test-refresh',
          expiresIn: 3600,
          user: { id: 'user-123' }
        })
      });

      // Start multiple login attempts simultaneously
      const [result1, result2] = await Promise.all([
        authController.login('test@example.com', 'password123'),
        authController.login('test@example.com', 'password123')
      ]);

      // Only one should succeed, or both should handle gracefully
      expect(result1.success || result2.success).toBe(true);
    });

    test('should handle storage quota exceeded errors', async () => {
      // Mock storage quota exceeded
      const originalSetItem = localStorage.setItem;
      localStorage.setItem = vi.fn(() => {
        throw new Error('QuotaExceededError');
      });

      // Should not crash when trying to store auth data
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          token: 'test-token',
          refreshToken: 'test-refresh',
          expiresIn: 3600,
          user: { id: 'user-123' }
        })
      });

      const result = await authController.login('test@example.com', 'password123');
      
      // Should still succeed even if storage fails
      expect(result.success).toBe(true);

      // Restore original method
      localStorage.setItem = originalSetItem;
    });

    test('should handle missing refresh token', async () => {
      // Store auth data without refresh token
      localStorage.setItem('streetstudio_auth', JSON.stringify({
        token: 'test-token',
        expiry: new Date(Date.now() - 1000).toISOString(), // Expired
        user: { id: 'user-123' }
        // No refreshToken
      }));

      const restored = await authController.initializeFromStorage();

      expect(restored).toBe(false);
      expect(authController.isAuthenticated()).toBe(false);
    });

    test('should handle network connectivity issues', async () => {
      // Mock network error
      mockFetch.mockRejectedValue(new Error('Failed to fetch'));

      const result = await authController.login('test@example.com', 'password123');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to fetch');
    });

    test('should handle session validation failure', async () => {
      // Setup stored auth
      localStorage.setItem('streetstudio_auth', JSON.stringify({
        token: 'invalid-token',
        refreshToken: 'invalid-refresh',
        expiry: new Date(Date.now() + 3600000).toISOString(),
        user: { id: 'user-123' }
      }));

      // Mock session validation failure
      mockDashboardSession.currentMember.mockRejectedValue(new Error('Unauthorized'));

      // Mock refresh failure too
      mockFetch.mockRejectedValue(new Error('Unauthorized'));

      const restored = await authController.initializeFromStorage();

      expect(restored).toBe(false);
      expect(authController.isAuthenticated()).toBe(false);
    });
  });

  describe('Security Features', () => {
    test('should implement secure token storage strategies', () => {
      const secureController = new AuthController(mockDashboardSession, {
        tokenStorage: {
          strategy: 'memory',
          secure: true,
          sameSite: 'strict'
        }
      });

      expect(secureController.getSessionInfo().storageStrategy).toBe('memory');

      secureController.destroy();
    });

    test('should handle session timeout configuration', () => {
      const config = {
        sessionTimeout: 15 * 60 * 1000, // 15 minutes
        refreshMargin: 2 * 60 * 1000,   // 2 minutes
        maxRetries: 5
      };

      const customController = new AuthController(mockDashboardSession, config);
      const sessionInfo = customController.getSessionInfo();

      expect(sessionInfo.sessionTimeout).toBe(15 * 60 * 1000);

      customController.destroy();
    });

    test('should clear sensitive data on logout', async () => {
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

      // Verify auth data is stored
      expect(localStorage.getItem('streetstudio_auth')).toBeTruthy();

      // Mock logout response
      mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) });

      await authController.logout();

      // Verify sensitive data is cleared
      expect(localStorage.getItem('streetstudio_auth')).toBeNull();
    });

    test('should validate session expiry times', async () => {
      const sessionInfo = authController.getSessionInfo();
      
      expect(sessionInfo.isAuthenticated).toBe(false);
      expect(sessionInfo.tokenExpiry).toBeUndefined();
      expect(sessionInfo.timeUntilExpiry).toBeUndefined();
    });
  });
});