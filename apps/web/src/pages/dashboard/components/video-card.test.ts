/**
 * Video Card Component Tests
 * 
 * Unit tests for the video card component including rendering, metadata display,
 * status indicators, user interactions, and accessibility.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { VideoCard } from './video-card.js';
import type { VideoDto } from '@streetstudio/shared';

// Mock format-time utility
vi.mock('../../../utils/format-time.js', () => ({
  formatRelativeTime: vi.fn((timestamp: string) => '5 minutes ago'),
  formatDuration: vi.fn((seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${String(remainingSeconds).padStart(2, '0')}`;
  })
}));

describe('VideoCard', () => {
  let mockVideo: VideoDto;
  let videoCard: VideoCard;

  beforeEach(() => {
    mockVideo = {
      id: 'video-123',
      title: 'Test Video Title',
      description: 'This is a test video description',
      thumbnailUrl: 'https://example.com/thumbnail.jpg',
      duration: 125, // 2:05
      commentCount: 8,
      viewCount: 42,
      status: 'ready',
      createdAt: '2024-01-01T12:00:00Z',
    } as VideoDto;

    // Setup DOM
    document.body.innerHTML = '<div id="test-container"></div>';
    
    // Mock window.location.href
    Object.defineProperty(window, 'location', {
      writable: true,
      value: { href: '' }
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = '';
  });

  describe('Component Initialization', () => {
    it('should create video card element with correct structure', () => {
      videoCard = new VideoCard(mockVideo);
      
      const element = videoCard.getElement();
      expect(element).toBeInstanceOf(HTMLElement);
      expect(element.tagName).toBe('DIV');
      expect(element.className).toContain('group cursor-pointer');
      expect(element.getAttribute('data-video-id')).toBe('video-123');
    });

    it('should set proper accessibility attributes', () => {
      videoCard = new VideoCard(mockVideo);
      
      const element = videoCard.getElement();
      expect(element.getAttribute('role')).toBe('button');
      expect(element.getAttribute('aria-label')).toBe('Open video Test Video Title');
      expect(element.tabIndex).toBe(0);
    });
  });

  describe('Content Rendering', () => {
    beforeEach(() => {
      videoCard = new VideoCard(mockVideo);
    });

    it('should render video title correctly', () => {
      const element = videoCard.getElement();
      expect(element.innerHTML).toContain('Test Video Title');
    });

    it('should render video description when available', () => {
      const element = videoCard.getElement();
      expect(element.innerHTML).toContain('This is a test video description');
    });

    it('should render video thumbnail when available', () => {
      const element = videoCard.getElement();
      const img = element.querySelector('img');
      expect(img).toBeTruthy();
      expect(img?.src).toBe('https://example.com/thumbnail.jpg');
      expect(img?.alt).toBe('Test Video Title thumbnail');
      expect(img?.getAttribute('loading')).toBe('lazy');
    });

    it('should render placeholder icon when no thumbnail', () => {
      mockVideo.thumbnailUrl = undefined;
      videoCard = new VideoCard(mockVideo);
      
      const element = videoCard.getElement();
      const img = element.querySelector('img');
      const svg = element.querySelector('svg');
      
      expect(img).toBeNull();
      expect(svg).toBeTruthy();
    });

    it('should display duration overlay when available', () => {
      const element = videoCard.getElement();
      expect(element.innerHTML).toContain('2:05');
    });

    it('should display comment count with proper icon', () => {
      const element = videoCard.getElement();
      const commentElement = element.querySelector('[data-comment-count]');
      expect(commentElement).toBeTruthy();
      expect(commentElement?.textContent?.trim()).toContain('8 comments');
    });

    it('should display view count with proper icon', () => {
      const element = videoCard.getElement();
      expect(element.innerHTML).toContain('42 views');
    });

    it('should display relative timestamp', () => {
      const element = videoCard.getElement();
      expect(element.innerHTML).toContain('5 minutes ago');
    });
  });

  describe('Status Indicators', () => {
    it('should show green indicator for ready status', () => {
      mockVideo.status = 'ready';
      videoCard = new VideoCard(mockVideo);
      
      const element = videoCard.getElement();
      const indicator = element.querySelector('.bg-green-400');
      expect(indicator).toBeTruthy();
      expect(indicator?.getAttribute('title')).toBe('Video is ready to view');
    });

    it('should show yellow pulsing indicator for processing status', () => {
      mockVideo.status = 'processing';
      videoCard = new VideoCard(mockVideo);
      
      const element = videoCard.getElement();
      const indicator = element.querySelector('.bg-yellow-400');
      expect(indicator).toBeTruthy();
      expect(indicator?.className).toContain('animate-pulse');
      expect(indicator?.getAttribute('title')).toBe('Video is processing');
    });

    it('should show blue pulsing indicator for uploading status', () => {
      mockVideo.status = 'uploading';
      videoCard = new VideoCard(mockVideo);
      
      const element = videoCard.getElement();
      const indicator = element.querySelector('.bg-blue-400');
      expect(indicator).toBeTruthy();
      expect(indicator?.className).toContain('animate-pulse');
      expect(indicator?.getAttribute('title')).toBe('Video is uploading');
    });

    it('should show red indicator for error status', () => {
      mockVideo.status = 'error';
      videoCard = new VideoCard(mockVideo);
      
      const element = videoCard.getElement();
      const indicator = element.querySelector('.bg-red-400');
      expect(indicator).toBeTruthy();
      expect(indicator?.getAttribute('title')).toBe('Video processing failed');
    });

    it('should show gray indicator for unknown status', () => {
      mockVideo.status = 'unknown_status' as any;
      videoCard = new VideoCard(mockVideo);
      
      const element = videoCard.getElement();
      const indicator = element.querySelector('.bg-gray-400');
      expect(indicator).toBeTruthy();
      expect(indicator?.getAttribute('title')).toBe('Unknown status');
    });
  });

  describe('Empty States and Edge Cases', () => {
    it('should handle video with no description', () => {
      mockVideo.description = undefined;
      videoCard = new VideoCard(mockVideo);
      
      const element = videoCard.getElement();
      expect(element.innerHTML).not.toContain('<p class="text-xs text-gray-600');
    });

    it('should handle video with no duration', () => {
      mockVideo.duration = undefined;
      videoCard = new VideoCard(mockVideo);
      
      const element = videoCard.getElement();
      expect(element.innerHTML).not.toContain('bg-black bg-opacity-70');
    });

    it('should handle zero comment count', () => {
      mockVideo.commentCount = 0;
      videoCard = new VideoCard(mockVideo);
      
      const element = videoCard.getElement();
      const commentElement = element.querySelector('[data-comment-count]');
      expect(commentElement).toBeNull();
    });

    it('should handle undefined comment count', () => {
      mockVideo.commentCount = undefined;
      videoCard = new VideoCard(mockVideo);
      
      const element = videoCard.getElement();
      const commentElement = element.querySelector('[data-comment-count]');
      expect(commentElement).toBeNull();
    });

    it('should handle zero view count', () => {
      mockVideo.viewCount = 0;
      videoCard = new VideoCard(mockVideo);
      
      const element = videoCard.getElement();
      expect(element.innerHTML).not.toContain('0 views');
    });

    it('should handle undefined view count', () => {
      mockVideo.viewCount = undefined;
      videoCard = new VideoCard(mockVideo);
      
      const element = videoCard.getElement();
      expect(element.innerHTML).not.toContain('views');
    });
  });

  describe('HTML Escaping and Security', () => {
    it('should escape HTML in video title', () => {
      mockVideo.title = '<script>alert("xss")</script>';
      videoCard = new VideoCard(mockVideo);
      
      const element = videoCard.getElement();
      expect(element.innerHTML).toContain('&lt;script&gt;alert("xss")&lt;/script&gt;');
      expect(element.innerHTML).not.toContain('<script>alert("xss")</script>');
    });

    it('should escape HTML in video description', () => {
      mockVideo.description = '<img src="x" onerror="alert(1)">';
      videoCard = new VideoCard(mockVideo);
      
      const element = videoCard.getElement();
      expect(element.innerHTML).toContain('&lt;img src="x" onerror="alert(1)"&gt;');
      expect(element.innerHTML).not.toContain('<img src="x" onerror="alert(1)">');
    });
  });

  describe('User Interactions', () => {
    beforeEach(() => {
      videoCard = new VideoCard(mockVideo);
    });

    it('should navigate to review page on click for ready videos', () => {
      mockVideo.status = 'ready';
      videoCard = new VideoCard(mockVideo);
      
      const element = videoCard.getElement();
      element.click();
      
      expect(window.location.href).toBe('/recordings/video-123/review');
    });

    it('should navigate to detail page on click for non-ready videos', () => {
      mockVideo.status = 'processing';
      videoCard = new VideoCard(mockVideo);
      
      const element = videoCard.getElement();
      element.click();
      
      expect(window.location.href).toBe('/recordings/video-123');
    });

    it('should navigate on Enter key', () => {
      const element = videoCard.getElement();
      const enterEvent = new KeyboardEvent('keydown', { key: 'Enter' });
      
      element.dispatchEvent(enterEvent);
      
      expect(window.location.href).toBe('/recordings/video-123/review');
    });

    it('should navigate on Space key', () => {
      const element = videoCard.getElement();
      const spaceEvent = new KeyboardEvent('keydown', { key: ' ' });
      
      element.dispatchEvent(spaceEvent);
      
      expect(window.location.href).toBe('/recordings/video-123/review');
    });

    it('should not navigate on other keys', () => {
      const element = videoCard.getElement();
      const tabEvent = new KeyboardEvent('keydown', { key: 'Tab' });
      
      element.dispatchEvent(tabEvent);
      
      expect(window.location.href).toBe('');
    });

    it('should prevent default behavior on Space key', () => {
      const element = videoCard.getElement();
      const spaceEvent = new KeyboardEvent('keydown', { key: ' ' });
      const preventDefaultSpy = vi.spyOn(spaceEvent, 'preventDefault');
      
      element.dispatchEvent(spaceEvent);
      
      expect(preventDefaultSpy).toHaveBeenCalled();
    });
  });

  describe('Layout and Styling', () => {
    beforeEach(() => {
      videoCard = new VideoCard(mockVideo);
    });

    it('should have horizontal flex layout', () => {
      const element = videoCard.getElement();
      const cardDiv = element.querySelector('.flex.items-center');
      expect(cardDiv).toBeTruthy();
      expect(cardDiv?.className).toContain('p-3');
    });

    it('should have proper thumbnail sizing', () => {
      const element = videoCard.getElement();
      const thumbnailDiv = element.querySelector('.w-20.h-12');
      expect(thumbnailDiv).toBeTruthy();
      expect(thumbnailDiv?.className).toContain('flex-shrink-0');
      expect(thumbnailDiv?.className).toContain('mr-3');
    });

    it('should have responsive text sizing and truncation', () => {
      const element = videoCard.getElement();
      
      const title = element.querySelector('h3');
      expect(title?.className).toContain('text-sm font-medium');
      expect(title?.className).toContain('truncate');
      
      const description = element.querySelector('p');
      expect(description?.className).toContain('text-xs');
      expect(description?.className).toContain('line-clamp-1');
    });

    it('should have hover states for interactivity', () => {
      const element = videoCard.getElement();
      const cardDiv = element.querySelector('.group-hover\\:bg-gray-100');
      expect(cardDiv).toBeTruthy();
    });
  });

  describe('Duration Formatting', () => {
    it('should format duration correctly for different lengths', () => {
      const testCases = [
        { duration: 65, expected: '1:05' },
        { duration: 125, expected: '2:05' },
        { duration: 3661, expected: '61:01' }
      ];

      testCases.forEach(({ duration, expected }) => {
        mockVideo.duration = duration;
        videoCard = new VideoCard(mockVideo);
        
        const element = videoCard.getElement();
        expect(element.innerHTML).toContain(expected);
      });
    });

    it('should position duration overlay correctly', () => {
      const element = videoCard.getElement();
      const durationOverlay = element.querySelector('.bg-black.bg-opacity-70');
      
      expect(durationOverlay).toBeTruthy();
      expect(durationOverlay?.className).toContain('text-white');
      expect(durationOverlay?.className).toContain('text-xs');
      expect(durationOverlay?.className).toContain('px-1 py-0.5');
    });
  });

  describe('Dark Mode Support', () => {
    beforeEach(() => {
      videoCard = new VideoCard(mockVideo);
    });

    it('should have dark mode classes', () => {
      const element = videoCard.getElement();
      
      expect(element.innerHTML).toContain('dark:bg-gray-700');
      expect(element.innerHTML).toContain('dark:group-hover:bg-gray-600');
      expect(element.innerHTML).toContain('dark:text-white');
      expect(element.innerHTML).toContain('dark:text-gray-400');
      expect(element.innerHTML).toContain('dark:bg-gray-600');
      expect(element.innerHTML).toContain('dark:text-gray-500');
    });
  });

  describe('Accessibility Compliance', () => {
    beforeEach(() => {
      videoCard = new VideoCard(mockVideo);
    });

    it('should support keyboard navigation', () => {
      const element = videoCard.getElement();
      expect(element.tabIndex).toBe(0);
    });

    it('should have proper ARIA role', () => {
      const element = videoCard.getElement();
      expect(element.getAttribute('role')).toBe('button');
    });

    it('should have descriptive ARIA label', () => {
      const element = videoCard.getElement();
      expect(element.getAttribute('aria-label')).toContain('Test Video Title');
    });

    it('should have proper heading hierarchy', () => {
      const element = videoCard.getElement();
      const heading = element.querySelector('h3');
      expect(heading).toBeTruthy();
    });

    it('should have alt text for images', () => {
      const element = videoCard.getElement();
      const img = element.querySelector('img');
      expect(img?.alt).toBe('Test Video Title thumbnail');
    });

    it('should hide decorative icons from screen readers', () => {
      const element = videoCard.getElement();
      const svgs = element.querySelectorAll('svg');
      
      svgs.forEach(svg => {
        expect(svg.getAttribute('aria-hidden')).toBe('true');
      });
    });

    it('should have meaningful status indicators', () => {
      const element = videoCard.getElement();
      const statusIndicator = element.querySelector('.bg-green-400');
      expect(statusIndicator?.getAttribute('title')).toBe('Video is ready to view');
    });
  });

  describe('Performance', () => {
    it('should create minimal DOM structure', () => {
      videoCard = new VideoCard(mockVideo);
      
      const element = videoCard.getElement();
      const childCount = element.querySelectorAll('*').length;
      
      // Should not create excessive DOM nodes
      expect(childCount).toBeLessThan(25);
    });

    it('should reuse DOM element on multiple calls', () => {
      videoCard = new VideoCard(mockVideo);
      
      const element1 = videoCard.getElement();
      const element2 = videoCard.getElement();
      
      expect(element1).toBe(element2);
    });
  });

  describe('Responsive Behavior', () => {
    beforeEach(() => {
      videoCard = new VideoCard(mockVideo);
    });

    it('should maintain compact horizontal layout', () => {
      const element = videoCard.getElement();
      const container = element.querySelector('.flex.items-center');
      expect(container).toBeTruthy();
    });

    it('should handle text overflow gracefully', () => {
      mockVideo.title = 'This is a very long video title that should be truncated when displayed in the card component';
      mockVideo.description = 'This is an extremely long description that should also be truncated to prevent layout issues and maintain a clean appearance in the dashboard interface';
      
      videoCard = new VideoCard(mockVideo);
      
      const element = videoCard.getElement();
      
      const title = element.querySelector('h3');
      expect(title?.className).toContain('truncate');
      
      const description = element.querySelector('p');
      expect(description?.className).toContain('line-clamp-1');
    });

    it('should have proper spacing for touch interfaces', () => {
      const element = videoCard.getElement();
      const cardDiv = element.querySelector('.p-3');
      expect(cardDiv).toBeTruthy();
    });
  });

  describe('Metadata Display', () => {
    beforeEach(() => {
      videoCard = new VideoCard(mockVideo);
    });

    it('should show proper metadata spacing', () => {
      const element = videoCard.getElement();
      const metadataContainer = element.querySelector('.space-x-3');
      expect(metadataContainer).toBeTruthy();
    });

    it('should display comment and view counts with proper icons', () => {
      const element = videoCard.getElement();
      
      // Check comment count structure
      const commentElement = element.querySelector('[data-comment-count]');
      const commentIcon = commentElement?.querySelector('svg');
      expect(commentIcon).toBeTruthy();
      
      // Check view count structure  
      const viewElements = element.querySelectorAll('.flex.items-center');
      expect(viewElements.length).toBeGreaterThan(1);
    });

    it('should handle missing metadata gracefully', () => {
      mockVideo.commentCount = undefined;
      mockVideo.viewCount = undefined;
      mockVideo.description = undefined;
      
      videoCard = new VideoCard(mockVideo);
      
      const element = videoCard.getElement();
      
      // Should still show timestamp
      expect(element.innerHTML).toContain('5 minutes ago');
      
      // Should not crash or show undefined
      expect(element.innerHTML).not.toContain('undefined');
    });
  });
});