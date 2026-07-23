/**
 * Dashboard Stats Widget Component Tests
 * 
 * Unit tests for the dashboard stats widget including stat rendering,
 * data updates, responsive layout, and accessibility.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DashboardStatsWidget, type WeeklyStats } from './dashboard-stats-widget.js';

// Mock format-time utility
vi.mock('../../../utils/format-time.js', () => ({
  formatNumber: vi.fn((num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  })
}));

describe('DashboardStatsWidget', () => {
  let mockStats: WeeklyStats;
  let statsWidget: DashboardStatsWidget;

  beforeEach(() => {
    mockStats = {
      videosCreated: 12,
      commentsReceived: 45,
      teamMembers: 8
    };

    // Setup DOM
    document.body.innerHTML = '<div id="test-container"></div>';
  });

  afterEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = '';
  });

  describe('Component Initialization', () => {
    it('should create stats widget element with correct structure', () => {
      statsWidget = new DashboardStatsWidget(mockStats);
      
      const element = statsWidget.getElement();
      expect(element).toBeInstanceOf(HTMLElement);
      expect(element.tagName).toBe('DIV');
    });

    it('should render widget heading correctly', () => {
      statsWidget = new DashboardStatsWidget(mockStats);
      
      const element = statsWidget.getElement();
      const heading = element.querySelector('h2');
      expect(heading).toBeTruthy();
      expect(heading?.textContent?.trim()).toBe('This Week');
    });

    it('should render three stat cards', () => {
      statsWidget = new DashboardStatsWidget(mockStats);
      
      const element = statsWidget.getElement();
      const statCards = element.querySelectorAll('.bg-white');
      expect(statCards.length).toBe(3);
    });
  });

  describe('Videos Created Stat', () => {
    beforeEach(() => {
      statsWidget = new DashboardStatsWidget(mockStats);
    });

    it('should render videos created stat correctly', () => {
      const element = statsWidget.getElement();
      const statCards = element.querySelectorAll('.bg-white');
      const videosCard = statCards[0];
      
      expect(videosCard.textContent).toContain('12');
      expect(videosCard.textContent).toContain('Videos Created');
    });

    it('should have correct icon for videos created', () => {
      const element = statsWidget.getElement();
      const videosIcon = element.querySelector('.bg-blue-100 svg');
      expect(videosIcon).toBeTruthy();
      expect(videosIcon?.getAttribute('viewBox')).toBe('0 0 24 24');
    });

    it('should have proper styling for videos stat', () => {
      const element = statsWidget.getElement();
      const videosIconContainer = element.querySelector('.bg-blue-100');
      const videosIcon = videosIconContainer?.querySelector('svg');
      
      expect(videosIconContainer?.className).toContain('bg-blue-100');
      expect(videosIconContainer?.className).toContain('dark:bg-blue-900');
      expect(videosIcon?.className).toContain('text-blue-600');
      expect(videosIcon?.className).toContain('dark:text-blue-400');
    });
  });

  describe('Comments Received Stat', () => {
    beforeEach(() => {
      statsWidget = new DashboardStatsWidget(mockStats);
    });

    it('should render comments received stat correctly', () => {
      const element = statsWidget.getElement();
      const statCards = element.querySelectorAll('.bg-white');
      const commentsCard = statCards[1];
      
      expect(commentsCard.textContent).toContain('45');
      expect(commentsCard.textContent).toContain('Comments Received');
    });

    it('should have correct icon for comments received', () => {
      const element = statsWidget.getElement();
      const commentsIcon = element.querySelector('.bg-green-100 svg');
      expect(commentsIcon).toBeTruthy();
      expect(commentsIcon?.getAttribute('viewBox')).toBe('0 0 24 24');
    });

    it('should have proper styling for comments stat', () => {
      const element = statsWidget.getElement();
      const commentsIconContainer = element.querySelector('.bg-green-100');
      const commentsIcon = commentsIconContainer?.querySelector('svg');
      
      expect(commentsIconContainer?.className).toContain('bg-green-100');
      expect(commentsIconContainer?.className).toContain('dark:bg-green-900');
      expect(commentsIcon?.className).toContain('text-green-600');
      expect(commentsIcon?.className).toContain('dark:text-green-400');
    });
  });

  describe('Team Members Stat', () => {
    beforeEach(() => {
      statsWidget = new DashboardStatsWidget(mockStats);
    });

    it('should render team members stat correctly', () => {
      const element = statsWidget.getElement();
      const statCards = element.querySelectorAll('.bg-white');
      const teamCard = statCards[2];
      
      expect(teamCard.textContent).toContain('8');
      expect(teamCard.textContent).toContain('Team Members');
    });

    it('should have correct icon for team members', () => {
      const element = statsWidget.getElement();
      const teamIcon = element.querySelector('.bg-purple-100 svg');
      expect(teamIcon).toBeTruthy();
      expect(teamIcon?.getAttribute('viewBox')).toBe('0 0 24 24');
    });

    it('should have proper styling for team members stat', () => {
      const element = statsWidget.getElement();
      const teamIconContainer = element.querySelector('.bg-purple-100');
      const teamIcon = teamIconContainer?.querySelector('svg');
      
      expect(teamIconContainer?.className).toContain('bg-purple-100');
      expect(teamIconContainer?.className).toContain('dark:bg-purple-900');
      expect(teamIcon?.className).toContain('text-purple-600');
      expect(teamIcon?.className).toContain('dark:text-purple-400');
    });
  });

  describe('Number Formatting', () => {
    it('should format large numbers with K suffix', () => {
      mockStats.videosCreated = 1500;
      mockStats.commentsReceived = 2300;
      
      statsWidget = new DashboardStatsWidget(mockStats);
      
      const element = statsWidget.getElement();
      expect(element.textContent).toContain('1.5K');
      expect(element.textContent).toContain('2.3K');
    });

    it('should format very large numbers with M suffix', () => {
      mockStats.videosCreated = 1500000;
      mockStats.commentsReceived = 2300000;
      
      statsWidget = new DashboardStatsWidget(mockStats);
      
      const element = statsWidget.getElement();
      expect(element.textContent).toContain('1.5M');
      expect(element.textContent).toContain('2.3M');
    });

    it('should display small numbers without formatting', () => {
      mockStats.videosCreated = 5;
      mockStats.commentsReceived = 23;
      mockStats.teamMembers = 3;
      
      statsWidget = new DashboardStatsWidget(mockStats);
      
      const element = statsWidget.getElement();
      expect(element.textContent).toContain('5');
      expect(element.textContent).toContain('23');
      expect(element.textContent).toContain('3');
    });
  });

  describe('Zero and Edge Cases', () => {
    it('should handle zero values correctly', () => {
      mockStats.videosCreated = 0;
      mockStats.commentsReceived = 0;
      mockStats.teamMembers = 0;
      
      statsWidget = new DashboardStatsWidget(mockStats);
      
      const element = statsWidget.getElement();
      const statValues = element.querySelectorAll('.text-2xl');
      
      statValues.forEach(value => {
        expect(value.textContent?.trim()).toBe('0');
      });
    });

    it('should handle negative values gracefully', () => {
      mockStats.videosCreated = -5;
      mockStats.commentsReceived = -10;
      mockStats.teamMembers = -2;
      
      statsWidget = new DashboardStatsWidget(mockStats);
      
      const element = statsWidget.getElement();
      expect(element.textContent).toContain('-5');
      expect(element.textContent).toContain('-10');
      expect(element.textContent).toContain('-2');
    });

    it('should handle undefined values', () => {
      mockStats = {
        videosCreated: undefined as any,
        commentsReceived: undefined as any,
        teamMembers: undefined as any
      };
      
      expect(() => {
        statsWidget = new DashboardStatsWidget(mockStats);
      }).not.toThrow();
    });
  });

  describe('Stats Update Functionality', () => {
    beforeEach(() => {
      statsWidget = new DashboardStatsWidget(mockStats);
    });

    it('should update stats and re-render', () => {
      const element = statsWidget.getElement();
      
      // Initial state
      expect(element.textContent).toContain('12');
      expect(element.textContent).toContain('45');
      expect(element.textContent).toContain('8');
      
      // Update stats
      const newStats: WeeklyStats = {
        videosCreated: 20,
        commentsReceived: 60,
        teamMembers: 12
      };
      
      statsWidget.updateStats(newStats);
      
      // Check updated values
      expect(element.textContent).toContain('20');
      expect(element.textContent).toContain('60');
      expect(element.textContent).toContain('12');
    });

    it('should preserve element reference after update', () => {
      const element1 = statsWidget.getElement();
      
      const newStats: WeeklyStats = {
        videosCreated: 100,
        commentsReceived: 200,
        teamMembers: 15
      };
      
      statsWidget.updateStats(newStats);
      const element2 = statsWidget.getElement();
      
      expect(element1).toBe(element2);
    });

    it('should handle multiple rapid updates', () => {
      const updates = [
        { videosCreated: 10, commentsReceived: 20, teamMembers: 5 },
        { videosCreated: 15, commentsReceived: 30, teamMembers: 7 },
        { videosCreated: 25, commentsReceived: 50, teamMembers: 10 }
      ];
      
      updates.forEach(update => {
        statsWidget.updateStats(update);
      });
      
      const element = statsWidget.getElement();
      expect(element.textContent).toContain('25');
      expect(element.textContent).toContain('50');
      expect(element.textContent).toContain('10');
    });
  });

  describe('Layout and Styling', () => {
    beforeEach(() => {
      statsWidget = new DashboardStatsWidget(mockStats);
    });

    it('should have proper spacing between stat cards', () => {
      const element = statsWidget.getElement();
      const container = element.querySelector('.space-y-4');
      expect(container).toBeTruthy();
    });

    it('should have consistent card styling', () => {
      const element = statsWidget.getElement();
      const statCards = element.querySelectorAll('.bg-white');
      
      statCards.forEach(card => {
        expect(card.className).toContain('bg-white');
        expect(card.className).toContain('dark:bg-gray-800');
        expect(card.className).toContain('rounded-lg');
        expect(card.className).toContain('shadow-sm');
        expect(card.className).toContain('border');
        expect(card.className).toContain('p-4');
      });
    });

    it('should have proper icon container styling', () => {
      const element = statsWidget.getElement();
      const iconContainers = element.querySelectorAll('.p-3.rounded-lg');
      
      expect(iconContainers.length).toBe(3);
      iconContainers.forEach(container => {
        expect(container.className).toContain('p-3');
        expect(container.className).toContain('rounded-lg');
      });
    });

    it('should have proper typography classes', () => {
      const element = statsWidget.getElement();
      
      const statNumbers = element.querySelectorAll('.text-2xl');
      statNumbers.forEach(number => {
        expect(number.className).toContain('text-2xl');
        expect(number.className).toContain('font-semibold');
        expect(number.className).toContain('text-gray-900');
        expect(number.className).toContain('dark:text-white');
      });
      
      const statLabels = element.querySelectorAll('.text-sm');
      statLabels.forEach(label => {
        expect(label.className).toContain('text-sm');
        expect(label.className).toContain('text-gray-600');
        expect(label.className).toContain('dark:text-gray-400');
      });
    });
  });

  describe('Dark Mode Support', () => {
    beforeEach(() => {
      statsWidget = new DashboardStatsWidget(mockStats);
    });

    it('should have dark mode classes for heading', () => {
      const element = statsWidget.getElement();
      const heading = element.querySelector('h2');
      
      expect(heading?.className).toContain('text-gray-900');
      expect(heading?.className).toContain('dark:text-white');
    });

    it('should have dark mode classes for stat cards', () => {
      const element = statsWidget.getElement();
      const statCards = element.querySelectorAll('.bg-white');
      
      statCards.forEach(card => {
        expect(card.className).toContain('bg-white');
        expect(card.className).toContain('dark:bg-gray-800');
        expect(card.className).toContain('border-gray-200');
        expect(card.className).toContain('dark:border-gray-700');
      });
    });

    it('should have dark mode classes for icons', () => {
      const element = statsWidget.getElement();
      
      const blueIcon = element.querySelector('.bg-blue-100');
      expect(blueIcon?.className).toContain('dark:bg-blue-900');
      expect(blueIcon?.querySelector('svg')?.className).toContain('dark:text-blue-400');
      
      const greenIcon = element.querySelector('.bg-green-100');
      expect(greenIcon?.className).toContain('dark:bg-green-900');
      expect(greenIcon?.querySelector('svg')?.className).toContain('dark:text-green-400');
      
      const purpleIcon = element.querySelector('.bg-purple-100');
      expect(purpleIcon?.className).toContain('dark:bg-purple-900');
      expect(purpleIcon?.querySelector('svg')?.className).toContain('dark:text-purple-400');
    });
  });

  describe('Accessibility', () => {
    beforeEach(() => {
      statsWidget = new DashboardStatsWidget(mockStats);
    });

    it('should have proper heading hierarchy', () => {
      const element = statsWidget.getElement();
      const heading = element.querySelector('h2');
      
      expect(heading).toBeTruthy();
      expect(heading?.tagName).toBe('H2');
    });

    it('should hide decorative icons from screen readers', () => {
      const element = statsWidget.getElement();
      const svgs = element.querySelectorAll('svg');
      
      svgs.forEach(svg => {
        expect(svg.getAttribute('aria-hidden')).toBe('true');
      });
    });

    it('should have proper semantic structure', () => {
      const element = statsWidget.getElement();
      
      // Check that numbers are properly structured with labels
      const statCards = element.querySelectorAll('.bg-white');
      statCards.forEach(card => {
        const number = card.querySelector('.text-2xl');
        const label = card.querySelector('.text-sm');
        
        expect(number).toBeTruthy();
        expect(label).toBeTruthy();
      });
    });
  });

  describe('Performance', () => {
    it('should create minimal DOM structure', () => {
      statsWidget = new DashboardStatsWidget(mockStats);
      
      const element = statsWidget.getElement();
      const childCount = element.querySelectorAll('*').length;
      
      // Should not create excessive DOM nodes
      expect(childCount).toBeLessThan(30);
    });

    it('should reuse DOM element on multiple calls', () => {
      statsWidget = new DashboardStatsWidget(mockStats);
      
      const element1 = statsWidget.getElement();
      const element2 = statsWidget.getElement();
      
      expect(element1).toBe(element2);
    });

    it('should handle frequent updates efficiently', () => {
      statsWidget = new DashboardStatsWidget(mockStats);
      const startTime = performance.now();
      
      // Perform many updates
      for (let i = 0; i < 100; i++) {
        statsWidget.updateStats({
          videosCreated: i,
          commentsReceived: i * 2,
          teamMembers: Math.floor(i / 10)
        });
      }
      
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      // Should complete quickly
      expect(duration).toBeLessThan(100);
    });
  });

  describe('Responsive Behavior', () => {
    beforeEach(() => {
      statsWidget = new DashboardStatsWidget(mockStats);
    });

    it('should maintain layout structure for mobile', () => {
      const element = statsWidget.getElement();
      const container = element.querySelector('.space-y-4');
      
      // Vertical stacking for mobile
      expect(container).toBeTruthy();
    });

    it('should have appropriate sizing for stat numbers', () => {
      const element = statsWidget.getElement();
      const statNumbers = element.querySelectorAll('.text-2xl');
      
      statNumbers.forEach(number => {
        expect(number.className).toContain('text-2xl');
      });
    });

    it('should have proper card padding for touch interfaces', () => {
      const element = statsWidget.getElement();
      const statCards = element.querySelectorAll('.p-4');
      
      expect(statCards.length).toBe(3);
      statCards.forEach(card => {
        expect(card.className).toContain('p-4');
      });
    });
  });
});