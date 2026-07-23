/**
 * Authentication Controller
 * 
 * Manages authentication state, token refresh, and authentication-related operations.
 * Implements comprehensive auth error handling including automatic token refresh
 * and session recovery. (Requirement 13.7)
 */

import type { DashboardSession } from '@streetstudio/dashboard';
import type { MemberDto, OrganizationDto } from '@streetstudio/shared';
import { handleError } from '../error-handler.js';
import { logger } from '../client-logger.js';

export interface AuthState {
  isAuthenticated: boolean;
  currentUser?: MemberDto;
  currentOrganization?: OrganizationDto;
  isLoading: boolean;
  error?: string;
  tokenExpiry?: Date;
}

export interface AuthStateChangeHandler {
  (state: AuthState): void;
}

export interface StoredAuth {
  token: string;
  refreshToken?: string;
  expiry: string;
  user?: MemberDto;
}

export interface TokenStorage {
  strategy: 'memory' | 'localStorage' | 'httpOnlyCookie';
  secure: boolean;
  sameSite: 'strict' | 'lax' | 'none';
}

export interface SessionConfig {
  tokenStorage: TokenStorage;
  refreshMargin: number; // milliseconds before expiry to refresh
  maxRetries: number;
  sessionTimeout: number; // milliseconds of inactivity before logout
}

export class AuthController {
  private state: AuthState = {
    isAuthenticated: false,
    isLoading: false,
  };
  
  private listeners: Set<AuthStateChangeHandler> = new Set();
  private session: DashboardSession;
  private refreshTimer?: number;
  private refreshPromise?: Promise<boolean>;
  private sessionTimeoutTimer?: number;
  private activityTimer?: number;
  private memoryTokenStorage = new Map<string, string>();
  private config: SessionConfig;
  private readonly DEFAULT_CONFIG: SessionConfig = {
    tokenStorage: {
      strategy: 'memory',
      secure: true,
      sameSite: 'strict'
    },
    refreshMargin: 5 * 60 * 1000, // 5 minutes
    maxRetries: 3,
    sessionTimeout: 30 * 60 * 1000 // 30 minutes
  };

  constructor(session: DashboardSession, config?: Partial<SessionConfig>) {
    this.session = session;
    this.config = { ...this.DEFAULT_CONFIG, ...config };
    this.setupTokenRefreshHandling();
    this.setupSessionActivityTracking();
  }

  /**
   * Setup automatic token refresh and auth error handling
   */
  private setupTokenRefreshHandling(): void {
    // Setup API interceptor for auth errors
    this.setupAuthErrorInterceptor();
    
    // Check for expired tokens periodically
    setInterval(() => {
      this.checkTokenExpiry();
    }, 60 * 1000); // Check every minute
  }

  /**
   * Setup session activity tracking for automatic timeout
   */
  private setupSessionActivityTracking(): void {
    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'];
    
    const activityHandler = () => {
      this.resetSessionTimeout();
    };

    // Add activity listeners
    events.forEach(event => {
      document.addEventListener(event, activityHandler, { passive: true });
    });

    // Track page visibility changes
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && this.isAuthenticated()) {
        this.resetSessionTimeout();
        // Validate session when page becomes visible
        this.validateSession();
      }
    });
  }

  /**
   * Reset session timeout timer
   */
  private resetSessionTimeout(): void {
    if (!this.isAuthenticated()) return;

    // Clear existing timer
    if (this.sessionTimeoutTimer) {
      clearTimeout(this.sessionTimeoutTimer);
    }

    // Set new timeout
    this.sessionTimeoutTimer = window.setTimeout(() => {
      this.handleSessionTimeout();
    }, this.config.sessionTimeout);
  }

  /**
   * Handle session timeout
   */
  private async handleSessionTimeout(): Promise<void> {
    logger.warn('Session timeout due to inactivity');
    
    // Show warning notification
    window.dispatchEvent(new CustomEvent('show-notification', {
      detail: {
        type: 'warning',
        message: 'Your session will expire soon due to inactivity. Please interact with the page to continue.',
        duration: 10000,
        actions: [{
          label: 'Stay logged in',
          action: () => this.resetSessionTimeout()
        }]
      }
    }));

    // Force logout after additional grace period
    setTimeout(() => {
      if (this.isAuthenticated()) {
        this.logout();
      }
    }, 30000); // 30 seconds grace period
  }

  /**
   * Setup API error interceptor to handle auth errors
   */
  private setupAuthErrorInterceptor(): void {
    // This would normally be set up in the API client
    // For now, we'll handle it through error events
    window.addEventListener('api-error', (event: any) => {
      const { status, response } = event.detail;
      
      if (status === 401) {
        this.handleAuthenticationError(response);
      }
    });
  }

  /**
   * Handle authentication errors with automatic recovery
   */
  private async handleAuthenticationError(response?: any): Promise<void> {
    logger.warn('Authentication error detected', { response });

    // Try to refresh token first
    const refreshed = await this.attemptTokenRefresh();
    
    if (!refreshed) {
      // Refresh failed, need to re-authenticate
      const currentPath = window.location.pathname;
      
      // Save current location for redirect after login
      if (currentPath !== '/auth/login') {
        sessionStorage.setItem('auth_return_url', currentPath + window.location.search);
      }

      // Clear authentication state
      this.setState({
        isAuthenticated: false,
        currentUser: undefined,
        currentOrganization: undefined,
        error: 'Your session has expired. Please log in again.',
      });

      // Clear stored tokens
      this.clearStoredAuth();

      // Redirect to login
      window.location.href = '/auth/login';
      
      // Report the auth error
      handleError(new Error('Authentication expired'), 'authentication', {
        originalPath: currentPath,
        autoRefreshFailed: true,
      });
    }
  }

  /**
   * Check if token is near expiry and refresh if needed
   */
  private async checkTokenExpiry(): Promise<void> {
    const { tokenExpiry, isAuthenticated } = this.state;
    
    if (!isAuthenticated || !tokenExpiry) {
      return;
    }

    const now = new Date();
    const timeUntilExpiry = tokenExpiry.getTime() - now.getTime();

    // Refresh token if it expires within the margin
    if (timeUntilExpiry <= this.config.refreshMargin) {
      logger.info('Token approaching expiry, refreshing...', {
        expiresIn: Math.floor(timeUntilExpiry / 1000),
      });
      
      await this.attemptTokenRefresh();
    }
  }

  /**
   * Validate current session with server
   */
  private async validateSession(): Promise<boolean> {
    if (!this.isAuthenticated()) return false;

    try {
      const user = await this.session.currentMember();
      
      // Update user info if changed
      if (JSON.stringify(user) !== JSON.stringify(this.state.currentUser)) {
        this.setState({
          currentUser: user,
        });
      }

      return true;

    } catch (error) {
      logger.warn('Session validation failed', {
        error: (error as Error).message,
      });
      
      // Try to refresh token
      const refreshed = await this.attemptTokenRefresh();
      return refreshed;
    }
  }

  /**
   * Store token securely based on configured strategy
   */
  private storeTokenSecurely(key: string, value: string): void {
    try {
      switch (this.config.tokenStorage.strategy) {
        case 'memory':
          this.memoryTokenStorage.set(key, value);
          break;
          
        case 'httpOnlyCookie':
          // Set httpOnly cookie via server endpoint
          fetch('/api/auth/set-session-cookie', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: key,
              value,
              secure: this.config.tokenStorage.secure,
              sameSite: this.config.tokenStorage.sameSite,
              maxAge: 24 * 60 * 60 // 24 hours
            })
          }).catch(error => {
            logger.warn('Failed to set httpOnly cookie, falling back to memory', {
              error: error.message
            });
            this.memoryTokenStorage.set(key, value);
          });
          break;
          
        case 'localStorage':
        default:
          localStorage.setItem(key, value);
          break;
      }
    } catch (error) {
      logger.error('Failed to store token securely', {
        error: (error as Error).message,
        strategy: this.config.tokenStorage.strategy
      });
      
      // Fallback to memory storage
      this.memoryTokenStorage.set(key, value);
    }
  }

  /**
   * Retrieve token securely based on configured strategy
   */
  private getStoredTokenSecurely(key: string): string | null {
    try {
      switch (this.config.tokenStorage.strategy) {
        case 'memory':
          return this.memoryTokenStorage.get(key) || null;
          
        case 'httpOnlyCookie':
          // HttpOnly cookies are not accessible via JavaScript
          // Server should include token in auth check responses
          return null;
          
        case 'localStorage':
        default:
          return localStorage.getItem(key);
      }
    } catch (error) {
      logger.error('Failed to retrieve stored token', {
        error: (error as Error).message,
        strategy: this.config.tokenStorage.strategy
      });
      return null;
    }
  }

  /**
   * Clear stored tokens securely
   */
  private clearStoredTokensSecurely(): void {
    try {
      // Clear from all possible storage locations
      this.memoryTokenStorage.clear();
      
      // Clear localStorage
      localStorage.removeItem('streetstudio_auth');
      sessionStorage.removeItem('auth_return_url');
      
      // Clear httpOnly cookies via server
      if (this.config.tokenStorage.strategy === 'httpOnlyCookie') {
        fetch('/api/auth/clear-session-cookie', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        }).catch(error => {
          logger.warn('Failed to clear httpOnly cookie', {
            error: error.message
          });
        });
      }
      
    } catch (error) {
      logger.warn('Error clearing stored tokens', {
        error: (error as Error).message
      });
    }
  }

  /**
   * Attempt to refresh the authentication token
   */
  private async attemptTokenRefresh(): Promise<boolean> {
    // Prevent multiple concurrent refresh attempts
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    this.refreshPromise = this.doTokenRefreshWithRetry();
    const result = await this.refreshPromise;
    this.refreshPromise = undefined;
    
    return result;
  }

  /**
   * Perform token refresh with retry logic
   */
  private async doTokenRefreshWithRetry(): Promise<boolean> {
    let lastError: Error;
    
    for (let attempt = 0; attempt < this.config.maxRetries; attempt++) {
      try {
        return await this.doTokenRefresh();
      } catch (error) {
        lastError = error as Error;
        
        // Don't retry on certain errors
        if (error instanceof Error && 
            (error.message.includes('401') || error.message.includes('403'))) {
          break;
        }
        
        // Wait before retry with exponential backoff
        if (attempt < this.config.maxRetries - 1) {
          const delay = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s, etc.
          await this.delay(delay);
        }
      }
    }
    
    logger.error('Token refresh failed after all retry attempts', {
      attempts: this.config.maxRetries,
      error: lastError!.message
    });
    
    throw lastError!;
  }

  /**
   * Perform the actual token refresh
   */
  private async doTokenRefresh(): Promise<boolean> {
    try {
      const storedAuth = this.getStoredAuth();
      if (!storedAuth?.refreshToken) {
        logger.warn('No refresh token available');
        return false;
      }

      // Call refresh endpoint
      const response = await fetch('/api/auth/refresh', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${storedAuth.refreshToken}`,
        },
      });

      if (!response.ok) {
        throw new Error(`Refresh failed: ${response.status}`);
      }

      const { token, refreshToken, expiresIn } = await response.json();
      
      // Update stored auth
      const newExpiry = new Date(Date.now() + (expiresIn * 1000));
      this.storeAuth({
        token,
        refreshToken,
        expiry: newExpiry.toISOString(),
        user: storedAuth.user,
      });

      // Update session with new token
      this.session.useBearerToken(token);

      // Update state
      this.setState({
        tokenExpiry: newExpiry,
        error: undefined,
      });

      logger.info('Token refreshed successfully');
      return true;

    } catch (error) {
      logger.error('Token refresh failed', {
        error: (error as Error).message,
      });

      handleError(error as Error, 'authentication', {
        operation: 'token-refresh',
        retryable: true,
      });

      return false;
    }
  }

  /**
   * Get current authentication state
   */
  public getState(): AuthState {
    return { ...this.state };
  }

  /**
   * Set authentication state
   */
  public setState(updates: Partial<AuthState>): void {
    this.state = { ...this.state, ...updates };
    this.notifyListeners();
  }

  /**
   * Subscribe to authentication state changes
   */
  public onAuthStateChange(handler: AuthStateChangeHandler): () => void {
    this.listeners.add(handler);
    
    // Return unsubscribe function
    return () => {
      this.listeners.delete(handler);
    };
  }

  /**
   * Notify all listeners of state changes
   */
  private notifyListeners(): void {
    const currentState = this.getState();
    for (const listener of this.listeners) {
      try {
        listener(currentState);
      } catch (error) {
        console.error('Auth state listener error:', error);
      }
    }
  }

  /**
   * Check if user is authenticated
   */
  public isAuthenticated(): boolean {
    return this.state.isAuthenticated;
  }

  /**
   * Initialize authentication from stored tokens
   */
  public async initializeFromStorage(): Promise<boolean> {
    const storedAuth = this.getStoredAuth();
    if (!storedAuth) {
      return false;
    }

    try {
      // Check if token is expired
      const expiry = new Date(storedAuth.expiry);
      const now = new Date();
      
      if (expiry <= now) {
        // Token expired, try to refresh
        logger.info('Stored token expired, attempting refresh');
        const refreshed = await this.attemptTokenRefresh();
        
        if (!refreshed) {
          this.clearStoredAuth();
          return false;
        }
      } else {
        // Token still valid, use it
        this.session.useBearerToken(storedAuth.token);
        
        // Validate token with server
        try {
          const user = await this.session.currentMember();
          
          this.setState({
            isAuthenticated: true,
            currentUser: user,
            tokenExpiry: expiry,
          });

          return true;
          
        } catch (error) {
          // Token invalid, clear it
          logger.warn('Stored token validation failed', {
            error: (error as Error).message,
          });
          
          this.clearStoredAuth();
          return false;
        }
      }

      return true;

    } catch (error) {
      logger.error('Auth initialization failed', {
        error: (error as Error).message,
      });
      
      this.clearStoredAuth();
      return false;
    }
  }

  /**
   * Login with credentials
   */
  public async login(email: string, password: string): Promise<{ success: boolean; error?: string }> {
    this.setState({ isLoading: true, error: undefined });

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(error || 'Login failed');
      }

      const { token, refreshToken, expiresIn, user } = await response.json();
      
      // Store authentication
      const expiry = new Date(Date.now() + (expiresIn * 1000));
      this.storeAuth({
        token,
        refreshToken,
        expiry: expiry.toISOString(),
        user,
      });

      // Update session
      this.session.useBearerToken(token);

      // Update state
      this.setState({
        isAuthenticated: true,
        currentUser: user,
        tokenExpiry: expiry,
        isLoading: false,
      });

      // Redirect to saved URL if available
      const returnUrl = sessionStorage.getItem('auth_return_url');
      if (returnUrl) {
        sessionStorage.removeItem('auth_return_url');
        window.location.href = returnUrl;
      }

      logger.info('User logged in successfully', {
        userId: user.id,
        email: user.email,
      });

      return { success: true };

    } catch (error) {
      const errorMessage = (error as Error).message || 'Invalid credentials';
      
      this.setState({
        isAuthenticated: false,
        currentUser: undefined,
        isLoading: false,
        error: errorMessage,
      });

      handleError(error as Error, 'authentication', {
        operation: 'login',
        email,
      });

      return { success: false, error: errorMessage };
    }
  }

  /**
   * Logout with comprehensive session cleanup
   */
  public async logout(): Promise<void> {
    this.setState({ isLoading: true });

    try {
      // Clear session timeout timer
      if (this.sessionTimeoutTimer) {
        clearTimeout(this.sessionTimeoutTimer);
        this.sessionTimeoutTimer = undefined;
      }
      
      // Clear refresh timer
      if (this.refreshTimer) {
        clearTimeout(this.refreshTimer);
        this.refreshTimer = undefined;
      }

      // Notify server of logout
      const storedAuth = this.getStoredAuth();
      if (storedAuth?.token) {
        try {
          await Promise.race([
            fetch('/api/auth/logout', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${storedAuth.token}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                allSessions: false // Only logout current session
              })
            }),
            // Timeout after 3 seconds
            new Promise((_, reject) => 
              setTimeout(() => reject(new Error('Logout timeout')), 3000)
            )
          ]);
        } catch (error) {
          // Ignore logout API errors, still clear local state
          logger.warn('Logout API call failed', {
            error: (error as Error).message,
          });
        }
      }
      
      // Clear session from dashboard
      if (this.session.clearAuthentication) {
        this.session.clearAuthentication();
      }

      // Clear local state
      this.setState({
        isAuthenticated: false,
        currentUser: undefined,
        currentOrganization: undefined,
        tokenExpiry: undefined,
        isLoading: false,
        error: undefined,
      });

      // Clear stored authentication data
      this.clearStoredAuth();

      // Clear any cached data that might contain sensitive information
      this.clearSensitiveCaches();

      // Broadcast logout event for other components to clean up
      window.dispatchEvent(new CustomEvent('auth-logout', {
        detail: { reason: 'user-initiated' }
      }));

      logger.info('User logged out successfully');

    } catch (error) {
      logger.error('Logout error', {
        error: (error as Error).message,
      });
      
      this.setState({ isLoading: false });
      
      handleError(error as Error, 'authentication', {
        operation: 'logout',
      });
    }
  }

  /**
   * Logout from all sessions
   */
  public async logoutFromAllSessions(): Promise<void> {
    this.setState({ isLoading: true });

    try {
      const storedAuth = this.getStoredAuth();
      if (storedAuth?.token) {
        await fetch('/api/auth/logout', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${storedAuth.token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            allSessions: true
          })
        });
      }

      // Perform regular logout cleanup
      await this.logout();
      
      logger.info('User logged out from all sessions');

    } catch (error) {
      // Still perform local cleanup even if server call fails
      await this.logout();
      
      handleError(error as Error, 'authentication', {
        operation: 'logout-all-sessions',
      });
    }
  }

  /**
   * Clear sensitive cached data
   */
  private clearSensitiveCaches(): void {
    try {
      // Clear API cache
      if ('caches' in window) {
        caches.delete('streetstudio-api-cache').catch(error => {
          logger.warn('Failed to clear API cache', { error: error.message });
        });
      }

      // Clear memory caches in other services
      window.dispatchEvent(new CustomEvent('clear-sensitive-caches'));

      // Clear any service worker stored data
      if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({
          type: 'CLEAR_SENSITIVE_DATA'
        });
      }

    } catch (error) {
      logger.warn('Error clearing sensitive caches', {
        error: (error as Error).message
      });
    }
  }

  /**
   * Register new user
   */
  public async register(email: string, password: string, displayName: string): Promise<{ success: boolean; error?: string }> {
    this.setState({ isLoading: true, error: undefined });

    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password, displayName }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(error || 'Registration failed');
      }

      this.setState({ isLoading: false });
      
      logger.info('User registered successfully', { email });
      
      return { success: true };

    } catch (error) {
      const errorMessage = (error as Error).message || 'Registration failed';
      
      this.setState({
        isLoading: false,
        error: errorMessage,
      });

      handleError(error as Error, 'authentication', {
        operation: 'register',
        email,
      });

      return { success: false, error: errorMessage };
    }
  }

  /**
   * Request password reset
   */
  public async requestPasswordReset(email: string): Promise<{ success: boolean; error?: string }> {
    this.setState({ isLoading: true, error: undefined });

    try {
      const response = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(error || 'Password reset request failed');
      }

      this.setState({ isLoading: false });
      
      logger.info('Password reset requested', { email });
      
      return { success: true };

    } catch (error) {
      const errorMessage = (error as Error).message || 'Password reset request failed';
      
      this.setState({
        isLoading: false,
        error: errorMessage,
      });

      handleError(error as Error, 'authentication', {
        operation: 'password-reset',
        email,
      });

      return { success: false, error: errorMessage };
    }
  }

  /**
   * Get stored authentication data
   */
  private getStoredAuth(): StoredAuth | null {
    try {
      // Try to get from configured storage
      const stored = this.getStoredTokenSecurely('streetstudio_auth');
      
      if (!stored) {
        // Fallback: try localStorage for backward compatibility
        const fallback = localStorage.getItem('streetstudio_auth');
        if (fallback) {
          const auth = JSON.parse(fallback);
          // Migrate to secure storage
          this.storeAuth(auth);
          localStorage.removeItem('streetstudio_auth'); // Clean up old storage
          return auth;
        }
        return null;
      }
      
      return JSON.parse(stored);
    } catch (error) {
      logger.warn('Failed to parse stored auth', {
        error: (error as Error).message,
      });
      return null;
    }
  }

  /**
   * Store authentication data securely
   */
  private storeAuth(authData: StoredAuth): void {
    try {
      const serialized = JSON.stringify(authData);
      this.storeTokenSecurely('streetstudio_auth', serialized);
      
      // Also store user info separately for quick access (non-sensitive)
      if (authData.user) {
        localStorage.setItem('streetstudio_user', JSON.stringify(authData.user));
      }
    } catch (error) {
      logger.error('Failed to store auth data', {
        error: (error as Error).message,
      });
      
      handleError(error as Error, 'authentication', {
        operation: 'store-auth',
      });
    }
  }

  /**
   * Clear stored authentication data
   */
  private clearStoredAuth(): void {
    try {
      this.clearStoredTokensSecurely();
      
      // Clear user info
      localStorage.removeItem('streetstudio_user');
      
    } catch (error) {
      logger.warn('Failed to clear stored auth', {
        error: (error as Error).message,
      });
    }
  }

  /**
   * Update token storage configuration
   */
  public updateStorageConfig(config: Partial<SessionConfig>): void {
    const oldStrategy = this.config.tokenStorage.strategy;
    this.config = { ...this.config, ...config };
    
    // If storage strategy changed, migrate existing tokens
    if (config.tokenStorage?.strategy && config.tokenStorage.strategy !== oldStrategy) {
      const auth = this.getStoredAuth();
      if (auth) {
        // Clear old storage
        if (oldStrategy === 'localStorage') {
          localStorage.removeItem('streetstudio_auth');
        } else if (oldStrategy === 'memory') {
          this.memoryTokenStorage.clear();
        }
        
        // Store in new location
        this.storeAuth(auth);
        
        logger.info('Migrated token storage', {
          from: oldStrategy,
          to: config.tokenStorage.strategy
        });
      }
    }
  }

  /**
   * Get session information
   */
  public getSessionInfo(): {
    isAuthenticated: boolean;
    tokenExpiry?: Date;
    timeUntilExpiry?: number;
    storageStrategy: string;
    sessionTimeout: number;
  } {
    const { tokenExpiry } = this.state;
    return {
      isAuthenticated: this.isAuthenticated(),
      tokenExpiry,
      timeUntilExpiry: tokenExpiry ? tokenExpiry.getTime() - Date.now() : undefined,
      storageStrategy: this.config.tokenStorage.strategy,
      sessionTimeout: this.config.sessionTimeout
    };
  }

  /**
   * Force session validation
   */
  public async forceValidateSession(): Promise<boolean> {
    return this.validateSession();
  }

  /**
   * Utility method for delays
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Destroy the controller and clean up resources
   */
  public destroy(): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
    }
    
    if (this.sessionTimeoutTimer) {
      clearTimeout(this.sessionTimeoutTimer);
    }
    
    if (this.activityTimer) {
      clearTimeout(this.activityTimer);
    }
    
    this.listeners.clear();
    this.memoryTokenStorage.clear();
    
    // Remove event listeners
    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'];
    events.forEach(event => {
      document.removeEventListener(event, this.resetSessionTimeout);
    });
    
    logger.info('AuthController destroyed');
  }

  /**
   * Destroy the controller and clean up resources
   */
  public destroy(): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
    }
    
    if (this.sessionTimeoutTimer) {
      clearTimeout(this.sessionTimeoutTimer);
    }
    
    if (this.activityTimer) {
      clearTimeout(this.activityTimer);
    }
    
    this.listeners.clear();
    this.memoryTokenStorage.clear();
    
    // Remove event listeners
    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'];
    events.forEach(event => {
      document.removeEventListener(event, this.resetSessionTimeout);
    });
    
    logger.info('AuthController destroyed');
  }

  // OAuth Integration Methods

  /**
   * Initiate OAuth authentication flow
   */
  public async initiateOAuth(providerId: string, returnUrl?: string): Promise<void> {
    this.setState({ isLoading: true, error: undefined });

    try {
      const { oauthConfigService } = await import('../../services/oauth-config.js');
      await oauthConfigService.initiateOAuth(providerId, returnUrl);
      
      logger.info('OAuth flow initiated', { provider: providerId });
      
    } catch (error) {
      const errorMessage = (error as Error).message || 'OAuth authentication failed to start';
      
      this.setState({
        isLoading: false,
        error: errorMessage,
      });

      handleError(error as Error, 'authentication', {
        operation: 'initiate-oauth',
        provider: providerId,
      });
      
      throw new Error(errorMessage);
    }
  }

  /**
   * Check if OAuth providers are available
   */
  public async isOAuthAvailable(): Promise<boolean> {
    try {
      const { oauthConfigService } = await import('../../services/oauth-config.js');
      return await oauthConfigService.isOAuthAvailable();
    } catch (error) {
      logger.warn('Failed to check OAuth availability', {
        error: (error as Error).message,
      });
      return false;
    }
  }

  /**
   * Get available OAuth providers
   */
  public async getOAuthProviders(): Promise<any[]> {
    try {
      const { oauthConfigService } = await import('../../services/oauth-config.js');
      return await oauthConfigService.getEnabledProviders();
    } catch (error) {
      logger.warn('Failed to get OAuth providers', {
        error: (error as Error).message,
      });
      return [];
    }
  }

  // SSO Integration Methods

  /**
   * Initiate SSO authentication flow
   */
  public async initiateSSO(providerId: string, returnUrl?: string): Promise<void> {
    this.setState({ isLoading: true, error: undefined });

    try {
      const { ssoConfigService } = await import('../services/sso-config.js');
      await ssoConfigService.initiatSSO(providerId, returnUrl);
      
      logger.info('SSO flow initiated', { provider: providerId });
      
    } catch (error) {
      const errorMessage = (error as Error).message || 'SSO authentication failed to start';
      
      this.setState({
        isLoading: false,
        error: errorMessage,
      });

      handleError(error as Error, 'authentication', {
        operation: 'initiate-sso',
        provider: providerId,
      });
      
      throw new Error(errorMessage);
    }
  }

  /**
   * Check if SSO should auto-redirect for a given email
   */
  public async shouldAutoRedirectSSO(email: string): Promise<any | null> {
    try {
      const { ssoConfigService } = await import('../services/sso-config.js');
      return await ssoConfigService.shouldAutoRedirect(email);
    } catch (error) {
      logger.warn('Failed to check SSO auto-redirect', {
        email,
        error: (error as Error).message,
      });
      return null;
    }
  }

  /**
   * Check if SSO is available
   */
  public async isSSOAvailable(): Promise<boolean> {
    try {
      const { ssoConfigService } = await import('../services/sso-config.js');
      return await ssoConfigService.isSSOAvailable();
    } catch (error) {
      logger.warn('Failed to check SSO availability', {
        error: (error as Error).message,
      });
      return false;
    }
  }

  /**
   * Get available SSO providers
   */
  public async getSSOProviders(): Promise<any[]> {
    try {
      const { ssoConfigService } = await import('../services/sso-config.js');
      return await ssoConfigService.getEnabledProviders();
    } catch (error) {
      logger.warn('Failed to get SSO providers', {
        error: (error as Error).message,
      });
      return [];
    }
  }

  /**
   * Get SSO provider for a specific email domain
   */
  public async getSSOProviderForDomain(email: string): Promise<any | null> {
    try {
      const { ssoConfigService } = await import('../services/sso-config.js');
      return await ssoConfigService.getProviderForDomain(email);
    } catch (error) {
      logger.warn('Failed to get SSO provider for domain', {
        email,
        error: (error as Error).message,
      });
      return null;
    }
  }

  /**
   * Get stored OAuth/SSO callback error
   */
  public async getStoredCallbackError(): Promise<{ error: string; provider?: string } | null> {
    try {
      const { OAuthCallbackHandler } = await import('../services/oauth-callback-handler.js');
      return OAuthCallbackHandler.getAndClearStoredError();
    } catch (error) {
      logger.warn('Failed to get stored callback error', {
        error: (error as Error).message,
      });
      return null;
    }
  }

  /**
   * Enhanced login with SSO auto-redirect support
   */
  public async loginWithEmailCheck(email: string, password: string): Promise<{ success: boolean; error?: string; shouldRedirectSSO?: any }> {
    // Check for SSO auto-redirect first
    const ssoProvider = await this.shouldAutoRedirectSSO(email);
    
    if (ssoProvider) {
      logger.info('Auto-redirecting to SSO', {
        email,
        provider: ssoProvider.id,
      });
      
      return {
        success: false,
        shouldRedirectSSO: ssoProvider,
      };
    }

    // Proceed with regular login
    return this.login(email, password);
  }

  /**
   * Utility method for delays
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Destroy the controller and clean up resources
   */
  public destroy(): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
    }
    
    if (this.sessionTimeoutTimer) {
      clearTimeout(this.sessionTimeoutTimer);
    }
    
    if (this.activityTimer) {
      clearTimeout(this.activityTimer);
    }
    
    this.listeners.clear();
    this.memoryTokenStorage.clear();
    
    // Remove event listeners
    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'];
    events.forEach(event => {
      document.removeEventListener(event, this.resetSessionTimeout);
    });
    
    logger.info('AuthController destroyed');
  }
}