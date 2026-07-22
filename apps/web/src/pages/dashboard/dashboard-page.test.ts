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