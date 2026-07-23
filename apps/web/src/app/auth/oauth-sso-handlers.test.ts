/**
 * OAuth and SSO Handlers Integration Tests
 * 
 * Tests the OAuth and SSO integration handlers in the AuthController.
 * Requirements 1.6, 1.7: OAuth redirect flow handling and SSO authentication flow
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AuthController } from './auth-controller.js';

// Mock dependencies
const mockSession = {
  useBearerToken: vi.fn(),
  currentMember: vi.fn(),
  clearAuthentication: vi.fn(),
};

vi.mock('../client-logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../error-handler.js', () => ({
  handleError: vi.fn(),
}));

// Mock OAuth/SSO services
vi.mock('../../services/oauth-config.js', () => ({
  oauthConfigService: {
    initiateOAuth: vi.fn(),
    isOAuthAvailable: vi.fn(),
    getEnabledProviders: vi.fn(),
  },
}));

vi.mock('../../services/sso-config.js', () => ({
  ssoConfigService: {
    initiatSSO: vi.fn(),
    shouldAutoRedirect: vi.fn(),
    isSSOAvailable: vi.fn(),
    getEnabledProviders: vi.fn(),
    getProviderForDomain: vi.fn(),
  },
}));

vi.mock('../../services/oauth-callback-handler.js', () => ({
  OAuthCallbackHandler: {
    getAndClearStoredError: vi.fn(),
  },
}));

describe('AuthController OAuth/SSO Integration', () => {
  let authController: AuthController;

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Reset DOM and storage
    document.body.innerHTML = '';
    sessionStorage.clear();
    localStorage.clear();
    
    authController = new AuthController(mockSession as any);
  });

  afterEach(() => {
    authController.destroy();
  });

  describe('OAuth Integration', () => {
    it('initiates OAuth flow successfully', async () => {
      const { oauthConfigService } = await import('../../services/oauth-config.js');
      oauthConfigService.initiateOAuth.mockResolvedValue(undefined);

      await authController.initiateOAuth('google', '/dashboard');

      expect(oauthConfigService.initiateOAuth).toHaveBeenCalledWith('google', '/dashboard');
    });

    it('handles OAuth initiation errors gracefully', async () => {
      const { oauthConfigService } = await import('../../services/oauth-config.js');
      oauthConfigService.initiateOAuth.mockRejectedValue(new Error('Provider not found'));

      await expect(authController.initiateOAuth('invalid-provider')).rejects.toThrow('Provider not found');

      // Check that error state was set
      const state = authController.getState();
      expect(state.isLoading).toBe(false);
      expect(state.error).toContain('Provider not found');
    });

    it('checks OAuth availability correctly', async () => {
      const { oauthConfigService } = await import('../../services/oauth-config.js');
      oauthConfigService.isOAuthAvailable.mockResolvedValue(true);

      const available = await authController.isOAuthAvailable();

      expect(available).toBe(true);
      expect(oauthConfigService.isOAuthAvailable).toHaveBeenCalled();
    });

    it('returns empty providers list on error', async () => {
      const { oauthConfigService } = await import('../../services/oauth-config.js');
      oauthConfigService.getEnabledProviders.mockRejectedValue(new Error('Network error'));

      const providers = await authController.getOAuthProviders();

      expect(providers).toEqual([]);
    });

    it('gets OAuth providers successfully', async () => {
      const mockProviders = [
        { id: 'google', displayName: 'Google', enabled: true },
        { id: 'github', displayName: 'GitHub', enabled: true },
      ];

      const { oauthConfigService } = await import('../../services/oauth-config.js');
      oauthConfigService.getEnabledProviders.mockResolvedValue(mockProviders);

      const providers = await authController.getOAuthProviders();

      expect(providers).toEqual(mockProviders);
    });
  });

  describe('SSO Integration', () => {
    it('initiates SSO flow successfully', async () => {
      const { ssoConfigService } = await import('../../services/sso-config.js');
      ssoConfigService.initiatSSO.mockResolvedValue(undefined);

      await authController.initiateSSO('azure-ad', '/dashboard');

      expect(ssoConfigService.initiatSSO).toHaveBeenCalledWith('azure-ad', '/dashboard');
    });

    it('handles SSO initiation errors gracefully', async () => {
      const { ssoConfigService } = await import('../../services/sso-config.js');
      ssoConfigService.initiatSSO.mockRejectedValue(new Error('SSO not configured'));

      await expect(authController.initiateSSO('invalid-provider')).rejects.toThrow('SSO not configured');

      // Check that error state was set
      const state = authController.getState();
      expect(state.isLoading).toBe(false);
      expect(state.error).toContain('SSO not configured');
    });

    it('checks SSO auto-redirect correctly', async () => {
      const mockProvider = { id: 'azure-ad', displayName: 'Microsoft Azure AD' };
      const { ssoConfigService } = await import('../../services/sso-config.js');
      ssoConfigService.shouldAutoRedirect.mockResolvedValue(mockProvider);

      const provider = await authController.shouldAutoRedirectSSO('user@company.com');

      expect(provider).toEqual(mockProvider);
      expect(ssoConfigService.shouldAutoRedirect).toHaveBeenCalledWith('user@company.com');
    });

    it('returns null when SSO auto-redirect fails', async () => {
      const { ssoConfigService } = await import('../../services/sso-config.js');
      ssoConfigService.shouldAutoRedirect.mockRejectedValue(new Error('Network error'));

      const provider = await authController.shouldAutoRedirectSSO('user@company.com');

      expect(provider).toBeNull();
    });

    it('checks SSO availability', async () => {
      const { ssoConfigService } = await import('../../services/sso-config.js');
      ssoConfigService.isSSOAvailable.mockResolvedValue(true);

      const available = await authController.isSSOAvailable();

      expect(available).toBe(true);
    });

    it('gets SSO providers successfully', async () => {
      const mockProviders = [
        { id: 'azure-ad', displayName: 'Microsoft Azure AD', enabled: true },
        { id: 'okta', displayName: 'Okta', enabled: true },
      ];

      const { ssoConfigService } = await import('../../services/sso-config.js');
      ssoConfigService.getEnabledProviders.mockResolvedValue(mockProviders);

      const providers = await authController.getSSOProviders();

      expect(providers).toEqual(mockProviders);
    });

    it('gets SSO provider for domain', async () => {
      const mockProvider = { id: 'azure-ad', displayName: 'Microsoft Azure AD' };
      const { ssoConfigService } = await import('../../services/sso-config.js');
      ssoConfigService.getProviderForDomain.mockResolvedValue(mockProvider);

      const provider = await authController.getSSOProviderForDomain('user@company.com');

      expect(provider).toEqual(mockProvider);
      expect(ssoConfigService.getProviderForDomain).toHaveBeenCalledWith('user@company.com');
    });
  });

  describe('Enhanced Login with SSO Check', () => {
    it('performs regular login when no SSO auto-redirect', async () => {
      const { ssoConfigService } = await import('../../services/sso-config.js');
      ssoConfigService.shouldAutoRedirect.mockResolvedValue(null);

      // Mock successful login
      vi.spyOn(authController, 'login').mockResolvedValue({ success: true });

      const result = await authController.loginWithEmailCheck('user@example.com', 'password');

      expect(result.success).toBe(true);
      expect(result.shouldRedirectSSO).toBeUndefined();
      expect(authController.login).toHaveBeenCalledWith('user@example.com', 'password');
    });

    it('returns SSO provider when auto-redirect is required', async () => {
      const mockProvider = { id: 'azure-ad', displayName: 'Microsoft Azure AD' };
      const { ssoConfigService } = await import('../../services/sso-config.js');
      ssoConfigService.shouldAutoRedirect.mockResolvedValue(mockProvider);

      const result = await authController.loginWithEmailCheck('user@company.com', 'password');

      expect(result.success).toBe(false);
      expect(result.shouldRedirectSSO).toEqual(mockProvider);
      
      // Should not attempt regular login
      const loginSpy = vi.spyOn(authController, 'login');
      expect(loginSpy).not.toHaveBeenCalled();
    });
  });

  describe('Callback Error Handling', () => {
    it('retrieves stored callback errors', async () => {
      const mockError = { error: 'OAuth failed', provider: 'google' };
      const { OAuthCallbackHandler } = await import('../../services/oauth-callback-handler.js');
      OAuthCallbackHandler.getAndClearStoredError.mockReturnValue(mockError);

      const error = await authController.getStoredCallbackError();

      expect(error).toEqual(mockError);
      expect(OAuthCallbackHandler.getAndClearStoredError).toHaveBeenCalled();
    });

    it('handles errors when retrieving callback errors', async () => {
      const { OAuthCallbackHandler } = await import('../../services/oauth-callback-handler.js');
      OAuthCallbackHandler.getAndClearStoredError.mockImplementation(() => {
        throw new Error('Storage error');
      });

      const error = await authController.getStoredCallbackError();

      expect(error).toBeNull();
    });
  });

  describe('State Management During OAuth/SSO', () => {
    it('sets loading state during OAuth initiation', async () => {
      const { oauthConfigService } = await import('../../services/oauth-config.js');
      
      // Make the promise hang to test loading state
      let resolveOAuth: () => void;
      const oauthPromise = new Promise<void>(resolve => {
        resolveOAuth = resolve;
      });
      oauthConfigService.initiateOAuth.mockReturnValue(oauthPromise);

      const oauthPromiseResult = authController.initiateOAuth('google');

      // Check loading state
      const state = authController.getState();
      expect(state.isLoading).toBe(true);
      expect(state.error).toBeUndefined();

      // Resolve and complete
      resolveOAuth!();
      await oauthPromiseResult;
    });

    it('clears loading state after OAuth completion', async () => {
      const { oauthConfigService } = await import('../../services/oauth-config.js');
      oauthConfigService.initiateOAuth.mockResolvedValue(undefined);

      await authController.initiateOAuth('google');

      const state = authController.getState();
      expect(state.isLoading).toBe(false);
    });

    it('sets error state on OAuth failure', async () => {
      const { oauthConfigService } = await import('../../services/oauth-config.js');
      const errorMessage = 'OAuth provider not configured';
      oauthConfigService.initiateOAuth.mockRejectedValue(new Error(errorMessage));

      await expect(authController.initiateOAuth('invalid')).rejects.toThrow();

      const state = authController.getState();
      expect(state.isLoading).toBe(false);
      expect(state.error).toContain(errorMessage);
    });
  });

  describe('Error Handling and Logging', () => {
    it('logs OAuth operations correctly', async () => {
      const { logger } = await import('../client-logger.js');
      const { oauthConfigService } = await import('../../services/oauth-config.js');
      oauthConfigService.initiateOAuth.mockResolvedValue(undefined);

      await authController.initiateOAuth('google');

      expect(logger.info).toHaveBeenCalledWith('OAuth flow initiated', { provider: 'google' });
    });

    it('logs SSO operations correctly', async () => {
      const { logger } = await import('../client-logger.js');
      const { ssoConfigService } = await import('../../services/sso-config.js');
      ssoConfigService.initiatSSO.mockResolvedValue(undefined);

      await authController.initiateSSO('azure-ad');

      expect(logger.info).toHaveBeenCalledWith('SSO flow initiated', { provider: 'azure-ad' });
    });

    it('logs errors appropriately', async () => {
      const { logger } = await import('../client-logger.js');
      const { handleError } = await import('../error-handler.js');
      const { oauthConfigService } = await import('../../services/oauth-config.js');
      
      const error = new Error('OAuth failed');
      oauthConfigService.initiateOAuth.mockRejectedValue(error);

      await expect(authController.initiateOAuth('google')).rejects.toThrow();

      expect(handleError).toHaveBeenCalledWith(error, 'authentication', {
        operation: 'initiate-oauth',
        provider: 'google',
      });
    });

    it('handles network failures gracefully', async () => {
      const { oauthConfigService } = await import('../../services/oauth-config.js');
      oauthConfigService.isOAuthAvailable.mockRejectedValue(new Error('Network timeout'));

      const available = await authController.isOAuthAvailable();

      expect(available).toBe(false);
    });
  });
});