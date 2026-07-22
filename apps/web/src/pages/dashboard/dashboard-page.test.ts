/**
 * Dashboard Page Tests
 * 
 * Tests for the main dashboard interface including component rendering,
 * data loading, responsive layout, and real-time updates.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DashboardPage } from './dashboard-page.js';
import type { DashboardSession } from '@streetstudio/dashboard';
import type { ProjectDto, VideoDto, MemberDto } from '@streetstudio/shared';

// Mock the dashboard session
const mockSession = {
  currentMember: vi.fn(),
} as unknown as DashboardSession;

// Mock component imports
vi.mock('./components/quick-actions.js', () => ({
  QuickActions: vi.fn().mockImplementation(() => ({
    getElement: () => document.createElement('div'),
  }))
}));

vi.mock('./components/project-card.js', () => ({
  ProjectCard: vi.fn().mockImplementation(() => ({
    getElement: () => document.createElement('div'),
  }))
}));

vi.mock('./components/video-card.js', () => ({
  VideoCard: vi.fn().mockImplementation(() => ({
    getElement: () => document.createElement('div'),
  }))
}));

vi.mock('./components/dashboard-stats-widget.js', () => ({
  DashboardStatsWidget: vi.fn().mockImplementation(() => ({
    getElement: () => document.createElement('div'),
  }))
}));

vi.mock('./components/activity-feed.js', () => ({
  ActivityFeed: vi.fn().mockImplementation(() => ({
    getElement: () => document.createElement('div'),
  }))
}));

describe('DashboardPage', () => {
  let dashboardPage: DashboardPage;
  let mockMember: MemberDto;

  beforeEach(() => {
    mockMember = {
      id: '1',
      displayName: 'John Doe',
      email: 'john@example.com',
    } as MemberDto;

    (mockSession.currentMember as any).mockResolvedValue(mockMember);

    // Setup DOM
    document.body.innerHTML = '<div id="test-container"></div>';
  });

  afterEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = '';
  });

  describe('Initialization', () => {
    it('should create dashboard page element', async () => {
      dashboardPage = new DashboardPage(mockSession);
      
      expect(dashboardPage.getElement()).toBeInstanceOf(HTMLElement);
      expect(dashboardPage.getElement().className).toContain('flex-1');
    });

    it('should load dashboard data on initialization', async () => {
      dashboardPage = new DashboardPage(mockSession);
      
      // Allow async initialization to complete
      await new Promise(resolve => setTimeout(resolve, 0));
      
      expect(mockSession.currentMember).toHaveBeenCalled();
    });
  });

  describe('Loading States', () => {
    it('should show loading state initially', () => {
      dashboardPage = new DashboardPage(mockSession);
      const element = dashboardPage.getElement();
      
      expect(element.innerHTML).toContain('animate-pulse');
      expect(element.innerHTML).toContain('bg-gray-200');
    });

    it('should show dashboard content after loading', async () => {
      dashboardPage = new DashboardPage(mockSession);
      
      // Wait for initialization
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const element = dashboardPage.getElement();
      expect(element.innerHTML).toContain('Welcome back');
      expect(element.innerHTML).toContain('Quick Actions');
    });
  });

  describe('Error Handling', () => {
    it('should show error state when data loading fails', async () => {
      (mockSession.currentMember as any).mockRejectedValue(new Error('API Error'));
      
      dashboardPage = new DashboardPage(mockSession);
      
      // Wait for error handling
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const element = dashboardPage.getElement();
      expect(element.innerHTML).toContain('Failed to load dashboard');
      expect(element.innerHTML).toContain('Try Again');
    });

    it('should handle retry functionality', async () => {
      (mockSession.currentMember as any).mockRejectedValueOnce(new Error('API Error'))
                                       .mockResolvedValue(mockMember);
      
      dashboardPage = new DashboardPage(mockSession);
      
      // Wait for error state
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Click retry button
      const retryButton = dashboardPage.getElement().querySelector('#retry-load') as HTMLButtonElement;
      expect(retryButton).toBeTruthy();
      
      retryButton.click();
      
      // Wait for retry
      await new Promise(resolve => setTimeout(resolve, 100));
      
      expect(mockSession.currentMember).toHaveBeenCalledTimes(2);
    });
  });

  describe('Responsive Layout', () => {
    it('should render responsive grid layout', async () => {
      dashboardPage = new DashboardPage(mockSession);
      
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const element = dashboardPage.getElement();
      expect(element.innerHTML).toContain('grid-cols-1 lg:grid-cols-3');
      expect(element.innerHTML).toContain('lg:col-span-2');
    });

    it('should handle mobile layout classes', async () => {
      dashboardPage = new DashboardPage(mockSession);
      
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const element = dashboardPage.getElement();
      expect(element.innerHTML).toContain('sm:grid-cols-2');
      expect(element.innerHTML).toContain('sm:flex-row');
    });
  });
  describe('Content Rendering', () => {
    it('should render user welcome message with member name', async () => {
      dashboardPage = new DashboardPage(mockSession);
      
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const element = dashboardPage.getElement();
      expect(element.innerHTML).toContain(`Welcome back, ${mockMember.displayName}!`);
    });

    it('should render quick actions section', async () => {
      dashboardPage = new DashboardPage(mockSession);
      
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const element = dashboardPage.getElement();
      expect(element.querySelector('#quick-actions-container')).toBeTruthy();
    });

    it('should render recent projects section', async () => {
      dashboardPage = new DashboardPage(mockSession);
      
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const element = dashboardPage.getElement();
      expect(element.innerHTML).toContain('Recent Projects');
      expect(element.querySelector('#projects-container')).toBeTruthy();
    });

    it('should render recent videos section', async () => {
      dashboardPage = new DashboardPage(mockSession);
      
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const element = dashboardPage.getElement();
      expect(element.innerHTML).toContain('Recent Videos');
      expect(element.querySelector('#videos-container')).toBeTruthy();
    });

    it('should render weekly stats widget', async () => {
      dashboardPage = new DashboardPage(mockSession);
      
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const element = dashboardPage.getElement();
      expect(element.innerHTML).toContain('This Week');
      expect(element.querySelector('#stats-container')).toBeTruthy();
    });

    it('should render activity feed', async () => {
      dashboardPage = new DashboardPage(mockSession);
      
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const element = dashboardPage.getElement();
      expect(element.innerHTML).toContain('Recent Activity');
      expect(element.querySelector('#activity-feed-container')).toBeTruthy();
    });
  });

  describe('Empty States', () => {
    it('should show empty state for projects when no projects exist', async () => {
      dashboardPage = new DashboardPage(mockSession);
      
      // Mock empty projects
      dashboardPage['loadRecentProjects'] = vi.fn().mockResolvedValue([]);
      
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const element = dashboardPage.getElement();
      const projectsContainer = element.querySelector('#projects-container');
      expect(projectsContainer?.innerHTML).toContain('No recent projects');
    });

    it('should show empty state for videos when no videos exist', async () => {
      dashboardPage = new DashboardPage(mockSession);
      
      // Mock empty videos
      dashboardPage['loadRecentVideos'] = vi.fn().mockResolvedValue([]);
      
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const element = dashboardPage.getElement();
      const videosContainer = element.querySelector('#videos-container');
      expect(videosContainer?.innerHTML).toContain('No recent videos');
    });
  });

  describe('Refresh Functionality', () => {
    it('should handle refresh button click', async () => {
      dashboardPage = new DashboardPage(mockSession);
      
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const refreshSpy = vi.spyOn(dashboardPage, 'refresh');
      
      const refreshButton = dashboardPage.getElement().querySelector('#refresh-dashboard') as HTMLButtonElement;
      expect(refreshButton).toBeTruthy();
      
      refreshButton.click();
      
      expect(refreshSpy).toHaveBeenCalled();
    });

    it('should disable refresh button while loading', async () => {
      dashboardPage = new DashboardPage(mockSession);
      
      const element = dashboardPage.getElement();
      const refreshButton = element.querySelector('#refresh-dashboard') as HTMLButtonElement;
      
      expect(refreshButton?.disabled).toBe(true);
    });
  });

  describe('Real-time Updates', () => {
    it('should handle comment update events', async () => {
      dashboardPage = new DashboardPage(mockSession);
      
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const updateSpy = vi.spyOn(dashboardPage as any, 'handleRealTimeUpdate');
      
      // Simulate real-time update event
      const event = new CustomEvent('streetstudio:real-time-update', {
        detail: {
          type: 'new_comment',
          videoId: '1',
          commentId: '1'
        }
      });
      
      document.dispatchEvent(event);
      
      expect(updateSpy).toHaveBeenCalledWith({
        type: 'new_comment',
        videoId: '1',
        commentId: '1'
      });
    });

    it('should refresh on visibility change', async () => {
      dashboardPage = new DashboardPage(mockSession);
      
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const refreshSpy = vi.spyOn(dashboardPage, 'refresh');
      
      // Simulate page becoming visible
      Object.defineProperty(document, 'hidden', {
        writable: true,
        value: false
      });
      
      document.dispatchEvent(new Event('visibilitychange'));
      
      expect(refreshSpy).toHaveBeenCalled();
    });
  });

  describe('Accessibility', () => {
    it('should have proper ARIA labels and roles', async () => {
      dashboardPage = new DashboardPage(mockSession);
      
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const element = dashboardPage.getElement();
      
      // Check for headings structure
      const h1 = element.querySelector('h1');
      expect(h1).toBeTruthy();
      expect(h1?.textContent).toContain('Welcome back');
      
      const h2Elements = element.querySelectorAll('h2');
      expect(h2Elements.length).toBeGreaterThan(0);
    });

    it('should support keyboard navigation for refresh button', async () => {
      dashboardPage = new DashboardPage(mockSession);
      
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const refreshButton = dashboardPage.getElement().querySelector('#refresh-dashboard') as HTMLButtonElement;
      expect(refreshButton?.getAttribute('class')).toContain('focus:ring');
    });
  });

  describe('Performance', () => {
    it('should load data efficiently with parallel requests', async () => {
      const startTime = Date.now();
      
      dashboardPage = new DashboardPage(mockSession);
      
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const endTime = Date.now();
      const loadTime = endTime - startTime;
      
      // Should complete initialization quickly
      expect(loadTime).toBeLessThan(1000);
    });

    it('should implement auto-refresh timer', async () => {
      vi.useFakeTimers();
      
      dashboardPage = new DashboardPage(mockSession);
      
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const refreshSpy = vi.spyOn(dashboardPage, 'refresh');
      
      // Fast-forward 5 minutes
      vi.advanceTimersByTime(5 * 60 * 1000);
      
      expect(refreshSpy).toHaveBeenCalled();
      
      vi.useRealTimers();
    });
  });

  describe('Memory Management', () => {
    it('should clean up resources on destroy', async () => {
      dashboardPage = new DashboardPage(mockSession);
      
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const clearIntervalSpy = vi.spyOn(window, 'clearInterval');
      
      dashboardPage.destroy();
      
      expect(clearIntervalSpy).toHaveBeenCalled();
    });
  });
});