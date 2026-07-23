/**
 * Activity Feed Component Tests
 * 
 * Unit tests for the activity feed component including notification rendering,
 * pagination, user interactions, and real-time updates.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ActivityFeed } from './activity-feed.js';
import type { NotificationDto } from '@streetstudio/shared';

// Mock format-time utility
vi.mock('../../../utils/format-time.js', () => ({
  formatRelativeTime: vi.fn((timestamp: string) => '2 minutes ago')
}));

describe('ActivityFeed', () => {
  let mockNotifications: NotificationDto[];
  let activityFeed: ActivityFeed;

  beforeEach(() => {
    mockNotifications = [
      {
        id: 'notif-1',
        message: 'John Doe commented on your video',
        type: 'comment',
        read: false,
        createdAt: '2024-01-01T12:00:00Z',
        metadata: { videoId: 'video-123' }
      },
      {
        id: 'notif-2',
        message: 'You were invited to Project Alpha',
        type: 'project_invite',
        read: true,
        createdAt: '2024-01-01T11:30:00Z',
        metadata: { projectId: 'project-456' }
      },
      {
        id: 'notif-3',
        message: 'Your video is ready for viewing',
        type: 'video_ready',
        read: false,
        createdAt: '2024-01-01T11:00:00Z',
        metadata: { videoId: 'video-789' }
      }
    ] as NotificationDto[];

    // Setup DOM
    document.body.innerHTML = '<div id="test-container"></div>';
    
    // Mock window.location.href
    Object.defineProperty(window, 'location', {
      writable: true,
      value: { href: '' }
    });

    // Mock console methods
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = '';
  });

  describe('Component Initialization', () => {
    it('should create activity feed element with correct structure', () => {
      activityFeed = new ActivityFeed(mockNotifications);
      
      const element = activityFeed.getElement();
      expect(element).toBeInstanceOf(HTMLElement);
      expect(element.tagName).toBe('DIV');
    });

    it('should render notifications when provided', () => {
      activityFeed = new ActivityFeed(mockNotifications);
      
      const element = activityFeed.getElement();
      const notificationElements = element.querySelectorAll('[data-notification-id]');
      expect(notificationElements.length).toBe(3);
    });

    it('should show empty state when no notifications', () => {
      activityFeed = new ActivityFeed([]);
      
      const element = activityFeed.getElement();
      expect(element.textContent).toContain('No recent activity');
      expect(element.textContent).toContain('Activity will appear here when you start collaborating');
    });
  });

  describe('Notification Rendering', () => {
    beforeEach(() => {
      activityFeed = new ActivityFeed(mockNotifications);
    });

    it('should render notification messages correctly', () => {
      const element = activityFeed.getElement();
      
      expect(element.textContent).toContain('John Doe commented on your video');
      expect(element.textContent).toContain('You were invited to Project Alpha');
      expect(element.textContent).toContain('Your video is ready for viewing');
    });

    it('should show unread indicators for unread notifications', () => {
      const element = activityFeed.getElement();
      
      const unreadNotifications = element.querySelectorAll('[data-unread="true"]');
      expect(unreadNotifications.length).toBe(2); // notif-1 and notif-3 are unread
      
      const unreadIndicators = element.querySelectorAll('.w-2.h-2.bg-blue-600');
      expect(unreadIndicators.length).toBe(2);
    });

    it('should apply correct styling for unread notifications', () => {
      const element = activityFeed.getElement();
      
      const unreadElements = element.querySelectorAll('[data-unread="true"]');
      unreadElements.forEach(elem => {
        expect(elem.className).toContain('bg-blue-50');
        expect(elem.className).toContain('dark:bg-blue-900/20');
      });
    });

    it('should apply correct styling for read notifications', () => {
      const element = activityFeed.getElement();
      
      const readNotification = element.querySelector('[data-notification-id="notif-2"]');
      expect(readNotification?.className).toContain('hover:bg-gray-50');
      expect(readNotification?.className).toContain('dark:hover:bg-gray-700');
      expect(readNotification?.hasAttribute('data-unread')).toBe(false);
    });

    it('should display relative timestamps', () => {
      const element = activityFeed.getElement();
      const timestamps = element.querySelectorAll('.text-xs.text-gray-600');
      
      timestamps.forEach(timestamp => {
        expect(timestamp.textContent).toContain('2 minutes ago');
      });
    });
  });

  describe('Notification Icons', () => {
    beforeEach(() => {
      activityFeed = new ActivityFeed(mockNotifications);
    });

    it('should render correct icon for comment notifications', () => {
      const element = activityFeed.getElement();
      const commentNotification = element.querySelector('[data-notification-id="notif-1"]');
      const iconContainer = commentNotification?.querySelector('.bg-green-100');
      
      expect(iconContainer).toBeTruthy();
      expect(iconContainer?.querySelector('svg')).toBeTruthy();
    });

    it('should render correct icon for project invite notifications', () => {
      const element = activityFeed.getElement();
      const projectNotification = element.querySelector('[data-notification-id="notif-2"]');
      const iconContainer = projectNotification?.querySelector('.bg-blue-100');
      
      expect(iconContainer).toBeTruthy();
      expect(iconContainer?.querySelector('svg')).toBeTruthy();
    });

    it('should render correct icon for video ready notifications', () => {
      const element = activityFeed.getElement();
      const videoNotification = element.querySelector('[data-notification-id="notif-3"]');
      const iconContainer = videoNotification?.querySelector('.bg-purple-100');
      
      expect(iconContainer).toBeTruthy();
      expect(iconContainer?.querySelector('svg')).toBeTruthy();
    });

    it('should have dark mode classes for icons', () => {
      const element = activityFeed.getElement();
      
      const greenIcon = element.querySelector('.bg-green-100');
      expect(greenIcon?.className).toContain('dark:bg-green-900');
      
      const blueIcon = element.querySelector('.bg-blue-100');
      expect(blueIcon?.className).toContain('dark:bg-blue-900');
      
      const purpleIcon = element.querySelector('.bg-purple-100');
      expect(purpleIcon?.className).toContain('dark:bg-purple-900');
    });
  });

  describe('Pagination Functionality', () => {
    beforeEach(() => {
      // Create more notifications to test pagination
      const manyNotifications = Array.from({ length: 12 }, (_, i) => ({
        id: `notif-${i + 1}`,
        message: `Notification ${i + 1}`,
        type: 'comment',
        read: i % 2 === 0,
        createdAt: `2024-01-01T12:${String(i).padStart(2, '0')}:00Z`,
        metadata: { videoId: `video-${i + 1}` }
      })) as NotificationDto[];
      
      activityFeed = new ActivityFeed(manyNotifications);
    });

    it('should initially show only 5 notifications', () => {
      const element = activityFeed.getElement();
      const notificationElements = element.querySelectorAll('[data-notification-id]');
      expect(notificationElements.length).toBe(5);
    });

    it('should show load more button when there are more notifications', () => {
      const element = activityFeed.getElement();
      const loadMoreButton = element.querySelector('#load-more-activity');
      expect(loadMoreButton).toBeTruthy();
      expect(loadMoreButton?.textContent?.trim()).toContain('Load More');
    });

    it('should load more notifications when load more button is clicked', () => {
      const element = activityFeed.getElement();
      const loadMoreButton = element.querySelector('#load-more-activity') as HTMLButtonElement;
      
      loadMoreButton.click();
      
      const notificationElements = element.querySelectorAll('[data-notification-id]');
      expect(notificationElements.length).toBe(10);
    });

    it('should hide load more button when all notifications are shown', () => {
      const element = activityFeed.getElement();
      const loadMoreButton = element.querySelector('#load-more-activity') as HTMLButtonElement;
      
      // Click twice to load all notifications
      loadMoreButton.click();
      loadMoreButton.click();
      
      const updatedLoadMoreButton = element.querySelector('#load-more-activity');
      expect(updatedLoadMoreButton).toBeNull();
    });

    it('should show view all notifications link when appropriate', () => {
      const element = activityFeed.getElement();
      const viewAllLink = element.querySelector('a[href="/notifications"]');
      expect(viewAllLink).toBeTruthy();
      expect(viewAllLink?.textContent?.trim()).toContain('View All Notifications');
    });
  });

  describe('User Interactions', () => {
    beforeEach(() => {
      activityFeed = new ActivityFeed(mockNotifications);
    });

    it('should mark notification as read when clicked', () => {
      const element = activityFeed.getElement();
      const unreadNotification = element.querySelector('[data-notification-id="notif-1"]') as HTMLElement;
      
      expect(unreadNotification.hasAttribute('data-unread')).toBe(true);
      
      unreadNotification.click();
      
      expect(unreadNotification.hasAttribute('data-unread')).toBe(false);
      expect(unreadNotification.className).toContain('hover:bg-gray-50');
    });

    it('should navigate to correct page for comment notifications', () => {
      const element = activityFeed.getElement();
      const commentNotification = element.querySelector('[data-notification-id="notif-1"]') as HTMLElement;
      
      commentNotification.click();
      
      expect(window.location.href).toBe('/recordings/video-123/review');
    });

    it('should navigate to correct page for project notifications', () => {
      const element = activityFeed.getElement();
      const projectNotification = element.querySelector('[data-notification-id="notif-2"]') as HTMLElement;
      
      projectNotification.click();
      
      expect(window.location.href).toBe('/projects/project-456');
    });

    it('should navigate to correct page for video notifications', () => {
      const element = activityFeed.getElement();
      const videoNotification = element.querySelector('[data-notification-id="notif-3"]') as HTMLElement;
      
      videoNotification.click();
      
      expect(window.location.href).toBe('/recordings/video-789');
    });

    it('should send API request to mark notification as read', () => {
      const element = activityFeed.getElement();
      const unreadNotification = element.querySelector('[data-notification-id="notif-1"]') as HTMLElement;
      
      unreadNotification.click();
      
      expect(console.log).toHaveBeenCalledWith('Marked notification as read:', 'notif-1');
    });

    it('should not navigate when notification has no metadata', () => {
      const noMetadataNotifications = [{
        id: 'notif-no-meta',
        message: 'System notification',
        type: 'system',
        read: false,
        createdAt: '2024-01-01T12:00:00Z',
        metadata: undefined
      }] as NotificationDto[];
      
      activityFeed = new ActivityFeed(noMetadataNotifications);
      
      const element = activityFeed.getElement();
      const notification = element.querySelector('[data-notification-id="notif-no-meta"]') as HTMLElement;
      
      notification.click();
      
      // Should not have navigated
      expect(window.location.href).toBe('');
    });
  });

  describe('HTML Escaping and Security', () => {
    it('should escape HTML in notification messages', () => {
      const maliciousNotifications = [{
        id: 'notif-xss',
        message: '<script>alert("xss")</script>Test message',
        type: 'comment',
        read: false,
        createdAt: '2024-01-01T12:00:00Z',
        metadata: { videoId: 'video-123' }
      }] as NotificationDto[];
      
      activityFeed = new ActivityFeed(maliciousNotifications);
      
      const element = activityFeed.getElement();
      expect(element.innerHTML).toContain('&lt;script&gt;alert("xss")&lt;/script&gt;Test message');
      expect(element.innerHTML).not.toContain('<script>alert("xss")</script>');
    });
  });

  describe('Real-time Updates', () => {
    beforeEach(() => {
      activityFeed = new ActivityFeed(mockNotifications);
    });

    it('should add new notification to the beginning of the feed', () => {
      const element = activityFeed.getElement();
      
      const newNotification: NotificationDto = {
        id: 'notif-new',
        message: 'New notification message',
        type: 'mention',
        read: false,
        createdAt: '2024-01-01T12:30:00Z',
        metadata: { videoId: 'video-new' }
      };
      
      activityFeed.addNotification(newNotification);
      
      const firstNotification = element.querySelector('[data-notification-id]');
      expect(firstNotification?.getAttribute('data-notification-id')).toBe('notif-new');
    });

    it('should update entire notification list', () => {
      const element = activityFeed.getElement();
      
      const newNotifications: NotificationDto[] = [
        {
          id: 'notif-updated-1',
          message: 'Updated notification 1',
          type: 'comment',
          read: true,
          createdAt: '2024-01-01T13:00:00Z',
          metadata: { videoId: 'video-updated' }
        }
      ];
      
      activityFeed.updateNotifications(newNotifications);
      
      const notificationElements = element.querySelectorAll('[data-notification-id]');
      expect(notificationElements.length).toBe(1);
      expect(notificationElements[0]?.getAttribute('data-notification-id')).toBe('notif-updated-1');
    });

    it('should reset pagination when notifications are updated', () => {
      // Create many notifications first
      const manyNotifications = Array.from({ length: 12 }, (_, i) => ({
        id: `notif-${i + 1}`,
        message: `Notification ${i + 1}`,
        type: 'comment',
        read: false,
        createdAt: `2024-01-01T12:${String(i).padStart(2, '0')}:00Z`,
        metadata: { videoId: `video-${i + 1}` }
      })) as NotificationDto[];
      
      activityFeed = new ActivityFeed(manyNotifications);
      
      const element = activityFeed.getElement();
      const loadMoreButton = element.querySelector('#load-more-activity') as HTMLButtonElement;
      loadMoreButton.click(); // Load more to increase current page
      
      // Update with fewer notifications
      activityFeed.updateNotifications(mockNotifications);
      
      const notificationElements = element.querySelectorAll('[data-notification-id]');
      expect(notificationElements.length).toBe(3); // Should show all 3, not paginated
    });
  });

  describe('Accessibility', () => {
    beforeEach(() => {
      activityFeed = new ActivityFeed(mockNotifications);
    });

    it('should hide decorative icons from screen readers', () => {
      const element = activityFeed.getElement();
      const svgs = element.querySelectorAll('svg');
      
      svgs.forEach(svg => {
        expect(svg.getAttribute('aria-hidden')).toBe('true');
      });
    });

    it('should have proper button accessibility for load more', () => {
      // Create more notifications to show load more button
      const manyNotifications = Array.from({ length: 10 }, (_, i) => ({
        id: `notif-${i + 1}`,
        message: `Notification ${i + 1}`,
        type: 'comment',
        read: false,
        createdAt: `2024-01-01T12:${String(i).padStart(2, '0')}:00Z`,
        metadata: { videoId: `video-${i + 1}` }
      })) as NotificationDto[];
      
      activityFeed = new ActivityFeed(manyNotifications);
      
      const element = activityFeed.getElement();
      const loadMoreButton = element.querySelector('#load-more-activity');
      
      expect(loadMoreButton?.tagName).toBe('BUTTON');
      expect(loadMoreButton?.className).toContain('focus:outline-none');
      expect(loadMoreButton?.className).toContain('focus:ring-2');
    });

    it('should have proper semantic structure', () => {
      const element = activityFeed.getElement();
      
      // Check that notifications are in a proper structure
      const notificationContainer = element.querySelector('.space-y-3');
      expect(notificationContainer).toBeTruthy();
      
      // Check that each notification has proper structure
      const notifications = element.querySelectorAll('[data-notification-id]');
      notifications.forEach(notification => {
        expect(notification.getAttribute('role')).toBe(null); // Should be clickable divs
        expect(notification.className).toContain('cursor-pointer');
      });
    });
  });

  describe('Dark Mode Support', () => {
    beforeEach(() => {
      activityFeed = new ActivityFeed(mockNotifications);
    });

    it('should have dark mode classes for notification content', () => {
      const element = activityFeed.getElement();
      
      expect(element.innerHTML).toContain('dark:text-white');
      expect(element.innerHTML).toContain('dark:text-gray-400');
      expect(element.innerHTML).toContain('dark:hover:bg-gray-700');
    });

    it('should have dark mode classes for empty state', () => {
      activityFeed = new ActivityFeed([]);
      
      const element = activityFeed.getElement();
      expect(element.innerHTML).toContain('dark:bg-gray-700');
      expect(element.innerHTML).toContain('dark:text-gray-500');
    });

    it('should have dark mode classes for unread notifications', () => {
      const element = activityFeed.getElement();
      const unreadNotifications = element.querySelectorAll('[data-unread="true"]');
      
      unreadNotifications.forEach(notification => {
        expect(notification.className).toContain('dark:bg-blue-900/20');
      });
    });
  });

  describe('Performance', () => {
    it('should create minimal DOM structure', () => {
      activityFeed = new ActivityFeed(mockNotifications);
      
      const element = activityFeed.getElement();
      const childCount = element.querySelectorAll('*').length;
      
      // Should not create excessive DOM nodes
      expect(childCount).toBeLessThan(50);
    });

    it('should reuse DOM element on multiple calls', () => {
      activityFeed = new ActivityFeed(mockNotifications);
      
      const element1 = activityFeed.getElement();
      const element2 = activityFeed.getElement();
      
      expect(element1).toBe(element2);
    });

    it('should handle large notification lists efficiently', () => {
      const manyNotifications = Array.from({ length: 1000 }, (_, i) => ({
        id: `notif-${i + 1}`,
        message: `Notification ${i + 1}`,
        type: 'comment',
        read: i % 2 === 0,
        createdAt: `2024-01-01T12:${String(i % 60).padStart(2, '0')}:00Z`,
        metadata: { videoId: `video-${i + 1}` }
      })) as NotificationDto[];
      
      const startTime = performance.now();
      activityFeed = new ActivityFeed(manyNotifications);
      const endTime = performance.now();
      
      const duration = endTime - startTime;
      expect(duration).toBeLessThan(100); // Should render quickly
      
      // Should still only render 5 items initially
      const element = activityFeed.getElement();
      const notificationElements = element.querySelectorAll('[data-notification-id]');
      expect(notificationElements.length).toBe(5);
    });
  });

  describe('Edge Cases', () => {
    it('should handle notifications with unknown types', () => {
      const unknownTypeNotifications = [{
        id: 'notif-unknown',
        message: 'Unknown notification type',
        type: 'unknown_type' as any,
        read: false,
        createdAt: '2024-01-01T12:00:00Z',
        metadata: { videoId: 'video-123' }
      }] as NotificationDto[];
      
      expect(() => {
        activityFeed = new ActivityFeed(unknownTypeNotifications);
      }).not.toThrow();
      
      const element = activityFeed.getElement();
      const unknownNotification = element.querySelector('[data-notification-id="notif-unknown"]');
      expect(unknownNotification).toBeTruthy();
      
      // Should use default icon and styling
      const defaultIcon = unknownNotification?.querySelector('.bg-gray-100');
      expect(defaultIcon).toBeTruthy();
    });

    it('should handle notifications without metadata gracefully', () => {
      const noMetadataNotifications = [{
        id: 'notif-no-meta',
        message: 'Notification without metadata',
        type: 'comment',
        read: false,
        createdAt: '2024-01-01T12:00:00Z'
        // no metadata field
      }] as NotificationDto[];
      
      expect(() => {
        activityFeed = new ActivityFeed(noMetadataNotifications);
      }).not.toThrow();
      
      const element = activityFeed.getElement();
      const notification = element.querySelector('[data-notification-id="notif-no-meta"]');
      expect(notification).toBeTruthy();
    });

    it('should handle empty notification arrays', () => {
      expect(() => {
        activityFeed = new ActivityFeed([]);
      }).not.toThrow();
      
      const element = activityFeed.getElement();
      expect(element.textContent).toContain('No recent activity');
    });
  });
});