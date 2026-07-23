/**
 * Notification Store
 * 
 * Manages notification state, unread counts, and real-time notification delivery
 */

import type { NotificationDto, Uuid, IsoTimestamp } from '@streetstudio/shared';
import { logger } from '../app/client-logger';

export interface NotificationState {
  notifications: NotificationDto[];
  unreadCount: number;
  isLoading: boolean;
  lastFetch?: IsoTimestamp;
  error?: string;
}

export interface NotificationFilters {
  type?: string;
  read?: boolean;
  limit?: number;
  offset?: number;
}

export class NotificationStore {
  private state: NotificationState;
  private listeners: Set<(state: NotificationState) => void> = new Set();
  private websocket?: WebSocket;
  private fetchInterval?: number;
  private storageKey = 'streetstudio_notifications';

  constructor() {
    this.state = this.getInitialState();
    this.loadCachedNotifications();
    this.setupPeriodicFetch();
  }

  /**
   * Get initial state
   */
  private getInitialState(): NotificationState {
    return {
      notifications: [],
      unreadCount: 0,
      isLoading: false
    };
  }

  /**
   * Load cached notifications from localStorage
   */
  private loadCachedNotifications(): void {
    try {
      const cached = localStorage.getItem(this.storageKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed.timestamp && Date.now() - parsed.timestamp < 5 * 60 * 1000) { // 5 minutes
          this.updateState({
            notifications: parsed.notifications || [],
            unreadCount: parsed.unreadCount || 0,
            lastFetch: parsed.lastFetch
          });
        }
      }
    } catch (error) {
      logger.warn('Failed to load cached notifications', { error });
    }
  }

  /**
   * Cache notifications to localStorage
   */
  private cacheNotifications(): void {
    try {
      const cacheData = {
        notifications: this.state.notifications,
        unreadCount: this.state.unreadCount,
        lastFetch: this.state.lastFetch,
        timestamp: Date.now()
      };
      localStorage.setItem(this.storageKey, JSON.stringify(cacheData));
    } catch (error) {
      logger.warn('Failed to cache notifications', { error });
    }
  }

  /**
   * Setup periodic fetch for notifications
   */
  private setupPeriodicFetch(): void {
    // Fetch every 30 seconds when app is active
    this.fetchInterval = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        this.fetchNotifications();
      }
    }, 30 * 1000);

    // Fetch when tab becomes visible
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        this.fetchNotifications();
      }
    });
  }

  /**
   * Get current notification state
   */
  public getState(): NotificationState {
    return { ...this.state };
  }

  /**
   * Subscribe to notification state changes
   */
  public subscribe(listener: (state: NotificationState) => void): () => void {
    this.listeners.add(listener);
    
    // Send current state immediately
    listener(this.getState());
    
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Update notification state
   */
  private updateState(updates: Partial<NotificationState>): void {
    this.state = { ...this.state, ...updates };
    this.cacheNotifications();
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
        logger.error('Notification store listener error', { error });
      }
    });
  }

  /**
   * Initialize notification system
   */
  public async initialize(accessToken: string): Promise<void> {
    try {
      this.updateState({ isLoading: true });
      
      // Initial fetch
      await this.fetchNotifications();
      
      // Setup real-time updates
      this.setupWebSocketConnection(accessToken);
      
      this.updateState({ isLoading: false });
    } catch (error) {
      logger.error('Failed to initialize notifications', { error });
      this.updateState({ 
        isLoading: false, 
        error: 'Failed to load notifications' 
      });
    }
  }

  /**
   * Setup WebSocket connection for real-time updates
   */
  private setupWebSocketConnection(accessToken: string): void {
    try {
      const wsUrl = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws/notifications`;
      
      this.websocket = new WebSocket(wsUrl);
      
      this.websocket.onopen = () => {
        logger.info('Notification WebSocket connected');
        
        // Send authentication
        this.websocket?.send(JSON.stringify({
          type: 'auth',
          token: accessToken
        }));
      };

      this.websocket.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          this.handleWebSocketMessage(message);
        } catch (error) {
          logger.warn('Failed to parse WebSocket message', { error });
        }
      };

      this.websocket.onclose = (event) => {
        logger.warn('Notification WebSocket disconnected', { code: event.code });
        
        // Attempt to reconnect after delay
        setTimeout(() => {
          if (document.visibilityState === 'visible') {
            this.setupWebSocketConnection(accessToken);
          }
        }, 5000);
      };

      this.websocket.onerror = (error) => {
        logger.error('Notification WebSocket error', { error });
      };

    } catch (error) {
      logger.error('Failed to setup WebSocket connection', { error });
    }
  }

  /**
   * Handle WebSocket messages
   */
  private handleWebSocketMessage(message: any): void {
    switch (message.type) {
      case 'notification':
        this.addNotification(message.data);
        break;
      
      case 'notification_read':
        this.markNotificationAsRead(message.notificationId);
        break;
      
      case 'unread_count':
        this.updateState({ unreadCount: message.count });
        break;
      
      default:
        logger.warn('Unknown WebSocket message type', { type: message.type });
    }
  }

  /**
   * Fetch notifications from API
   */
  public async fetchNotifications(filters?: NotificationFilters): Promise<void> {
    try {
      const params = new URLSearchParams();
      
      if (filters?.type) params.append('type', filters.type);
      if (filters?.read !== undefined) params.append('read', filters.read.toString());
      if (filters?.limit) params.append('limit', filters.limit.toString());
      if (filters?.offset) params.append('offset', filters.offset.toString());

      const response = await fetch(`/api/notifications?${params}`, {
        headers: {
          'Authorization': `Bearer ${await this.getAccessToken()}`
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch notifications: ${response.statusText}`);
      }

      const data = await response.json();
      
      this.updateState({
        notifications: data.notifications || [],
        unreadCount: data.unreadCount || 0,
        lastFetch: new Date().toISOString() as IsoTimestamp,
        error: undefined
      });

      logger.debug('Notifications fetched', {
        count: data.notifications?.length || 0,
        unreadCount: data.unreadCount || 0
      });

    } catch (error) {
      logger.error('Failed to fetch notifications', { error });
      this.updateState({
        error: 'Failed to load notifications'
      });
    }
  }

  /**
   * Add new notification to state
   */
  private addNotification(notification: NotificationDto): void {
    const notifications = [notification, ...this.state.notifications];
    
    // Keep only recent notifications (limit to 100)
    if (notifications.length > 100) {
      notifications.splice(100);
    }

    const unreadCount = notification.isRead ? this.state.unreadCount : this.state.unreadCount + 1;

    this.updateState({
      notifications,
      unreadCount
    });

    // Show browser notification if permission granted
    this.showBrowserNotification(notification);

    logger.debug('New notification added', {
      id: notification.id,
      type: notification.type,
      isRead: notification.isRead
    });
  }

  /**
   * Mark notification as read
   */
  public async markAsRead(notificationId: Uuid): Promise<void> {
    try {
      const response = await fetch(`/api/notifications/${notificationId}/read`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${await this.getAccessToken()}`
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to mark notification as read: ${response.statusText}`);
      }

      this.markNotificationAsRead(notificationId);

    } catch (error) {
      logger.error('Failed to mark notification as read', { error, notificationId });
    }
  }

  /**
   * Mark notification as read in local state
   */
  private markNotificationAsRead(notificationId: Uuid): void {
    const notifications = this.state.notifications.map(notification => {
      if (notification.id === notificationId && !notification.isRead) {
        return { ...notification, isRead: true };
      }
      return notification;
    });

    const unreadCount = Math.max(0, this.state.unreadCount - 1);

    this.updateState({
      notifications,
      unreadCount
    });
  }

  /**
   * Mark all notifications as read
   */
  public async markAllAsRead(): Promise<void> {
    try {
      const response = await fetch('/api/notifications/mark-all-read', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${await this.getAccessToken()}`
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to mark all notifications as read: ${response.statusText}`);
      }

      const notifications = this.state.notifications.map(notification => ({
        ...notification,
        isRead: true
      }));

      this.updateState({
        notifications,
        unreadCount: 0
      });

      logger.debug('All notifications marked as read');

    } catch (error) {
      logger.error('Failed to mark all notifications as read', { error });
    }
  }

  /**
   * Delete notification
   */
  public async deleteNotification(notificationId: Uuid): Promise<void> {
    try {
      const response = await fetch(`/api/notifications/${notificationId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${await this.getAccessToken()}`
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to delete notification: ${response.statusText}`);
      }

      const notifications = this.state.notifications.filter(n => n.id !== notificationId);
      const deletedNotification = this.state.notifications.find(n => n.id === notificationId);
      const unreadCount = deletedNotification && !deletedNotification.isRead 
        ? Math.max(0, this.state.unreadCount - 1)
        : this.state.unreadCount;

      this.updateState({
        notifications,
        unreadCount
      });

      logger.debug('Notification deleted', { notificationId });

    } catch (error) {
      logger.error('Failed to delete notification', { error, notificationId });
    }
  }

  /**
   * Show browser notification
   */
  private showBrowserNotification(notification: NotificationDto): void {
    if (Notification.permission === 'granted') {
      try {
        new Notification(notification.title || 'New Notification', {
          body: notification.message,
          icon: '/logo.svg',
          tag: notification.id, // Prevent duplicate notifications
          requireInteraction: notification.type === 'urgent'
        });
      } catch (error) {
        logger.warn('Failed to show browser notification', { error });
      }
    }
  }

  /**
   * Request notification permission
   */
  public async requestNotificationPermission(): Promise<NotificationPermission> {
    if ('Notification' in window) {
      const permission = await Notification.requestPermission();
      logger.debug('Notification permission requested', { permission });
      return permission;
    }
    return 'denied';
  }

  /**
   * Get access token (placeholder - would integrate with auth store)
   */
  private async getAccessToken(): Promise<string> {
    // This should integrate with the auth store
    // For now, return a placeholder
    return 'TOKEN_PLACEHOLDER';
  }

  /**
   * Clear all notifications
   */
  public clearAll(): void {
    this.updateState({
      notifications: [],
      unreadCount: 0
    });
    
    localStorage.removeItem(this.storageKey);
    logger.debug('All notifications cleared');
  }

  /**
   * Get notifications by type
   */
  public getNotificationsByType(type: string): NotificationDto[] {
    return this.state.notifications.filter(notification => notification.type === type);
  }

  /**
   * Get unread notifications
   */
  public getUnreadNotifications(): NotificationDto[] {
    return this.state.notifications.filter(notification => !notification.isRead);
  }

  /**
   * Destroy store and clean up resources
   */
  public destroy(): void {
    if (this.fetchInterval) {
      clearInterval(this.fetchInterval);
    }

    if (this.websocket) {
      this.websocket.close();
    }

    this.listeners.clear();
    this.cacheNotifications();
    
    logger.info('Notification store destroyed');
  }
}

// Export singleton instance
let notificationStoreInstance: NotificationStore | null = null;

export function createNotificationStore(): NotificationStore {
  if (notificationStoreInstance) {
    notificationStoreInstance.destroy();
  }
  
  notificationStoreInstance = new NotificationStore();
  return notificationStoreInstance;
}

export function getNotificationStore(): NotificationStore {
  if (!notificationStoreInstance) {
    throw new Error('Notification store not initialized. Call createNotificationStore first.');
  }
  
  return notificationStoreInstance;
}

// Convenience functions
export function useNotificationState(): NotificationState {
  return getNotificationStore().getState();
}

export function subscribeToNotifications(callback: (state: NotificationState) => void): () => void {
  return getNotificationStore().subscribe(callback);
}

export function getUnreadCount(): number {
  return getNotificationStore().getState().unreadCount;
}