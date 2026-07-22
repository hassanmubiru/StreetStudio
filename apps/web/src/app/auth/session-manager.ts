/**
 * Session Manager
 * 
 * Provides high-level session management functionality including
 * reactive session state, cross-tab synchronization, and advanced
 * session security features.
 */

import type { AuthController, AuthState, SessionConfig } from './auth-controller.js';
import { logger } from '../client-logger.js';
import { handleError } from '../error-handler.js';

export interface SessionEventData {
  type: 'login' | 'logout' | 'token-refresh' | 'session-timeout' | 'security-event';
  timestamp: number;
  data?: any;
}

export interface SessionSecurityEvent {
  type: 'suspicious-activity' | 'concurrent-sessions' | 'location-change' | 'device-change';
  details: any;
  severity: 'low' | 'medium' | 'high';
}

export interface SessionStats {
  loginCount: number;
  lastLogin: Date | null;
  totalSessionTime: number;
  averageSessionDuration: number;
  securityEvents: SessionSecurityEvent[];
}

export class SessionManager {
  private authController: AuthController;
  private subscribers: Set<(state: AuthState) => void> = new Set();
  private sessionStartTime?: number;
  private crossTabChannel: BroadcastChannel;
  private securityMonitor: SecurityMonitor;
  private stats: SessionStats = {
    loginCount: 0,
    lastLogin: null,
    totalSessionTime: 0,
    averageSessionDuration: 0,
    securityEvents: []
  };

  constructor(authController: AuthController) {
    this.authController = authController;
    this.crossTabChannel = new BroadcastChannel('streetstudio-session');
    this.securityMonitor = new SecurityMonitor();
    
    this.setupCrossTabSync();
    this.setupSecurityMonitoring();
    this.loadStats();
    
    // Subscribe to auth state changes
    this.authController.onAuthStateChange((state) => {
      this.handleAuthStateChange(state);
      this.notifySubscribers(state);
    });
  }

  /**
   * Setup cross-tab session synchronization
   */
  private setupCrossTabSync(): void {
    this.crossTabChannel.addEventListener('message', (event) => {
      const { type, data } = event.data as SessionEventData;
      
      switch (type) {
        case 'logout':
          // Another tab logged out, sync this tab
          if (this.authController.isAuthenticated()) {
            logger.info('Syncing logout from another tab');
            this.authController.logout();
          }
          break;
          
        case 'login':
          // Another tab logged in, validate our session
          if (!this.authController.isAuthenticated()) {
            logger.info('Another tab logged in, attempting to restore session');
            this.authController.initializeFromStorage();
          }
          break;
          
        case 'security-event':
          this.handleCrossTabSecurityEvent(data);
          break;
      }
    });

    // Listen for page unload to broadcast session end
    window.addEventListener('beforeunload', () => {
      if (this.authController.isAuthenticated()) {
        this.broadcastSessionEvent('logout', {
          reason: 'page-unload',
          sessionDuration: this.getSessionDuration()
        });
      }
    });
  }

  /**
   * Setup security monitoring
   */
  private setupSecurityMonitoring(): void {
    // Monitor for multiple rapid login attempts
    let loginAttempts = 0;
    const loginAttemptWindow = 5 * 60 * 1000; // 5 minutes
    
    this.authController.onAuthStateChange((state) => {
      if (state.error && state.error.includes('Invalid credentials')) {
        loginAttempts++;
        
        setTimeout(() => loginAttempts--, loginAttemptWindow);
        
        if (loginAttempts > 5) {
          this.securityMonitor.reportEvent({
            type: 'suspicious-activity',
            details: { rapidLoginAttempts: loginAttempts },
            severity: 'high'
          });
        }
      }
    });

    // Monitor for unusual session patterns
    this.securityMonitor.onSecurityEvent((event) => {
      this.stats.securityEvents.push(event);
      this.saveStats();
      
      if (event.severity === 'high') {
        // Broadcast to other tabs
        this.broadcastSessionEvent('security-event', event);
        
        // Show security warning
        window.dispatchEvent(new CustomEvent('show-notification', {
          detail: {
            type: 'warning',
            message: 'Unusual activity detected. Please verify your account security.',
            persistent: true,
            actions: [{
              label: 'Review Security',
              action: () => window.location.href = '/settings/security'
            }]
          }
        }));
      }
    });
  }

  /**
   * Handle authentication state changes
   */
  private handleAuthStateChange(state: AuthState): void {
    if (state.isAuthenticated && !this.sessionStartTime) {
      // Session started
      this.sessionStartTime = Date.now();
      this.stats.loginCount++;
      this.stats.lastLogin = new Date();
      this.saveStats();
      
      this.broadcastSessionEvent('login', {
        userId: state.currentUser?.id,
        timestamp: this.sessionStartTime
      });
      
    } else if (!state.isAuthenticated && this.sessionStartTime) {
      // Session ended
      const sessionDuration = Date.now() - this.sessionStartTime;
      this.stats.totalSessionTime += sessionDuration;
      this.stats.averageSessionDuration = this.stats.totalSessionTime / this.stats.loginCount;
      this.saveStats();
      
      this.sessionStartTime = undefined;
      
      this.broadcastSessionEvent('logout', {
        sessionDuration,
        reason: state.error ? 'error' : 'user-initiated'
      });
    }
  }

  /**
   * Subscribe to session state changes
   */
  public subscribe(callback: (state: AuthState) => void): () => void {
    this.subscribers.add(callback);
    
    // Send current state immediately
    callback(this.authController.getState());
    
    return () => {
      this.subscribers.delete(callback);
    };
  }

  /**
   * Notify all subscribers of state changes
   */
  private notifySubscribers(state: AuthState): void {
    this.subscribers.forEach(callback => {
      try {
        callback(state);
      } catch (error) {
        logger.error('Session subscriber error', {
          error: (error as Error).message
        });
      }
    });
  }

  /**
   * Broadcast session event to other tabs
   */
  private broadcastSessionEvent(type: SessionEventData['type'], data?: any): void {
    try {
      this.crossTabChannel.postMessage({
        type,
        timestamp: Date.now(),
        data
      });
    } catch (error) {
      logger.warn('Failed to broadcast session event', {
        error: (error as Error).message,
        type
      });
    }
  }

  /**
   * Handle security events from other tabs
   */
  private handleCrossTabSecurityEvent(event: SessionSecurityEvent): void {
    // Add to local stats
    this.stats.securityEvents.push(event);
    this.saveStats();
    
    // Show warning if severe
    if (event.severity === 'high') {
      window.dispatchEvent(new CustomEvent('show-notification', {
        detail: {
          type: 'error',
          message: 'Security alert: Suspicious activity detected across sessions.',
          persistent: true
        }
      }));
    }
  }

  /**
   * Get current session duration
   */
  public getSessionDuration(): number {
    return this.sessionStartTime ? Date.now() - this.sessionStartTime : 0;
  }

  /**
   * Get session statistics
   */
  public getStats(): SessionStats {
    return { ...this.stats };
  }

  /**
   * Clear session statistics
   */
  public clearStats(): void {
    this.stats = {
      loginCount: 0,
      lastLogin: null,
      totalSessionTime: 0,
      averageSessionDuration: 0,
      securityEvents: []
    };
    this.saveStats();
  }

  /**
   * Force logout across all tabs
   */
  public async forceLogoutAll(): Promise<void> {
    this.broadcastSessionEvent('logout', { reason: 'force-logout' });
    await this.authController.logoutFromAllSessions();
  }

  /**
   * Load statistics from storage
   */
  private loadStats(): void {
    try {
      const stored = localStorage.getItem('streetstudio_session_stats');
      if (stored) {
        const parsed = JSON.parse(stored);
        this.stats = {
          ...this.stats,
          ...parsed,
          lastLogin: parsed.lastLogin ? new Date(parsed.lastLogin) : null
        };
      }
    } catch (error) {
      logger.warn('Failed to load session stats', {
        error: (error as Error).message
      });
    }
  }

  /**
   * Save statistics to storage
   */
  private saveStats(): void {
    try {
      localStorage.setItem('streetstudio_session_stats', JSON.stringify(this.stats));
    } catch (error) {
      logger.warn('Failed to save session stats', {
        error: (error as Error).message
      });
    }
  }

  /**
   * Destroy session manager
   */
  public destroy(): void {
    this.crossTabChannel.close();
    this.securityMonitor.destroy();
    this.subscribers.clear();
    
    if (this.sessionStartTime) {
      const sessionDuration = Date.now() - this.sessionStartTime;
      this.stats.totalSessionTime += sessionDuration;
      this.stats.averageSessionDuration = this.stats.totalSessionTime / this.stats.loginCount;
      this.saveStats();
    }
  }
}

/**
 * Security Monitor
 * 
 * Monitors for suspicious session activity and security events
 */
class SecurityMonitor {
  private listeners: Set<(event: SessionSecurityEvent) => void> = new Set();
  private deviceFingerprint: string;
  private locationHistory: Array<{ ip: string; location: string; timestamp: number }> = [];

  constructor() {
    this.deviceFingerprint = this.generateDeviceFingerprint();
    this.loadLocationHistory();
  }

  /**
   * Generate device fingerprint for security monitoring
   */
  private generateDeviceFingerprint(): string {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    ctx?.fillText('StreetStudio', 10, 10);
    
    const fingerprint = {
      userAgent: navigator.userAgent,
      language: navigator.language,
      platform: navigator.platform,
      screen: `${screen.width}x${screen.height}`,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      canvas: canvas.toDataURL()
    };

    return btoa(JSON.stringify(fingerprint)).substring(0, 32);
  }

  /**
   * Report security event
   */
  public reportEvent(event: SessionSecurityEvent): void {
    this.listeners.forEach(listener => {
      try {
        listener(event);
      } catch (error) {
        logger.error('Security monitor listener error', {
          error: (error as Error).message
        });
      }
    });

    logger.warn('Security event reported', {
      type: event.type,
      severity: event.severity,
      details: event.details
    });
  }

  /**
   * Subscribe to security events
   */
  public onSecurityEvent(callback: (event: SessionSecurityEvent) => void): void {
    this.listeners.add(callback);
  }

  /**
   * Check for device changes
   */
  public checkDeviceChange(): void {
    const currentFingerprint = this.generateDeviceFingerprint();
    
    if (currentFingerprint !== this.deviceFingerprint) {
      this.reportEvent({
        type: 'device-change',
        details: {
          oldFingerprint: this.deviceFingerprint,
          newFingerprint: currentFingerprint
        },
        severity: 'medium'
      });
    }
  }

  /**
   * Load location history
   */
  private loadLocationHistory(): void {
    try {
      const stored = localStorage.getItem('streetstudio_location_history');
      if (stored) {
        this.locationHistory = JSON.parse(stored);
      }
    } catch (error) {
      logger.warn('Failed to load location history', {
        error: (error as Error).message
      });
    }
  }

  /**
   * Save location history
   */
  private saveLocationHistory(): void {
    try {
      // Keep only last 10 locations
      const recent = this.locationHistory.slice(-10);
      localStorage.setItem('streetstudio_location_history', JSON.stringify(recent));
    } catch (error) {
      logger.warn('Failed to save location history', {
        error: (error as Error).message
      });
    }
  }

  /**
   * Destroy security monitor
   */
  public destroy(): void {
    this.listeners.clear();
    this.saveLocationHistory();
  }
}