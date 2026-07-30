/**
 * OAuth Callback Handler
 * 
 * Handles OAuth callback processing and error storage
 */

export interface OAuthCallbackParams {
  code?: string;
  error?: string;
  state?: string;
  provider?: string;
}

export interface OAuthCallbackResult {
  success: boolean;
  provider?: string;
  returnUrl?: string;
  error?: string;
}

export class OAuthCallbackHandler {
  private static storageKey = 'streetstudio_oauth_error';
  private static stateKey = 'streetstudio_oauth_state';
  private static returnUrlKey = 'streetstudio_oauth_return_url';

  /**
   * Parse callback parameters from the URL
   */
  static parseCallbackParams(): OAuthCallbackParams {
    const urlParams = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(window.location.hash.replace('#', '?'));

    return {
      code: urlParams.get('code') || hashParams.get('code') || undefined,
      error: urlParams.get('error') || hashParams.get('error') || undefined,
      state: urlParams.get('state') || hashParams.get('state') || undefined,
      provider: urlParams.get('provider') || hashParams.get('provider') || 
                sessionStorage.getItem('oauth_provider') || undefined,
    };
  }

  /**
   * Handle the OAuth callback by exchanging the code for tokens
   */
  async handleCallback(params: OAuthCallbackParams): Promise<OAuthCallbackResult> {
    if (params.error) {
      return {
        success: false,
        provider: params.provider,
        error: params.error,
      };
    }

    if (!params.code) {
      return {
        success: false,
        provider: params.provider,
        error: 'No authorization code received',
      };
    }

    // Validate state parameter to prevent CSRF
    const storedState = sessionStorage.getItem(OAuthCallbackHandler.stateKey);
    if (params.state && storedState && params.state !== storedState) {
      return {
        success: false,
        provider: params.provider,
        error: 'Invalid state parameter - possible security issue',
      };
    }

    try {
      const response = await fetch('/api/auth/oauth/callback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: params.code,
          state: params.state,
          provider: params.provider,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        return {
          success: false,
          provider: params.provider,
          error: errorData.message || `Authentication failed (${response.status})`,
        };
      }

      const data = await response.json();

      // Store tokens if provided
      if (data.accessToken) {
        sessionStorage.setItem('access_token', data.accessToken);
      }
      if (data.refreshToken) {
        sessionStorage.setItem('refresh_token', data.refreshToken);
      }

      // Clean up OAuth state
      sessionStorage.removeItem(OAuthCallbackHandler.stateKey);
      sessionStorage.removeItem('oauth_provider');

      const returnUrl = sessionStorage.getItem(OAuthCallbackHandler.returnUrlKey) || '/dashboard';
      sessionStorage.removeItem(OAuthCallbackHandler.returnUrlKey);

      return {
        success: true,
        provider: params.provider,
        returnUrl,
      };
    } catch (error) {
      return {
        success: false,
        provider: params.provider,
        error: (error as Error).message || 'Network error during authentication',
      };
    }
  }

  /**
   * Handle successful redirect after authentication
   */
  static handleSuccessRedirect(returnUrl?: string): void {
    window.location.href = returnUrl || '/dashboard';
  }

  /**
   * Handle error display by storing the error and redirecting to login
   */
  static handleErrorDisplay(error: string, provider?: string): void {
    OAuthCallbackHandler.storeError(error, provider || 'unknown');
    window.location.href = '/auth/login';
  }

  /**
   * Store OAuth error for display
   */
  static storeError(error: string, provider: string): void {
    try {
      const errorData = {
        error,
        provider,
        timestamp: Date.now()
      };
      sessionStorage.setItem(this.storageKey, JSON.stringify(errorData));
    } catch (e) {
      console.warn('Failed to store OAuth error:', e);
    }
  }

  /**
   * Get and clear stored OAuth error
   */
  static getAndClearStoredError(): { error: string; provider: string } | null {
    try {
      const stored = sessionStorage.getItem(this.storageKey);
      if (!stored) return null;

      sessionStorage.removeItem(this.storageKey);
      
      const errorData = JSON.parse(stored);
      
      // Check if error is not too old (5 minutes)
      if (Date.now() - errorData.timestamp > 5 * 60 * 1000) {
        return null;
      }

      return {
        error: errorData.error,
        provider: errorData.provider
      };
    } catch (e) {
      console.warn('Failed to retrieve OAuth error:', e);
      return null;
    }
  }

  /**
   * Clear stored error without returning it
   */
  static clearStoredError(): void {
    try {
      sessionStorage.removeItem(this.storageKey);
    } catch (e) {
      console.warn('Failed to clear OAuth error:', e);
    }
  }

  /**
   * Check if there's a stored error
   */
  static hasStoredError(): boolean {
    try {
      const stored = sessionStorage.getItem(this.storageKey);
      if (!stored) return false;

      const errorData = JSON.parse(stored);
      
      // Check if error is not too old (5 minutes)
      return Date.now() - errorData.timestamp <= 5 * 60 * 1000;
    } catch (e) {
      return false;
    }
  }
}

/** Singleton instance for instance method usage */
export const oauthCallbackHandler = new OAuthCallbackHandler();