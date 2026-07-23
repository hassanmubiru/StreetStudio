/**
 * OAuth Integration Unit Tests
 * 
 * Comprehensive unit tests for OAuth callback handling, SSO integration,
 * and multi-provider authentication scenarios.
 * 
 * Requirements: 1.6, 1.7
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { oauthConfigService } from '../../services/oauth-config.js';

// Mock fetch for API calls
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock crypto for secure random generation
global.crypto = {
  randomUUID: vi.fn(() => 'mock-uuid-12345')
} as any;

describe('OAuth Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    localStorage.clear();
    
    // Reset fetch mock
    mockFetch.mockClear();
  });

  afterEach(() => {
    sessionStorage.clear();
  });

  describe('OAuth Configuration', () => {
    test('should load OAuth configuration from API', async () => {
      const mockConfig = {
        enabled: true,
        providers: [
          {
            id: 'google',
            name: 'google',
            displayName: 'Google',
            enabled: true,
            scopes: ['openid', 'email', 'profile'],
            authUrl: '/api/auth/oauth/google',
            buttonColor: '#4285f4',
            buttonTextColor: '#ffffff'
          },
          {
            id: 'github',
            name: 'github',
            displayName: 'GitHub',
            enabled: true,
            scopes: ['read:user', 'user:email'],
            authUrl: '/api/auth/oauth/github',
            buttonColor: '#24292e',
            buttonTextColor: '#ffffff'
          }
        ]
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockConfig
      });

      const config = await oauthConfigService.getConfig();

      expect(config).toEqual(mockConfig);
      expect(mockFetch).toHaveBeenCalledWith('/api/auth/oauth/config', expect.any(Object));
    });

    test('should fallback to default configuration when API fails', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const config = await oauthConfigService.getConfig();

      expect(config.enabled).toBe(true);
      expect(config.providers).toHaveLength(4); // Google, GitHub, Microsoft, Slack
      expect(config.providers.find(p => p.id === 'google')).toBeDefined();
      expect(config.providers.find(p => p.id === 'github')).toBeDefined();
    });

    test('should cache configuration after first load', async () => {
      const mockConfig = {
        enabled: true,
        providers: [
          { id: 'google', name: 'google', displayName: 'Google', enabled: true, scopes: [], authUrl: '/oauth/google' }
        ]
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockConfig
      });

      // First call
      const config1 = await oauthConfigService.getConfig();
      
      // Second call should use cache
      const config2 = await oauthConfigService.getConfig();

      expect(config1).toEqual(config2);
      expect(mockFetch).toHaveBeenCalledTimes(1); // Only called once
    });

    test('should refresh configuration when requested', async () => {
      const mockConfig = {
        enabled: true,
        providers: [{ id: 'google', name: 'google', displayName: 'Google', enabled: true, scopes: [], authUrl: '/oauth/google' }]
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => mockConfig
      });

      // Initial load
      await oauthConfigService.getConfig();
      
      // Refresh
      await oauthConfigService.refreshConfig();
      
      // Should make new API call
      await oauthConfigService.getConfig();

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    test('should filter enabled providers correctly', async () => {
      const mockConfig = {
        enabled: true,
        providers: [
          { id: 'google', name: 'google', displayName: 'Google', enabled: true, scopes: [], authUrl: '/oauth/google' },
          { id: 'github', name: 'github', displayName: 'GitHub', enabled: false, scopes: [], authUrl: '/oauth/github' },
          { id: 'microsoft', name: 'microsoft', displayName: 'Microsoft', enabled: true, scopes: [], authUrl: '/oauth/microsoft' }
        ]
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockConfig
      });

      const enabledProviders = await oauthConfigService.getEnabledProviders();

      expect(enabledProviders).toHaveLength(2);
      expect(enabledProviders.map(p => p.id)).toEqual(['google', 'microsoft']);
    });
  });

  describe('OAuth Flow Initiation', () => {
    test('should initiate OAuth flow with correct parameters', async () => {
      // Mock enabled providers
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          enabled: true,
          providers: [
            {
              id: 'google',
              name: 'google',
              displayName: 'Google',
              enabled: true,
              scopes: ['openid', 'email', 'profile'],
              authUrl: '/api/auth/oauth/google',
              clientId: 'test-client-id'
            }
          ]
        })
      });

      // Mock window.location.href setter
      delete (window as any).location;
      window.location = { href: '', origin: 'http://localhost:3000' } as any;

      await oauthConfigService.initiateOAuth('google', '/dashboard');

      // Verify flow state is stored
      const flowState = sessionStorage.getItem('oauth_flow_state');
      expect(flowState).toBeTruthy();
      
      const parsedState = JSON.parse(flowState!);
      expect(parsedState.providerId).toBe('google');
      expect(parsedState.returnUrl).toBe('/dashboard');
      expect(parsedState.scopes).toEqual(['openid', 'email', 'profile']);
      expect(parsedState.state).toBe('mock-uuid-12345');
    });

    test('should handle OAuth initiation for unknown provider', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          enabled: true,
          providers: [
            { id: 'google', name: 'google', displayName: 'Google', enabled: true, scopes: [], authUrl: '/oauth/google' }
          ]
        })
      });

      await expect(oauthConfigService.initiateOAuth('unknown-provider')).rejects.toThrow(
        "OAuth provider 'unknown-provider' not found or not enabled"
      );
    });

    test('should handle OAuth initiation when disabled provider', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          enabled: true,
          providers: [
            { id: 'google', name: 'google', displayName: 'Google', enabled: false, scopes: [], authUrl: '/oauth/google' }
          ]
        })
      });

      await expect(oauthConfigService.initiateOAuth('google')).rejects.toThrow(
        "OAuth provider 'google' not found or not enabled"
      );
    });

    test('should use default return URL when none provided', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          enabled: true,
          providers: [
            { id: 'google', name: 'google', displayName: 'Google', enabled: true, scopes: [], authUrl: '/oauth/google' }
          ]
        })
      });

      delete (window as any).location;
      window.location = { href: '', origin: 'http://localhost:3000' } as any;

      await oauthConfigService.initiateOAuth('google');

      const flowState = JSON.parse(sessionStorage.getItem('oauth_flow_state')!);
      expect(flowState.returnUrl).toBe('/dashboard'); // Default return URL
    });

    test('should use stored auth_return_url when available', async () => {
      sessionStorage.setItem('auth_return_url', '/projects/123');

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          enabled: true,
          providers: [
            { id: 'github', name: 'github', displayName: 'GitHub', enabled: true, scopes: [], authUrl: '/oauth/github' }
          ]
        })
      });

      delete (window as any).location;
      window.location = { href: '', origin: 'http://localhost:3000' } as any;

      await oauthConfigService.initiateOAuth('github');

      const flowState = JSON.parse(sessionStorage.getItem('oauth_flow_state')!);
      expect(flowState.returnUrl).toBe('/projects/123');
    });
  });

  describe('OAuth Callback Handling', () => {
    test('should handle successful OAuth callback', async () => {
      // Setup flow state
      sessionStorage.setItem('oauth_flow_state', JSON.stringify({
        state: 'test-state-123',
        providerId: 'google',
        returnUrl: '/dashboard',
        timestamp: Date.now(),
        scopes: ['openid', 'email']
      }));

      // Mock successful token exchange
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: {
            token: 'oauth-access-token',
            refreshToken: 'oauth-refresh-token',
            expiresIn: 3600,
            user: {
              id: 'oauth-user-123',
              email: 'user@example.com',
              displayName: 'OAuth User',
              provider: 'google'
            }
          }
        })
      });

      const result = await oauthConfigService.handleOAuthCallback(
        'auth-code-12345',
        'test-state-123',
        'google'
      );

      expect(result.success).toBe(true);
      expect(result.returnUrl).toBe('/dashboard');
      expect(sessionStorage.getItem('oauth_flow_state')).toBeNull(); // Cleaned up

      // Verify API call
      expect(mockFetch).toHaveBeenCalledWith('/api/auth/oauth/callback', expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          provider: 'google',
          code: 'auth-code-12345',
          state: 'test-state-123',
          redirect_uri: 'http://localhost:3000/auth/oauth/callback',
          scopes: ['openid', 'email']
        })
      }));
    });

    test('should handle OAuth callback with provider error', async () => {
      const result = await oauthConfigService.handleOAuthCallback(
        '',
        'test-state',
        'google',
        'access_denied',
        'The user denied the request'
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('cancelled');
      expect(result.error).toContain('Google');
    });

    test('should handle OAuth callback with invalid state parameter', async () => {
      sessionStorage.setItem('oauth_flow_state', JSON.stringify({
        state: 'correct-state',
        providerId: 'google',
        returnUrl: '/dashboard',
        timestamp: Date.now()
      }));

      const result = await oauthConfigService.handleOAuthCallback(
        'auth-code',
        'wrong-state',
        'google'
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid OAuth state parameter');
    });

    test('should handle OAuth callback with missing flow state', async () => {
      const result = await oauthConfigService.handleOAuthCallback(
        'auth-code',
        'test-state',
        'google'
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('No OAuth flow state found');
    });

    test('should handle OAuth callback with expired flow state', async () => {
      // Create expired flow state (35 minutes ago)
      sessionStorage.setItem('oauth_flow_state', JSON.stringify({
        state: 'test-state',
        providerId: 'google',
        returnUrl: '/dashboard',
        timestamp: Date.now() - (35 * 60 * 1000)
      }));

      const result = await oauthConfigService.handleOAuthCallback(
        'auth-code',
        'test-state',
        'google'
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('OAuth flow expired');
      expect(sessionStorage.getItem('oauth_flow_state')).toBeNull(); // Cleaned up
    });

    test('should handle OAuth callback with provider mismatch', async () => {
      sessionStorage.setItem('oauth_flow_state', JSON.stringify({
        state: 'test-state',
        providerId: 'github',
        returnUrl: '/dashboard',
        timestamp: Date.now()
      }));

      const result = await oauthConfigService.handleOAuthCallback(
        'auth-code',
        'test-state',
        'google' // Different provider
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Provider mismatch');
    });

    test('should handle token exchange API failure', async () => {
      sessionStorage.setItem('oauth_flow_state', JSON.stringify({
        state: 'test-state',
        providerId: 'google',
        returnUrl: '/dashboard',
        timestamp: Date.now()
      }));

      // Mock API failure
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () => 'Invalid authorization code'
      });

      const result = await oauthConfigService.handleOAuthCallback(
        'invalid-code',
        'test-state',
        'google'
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('OAuth token exchange failed');
    });

    test('should handle network errors during token exchange', async () => {
      sessionStorage.setItem('oauth_flow_state', JSON.stringify({
        state: 'test-state',
        providerId: 'google',
        returnUrl: '/dashboard',
        timestamp: Date.now()
      }));

      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await oauthConfigService.handleOAuthCallback(
        'auth-code',
        'test-state',
        'google'
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Network error');
    });
  });

  describe('OAuth Error Handling', () => {
    test('should format common OAuth errors appropriately', async () => {
      const testCases = [
        {
          error: 'access_denied',
          expectedMessage: 'You cancelled the Google sign-in'
        },
        {
          error: 'invalid_request',
          expectedMessage: 'There was a problem with the Google sign-in request'
        },
        {
          error: 'unauthorized_client',
          expectedMessage: 'Google sign-in is not properly configured'
        },
        {
          error: 'server_error',
          expectedMessage: 'Google is currently experiencing issues'
        },
        {
          error: 'temporarily_unavailable',
          expectedMessage: 'Google sign-in is temporarily unavailable'
        }
      ];

      for (const testCase of testCases) {
        const result = await oauthConfigService.handleOAuthCallback(
          '',
          'test-state',
          'google',
          testCase.error
        );

        expect(result.success).toBe(false);
        expect(result.error).toContain(testCase.expectedMessage);
      }
    });

    test('should handle unknown OAuth errors with generic message', async () => {
      const result = await oauthConfigService.handleOAuthCallback(
        '',
        'test-state',
        'github',
        'unknown_error',
        'Some unknown error occurred'
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('GitHub sign-in failed');
      expect(result.error).toContain('Some unknown error occurred');
    });

    test('should provide appropriate provider display names', async () => {
      const providers = [
        { id: 'google', expected: 'Google' },
        { id: 'github', expected: 'GitHub' },
        { id: 'microsoft', expected: 'Microsoft' },
        { id: 'slack', expected: 'Slack' },
        { id: 'unknown', expected: 'OAuth Provider' }
      ];

      for (const provider of providers) {
        const result = await oauthConfigService.handleOAuthCallback(
          '',
          'test-state',
          provider.id,
          'access_denied'
        );

        expect(result.error).toContain(provider.expected);
      }
    });
  });

  describe('OAuth Provider Validation', () => {
    test('should validate OAuth provider configuration', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          enabled: true,
          providers: [
            {
              id: 'google',
              name: 'google',
              displayName: 'Google',
              enabled: true,
              scopes: ['openid', 'email'],
              authUrl: '/api/auth/oauth/google'
            }
          ]
        })
      });

      const validation = await oauthConfigService.validateProvider('google');

      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    test('should detect invalid provider configuration', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          enabled: true,
          providers: [
            {
              id: 'invalid',
              name: 'invalid',
              displayName: 'Invalid',
              enabled: false, // Disabled
              scopes: [], // No scopes
              authUrl: '' // No auth URL
            }
          ]
        })
      });

      const validation = await oauthConfigService.validateProvider('invalid');

      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('Provider is disabled');
      expect(validation.errors).toContain('Authentication URL not configured');
      expect(validation.errors).toContain('No scopes configured');
    });

    test('should handle validation for non-existent provider', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          enabled: true,
          providers: []
        })
      });

      const validation = await oauthConfigService.validateProvider('nonexistent');

      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('Provider not found');
    });
  });

  describe('OAuth Availability Checks', () => {
    test('should detect OAuth availability when enabled with providers', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          enabled: true,
          providers: [
            { id: 'google', enabled: true, displayName: 'Google', scopes: [], authUrl: '/oauth/google' }
          ]
        })
      });

      const available = await oauthConfigService.isOAuthAvailable();
      expect(available).toBe(true);
    });

    test('should detect OAuth unavailability when disabled', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          enabled: false,
          providers: [
            { id: 'google', enabled: true, displayName: 'Google', scopes: [], authUrl: '/oauth/google' }
          ]
        })
      });

      const available = await oauthConfigService.isOAuthAvailable();
      expect(available).toBe(false);
    });

    test('should detect OAuth unavailability when no enabled providers', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          enabled: true,
          providers: [
            { id: 'google', enabled: false, displayName: 'Google', scopes: [], authUrl: '/oauth/google' },
            { id: 'github', enabled: false, displayName: 'GitHub', scopes: [], authUrl: '/oauth/github' }
          ]
        })
      });

      const available = await oauthConfigService.isOAuthAvailable();
      expect(available).toBe(false);
    });

    test('should handle OAuth availability check with API failure', async () => {
      mockFetch.mockRejectedValueOnce(new Error('API Error'));

      const available = await oauthConfigService.isOAuthAvailable();
      expect(available).toBe(false); // Fails safely
    });
  });

  describe('OAuth State Management', () => {
    test('should clean up OAuth state after successful callback', async () => {
      sessionStorage.setItem('oauth_flow_state', JSON.stringify({
        state: 'test-state',
        providerId: 'google',
        returnUrl: '/dashboard',
        timestamp: Date.now()
      }));

      // Also test legacy cleanup
      sessionStorage.setItem('oauth_state', 'legacy-state');
      sessionStorage.setItem('oauth_return_url', 'legacy-url');

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: { token: 'token', user: { id: '123' } }
        })
      });

      await oauthConfigService.handleOAuthCallback(
        'auth-code',
        'test-state',
        'google'
      );

      // All OAuth-related storage should be cleaned up
      expect(sessionStorage.getItem('oauth_flow_state')).toBeNull();
      expect(sessionStorage.getItem('oauth_state')).toBeNull();
      expect(sessionStorage.getItem('oauth_return_url')).toBeNull();
    });

    test('should clean up OAuth state after error', async () => {
      sessionStorage.setItem('oauth_flow_state', JSON.stringify({
        state: 'test-state',
        providerId: 'google',
        returnUrl: '/dashboard',
        timestamp: Date.now()
      }));

      const result = await oauthConfigService.handleOAuthCallback(
        '',
        'test-state',
        'google',
        'access_denied'
      );

      expect(result.success).toBe(false);
      expect(sessionStorage.getItem('oauth_flow_state')).toBeNull();
    });

    test('should handle malformed OAuth state gracefully', async () => {
      sessionStorage.setItem('oauth_flow_state', 'invalid-json');

      const result = await oauthConfigService.handleOAuthCallback(
        'auth-code',
        'test-state',
        'google'
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('No OAuth flow state found');
      expect(sessionStorage.getItem('oauth_flow_state')).toBeNull(); // Cleaned up
    });
  });

  describe('Multiple Provider Support', () => {
    test('should handle multiple simultaneous OAuth configurations', async () => {
      const multiProviderConfig = {
        enabled: true,
        providers: [
          {
            id: 'google',
            name: 'google',
            displayName: 'Google',
            enabled: true,
            scopes: ['openid', 'email', 'profile'],
            authUrl: '/api/auth/oauth/google',
            buttonColor: '#4285f4'
          },
          {
            id: 'github',
            name: 'github',
            displayName: 'GitHub',
            enabled: true,
            scopes: ['read:user', 'user:email'],
            authUrl: '/api/auth/oauth/github',
            buttonColor: '#24292e'
          },
          {
            id: 'microsoft',
            name: 'microsoft',
            displayName: 'Microsoft',
            enabled: true,
            scopes: ['openid', 'email', 'profile'],
            authUrl: '/api/auth/oauth/microsoft',
            buttonColor: '#0078d4'
          }
        ]
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => multiProviderConfig
      });

      const config = await oauthConfigService.getConfig();
      const enabledProviders = await oauthConfigService.getEnabledProviders();

      expect(config.providers).toHaveLength(3);
      expect(enabledProviders).toHaveLength(3);
      
      // Verify each provider has required properties
      enabledProviders.forEach(provider => {
        expect(provider.id).toBeDefined();
        expect(provider.displayName).toBeDefined();
        expect(provider.authUrl).toBeDefined();
        expect(provider.scopes).toBeDefined();
        expect(provider.enabled).toBe(true);
      });
    });

    test('should handle mixed enabled/disabled providers', async () => {
      const mixedConfig = {
        enabled: true,
        providers: [
          { id: 'google', displayName: 'Google', enabled: true, scopes: [], authUrl: '/oauth/google' },
          { id: 'github', displayName: 'GitHub', enabled: false, scopes: [], authUrl: '/oauth/github' },
          { id: 'microsoft', displayName: 'Microsoft', enabled: true, scopes: [], authUrl: '/oauth/microsoft' },
          { id: 'slack', displayName: 'Slack', enabled: false, scopes: [], authUrl: '/oauth/slack' }
        ]
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mixedConfig
      });

      const enabledProviders = await oauthConfigService.getEnabledProviders();

      expect(enabledProviders).toHaveLength(2);
      expect(enabledProviders.map(p => p.id).sort()).toEqual(['google', 'microsoft']);
    });
  });
});