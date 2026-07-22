/**
 * OAuth Configuration Service
 * 
 * Handles dynamic OAuth provider configuration and authentication flows.
 * Requirement 1.6: OAuth provider buttons with dynamic configuration
 */

import { apiClient } from './api.js';
import { logger } from '../app/client-logger.js';

export interface OAuthProvider {
  id: string;
  name: string;
  displayName: string;
  iconUrl?: string;
  iconSvg?: string;
  enabled: boolean;
  clientId?: string;
  scopes: string[];
  authUrl: string;
  buttonColor?: string;
  buttonTextColor?: string;
}

export interface OAuthConfig {
  providers: OAuthProvider[];
  enabled: boolean;
}

export class OAuthConfigService {
  private config: OAuthConfig | null = null;
  private configPromise: Promise<OAuthConfig> | null = null;

  /**
   * Get OAuth configuration from the server
   */
  public async getConfig(): Promise<OAuthConfig> {
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
   * Load OAuth configuration from the API
   */
  private async loadConfig(): Promise<OAuthConfig> {
    try {
      const response = await apiClient.get<OAuthConfig>('/auth/oauth/config');
      
      logger.info('OAuth configuration loaded successfully', {
        providersCount: response.data.providers.length,
        enabledProviders: response.data.providers.filter(p => p.enabled).length,
      });

      return response.data;

    } catch (error) {
      logger.warn('Failed to load OAuth configuration, using defaults', {
        error: (error as Error).message,
      });

      // Return default configuration with common providers
      return this.getDefaultConfig();
    }
  }

  /**
   * Get default OAuth configuration
   */
  private getDefaultConfig(): OAuthConfig {
    return {
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
          buttonTextColor: '#ffffff',
          iconSvg: `<path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
          <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
          <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
          <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>`,
        },
        {
          id: 'github',
          name: 'github',
          displayName: 'GitHub',
          enabled: true,
          scopes: ['read:user', 'user:email'],
          authUrl: '/api/auth/oauth/github',
          buttonColor: '#24292e',
          buttonTextColor: '#ffffff',
          iconSvg: `<path fill="currentColor" d="M12 0C5.374 0 0 5.373 0 12 0 17.302 3.438 21.8 8.207 23.387c.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0112 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z"/>`,
        },
        {
          id: 'microsoft',
          name: 'microsoft',
          displayName: 'Microsoft',
          enabled: false,
          scopes: ['openid', 'email', 'profile'],
          authUrl: '/api/auth/oauth/microsoft',
          buttonColor: '#0078d4',
          buttonTextColor: '#ffffff',
          iconSvg: `<path fill="currentColor" d="M11.4 24H0V12.6h11.4V24zM24 24H12.6V12.6H24V24zM11.4 11.4H0V0h11.4v11.4zM24 11.4H12.6V0H24v11.4z"/>`,
        },
        {
          id: 'slack',
          name: 'slack',
          displayName: 'Slack',
          enabled: false,
          scopes: ['identity.basic', 'identity.email'],
          authUrl: '/api/auth/oauth/slack',
          buttonColor: '#4a154b',
          buttonTextColor: '#ffffff',
          iconSvg: `<path fill="currentColor" d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z"/>`,
        },
      ],
    };
  }

  /**
   * Get enabled OAuth providers
   */
  public async getEnabledProviders(): Promise<OAuthProvider[]> {
    const config = await this.getConfig();
    return config.enabled ? config.providers.filter(p => p.enabled) : [];
  }

  /**
   * Initiate OAuth authentication flow with enhanced state management
   */
  public async initiateOAuth(providerId: string, returnUrl?: string): Promise<void> {
    try {
      const providers = await this.getEnabledProviders();
      const provider = providers.find(p => p.id === providerId);

      if (!provider) {
        throw new Error(`OAuth provider '${providerId}' not found or not enabled`);
      }

      logger.info('Initiating OAuth flow', { provider: providerId });

      // Store enhanced state information
      const finalReturnUrl = returnUrl || sessionStorage.getItem('auth_return_url') || '/dashboard';
      const state = crypto.randomUUID();
      const timestamp = Date.now();

      // Store flow state with timestamp for expiration
      const flowState = {
        state,
        providerId,
        returnUrl: finalReturnUrl,
        timestamp,
        scopes: provider.scopes,
      };

      sessionStorage.setItem('oauth_flow_state', JSON.stringify(flowState));

      // Construct OAuth URL with enhanced parameters
      const oauthUrl = new URL(provider.authUrl, window.location.origin);
      oauthUrl.searchParams.set('state', state);
      oauthUrl.searchParams.set('redirect_uri', `${window.location.origin}/auth/oauth/callback`);
      
      // Add scopes if specified
      if (provider.scopes && provider.scopes.length > 0) {
        oauthUrl.searchParams.set('scope', provider.scopes.join(' '));
      }

      // Add client ID if available
      if (provider.clientId) {
        oauthUrl.searchParams.set('client_id', provider.clientId);
      }

      logger.info('Redirecting to OAuth provider', {
        provider: providerId,
        url: oauthUrl.origin + oauthUrl.pathname, // Don't log sensitive params
        scopes: provider.scopes,
      });

      // Redirect to OAuth provider
      window.location.href = oauthUrl.toString();

    } catch (error) {
      logger.error('Failed to initiate OAuth flow', {
        provider: providerId,
        error: (error as Error).message,
      });
      
      // Clean up any partial state
      this.cleanupOAuthState();
      
      throw new Error(`OAuth authentication failed: ${(error as Error).message}`);
    }
  }

  /**
   * Handle OAuth callback with enhanced error handling and validation
   */
  public async handleOAuthCallback(
    code: string, 
    state: string, 
    providerId: string,
    error?: string,
    errorDescription?: string
  ): Promise<{ success: boolean; error?: string; returnUrl?: string }> {
    try {
      // Handle OAuth error responses from provider
      if (error) {
        logger.warn('OAuth provider returned error', {
          provider: providerId,
          error,
          errorDescription,
        });
        
        this.cleanupOAuthState();
        return { 
          success: false, 
          error: this.formatOAuthError(error, errorDescription, providerId) 
        };
      }

      // Verify flow state
      const flowState = this.getOAuthFlowState();
      if (!flowState) {
        throw new Error('No OAuth flow state found. The session may have expired.');
      }

      if (flowState.state !== state) {
        throw new Error('Invalid OAuth state parameter. This may indicate a security issue.');
      }

      if (flowState.providerId !== providerId) {
        throw new Error('Provider mismatch in OAuth callback');
      }

      // Check if flow state is expired (30 minutes max)
      const maxAge = 30 * 60 * 1000;
      if (Date.now() - flowState.timestamp > maxAge) {
        this.cleanupOAuthState();
        throw new Error('OAuth flow expired. Please try signing in again.');
      }

      // Exchange authorization code for tokens
      const response = await apiClient.post('/auth/oauth/callback', {
        provider: providerId,
        code,
        state,
        redirect_uri: `${window.location.origin}/auth/oauth/callback`,
        scopes: flowState.scopes,
      });

      if (response.success) {
        logger.info('OAuth authentication successful', { 
          provider: providerId,
          userId: response.data?.user?.id,
          scopes: flowState.scopes,
        });

        // Clean up OAuth state
        this.cleanupOAuthState();

        return { 
          success: true, 
          returnUrl: flowState.returnUrl 
        };
      } else {
        throw new Error(response.error || 'OAuth token exchange failed');
      }

    } catch (error) {
      logger.error('OAuth callback failed', {
        provider: providerId,
        error: (error as Error).message,
      });

      // Clean up OAuth state on error
      this.cleanupOAuthState();

      return { 
        success: false, 
        error: (error as Error).message || 'OAuth authentication failed' 
      };
    }
  }

  /**
   * Refresh OAuth configuration
   */
  public async refreshConfig(): Promise<void> {
    this.config = null;
    this.configPromise = null;
    await this.getConfig();
  }

  /**
   * Check if OAuth is available
   */
  public async isOAuthAvailable(): Promise<boolean> {
    try {
      const config = await this.getConfig();
      return config.enabled && config.providers.some(p => p.enabled);
    } catch (error) {
      return false;
    }
  }

  /**
   * Get OAuth flow state from storage
   */
  private getOAuthFlowState(): { state: string; providerId: string; returnUrl: string; timestamp: number; scopes: string[] } | null {
    try {
      const stored = sessionStorage.getItem('oauth_flow_state');
      return stored ? JSON.parse(stored) : null;
    } catch (error) {
      logger.warn('Failed to parse OAuth flow state', {
        error: (error as Error).message,
      });
      this.cleanupOAuthState();
      return null;
    }
  }

  /**
   * Clean up OAuth state from storage
   */
  private cleanupOAuthState(): void {
    try {
      sessionStorage.removeItem('oauth_flow_state');
      sessionStorage.removeItem('oauth_state'); // Legacy cleanup
      sessionStorage.removeItem('oauth_return_url'); // Legacy cleanup
    } catch (error) {
      logger.warn('Failed to cleanup OAuth state', {
        error: (error as Error).message,
      });
    }
  }

  /**
   * Format OAuth error messages for user display
   */
  private formatOAuthError(error: string, errorDescription?: string, providerId?: string): string {
    const provider = this.getProviderDisplayName(providerId);
    
    switch (error.toLowerCase()) {
      case 'access_denied':
        return `You cancelled the ${provider} sign-in. Please try again if you'd like to continue.`;
      case 'invalid_request':
        return `There was a problem with the ${provider} sign-in request. Please try again.`;
      case 'unauthorized_client':
        return `${provider} sign-in is not properly configured. Please contact your administrator.`;
      case 'unsupported_response_type':
        return `${provider} doesn't support this type of authentication request. Please contact your administrator.`;
      case 'invalid_scope':
        return `The requested permissions for ${provider} are not valid. Please contact your administrator.`;
      case 'server_error':
        return `${provider} is currently experiencing issues. Please try again later.`;
      case 'temporarily_unavailable':
        return `${provider} sign-in is temporarily unavailable. Please try again in a few minutes.`;
      case 'invalid_client':
        return `${provider} configuration error. Please contact your administrator.`;
      case 'invalid_grant':
        return `${provider} authentication expired. Please try signing in again.`;
      case 'unsupported_grant_type':
        return `${provider} authentication method is not supported. Please contact your administrator.`;
      default:
        const message = errorDescription || error;
        return `${provider} sign-in failed: ${message}. Please try again or contact support if the problem persists.`;
    }
  }

  /**
   * Get display name for provider ID
   */
  private getProviderDisplayName(providerId?: string): string {
    if (!providerId) {
      return 'OAuth Provider';
    }

    switch (providerId.toLowerCase()) {
      case 'google':
        return 'Google';
      case 'github':
        return 'GitHub';
      case 'microsoft':
        return 'Microsoft';
      case 'slack':
        return 'Slack';
      case 'gitlab':
        return 'GitLab';
      case 'bitbucket':
        return 'Bitbucket';
      case 'discord':
        return 'Discord';
      case 'linkedin':
        return 'LinkedIn';
      default:
        return 'OAuth Provider';
    }
  }

  /**
   * Validate OAuth provider configuration
   */
  public async validateProvider(providerId: string): Promise<{ valid: boolean; errors: string[] }> {
    try {
      const config = await this.getConfig();
      const provider = config.providers.find(p => p.id === providerId);
      
      if (!provider) {
        return { valid: false, errors: ['Provider not found'] };
      }

      const errors: string[] = [];

      if (!provider.enabled) {
        errors.push('Provider is disabled');
      }

      if (!provider.authUrl) {
        errors.push('Authentication URL not configured');
      }

      if (!provider.scopes || provider.scopes.length === 0) {
        errors.push('No scopes configured');
      }

      return { valid: errors.length === 0, errors };

    } catch (error) {
      return { 
        valid: false, 
        errors: [`Configuration validation failed: ${(error as Error).message}`] 
      };
    }
  }
}

// Export singleton instance
export const oauthConfigService = new OAuthConfigService();