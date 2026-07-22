/**
 * SSO Configuration Service
 * 
 * Handles Single Sign-On (SSO) provider configuration and authentication flows.
 * Requirement 1.7: SSO authentication flow with proper state management
 */

import { apiClient } from './api.js';
import { logger } from '../app/client-logger.js';

export interface SSOProvider {
  id: string;
  name: string;
  displayName: string;
  domainHint?: string;
  iconUrl?: string;
  iconSvg?: string;
  enabled: boolean;
  authUrl: string;
  buttonColor?: string;
  buttonTextColor?: string;
  autoRedirect?: boolean;
  emailDomains: string[];
}

export interface SSOConfig {
  providers: SSOProvider[];
  enabled: boolean;
  autoRedirectEnabled: boolean;
  emailDomainMatching: boolean;
}

export interface SSOFlowState {
  providerId: string;
  returnUrl: string;
  timestamp: number;
  nonce: string;
}

export class SSOConfigService {
  private config: SSOConfig | null = null;
  private configPromise: Promise<SSOConfig> | null = null;
  private readonly SSO_STATE_KEY = 'streetstudio_sso_state';
  private readonly STATE_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes

  /**
   * Get SSO configuration from the server
   */
  public async getConfig(): Promise<SSOConfig> {
    // Return cached config if available
    if (this.config) {
      return this.config;
    }

    // Return existing promise if already loading
    if (this.configPromise) {
      return this.configPromise;
    }

    // Load config from server
    this.configPromise = this.loadConfig();
    
    try {
      this.config = await this.configPromise;
      return this.config;
    } finally {
      this.configPromise = null;
    }
  }

  /**
   * Load SSO configuration from the API
   */
  private async loadConfig(): Promise<SSOConfig> {
    try {
      const response = await apiClient.get<SSOConfig>('/auth/sso/config');
      
      logger.info('SSO configuration loaded successfully', {
        providersCount: response.data.providers.length,
        enabledProviders: response.data.providers.filter(p => p.enabled).length,
        autoRedirectEnabled: response.data.autoRedirectEnabled,
      });

      return response.data;

    } catch (error) {
      logger.warn('Failed to load SSO configuration, using defaults', {
        error: (error as Error).message,
      });

      // Return default configuration with no providers enabled
      return this.getDefaultConfig();
    }
  }

  /**
   * Get default SSO configuration
   */
  private getDefaultConfig(): SSOConfig {
    return {
      enabled: false,
      autoRedirectEnabled: false,
      emailDomainMatching: false,
      providers: [
        {
          id: 'azure-ad',
          name: 'azure-ad',
          displayName: 'Microsoft Azure AD',
          enabled: false,
          authUrl: '/api/auth/sso/azure-ad',
          buttonColor: '#0078d4',
          buttonTextColor: '#ffffff',
          emailDomains: [],
          iconSvg: `<path fill="currentColor" d="M11.4 24H0V12.6h11.4V24zM24 24H12.6V12.6H24V24zM11.4 11.4H0V0h11.4v11.4zM24 11.4H12.6V0H24v11.4z"/>`,
        },
        {
          id: 'okta',
          name: 'okta',
          displayName: 'Okta',
          enabled: false,
          authUrl: '/api/auth/sso/okta',
          buttonColor: '#007dc1',
          buttonTextColor: '#ffffff',
          emailDomains: [],
          iconSvg: `<path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>`,
        },
        {
          id: 'google-workspace',
          name: 'google-workspace',
          displayName: 'Google Workspace',
          enabled: false,
          authUrl: '/api/auth/sso/google-workspace',
          buttonColor: '#4285f4',
          buttonTextColor: '#ffffff',
          emailDomains: [],
          iconSvg: `<path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
          <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
          <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
          <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>`,
        },
      ],
    };
  }

  /**
   * Get enabled SSO providers
   */
  public async getEnabledProviders(): Promise<SSOProvider[]> {
    const config = await this.getConfig();
    return config.enabled ? config.providers.filter(p => p.enabled) : [];
  }

  /**
   * Check if SSO should auto-redirect for a given email domain
   */
  public async shouldAutoRedirect(email: string): Promise<SSOProvider | null> {
    const config = await this.getConfig();
    
    if (!config.enabled || !config.autoRedirectEnabled || !config.emailDomainMatching) {
      return null;
    }

    const domain = email.split('@')[1]?.toLowerCase();
    if (!domain) {
      return null;
    }

    const providers = config.providers.filter(p => p.enabled && p.autoRedirect);
    
    for (const provider of providers) {
      if (provider.emailDomains.some(d => d.toLowerCase() === domain)) {
        logger.info('Auto-redirect SSO provider found for email domain', {
          provider: provider.id,
          domain,
        });
        return provider;
      }
    }

    return null;
  }

  /**
   * Initiate SSO authentication flow
   */
  public async initiatSSO(providerId: string, returnUrl?: string): Promise<void> {
    try {
      const providers = await this.getEnabledProviders();
      const provider = providers.find(p => p.id === providerId);

      if (!provider) {
        throw new Error(`SSO provider '${providerId}' not found or not enabled`);
      }

      logger.info('Initiating SSO flow', { provider: providerId });

      // Generate secure flow state
      const nonce = crypto.randomUUID();
      const flowState: SSOFlowState = {
        providerId,
        returnUrl: returnUrl || sessionStorage.getItem('auth_return_url') || '/dashboard',
        timestamp: Date.now(),
        nonce,
      };

      // Store flow state securely
      this.storeFlowState(flowState);

      // Construct SSO URL with state parameter
      const ssoUrl = new URL(provider.authUrl, window.location.origin);
      ssoUrl.searchParams.set('state', nonce);
      ssoUrl.searchParams.set('return_url', flowState.returnUrl);

      if (provider.domainHint) {
        ssoUrl.searchParams.set('domain_hint', provider.domainHint);
      }

      // Redirect to SSO provider
      logger.info('Redirecting to SSO provider', {
        provider: providerId,
        url: ssoUrl.origin + ssoUrl.pathname, // Don't log full URL with params
      });

      window.location.href = ssoUrl.toString();

    } catch (error) {
      logger.error('Failed to initiate SSO flow', {
        provider: providerId,
        error: (error as Error).message,
      });
      
      throw new Error(`SSO authentication failed: ${(error as Error).message}`);
    }
  }

  /**
   * Handle SSO callback
   */
  public async handleSSOCallback(
    code: string, 
    state: string, 
    providerId: string,
    error?: string
  ): Promise<{ success: boolean; error?: string; returnUrl?: string }> {
    try {
      // Handle SSO error responses
      if (error) {
        logger.warn('SSO provider returned error', {
          provider: providerId,
          error,
        });
        
        this.clearFlowState();
        return { 
          success: false, 
          error: this.formatSSOError(error, providerId) 
        };
      }

      // Verify and retrieve flow state
      const flowState = this.getFlowState();
      if (!flowState) {
        throw new Error('No SSO flow state found. The session may have expired.');
      }

      if (flowState.nonce !== state) {
        throw new Error('Invalid SSO state parameter. This may indicate a security issue.');
      }

      if (flowState.providerId !== providerId) {
        throw new Error('Provider mismatch in SSO callback');
      }

      // Check if state is expired
      if (Date.now() - flowState.timestamp > this.STATE_EXPIRY_MS) {
        this.clearFlowState();
        throw new Error('SSO flow state expired. Please try signing in again.');
      }

      // Exchange code for authentication
      const response = await apiClient.post('/auth/sso/callback', {
        provider: providerId,
        code,
        state,
        nonce: flowState.nonce,
      });

      if (response.success) {
        logger.info('SSO authentication successful', { 
          provider: providerId,
          userId: response.data?.user?.id,
        });

        // Clean up flow state
        this.clearFlowState();

        return { 
          success: true, 
          returnUrl: flowState.returnUrl 
        };
      } else {
        throw new Error(response.error || 'SSO authentication failed');
      }

    } catch (error) {
      logger.error('SSO callback failed', {
        provider: providerId,
        error: (error as Error).message,
      });

      // Clean up flow state on error
      this.clearFlowState();

      return { 
        success: false, 
        error: (error as Error).message || 'SSO authentication failed' 
      };
    }
  }

  /**
   * Format SSO error messages for user display
   */
  private formatSSOError(error: string, providerId: string): string {
    const provider = this.getProviderDisplayName(providerId);
    
    switch (error.toLowerCase()) {
      case 'access_denied':
        return `You cancelled the ${provider} sign-in. Please try again if you'd like to continue.`;
      case 'invalid_request':
        return `There was a problem with the ${provider} sign-in request. Please try again.`;
      case 'unauthorized_client':
        return `${provider} sign-in is not properly configured. Please contact your administrator.`;
      case 'unsupported_response_type':
      case 'invalid_scope':
        return `${provider} sign-in configuration error. Please contact your administrator.`;
      case 'server_error':
        return `${provider} is currently unavailable. Please try again later.`;
      case 'temporarily_unavailable':
        return `${provider} sign-in is temporarily unavailable. Please try again in a few minutes.`;
      default:
        return `${provider} sign-in failed: ${error}. Please try again or contact support if the problem persists.`;
    }
  }

  /**
   * Get display name for provider ID
   */
  private getProviderDisplayName(providerId: string): string {
    switch (providerId) {
      case 'azure-ad':
        return 'Microsoft Azure AD';
      case 'okta':
        return 'Okta';
      case 'google-workspace':
        return 'Google Workspace';
      default:
        return 'SSO Provider';
    }
  }

  /**
   * Store SSO flow state securely
   */
  private storeFlowState(state: SSOFlowState): void {
    try {
      const encrypted = btoa(JSON.stringify(state));
      sessionStorage.setItem(this.SSO_STATE_KEY, encrypted);
    } catch (error) {
      logger.error('Failed to store SSO flow state', {
        error: (error as Error).message,
      });
      throw new Error('Unable to initialize SSO flow. Please try again.');
    }
  }

  /**
   * Retrieve SSO flow state
   */
  private getFlowState(): SSOFlowState | null {
    try {
      const stored = sessionStorage.getItem(this.SSO_STATE_KEY);
      if (!stored) {
        return null;
      }
      
      const decrypted = atob(stored);
      return JSON.parse(decrypted) as SSOFlowState;
    } catch (error) {
      logger.warn('Failed to parse stored SSO flow state', {
        error: (error as Error).message,
      });
      this.clearFlowState();
      return null;
    }
  }

  /**
   * Clear SSO flow state
   */
  private clearFlowState(): void {
    try {
      sessionStorage.removeItem(this.SSO_STATE_KEY);
    } catch (error) {
      logger.warn('Failed to clear SSO flow state', {
        error: (error as Error).message,
      });
    }
  }

  /**
   * Refresh SSO configuration
   */
  public async refreshConfig(): Promise<void> {
    this.config = null;
    this.configPromise = null;
    await this.getConfig();
  }

  /**
   * Check if SSO is available
   */
  public async isSSOAvailable(): Promise<boolean> {
    try {
      const config = await this.getConfig();
      return config.enabled && config.providers.some(p => p.enabled);
    } catch (error) {
      return false;
    }
  }

  /**
   * Get SSO provider by email domain
   */
  public async getProviderForDomain(email: string): Promise<SSOProvider | null> {
    const config = await this.getConfig();
    
    if (!config.enabled || !config.emailDomainMatching) {
      return null;
    }

    const domain = email.split('@')[1]?.toLowerCase();
    if (!domain) {
      return null;
    }

    return config.providers
      .filter(p => p.enabled)
      .find(p => p.emailDomains.some(d => d.toLowerCase() === domain)) || null;
  }
}

// Export singleton instance
export const ssoConfigService = new SSOConfigService();