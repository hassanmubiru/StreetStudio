/**
 * OAuth and SSO Integration Tests
 * 
 * Tests for OAuth and SSO integration handlers and state management.
 * Requirements 1.6, 1.7: OAuth and SSO authentication flows
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { OAuthConfigService } from './oauth-config.js';
import { SSOConfigService } from './sso-config.js';
import { OAuthCallbackHandler } from './oauth-callback-handler.js';

// Mock dependencies
vi.mock('./api.js', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

vi.mock('../app/client-logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('OAuth Configuration Service', () => {
  let oauthService: OAuthConfigService;
  let mockApiClient: any;

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Reset DOM state
    window.location.href = 'http://localhost:3000';
    sessionStorage.clear();
    
    oauthService = new OAuthConfigService();
    mockApiClient = (await import('./api.js')).apiClient;
  });

  describe('Provider Configuration', () => {
    it('loads OAuth configuration from API successfully', async () => {
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
          },
        ],
      };

      mockApiClient.get.mockResolvedValue({ data: mockConfig });

      const config = await oauthService.getConfig();

      expect(config).toEqual(mockConfig);
      expect(mockApiClient.get).toHaveBeenCalledWith('/auth/oauth/config');
    });

    it('falls back to default configuration when API fails', async () => {
      mockApiClient.get.mockRejectedValue(new Error('Network error'));

      const config = await oauthService.getConfig();

      expect(config.enabled).toBe(true);
      expect(config.providers).toHaveLength(4); // Default providers
      expect(config.providers[0].id).toBe('google');
    });

    it('returns enabled providers only', async () => {
      const mockConfig = {
        enabled: true,
        providers: [
          { id: 'google', enabled: true, displayName: 'Google' },
          { id: 'github', enabled: false, displayName: 'GitHub' },
          { id: 'microsoft', enabled: true, displayName: 'Microsoft' },
        ],
      };

      mockApiClient.get.mockResolvedValue({ data: mockConfig });

      const enabledProviders = await oauthService.getEnabledProviders();

      expect(enabledProviders).toHaveLength(2);
      expect(enabledProviders.map(p => p.id)).toEqual(['google', 'microsoft']);
    });
  });

  describe('OAuth Flow Initiation', () => {
    it('initiates OAuth flow with correct parameters', async () => {
      const mockConfig = {
        enabled: true,
        providers: [
          {
            id: 'google',
            enabled: true,
            scopes: ['openid', 'email'],
            authUrl: '/api/auth/oauth/google',
            clientId: 'test-client-id',
          },
        ],
      };

      mockApiClient.get.mockResolvedValue({ data: mockConfig });

      // Mock window.location.href setter
      const mockLocationSetter = vi.fn();
      Object.defineProperty(window, 'location', {
        value: {
          ...window.location,
          href: '',
          origin: 'http://localhost:3000',
        },
        writable: true,
      });

      // Mock crypto.randomUUID
      global.crypto = {
        ...global.crypto,
        randomUUID: vi.fn(() => 'test-uuid-123'),
      } as any;

      await oauthService.initiateOAuth('google', '/dashboard');

      // Check that flow state was stored
      const storedState = sessionStorage.getItem('oauth_flow_state');
      expect(storedState).toBeTruthy();

      const flowState = JSON.parse(storedState!);
      expect(flowState.state).toBe('test-uuid-123');
      expect(flowState.providerId).toBe('google');
      expect(flowState.returnUrl).toBe('/dashboard');
      expect(flowState.scopes).toEqual(['openid', 'email']);
    });

    it('throws error for invalid provider', async () => {
      const mockConfig = {
        enabled: true,
        providers: [
          { id: 'google', enabled: true },
        ],
      };

      mockApiClient.get.mockResolvedValue({ data: mockConfig });

      await expect(oauthService.initiateOAuth('invalid-provider'))
        .rejects.toThrow("OAuth provider 'invalid-provider' not found or not enabled");
    });
  });

  describe('OAuth Callback Handling', () => {
    beforeEach(() => {
      // Setup flow state
      const flowState = {
        state: 'test-state-123',
        providerId: 'google',
        returnUrl: '/dashboard',
        timestamp: Date.now(),
        scopes: ['openid', 'email'],
      };
      sessionStorage.setItem('oauth_flow_state', JSON.stringify(flowState));
    });

    it('handles successful OAuth callback', async () => {
      mockApiClient.post.mockResolvedValue({
        success: true,
        data: { user: { id: 'user-123', email: 'test@example.com' } },
      });

      const result = await oauthService.handleOAuthCallback(
        'auth-code-123',
        'test-state-123',
        'google'
      );

      expect(result.success).toBe(true);
      expect(result.returnUrl).toBe('/dashboard');
      expect(mockApiClient.post).toHaveBeenCalledWith('/auth/oauth/callback', {
        provider: 'google',
        code: 'auth-code-123',
        state: 'test-state-123',
        redirect_uri: 'http://localhost:3000/auth/oauth/callback',
        scopes: ['openid', 'email'],
      });
    });

    it('handles OAuth error responses', async () => {
      const result = await oauthService.handleOAuthCallback(
        '',
        'test-state-123',
        'google',
        'access_denied',
        'User cancelled authentication'
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('You cancelled the Google sign-in');
    });

    it('validates state parameter', async () => {
      const result = await oauthService.handleOAuthCallback(
        'auth-code-123',
        'invalid-state',
        'google'
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid OAuth state parameter');
    });

    it('handles expired flow state', async () => {
      // Create expired flow state
      const expiredFlowState = {
        state: 'test-state-123',
        providerId: 'google',
        returnUrl: '/dashboard',
        timestamp: Date.now() - (31 * 60 * 1000), // 31 minutes ago
        scopes: ['openid', 'email'],
      };
      sessionStorage.setItem('oauth_flow_state', JSON.stringify(expiredFlowState));

      const result = await oauthService.handleOAuthCallback(
        'auth-code-123',
        'test-state-123',
        'google'
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('OAuth flow expired');
    });
  });

  describe('Provider Validation', () => {
    it('validates provider configuration correctly', async () => {
      const mockConfig = {
        enabled: true,
        providers: [
          {
            id: 'google',
            enabled: true,
            authUrl: '/api/auth/oauth/google',
            scopes: ['openid', 'email'],
          },
        ],
      };

      mockApiClient.get.mockResolvedValue({ data: mockConfig });

      const validation = await oauthService.validateProvider('google');

      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it('detects invalid provider configuration', async () => {
      const mockConfig = {
        enabled: true,
        providers: [
          {
            id: 'broken-provider',
            enabled: false, // Disabled
            authUrl: '', // Missing URL
            scopes: [], // No scopes
          },
        ],
      };

      mockApiClient.get.mockResolvedValue({ data: mockConfig });

      const validation = await oauthService.validateProvider('broken-provider');

      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('Provider is disabled');
      expect(validation.errors).toContain('Authentication URL not configured');
      expect(validation.errors).toContain('No scopes configured');
    });
  });
});

describe('SSO Configuration Service', () => {
  let ssoService: SSOConfigService;
  let mockApiClient: any;

  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    
    ssoService = new SSOConfigService();
    mockApiClient = (await import('./api.js')).apiClient;
  });

  describe('SSO Provider Configuration', () => {
    it('loads SSO configuration from API', async () => {
      const mockConfig = {
        enabled: true,
        autoRedirectEnabled: true,
        emailDomainMatching: true,
        providers: [
          {
            id: 'azure-ad',
            displayName: 'Microsoft Azure AD',
            enabled: true,
            emailDomains: ['company.com', 'enterprise.org'],
            authUrl: '/api/auth/sso/azure-ad',
          },
        ],
      };

      mockApiClient.get.mockResolvedValue({ data: mockConfig });

      const config = await ssoService.getConfig();

      expect(config).toEqual(mockConfig);
      expect(mockApiClient.get).toHaveBeenCalledWith('/auth/sso/config');
    });

    it('returns default config when API fails', async () => {
      mockApiClient.get.mockRejectedValue(new Error('Network error'));

      const config = await ssoService.getConfig();

      expect(config.enabled).toBe(false);
      expect(config.providers).toHaveLength(3); // Default providers
    });
  });

  describe('Auto-redirect Logic', () => {
    beforeEach(() => {
      const mockConfig = {
        enabled: true,
        autoRedirectEnabled: true,
        emailDomainMatching: true,
        providers: [
          {
            id: 'azure-ad',
            enabled: true,
            autoRedirect: true,
            emailDomains: ['company.com'],
          },
          {
            id: 'okta',
            enabled: true,
            autoRedirect: false,
            emailDomains: ['enterprise.org'],
          },
        ],
      };

      mockApiClient.get.mockResolvedValue({ data: mockConfig });
    });

    it('detects auto-redirect provider for matching domain', async () => {
      const provider = await ssoService.shouldAutoRedirect('user@company.com');

      expect(provider).toBeTruthy();
      expect(provider?.id).toBe('azure-ad');
    });

    it('does not auto-redirect for non-matching domain', async () => {
      const provider = await ssoService.shouldAutoRedirect('user@other.com');

      expect(provider).toBeNull();
    });

    it('does not auto-redirect when provider has autoRedirect disabled', async () => {
      const provider = await ssoService.shouldAutoRedirect('user@enterprise.org');

      expect(provider).toBeNull(); // Okta has autoRedirect: false
    });
  });

  describe('SSO Flow Management', () => {
    it('initiates SSO flow with secure state management', async () => {
      const mockConfig = {
        enabled: true,
        providers: [
          {
            id: 'azure-ad',
            enabled: true,
            authUrl: '/api/auth/sso/azure-ad',
            domainHint: 'company.com',
          },
        ],
      };

      mockApiClient.get.mockResolvedValue({ data: mockConfig });

      // Mock crypto and window.location
      global.crypto = {
        ...global.crypto,
        randomUUID: vi.fn(() => 'sso-nonce-123'),
      } as any;

      Object.defineProperty(window, 'location', {
        value: {
          ...window.location,
          href: '',
          origin: 'http://localhost:3000',
        },
        writable: true,
      });

      await ssoService.initiatSSO('azure-ad', '/dashboard');

      // Check stored state
      const storedState = sessionStorage.getItem('streetstudio_sso_state');
      expect(storedState).toBeTruthy();

      const decodedState = JSON.parse(atob(storedState!));
      expect(decodedState.providerId).toBe('azure-ad');
      expect(decodedState.returnUrl).toBe('/dashboard');
      expect(decodedState.nonce).toBe('sso-nonce-123');
    });

    it('handles SSO callback with state validation', async () => {
      // Setup SSO state
      const ssoState = {
        providerId: 'azure-ad',
        returnUrl: '/dashboard',
        timestamp: Date.now(),
        nonce: 'sso-nonce-123',
      };

      const encodedState = btoa(JSON.stringify(ssoState));
      sessionStorage.setItem('streetstudio_sso_state', encodedState);

      mockApiClient.post.mockResolvedValue({
        success: true,
        data: { user: { id: 'user-123' } },
      });

      const result = await ssoService.handleSSOCallback(
        'sso-code-123',
        'sso-nonce-123',
        'azure-ad'
      );

      expect(result.success).toBe(true);
      expect(result.returnUrl).toBe('/dashboard');
    });
  });

  describe('Error Formatting', () => {
    it('formats provider-specific error messages', async () => {
      const testCases = [
        { error: 'access_denied', expected: 'You cancelled the' },
        { error: 'server_error', expected: 'currently unavailable' },
        { error: 'invalid_request', expected: 'problem with the' },
        { error: 'unauthorized_client', expected: 'not properly configured' },
      ];

      for (const testCase of testCases) {
        const result = await ssoService.handleSSOCallback('', 'test', 'azure-ad', testCase.error);
        expect(result.error).toContain(testCase.expected);
      }
    });
  });
});

describe('OAuth/SSO Callback Handler', () => {
  let callbackHandler: OAuthCallbackHandler;

  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    
    callbackHandler = new OAuthCallbackHandler();
  });

  describe('URL Parameter Parsing', () => {
    it('parses OAuth callback parameters correctly', () => {
      // Mock window.location.search
      Object.defineProperty(window, 'location', {
        value: {
          ...window.location,
          search: '?code=abc123&state=xyz789&provider=google',
        },
        writable: true,
      });

      const params = OAuthCallbackHandler.parseCallbackParams();

      expect(params.code).toBe('abc123');
      expect(params.state).toBe('xyz789');
      expect(params.provider).toBe('google');
    });

    it('parses error parameters', () => {
      Object.defineProperty(window, 'location', {
        value: {
          ...window.location,
          search: '?error=access_denied&error_description=User%20cancelled&state=xyz789',
        },
        writable: true,
      });

      const params = OAuthCallbackHandler.parseCallbackParams();

      expect(params.error).toBe('access_denied');
      expect(params.error_description).toBe('User cancelled');
      expect(params.state).toBe('xyz789');
    });
  });

  describe('Callback URL Detection', () => {
    it('detects OAuth callback URLs', () => {
      const testCases = [
        { path: '/auth/oauth/callback', search: '?code=123', expected: true },
        { path: '/auth/sso/azure-ad/callback', search: '', expected: true },
        { path: '/auth/login', search: '?error=access_denied', expected: true },
        { path: '/dashboard', search: '', expected: false },
        { path: '/auth/login', search: '', expected: false },
      ];

      testCases.forEach(({ path, search, expected }) => {
        Object.defineProperty(window, 'location', {
          value: {
            ...window.location,
            pathname: path,
            search,
          },
          writable: true,
        });

        expect(OAuthCallbackHandler.isCallbackUrl()).toBe(expected);
      });
    });
  });

  describe('Error Storage and Retrieval', () => {
    it('stores and retrieves authentication errors', () => {
      const error = 'OAuth authentication failed';
      const provider = 'google';

      OAuthCallbackHandler.handleErrorDisplay(error, provider);

      const stored = sessionStorage.getItem('auth_callback_error');
      expect(stored).toBeTruthy();

      const retrieved = OAuthCallbackHandler.getAndClearStoredError();
      expect(retrieved?.error).toBe(error);
      expect(retrieved?.provider).toBe(provider);

      // Should be cleared after retrieval
      const secondRetrieval = OAuthCallbackHandler.getAndClearStoredError();
      expect(secondRetrieval).toBeNull();
    });

    it('ignores expired error messages', () => {
      const expiredError = {
        error: 'Old error',
        provider: 'google',
        timestamp: Date.now() - (6 * 60 * 1000), // 6 minutes ago
      };

      sessionStorage.setItem('auth_callback_error', JSON.stringify(expiredError));

      const retrieved = OAuthCallbackHandler.getAndClearStoredError();
      expect(retrieved).toBeNull();
    });
  });

  describe('Success Redirect Handling', () => {
    it('handles success redirect with URL cleanup', () => {
      // Mock window methods
      const mockPushState = vi.fn();
      const mockLocationSetter = vi.fn();

      Object.defineProperty(window, 'history', {
        value: { replaceState: mockPushState },
        writable: true,
      });

      Object.defineProperty(window, 'location', {
        value: {
          ...window.location,
          href: 'http://localhost:3000/auth/callback?code=123&state=456',
        },
        writable: true,
      });

      OAuthCallbackHandler.handleSuccessRedirect('/dashboard');

      expect(mockPushState).toHaveBeenCalled();
    });
  });
});

// Integration Tests
describe('OAuth/SSO Integration', () => {
  let mockApiClient: any;

  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    mockApiClient = (await import('./api.js')).apiClient;
  });

  it('completes full OAuth authentication flow', async () => {
    const oauthService = new OAuthConfigService();

    // Setup mock configuration
    mockApiClient.get.mockResolvedValue({
      data: {
        enabled: true,
        providers: [
          {
            id: 'google',
            enabled: true,
            scopes: ['openid', 'email'],
            authUrl: '/api/auth/oauth/google',
          },
        ],
      },
    });

    // Mock successful callback
    mockApiClient.post.mockResolvedValue({
      success: true,
      data: { user: { id: 'user-123', email: 'test@example.com' } },
    });

    // Mock crypto
    global.crypto = {
      ...global.crypto,
      randomUUID: vi.fn(() => 'test-uuid'),
    } as any;

    // Initiate OAuth flow
    await oauthService.initiateOAuth('google');

    // Verify flow state was stored
    const storedState = sessionStorage.getItem('oauth_flow_state');
    expect(storedState).toBeTruthy();

    // Simulate callback
    const result = await oauthService.handleOAuthCallback(
      'auth-code-123',
      'test-uuid',
      'google'
    );

    expect(result.success).toBe(true);
    expect(mockApiClient.post).toHaveBeenCalledWith('/auth/oauth/callback', expect.objectContaining({
      provider: 'google',
      code: 'auth-code-123',
      state: 'test-uuid',
    }));
  });

  it('handles provider-specific error messages correctly', async () => {
    const ssoService = new SSOConfigService();

    const result = await ssoService.handleSSOCallback(
      '',
      'test-state',
      'azure-ad',
      'unauthorized_client'
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('Microsoft Azure AD sign-in is not properly configured');
  });
});