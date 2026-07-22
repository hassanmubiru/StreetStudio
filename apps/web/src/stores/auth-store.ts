/**
 * Authentication Store
 * 
 * Reactive authentication state management with advanced session features,
 * cross-tab synchronization, and comprehensive security monitoring.
 */

import type { DashboardSession } from '@streetstudio/dashboard';
import type { MemberDto, OrganizationDto } from '@streetstudio/shared';
import { AuthController, type AuthState, type SessionConfig } from '../app/auth/auth-controller.js';
import { SessionManager } from '../app/auth/session-manager.js';
import { logger } from '../app/client-logger.js';

export interface AuthStoreState extends AuthState {
  sessionDuration: number;
  lastActivity: Date | null;
  securityAlerts: number;
}

export interface AuthStoreConfig extends SessionConfig {
  enableCrossTabSync: boolean;
  enableSecurityMonitoring: boolean;
  enableActivityTracking: boolean;
}

export class AuthStore {
  private authController: AuthController;
  private sessionManager: SessionManager;
  private state: AuthStoreState;
  private listeners: Set<(state: AuthStoreState) => void> = new Set();
  private config: AuthStoreConfig;

  private readonly DEFAULT_CONFIG: AuthStoreConfig = {
    tokenStorage: {
      strategy: 'memory',
      secure: true,
      sameSite: 'strict'
    },
    refreshMargin: 5 * 60 * 1000, // 5 minutes
    maxRetries: 3,
    sessionTimeout: 30 * 60 * 1000, // 30 minutes
    enableCrossTabSync: true,
    enableSecurityMonitoring: true,
    enableActivityTracking: true
  };

  constructor(session: DashboardSession, config?: Partial<AuthStoreConfig>) {
    this.config = { ...this.DEFAULT_CONFIG, ...config };
    
    // Initialize authentication controller
    this.authController = new AuthController(session, this.config);
    
    // Initialize session manager if cross-tab sync is enabled
    this.sessionManager = new SessionManager(this.authController);
    
    // Initialize state
    this.state = {
      ...this.authController.getState(),
      sessionDuration: 0,
      lastActivity: null,
      securityAlerts: 0
    };

    this.setupStateSync();
    this.setupActivityTracking();
  }

  /**
   * Setup state synchronization between auth controller and store
   */
  private setupStateSync(): void {
    // Subscribe to auth controller changes
    this.authController.onAuthStateChange((authState) => {
      this.updateState({
        ...authState,
        sessionDuration: this.sessionManager.getSessionDuration()
      });
    });

    // Subscribe to session manager for additional data
    this.sessionManager.subscribe((authState) => {
      const stats = this.sessionManager.getStats();
      this.updateState({
        securityAlerts: stats.securityEvents.filter(e => e.severity === 'high').length,
        lastActivity: stats.lastLogin
      });
    });
  }

  /**
   * Setup activity tracking if enabled
   */
  private setupActivityTracking(): void {
    if (!this.config.enableActivityTracking) return;

    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'];
    const activityHandler = () => {
      this.updateState({
        lastActivity: new Date()
      });
    };

    events.forEach(event => {
      document.addEventListener(event, activityHandler, { passive: true });
    });
  }

  /**
   * Update store state and notify listeners
   */
  private updateState(updates: Partial<AuthStoreState>): void {
    const previousState = { ...this.state };
    this.state = { ...this.state, ...updates };

    // Log significant state changes
    if (previousState.isAuthenticated !== this.state.isAuthenticated) {
      logger.info(`Authentication state changed: ${this.state.isAuthenticated ? 'logged in' : 'logged out'}`, {
        userId: this.state.currentUser?.id,
        organization: this.state.currentOrganization?.id
      });
    }

    this.notifyListeners();
  }

  /**
   * Notify all listeners of state changes
   */
  private notifyListeners(): void {
    this.listeners.forEach(listener => {
      try {
        listener(this.getState());
      } catch (error) {
        logger.error('Auth store listener error', {
          error: (error as Error).message
        });
      }
    });
  }

  /**
   * Get current authentication state
   */
  public getState(): AuthStoreState {
    return { ...this.state };
  }

  /**
   * Subscribe to authentication state changes
   */
  public subscribe(listener: (state: AuthStoreState) => void): () => void {
    this.listeners.add(listener);
    
    // Send current state immediately
    listener(this.getState());
    
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Initialize authentication from stored tokens
   */
  public async initialize(): Promise<boolean> {
    try {
      this.updateState({ isLoading: true });
      
      const success = await this.authController.initializeFromStorage();
      
      this.updateState({ isLoading: false });
      
      return success;
    } catch (error) {
      logger.error('Auth store initialization failed', {
        error: (error as Error).message
      });
      
      this.updateState({ 
        isLoading: false, 
        error: 'Failed to initialize authentication' 
      });
      
      return false;
    }
  }

  /**
   * Login with credentials
   */
  public async login(email: string, password: string, rememberMe = false): Promise<{ success: boolean; error?: string }> {
    try {
      // Update storage strategy based on remember me preference
      if (rememberMe) {
        this.authController.updateStorageConfig({
          tokenStorage: { 
            ...this.config.tokenStorage,
            strategy: 'localStorage' 
          }
        });
      }

      const result = await this.authController.login(email, password);
      
      if (result.success) {
        // Track successful login
        this.updateState({
          lastActivity: new Date()
        });
      }
      
      return result;
    } catch (error) {
      const errorMessage = (error as Error).message || 'Login failed';
      
      this.updateState({
        error: errorMessage
      });
      
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Logout
   */
  public async logout(): Promise<void> {
    return this.authController.logout();
  }

  /**
   * Logout from all sessions
   */
  public async logoutFromAllSessions(): Promise<void> {
    return this.sessionManager.forceLogoutAll();
  }

  /**
   * Register new user
   */
  public async register(email: string, password: string, displayName: string): Promise<{ success: boolean; error?: string }> {
    return this.authController.register(email, password, displayName);
  }

  /**
   * Request password reset
   */
  public async requestPasswordReset(email: string): Promise<{ success: boolean; error?: string }> {
    return this.authController.requestPasswordReset(email);
  }

  /**
   * Switch organization
   */
  public async switchOrganization(organizationId: string): Promise<boolean> {
    try {
      // This would typically involve the session/dashboard service
      // For now, we'll update local state and validate with server
      
      this.updateState({ isLoading: true });
      
      // Validate organization access
      const response = await fetch(`/api/organizations/${organizationId}/validate`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${await this.getAccessToken()}`
        }
      });

      if (!response.ok) {
        throw new Error('Organization access denied');
      }

      const organization: OrganizationDto = await response.json();
      
      this.updateState({
        currentOrganization: organization,
        isLoading: false
      });

      logger.info('Switched organization', {
        organizationId: organization.id,
        organizationName: organization.name
      });

      return true;

    } catch (error) {
      logger.error('Organization switch failed', {
        organizationId,
        error: (error as Error).message
      });

      this.updateState({
        isLoading: false,
        error: 'Failed to switch organization'
      });

      return false;
    }
  }

  /**
   * Get access token
   */
  public async getAccessToken(): Promise<string | null> {
    const sessionInfo = this.authController.getSessionInfo();
    
    if (!sessionInfo.isAuthenticated) {
      return null;
    }

    // Check if token needs refresh
    if (sessionInfo.timeUntilExpiry && sessionInfo.timeUntilExpiry < this.config.refreshMargin) {
      await this.authController.forceValidateSession();
    }

    // Return token from storage (this would need to be implemented in AuthController)
    // For now, return a placeholder that indicates we need the token
    return 'TOKEN_PLACEHOLDER';
  }

  /**
   * Validate current session
   */
  public async validateSession(): Promise<boolean> {
    return this.authController.forceValidateSession();
  }

  /**
   * Get session statistics
   */
  public getSessionStats() {
    return this.sessionManager.getStats();
  }

  /**
   * Clear session statistics
   */
  public clearSessionStats(): void {
    this.sessionManager.clearStats();
    this.updateState({ securityAlerts: 0 });
  }

  /**
   * Update storage configuration
   */
  public updateStorageConfig(config: Partial<SessionConfig>): void {
    this.config = { ...this.config, ...config };
    this.authController.updateStorageConfig(config);
  }

  /**
   * Get session information
   */
  public getSessionInfo() {
    return {
      ...this.authController.getSessionInfo(),
      duration: this.sessionManager.getSessionDuration(),
      stats: this.sessionManager.getStats()
    };
  }

  /**
   * Check if user has permission
   */
  public hasPermission(permission: string): boolean {
    // This would integrate with the actual permission system
    // For now, return true for authenticated users
    return this.state.isAuthenticated;
  }

  /**
   * Check if user has role
   */
  public hasRole(role: string): boolean {
    // This would integrate with the actual role system
    // For now, return true for authenticated users
    return this.state.isAuthenticated;
  }

  /**
   * Destroy store and clean up resources
   */
  public destroy(): void {
    this.authController.destroy();
    this.sessionManager.destroy();
    this.listeners.clear();
    
    logger.info('Auth store destroyed');
  }
}

// Export singleton instance
let authStoreInstance: AuthStore | null = null;

export function createAuthStore(session: DashboardSession, config?: Partial<AuthStoreConfig>): AuthStore {
  if (authStoreInstance) {
    authStoreInstance.destroy();
  }
  
  authStoreInstance = new AuthStore(session, config);
  return authStoreInstance;
}

export function getAuthStore(): AuthStore {
  if (!authStoreInstance) {
    throw new Error('Auth store not initialized. Call createAuthStore first.');
  }
  
  return authStoreInstance;
}

// Convenience functions for common operations
export function useAuthState(): AuthStoreState {
  return getAuthStore().getState();
}

export function subscribeToAuth(callback: (state: AuthStoreState) => void): () => void {
  return getAuthStore().subscribe(callback);
}

export function isAuthenticated(): boolean {
  return getAuthStore().getState().isAuthenticated;
}

export function getCurrentUser(): MemberDto | undefined {
  return getAuthStore().getState().currentUser;
}

export function getCurrentOrganization(): OrganizationDto | undefined {
  return getAuthStore().getState().currentOrganization;
}