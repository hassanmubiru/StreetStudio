/**
 * Authentication Controller Tests
 * 
 * Comprehensive unit tests for the enhanced authentication controller
 * covering token storage, session management, and security features.
 */

import { describe, it, expect, beforeEach, afterEach, vi, type MockedFunction } from 'vitest';
import { AuthController, type AuthState, type SessionConfig } from './auth-controller.js';

// Mock dependencies
const mockDashboardSession = {
  useBearerToken: vi.fn(),
  clearAuthentication: vi.fn(),
  currentMember: vi.fn()
};

const mockFetch = vi.fn() as MockedFunction<typeof fetch>;
global.fetch = mockFetch;

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn()
};
Object.defineProperty(window, 'localStorage', { value: localStorageMock });

// Mock sessionStorage
const sessionStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn()
};
Object.defineProperty(window, 'sessionStorage', { value: sessionStorageMock });

// Mock window.location
Object.defineProperty(window, 'location', {
  value: {
    href: '',
    pathname: '/dashboard',
    search: ''
  },
  writable: true
});

describe('AuthController', () => {
  let authController: AuthController;
  let mockConfig: SessionConfig;

  beforeEach(() => {
    vi.clearAllMocks();
    
    mockConfig = {
      tokenStorage: {
        strategy: 'memory',
        secure: true,
        sameSite: 'strict'
      },
      refreshMargin: 5 * 60 * 1000,
      maxRetries: 2,
      sessionTimeout: 30 * 60 * 1000
    };

    authController = new AuthController(mockDashboardSession as any, mockConfig);
  });

  afterEach(() => {
    authController.destroy();
  });

  describe('Initialization', () => {
    it('should initialize with default unauthenticated state', () => {
      const state = authController.getState();
      
      expect(state.isAuthenticated).toBe(false);
      expect(state.currentUser).toBeUndefined();
      expect(state.isLoading).toBe(false);
    });

    it('should initialize from stored authentication', async () => {
      const mockAuth = {
        token: 'stored-token',
        refreshToken: 'stored-refresh',
        expiry: new Date(Date.now() + 60000).toISOString(),
        user: { id: 'user-1', email: 'test@example.com' }
      };

      localStorageMock.getItem.mockReturnValue(JSON.stringify(mockAuth));
      mockDashboardSession.currentMember.mockResolvedValue(mockAuth.user);

      const result = await authController.initializeFromStorage();

      expect(result).toBe(true);
      expect(mockDashboardSession.useBearerToken).toHaveBeenCalledWith(mockAuth.token);
      
      const state = authController.getState();
      expect(state.isAuthenticated).toBe(true);
      expect(state.currentUser).toEqual(mockAuth.user);
    });

    it('should handle expired stored tokens', async () => {
      const expiredAuth = {
        token: 'expired-token',
        refreshToken: 'refresh-token',
        expiry: new Date(Date.now() - 60000).toISOString(), // Expired
        user: { id: 'user-1', email: 'test@example.com' }
      };

      localStorageMock.getItem.mockReturnValue(JSON.stringify(expiredAuth));
      
      // Mock successful token refresh
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          token: 'new-token',
          refreshToken: 'new-refresh-token',
          expiresIn: 3600
        })
      } as Response);

      const result = await authController.initializeFromStorage();

      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith('/api/auth/refresh', expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Authorization': 'Bearer refresh-token'
        })
      }));
    });

    it('should clear invalid stored tokens', async () => {
      localStorageMock.getItem.mockReturnValue('invalid-json');

      const result = await authController.initializeFromStorage();

      expect(result).toBe(false);
      expect(localStorageMock.removeItem).toHaveBeenCalled();
    });
  });

  describe('Login', () => {
    it('should login successfully with valid credentials', async () => {
      const mockResponse = {
        token: 'access-token',
        refreshToken: 'refresh-token',
        expiresIn: 3600,
        user: { id: 'user-1', email: 'test@example.com', displayName: 'Test User' }
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      } as Response);

      const result = await authController.login('test@example.com', 'password');

      expect(result.success).toBe(true);
      expect(mockDashboardSession.useBearerToken).toHaveBeenCalledWith(mockResponse.token);
      
      const state = authController.getState();
      expect(state.isAuthenticated).toBe(true);
      expect(state.currentUser).toEqual(mockResponse.user);
      expect(state.isLoading).toBe(false);
    });

    it('should handle login failure with invalid credentials', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: () => Promise.resolve('Invalid credentials')
      } as Response);

      const result = await authController.login('test@example.com', 'wrong-password');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid credentials');
      
      const state = authController.getState();
      expect(state.isAuthenticated).toBe(false);
      expect(state.error).toBe('Invalid credentials');
    });

    it('should handle network errors during login', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await authController.login('test@example.com', 'password');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Network error');
    });

    it('should redirect to saved return URL after login', async () => {
      sessionStorageMock.getItem.mockReturnValue('/projects/123');
      
      const mockResponse = {
        token: 'access-token',
        refreshToken: 'refresh-token',
        expiresIn: 3600,
        user: { id: 'user-1', email: 'test@example.com' }
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      } as Response);

      await authController.login('test@example.com', 'password');

      expect(sessionStorageMock.removeItem).toHaveBeenCalledWith('auth_return_url');
      expect(window.location.href).toBe('/projects/123');
    });
  });

  describe('Token Refresh', () => {
    beforeEach(() => {
      // Setup authenticated state
      const mockAuth = {
        token: 'current-token',
        refreshToken: 'refresh-token',
        expiry: new Date(Date.now() + 60000).toISOString(),
        user: { id: 'user-1', email: 'test@example.com' }
      };

      authController.setState({
        isAuthenticated: true,
        currentUser: mockAuth.user,
        tokenExpiry: new Date(mockAuth.expiry)
      });
    });

    it('should refresh token when approaching expiry', async () => {
      // Set token to expire soon
      authController.setState({
        tokenExpiry: new Date(Date.now() + 60000) // 1 minute
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          token: 'new-token',
          refreshToken: 'new-refresh-token',
          expiresIn: 3600
        })
      } as Response);

      // Trigger token expiry check
      await (authController as any).checkTokenExpiry();

      expect(mockFetch).toHaveBeenCalledWith('/api/auth/refresh', expect.objectContaining({
        method: 'POST'
      }));
      expect(mockDashboardSession.useBearerToken).toHaveBeenCalledWith('new-token');
    });

    it('should handle token refresh failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401
      } as Response);

      const result = await (authController as any).attemptTokenRefresh();

      expect(result).toBe(false);
    });

    it('should retry token refresh on network errors', async () => {
      mockFetch
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            token: 'new-token',
            refreshToken: 'new-refresh-token',
            expiresIn: 3600
          })
        } as Response);

      const result = await (authController as any).doTokenRefreshWithRetry();

      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should not retry on 401/403 errors', async () => {
      const error = new Error('401 Unauthorized');
      mockFetch.mockRejectedValueOnce(error);

      await expect((authController as any).doTokenRefreshWithRetry()).rejects.toThrow('401 Unauthorized');
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('Logout', () => {
    beforeEach(() => {
      authController.setState({
        isAuthenticated: true,
        currentUser: { id: 'user-1', email: 'test@example.com' },
        tokenExpiry: new Date(Date.now() + 60000)
      });
    });

    it('should logout successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true
      } as Response);

      await authController.logout();

      expect(mockFetch).toHaveBeenCalledWith('/api/auth/logout', expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Authorization': expect.stringContaining('Bearer')
        })
      }));

      const state = authController.getState();
      expect(state.isAuthenticated).toBe(false);
      expect(state.currentUser).toBeUndefined();
    });

    it('should handle logout API failure gracefully', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      await authController.logout();

      const state = authController.getState();
      expect(state.isAuthenticated).toBe(false);
    });

    it('should timeout logout request after 3 seconds', async () => {
      mockFetch.mockImplementationOnce(
        () => new Promise(resolve => setTimeout(resolve, 5000))
      );

      await authController.logout();

      const state = authController.getState();
      expect(state.isAuthenticated).toBe(false);
    });

    it('should broadcast logout event', async () => {
      const eventSpy = vi.spyOn(window, 'dispatchEvent');

      await authController.logout();

      expect(eventSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'auth-logout',
          detail: { reason: 'user-initiated' }
        })
      );
    });
  });

  describe('Session Management', () => {
    it('should handle session timeout', async () => {
      const notificationSpy = vi.spyOn(window, 'dispatchEvent');
      
      // Setup authenticated state
      authController.setState({
        isAuthenticated: true,
        currentUser: { id: 'user-1', email: 'test@example.com' }
      });

      // Trigger session timeout
      await (authController as any).handleSessionTimeout();

      expect(notificationSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'show-notification'
        })
      );
    });

    it('should reset session timeout on activity', () => {
      const clearTimeoutSpy = vi.spyOn(window, 'clearTimeout');
      const setTimeoutSpy = vi.spyOn(window, 'setTimeout');

      authController.setState({ isAuthenticated: true });
      (authController as any).resetSessionTimeout();

      expect(clearTimeoutSpy).toHaveBeenCalled();
      expect(setTimeoutSpy).toHaveBeenCalled();
    });

    it('should validate session when page becomes visible', async () => {
      authController.setState({
        isAuthenticated: true,
        currentUser: { id: 'user-1', email: 'test@example.com' }
      });

      mockDashboardSession.currentMember.mockResolvedValue({
        id: 'user-1',
        email: 'test@example.com',
        displayName: 'Updated Name'
      });

      const result = await (authController as any).validateSession();

      expect(result).toBe(true);
      expect(mockDashboardSession.currentMember).toHaveBeenCalled();
    });
  });

  describe('Secure Token Storage', () => {
    it('should store token in memory storage', () => {
      (authController as any).storeTokenSecurely('test-key', 'test-value');
      
      const stored = (authController as any).getStoredTokenSecurely('test-key');
      expect(stored).toBe('test-value');
    });

    it('should store token in localStorage when configured', () => {
      const controller = new AuthController(mockDashboardSession as any, {
        ...mockConfig,
        tokenStorage: { ...mockConfig.tokenStorage, strategy: 'localStorage' }
      });

      (controller as any).storeTokenSecurely('test-key', 'test-value');
      
      expect(localStorageMock.setItem).toHaveBeenCalledWith('test-key', 'test-value');
      
      controller.destroy();
    });

    it('should attempt httpOnly cookie storage', async () => {
      const controller = new AuthController(mockDashboardSession as any, {
        ...mockConfig,
        tokenStorage: { ...mockConfig.tokenStorage, strategy: 'httpOnlyCookie' }
      });

      mockFetch.mockResolvedValueOnce({
        ok: true
      } as Response);

      (controller as any).storeTokenSecurely('session-token', 'token-value');

      expect(mockFetch).toHaveBeenCalledWith('/api/auth/set-session-cookie', expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          name: 'session-token',
          value: 'token-value',
          secure: true,
          sameSite: 'strict',
          maxAge: 24 * 60 * 60
        })
      }));
      
      controller.destroy();
    });

    it('should fallback to memory storage on httpOnly failure', async () => {
      const controller = new AuthController(mockDashboardSession as any, {
        ...mockConfig,
        tokenStorage: { ...mockConfig.tokenStorage, strategy: 'httpOnlyCookie' }
      });

      mockFetch.mockRejectedValueOnce(new Error('Cookie API failed'));

      (controller as any).storeTokenSecurely('test-key', 'test-value');
      
      // Should fallback to memory storage
      const stored = (controller as any).getStoredTokenSecurely('test-key');
      expect(stored).toBe('test-value');
      
      controller.destroy();
    });

    it('should clear all token storage securely', () => {
      (authController as any).storeTokenSecurely('test-key', 'test-value');
      (authController as any).clearStoredTokensSecurely();
      
      const stored = (authController as any).getStoredTokenSecurely('test-key');
      expect(stored).toBeNull();
      
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('streetstudio_auth');
      expect(sessionStorageMock.removeItem).toHaveBeenCalledWith('auth_return_url');
    });
  });

  describe('State Management', () => {
    it('should notify listeners on state changes', () => {
      const listener = vi.fn();
      const unsubscribe = authController.onAuthStateChange(listener);

      authController.setState({ isLoading: true });

      expect(listener).toHaveBeenCalledWith(expect.objectContaining({
        isLoading: true
      }));

      unsubscribe();
    });

    it('should handle listener errors gracefully', () => {
      const errorListener = vi.fn().mockImplementation(() => {
        throw new Error('Listener error');
      });
      
      authController.onAuthStateChange(errorListener);

      // Should not throw
      expect(() => {
        authController.setState({ isLoading: true });
      }).not.toThrow();
    });

    it('should provide session info', () => {
      authController.setState({
        isAuthenticated: true,
        tokenExpiry: new Date(Date.now() + 60000)
      });

      const info = authController.getSessionInfo();

      expect(info.isAuthenticated).toBe(true);
      expect(info.storageStrategy).toBe('memory');
      expect(info.sessionTimeout).toBe(mockConfig.sessionTimeout);
      expect(info.timeUntilExpiry).toBeGreaterThan(0);
    });
  });

  describe('Configuration', () => {
    it('should update storage configuration', () => {
      const newConfig = {
        tokenStorage: { 
          strategy: 'localStorage' as const,
          secure: false,
          sameSite: 'lax' as const
        }
      };

      authController.updateStorageConfig(newConfig);

      const info = authController.getSessionInfo();
      expect(info.storageStrategy).toBe('localStorage');
    });

    it('should migrate tokens when storage strategy changes', () => {
      // Store token in memory first
      (authController as any).storeTokenSecurely('test-token', 'token-value');
      
      // Change to localStorage
      authController.updateStorageConfig({
        tokenStorage: { 
          strategy: 'localStorage',
          secure: true,
          sameSite: 'strict'
        }
      });

      expect(localStorageMock.setItem).toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should handle authentication errors', async () => {
      const mockEvent = new CustomEvent('api-error', {
        detail: { status: 401, response: 'Unauthorized' }
      });

      authController.setState({
        isAuthenticated: true,
        currentUser: { id: 'user-1', email: 'test@example.com' }
      });

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401
      } as Response);

      window.dispatchEvent(mockEvent);

      // Wait for async handling
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(window.location.href).toBe('/auth/login');
    });

    it('should save return URL on auth redirect', () => {
      Object.defineProperty(window, 'location', {
        value: {
          pathname: '/projects/123',
          search: '?tab=videos'
        }
      });

      const mockEvent = new CustomEvent('api-error', {
        detail: { status: 401 }
      });

      authController.setState({ isAuthenticated: true });

      window.dispatchEvent(mockEvent);

      expect(sessionStorageMock.setItem).toHaveBeenCalledWith(
        'auth_return_url',
        '/projects/123?tab=videos'
      );
    });
  });

  describe('Registration and Password Reset', () => {
    it('should register new user successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true
      } as Response);

      const result = await authController.register('new@example.com', 'password', 'New User');

      expect(result.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith('/api/auth/register', expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          email: 'new@example.com',
          password: 'password',
          displayName: 'New User'
        })
      }));
    });

    it('should handle registration failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        text: () => Promise.resolve('Email already exists')
      } as Response);

      const result = await authController.register('existing@example.com', 'password', 'User');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Email already exists');
    });

    it('should request password reset', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true
      } as Response);

      const result = await authController.requestPasswordReset('user@example.com');

      expect(result.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith('/api/auth/forgot-password', expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ email: 'user@example.com' })
      }));
    });
  });

  describe('Cleanup', () => {
    it('should destroy controller and cleanup resources', () => {
      const clearTimeoutSpy = vi.spyOn(window, 'clearTimeout');
      
      authController.destroy();

      expect(clearTimeoutSpy).toHaveBeenCalled();
    });
  });
});