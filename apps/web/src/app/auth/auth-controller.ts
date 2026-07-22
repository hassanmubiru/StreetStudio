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

export class AuthController {
  private state: AuthState = {
    isAuthenticated: false,
    isLoading: false,
  };
  
  private listeners: Set<AuthStateChangeHandler> = new Set();
  private session: DashboardSession;
  private refreshTimer?: number;
  private refreshPromise?: Promise<boolean>;
  private readonly REFRESH_MARGIN_MS = 5 * 60 * 1000; // Refresh 5 minutes before expiry

  constructor(session: DashboardSession) {
    this.session = session;
    this.setupTokenRefreshHandling();
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
    if (timeUntilExpiry <= this.REFRESH_MARGIN_MS) {
      logger.info('Token approaching expiry, refreshing...', {
        expiresIn: Math.floor(timeUntilExpiry / 1000),
      });
      
      await this.attemptTokenRefresh();
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

    this.refreshPromise = this.doTokenRefresh();
    const result = await this.refreshPromise;
    this.refreshPromise = undefined;
    
    return result;
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
   * Logout
   */
  public async logout(): Promise<void> {
    this.setState({ isLoading: true });

    try {
      // Notify server of logout
      const storedAuth = this.getStoredAuth();
      if (storedAuth?.token) {
        try {
          await fetch('/api/auth/logout', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${storedAuth.token}`,
            },
          });
        } catch (error) {
          // Ignore logout API errors, still clear local state
          logger.warn('Logout API call failed', {
            error: (error as Error).message,
          });
        }
      }
      
      // Clear session
      this.session.clearAuthentication?.();
      
      // Clear refresh timer
      if (this.refreshTimer) {
        clearTimeout(this.refreshTimer);
        this.refreshTimer = undefined;
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

      // Clear stored authentication
      this.clearStoredAuth();

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
      const stored = localStorage.getItem('streetstudio_auth');
      return stored ? JSON.parse(stored) : null;
    } catch (error) {
      logger.warn('Failed to parse stored auth', {
        error: (error as Error).message,
      });
      return null;
    }
  }

  /**
   * Store authentication data
   */
  private storeAuth(authData: StoredAuth): void {
    try {
      localStorage.setItem('streetstudio_auth', JSON.stringify(authData));
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
      localStorage.removeItem('streetstudio_auth');
      sessionStorage.removeItem('auth_return_url');
    } catch (error) {
      logger.warn('Failed to clear stored auth', {
        error: (error as Error).message,
      });
    }
  }

  /**
   * Destroy the controller and clean up resources
   */
  public destroy(): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
    }
    
    this.listeners.clear();
  }
}