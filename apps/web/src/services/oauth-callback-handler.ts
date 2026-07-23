/**
 * OAuth Callback Handler
 * 
 * Handles OAuth callback processing and error storage
 */

export class OAuthCallbackHandler {
  private static storageKey = 'streetstudio_oauth_error';

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