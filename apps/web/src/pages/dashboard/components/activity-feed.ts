/**
 * Activity Feed Component
 * 
 * Displays recent notifications and activity in the dashboard sidebar
 * with real-time updates and pagination support.
 */

import type { NotificationDto } from '@streetstudio/shared';
import { formatRelativeTime } from '../../../utils/format-time.js';

export class ActivityFeed {
  private element: HTMLElement;
  private notifications: NotificationDto[];
  private currentPage = 1;
  private itemsPerPage = 5;
  private hasMore = true;

  constructor(notifications: NotificationDto[]) {
    this.notifications = notifications;
    this.element = document.createElement('div');
    this.render();
    this.setupEventListeners();
  }

  public getElement(): HTMLElement {
    return this.element;
  }

  private render(): void {
    const displayedNotifications = this.notifications.slice(0, this.currentPage * this.itemsPerPage);
    this.hasMore = this.notifications.length > displayedNotifications.length;

    this.element.innerHTML = `
      <div class="space-y-4">
        ${displayedNotifications.length > 0 ? `
          <!-- Activity Items -->
          <div class="space-y-3">
            ${displayedNotifications.map(notification => this.renderNotification(notification)).join('')}
          </div>
          
          ${this.hasMore ? `
            <!-- Load More Button -->
            <div class="text-center">
              <button 
                id="load-more-activity"
                class="inline-flex items-center px-3 py-2 border border-gray-300 dark:border-gray-600 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
              >
                <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
                </svg>
                Load More
              </button>
            </div>
          ` : ''}
          
          ${this.notifications.length > this.itemsPerPage ? `
            <!-- View All Link -->
            <div class="text-center pt-2">
              <a 
                href="/notifications" 
                class="text-blue-600 hover:text-blue-500 dark:text-blue-400 dark:hover:text-blue-300 text-sm font-medium transition-colors"
              >
                View All Notifications →
              </a>
            </div>
          ` : ''}
        ` : `
          <!-- Empty State -->
          <div class="text-center py-6">
            <div class="w-12 h-12 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-3">
              <svg class="w-6 h-6 text-gray-400 dark:text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-5 5-5-5h5v-12"></path>
              </svg>
            </div>
            <p class="text-sm font-medium text-gray-900 dark:text-white mb-1">No recent activity</p>
            <p class="text-xs text-gray-600 dark:text-gray-400">Activity will appear here when you start collaborating</p>
          </div>
        `}
      </div>
    `;
  }

  private renderNotification(notification: NotificationDto): string {
    const icon = this.getNotificationIcon(notification.type);
    const isUnread = !notification.read;
    
    return `
      <div class="flex items-start space-x-3 p-3 rounded-lg ${isUnread ? 'bg-blue-50 dark:bg-blue-900/20' : 'hover:bg-gray-50 dark:hover:bg-gray-700'} transition-colors cursor-pointer"
           data-notification-id="${notification.id}"
           ${isUnread ? 'data-unread="true"' : ''}
      >
        <!-- Notification Icon -->
        <div class="flex-shrink-0 w-8 h-8 ${this.getIconBgColor(notification.type)} rounded-full flex items-center justify-center">
          ${icon}
        </div>
        
        <!-- Notification Content -->
        <div class="flex-1 min-w-0">
          <p class="text-sm ${isUnread ? 'font-medium' : ''} text-gray-900 dark:text-white">
            ${this.escapeHtml(notification.message)}
          </p>
          <p class="text-xs text-gray-600 dark:text-gray-400 mt-1">
            ${formatRelativeTime(notification.createdAt)}
          </p>
        </div>
        
        <!-- Unread Indicator -->
        ${isUnread ? `
          <div class="flex-shrink-0">
            <div class="w-2 h-2 bg-blue-600 rounded-full"></div>
          </div>
        ` : ''}
      </div>
    `;
  }
  private getNotificationIcon(type: string): string {
    switch (type) {
      case 'comment':
        return `
          <svg class="w-4 h-4 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"></path>
          </svg>
        `;
      case 'project_invite':
      case 'project_update':
        return `
          <svg class="w-4 h-4 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path>
          </svg>
        `;
      case 'video_ready':
      case 'video_uploaded':
        return `
          <svg class="w-4 h-4 text-purple-600 dark:text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"></path>
          </svg>
        `;
      case 'mention':
        return `
          <svg class="w-4 h-4 text-orange-600 dark:text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path>
          </svg>
        `;
      default:
        return `
          <svg class="w-4 h-4 text-gray-600 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-5 5-5-5h5v-12"></path>
          </svg>
        `;
    }
  }

  private getIconBgColor(type: string): string {
    switch (type) {
      case 'comment':
        return 'bg-green-100 dark:bg-green-900';
      case 'project_invite':
      case 'project_update':
        return 'bg-blue-100 dark:bg-blue-900';
      case 'video_ready':
      case 'video_uploaded':
        return 'bg-purple-100 dark:bg-purple-900';
      case 'mention':
        return 'bg-orange-100 dark:bg-orange-900';
      default:
        return 'bg-gray-100 dark:bg-gray-700';
    }
  }

  private setupEventListeners(): void {
    // Load more button
    this.element.addEventListener('click', (event) => {
      const target = event.target as HTMLElement;
      if (target.id === 'load-more-activity' || target.closest('#load-more-activity')) {
        event.preventDefault();
        this.loadMore();
      }
    });

    // Notification click handling
    this.element.addEventListener('click', (event) => {
      const target = event.target as HTMLElement;
      const notificationElement = target.closest('[data-notification-id]') as HTMLElement;
      
      if (notificationElement) {
        const notificationId = notificationElement.dataset.notificationId;
        if (notificationId) {
          this.handleNotificationClick(notificationId);
        }
      }
    });
  }

  private loadMore(): void {
    this.currentPage++;
    this.render();
  }

  private handleNotificationClick(notificationId: string): void {
    // Find the notification
    const notification = this.notifications.find(n => n.id === notificationId);
    if (!notification) return;

    // Mark as read if unread
    if (!notification.read) {
      this.markAsRead(notificationId);
    }

    // Navigate based on notification type and metadata
    this.navigateToNotificationTarget(notification);
  }

  private markAsRead(notificationId: string): void {
    // Update local state
    const notification = this.notifications.find(n => n.id === notificationId);
    if (notification) {
      notification.read = true;
      
      // Update UI
      const notificationElement = this.element.querySelector(`[data-notification-id="${notificationId}"]`);
      if (notificationElement) {
        notificationElement.removeAttribute('data-unread');
        notificationElement.classList.remove('bg-blue-50', 'dark:bg-blue-900/20');
        notificationElement.classList.add('hover:bg-gray-50', 'dark:hover:bg-gray-700');
        
        // Remove unread indicator
        const unreadIndicator = notificationElement.querySelector('.w-2.h-2.bg-blue-600');
        if (unreadIndicator) {
          unreadIndicator.remove();
        }
      }
    }

    // Send API request to mark as read
    this.sendMarkAsReadRequest(notificationId);
  }

  private async sendMarkAsReadRequest(notificationId: string): Promise<void> {
    try {
      // In a real implementation, make API call
      // await api.markNotificationAsRead(notificationId);
      console.log('Marked notification as read:', notificationId);
    } catch (error) {
      console.error('Failed to mark notification as read:', error);
    }
  }

  private navigateToNotificationTarget(notification: NotificationDto): void {
    if (!notification.metadata) return;

    switch (notification.type) {
      case 'comment':
        if (notification.metadata.videoId) {
          window.location.href = `/recordings/${notification.metadata.videoId}/review`;
        }
        break;
        
      case 'project_invite':
      case 'project_update':
        if (notification.metadata.projectId) {
          window.location.href = `/projects/${notification.metadata.projectId}`;
        }
        break;
        
      case 'video_ready':
      case 'video_uploaded':
        if (notification.metadata.videoId) {
          window.location.href = `/recordings/${notification.metadata.videoId}`;
        }
        break;
        
      default:
        // Navigate to notifications page
        window.location.href = '/notifications';
    }
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Add new notification to the feed
   */
  public addNotification(notification: NotificationDto): void {
    this.notifications.unshift(notification);
    this.render();
  }

  /**
   * Update notifications and re-render
   */
  public updateNotifications(notifications: NotificationDto[]): void {
    this.notifications = notifications;
    this.currentPage = 1;
    this.render();
  }
}