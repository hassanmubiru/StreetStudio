/**
 * OAuth/SSO Callback Handler Service
 * 
 * Handles OAuth and SSO authentication callbacks with proper redirect flow management.
 * Requirements 1.6, 1.7: OAuth and SSO integration handlers
 */

import { oauthConfigService } from './oauth-config.js';
import { ssoConfigService } from './sso-config.js';
import { logger } from '../app/client-logger.js';

export interface CallbackParams {
  code?: string;
  state?: string;
  error?: string;
  error_description?: string;
  provider?: string;
}

export interface CallbackResult {
  success: boolean;
  error?: string;
  returnUrl?: string;
  provider?: string;
}

export class OAuthCallbackHandler {
  /**
   * Handle OAuth or SSO callback based on URL parameters
   */
  public async handleCallback(params: CallbackParams): Promise<CallbackResult> {
    try {
      // Determine callback type based on current path
      const path = window.location.pathname;
      const isSSO = path.includes('/sso/') || params.provider?.startsWith('sso-');
      const isOAuth = path.includes('/oauth/') || !isSSO;

      logger.info('Processing authentication callback', {
        type: isSSO ? 'SSO' : 'OAuth',
        provider: params.provider,
        hasError: !!params.error,
        hasCode: !!params.code,
      });

      // Validate required parameters
      if (!params.code && !params.error) {
        throw new Error('Missing authorization code or error parameter');
      }

      if (!params.state) {
        throw new Error('Missing state parameter');
      }

      // Extract provider from state or URL if not provided
      const provider = params.provider || this.extractProviderFromUrl() || this.extractProviderFromState(params.state);
      
      if (!provider) {
        throw new Error('Unable to determine authentication provider');
      }

      // Route to appropriate handler
      if (isSSO) {
        return await this.handleSSOCallback(params, provider);
      } else {
        return await this.handleOAuthCallback(params, provider);
      }

    } catch (error) {
      logger.error('Callback handling failed', {
        error: (error as Error).message,
        params: {
          ...params,
          code: params.code ? '[REDACTED]' : undefined, // Don't log sensitive data
        },
      });

      return {
        success: false,
        error: (error as Error).message || 'Authentication callback failed',
      };
    }
  }

  /**
   * Handle OAuth callback
   */
  private async handleOAuthCallback(params: CallbackParams, provider: string): Promise<CallbackResult> {
    try {
      const result = await oauthConfigService.handleOAuthCallback(
        params.code!,
        params.state!,
        provider,
        params.error,
        params.error_description
      );

      if (result.success && result.returnUrl) {
        // Successful OAuth authentication
        logger.info('OAuth authentication completed', { 
          provider,
          returnUrl: result.returnUrl,
        });

        // Use setTimeout to ensure the URL change happens after current execution
        setTimeout(() => {
          window.location.href = result.returnUrl!;
        }, 100);
      }

      return result;

    } catch (error) {
      logger.error('OAuth callback processing failed', {
        provider,
        error: (error as Error).message,
      });

      return {
        success: false,
        error: `OAuth authentication failed: ${(error as Error).message}`,
        provider,
      };
    }
  }

  /**
   * Handle SSO callback
   */
  private async handleSSOCallback(params: CallbackParams, provider: string): Promise<CallbackResult> {
    try {
      const result = await ssoConfigService.handleSSOCallback(
        params.code!,
        params.state!,
        provider,
        params.error
      );

      if (result.success && result.returnUrl) {
        // Successful SSO authentication
        logger.info('SSO authentication completed', { 
          provider,
          returnUrl: result.returnUrl,
        });

        // Use setTimeout to ensure the URL change happens after current execution
        setTimeout(() => {
          window.location.href = result.returnUrl!;
        }, 100);
      }

      return result;

    } catch (error) {
      logger.error('SSO callback processing failed', {
        provider,
        error: (error as Error).message,
      });

      return {
        success: false,
        error: `SSO authentication failed: ${(error as Error).message}`,
        provider,
      };
    }
  }

  /**
   * Extract provider ID from current URL path
   */
  private extractProviderFromUrl(): string | null {
    const path = window.location.pathname;
    
    // Try to extract from path like /auth/oauth/google/callback or /auth/sso/azure-ad/callback
    const pathParts = path.split('/');
    
    if (pathParts.includes('oauth') || pathParts.includes('sso')) {
      const authIndex = pathParts.findIndex(part => part === 'oauth' || part === 'sso');
      if (authIndex >= 0 && pathParts.length > authIndex + 1) {
        const provider = pathParts[authIndex + 1];
        if (provider && provider !== 'callback') {
          return provider;
        }
      }
    }

    return null;
  }

  /**
   * Extract provider ID from state parameter (if encoded)
   */
  private extractProviderFromState(state: string): string | null {
    try {
      // If state is base64 encoded JSON with provider info
      const decoded = atob(state);
      const parsed = JSON.parse(decoded);
      return parsed.provider || parsed.providerId || null;
    } catch {
      // State is probably just a UUID, can't extract provider
      return null;
    }
  }

  /**
   * Parse URL parameters from current location
   */
  public static parseCallbackParams(): CallbackParams {
    const urlParams = new URLSearchParams(window.location.search);
    
    return {
      code: urlParams.get('code') || undefined,
      state: urlParams.get('state') || undefined,
      error: urlParams.get('error') || undefined,
      error_description: urlParams.get('error_description') || undefined,
      provider: urlParams.get('provider') || undefined,
    };
  }

  /**
   * Handle authentication success redirect
   */
  public static handleSuccessRedirect(returnUrl?: string): void {
    const finalUrl = returnUrl || '/dashboard';
    
    // Clean up URL parameters
    const cleanUrl = new URL(window.location.href);
    cleanUrl.search = '';
    window.history.replaceState({}, document.title, cleanUrl.toString());

    // Redirect to final destination
    logger.info('Redirecting after successful authentication', { 
      returnUrl: finalUrl,
    });

    window.location.href = finalUrl;
  }

  /**
   * Handle authentication error display
   */
  public static handleErrorDisplay(error: string, provider?: string): void {
    // Clean up URL parameters
    const cleanUrl = new URL(window.location.href);
    cleanUrl.search = '';
    window.history.replaceState({}, document.title, cleanUrl.toString());

    // Store error for display on login page
    sessionStorage.setItem('auth_callback_error', JSON.stringify({
      error,
      provider,
      timestamp: Date.now(),
    }));

    // Redirect to login page
    window.location.href = '/auth/login';
  }

  /**
   * Get and clear stored authentication error
   */
  public static getAndClearStoredError(): { error: string; provider?: string } | null {
    try {
      const stored = sessionStorage.getItem('auth_callback_error');
      if (!stored) {
        return null;
      }

      sessionStorage.removeItem('auth_callback_error');
      
      const parsed = JSON.parse(stored);
      
      // Check if error is too old (5 minutes max)
      if (Date.now() - parsed.timestamp > 5 * 60 * 1000) {
        return null;
      }

      return {
        error: parsed.error,
        provider: parsed.provider,
      };

    } catch (error) {
      logger.warn('Failed to parse stored auth error', {
        error: (error as Error).message,
      });
      return null;
    }
  }

  /**
   * Check if current page is an OAuth/SSO callback
   */
  public static isCallbackUrl(): boolean {
    const path = window.location.pathname.toLowerCase();
    const params = new URLSearchParams(window.location.search);
    
    return (
      (path.includes('/oauth/') || path.includes('/sso/')) &&
      (path.includes('/callback') || params.has('code') || params.has('error'))
    );
  }
}

// Export singleton instance
export const oauthCallbackHandler = new OAuthCallbackHandler();