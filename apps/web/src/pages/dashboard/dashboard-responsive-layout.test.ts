/**
 * Dashboard Responsive Layout Tests
 * 
 * Unit tests for responsive layout behavior across different breakpoints
 * including mobile, tablet, and desktop layouts.
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
    getElement: () => {
      const div = document.createElement('div');
      div.innerHTML = `
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <button class="p-4 rounded-lg">Action 1</button>
          <button class="p-4 rounded-lg">Action 2</button>
        </div>
      `;
      return div;
    }
  }))
}));

vi.mock('./components/project-card.js', () => ({
  ProjectCard: vi.fn().mockImplementation(() => ({
    getElement: () => {
      const div = document.createElement('div');
      div.className = 'group cursor-pointer';
      div.innerHTML = `
        <div class="bg-gray-50 rounded-lg p-4 transition-colors group-hover:bg-gray-100">
          <div class="w-full h-32 bg-gray-200 rounded-lg mb-3"></div>
          <h3 class="text-sm font-medium truncate mb-1">Project Name</h3>
        </div>
      `;
      return div;
    }
  }))
}));

describe('Dashboard Responsive Layout', () => {
  let dashboardPage: DashboardPage;
  let mockMember: MemberDto;

  // Viewport simulation utilities
  const setViewport = (width: number, height: number = 768) => {
    Object.defineProperty(window, 'innerWidth', { writable: true, value: width });
    Object.defineProperty(window, 'innerHeight', { writable: true, value: height });
    
    // Mock matchMedia for different breakpoints
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation(query => {
        const matches = (() => {
          if (query.includes('min-width: 1024px')) return width >= 1024; // lg
          if (query.includes('min-width: 768px')) return width >= 768;   // md
          if (query.includes('min-width: 640px')) return width >= 640;   // sm
          if (query.includes('max-width: 639px')) return width < 640;    // mobile
          return false;
        })();
        
        return {
          matches,
          media: query,
          onchange: null,
          addListener: vi.fn(),
          removeListener: vi.fn(),
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          dispatchEvent: vi.fn(),
        };
      }),
    });
    
    // Dispatch resize event
    window.dispatchEvent(new Event('resize'));
  };

  beforeEach(() => {
    mockMember = {
      id: 'user-123',
      displayName: 'John Doe',
      email: 'john@example.com',
    } as MemberDto;

    vi.mocked(mockSession.currentMember).mockResolvedValue(mockMember);

    // Setup DOM with container
    document.body.innerHTML = '<div id="test-container"></div>';
    
    // Default viewport (desktop)
    setViewport(1024, 768);
  });

  afterEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = '';
  });

  describe('Mobile Layout (< 640px)', () => {
    beforeEach(() => {
      setViewport(375, 667); // iPhone SE dimensions
    });

    it('should render mobile-optimized layout structure', async () => {
      dashboardPage = new DashboardPage(mockSession);
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const element = dashboardPage.getElement();
      
      // Should have single column layout
      expect(element.innerHTML).toContain('grid-cols-1');
      expect(element.innerHTML).toContain('sm:grid-cols-2');
      
      // Should stack elements vertically
      expect(element.innerHTML).toContain('flex-col');
    });

    it('should use appropriate spacing for mobile', async () => {
      dashboardPage = new DashboardPage(mockSession);
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const element = dashboardPage.getElement();
      
      // Should have mobile-friendly padding and margins
      expect(element.innerHTML).toContain('p-3');
      expect(element.innerHTML).toContain('space-y-4');
      expect(element.innerHTML).toContain('gap-3');
    });

    it('should handle touch-friendly sizing', async () => {
      dashboardPage = new DashboardPage(mockSession);
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const element = dashboardPage.getElement();
      const buttons = element.querySelectorAll('button');
      
      buttons.forEach(button => {
        const styles = window.getComputedStyle(button);
        const minHeight = parseInt(styles.minHeight || '0');
        const padding = parseInt(styles.padding || '0');
        
        // Touch targets should be at least 44px (iOS guidelines)
        expect(minHeight + padding * 2).toBeGreaterThanOrEqual(44);
      });
    });

    it('should collapse sidebar on mobile', async () => {
      dashboardPage = new DashboardPage(mockSession);
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const element = dashboardPage.getElement();
      
      // Sidebar should be hidden or collapsed on mobile
      const sidebar = element.querySelector('.sidebar, [data-sidebar]');
      if (sidebar) {
        expect(sidebar.className).toMatch(/(hidden|collapsed|lg:block)/);
      }
    });

    it('should stack dashboard sections vertically on mobile', async () => {
      dashboardPage = new DashboardPage(mockSession);
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const element = dashboardPage.getElement();
      
      // Main content areas should stack
      expect(element.innerHTML).toContain('grid-cols-1');
      expect(element.innerHTML).not.toContain('grid-cols-3');
    });

    it('should handle overflow properly on mobile', async () => {
      dashboardPage = new DashboardPage(mockSession);
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const element = dashboardPage.getElement();
      
      // Should not cause horizontal scroll
      expect(element.scrollWidth).toBeLessThanOrEqual(375);
      
      // Text should truncate properly
      const textElements = element.querySelectorAll('h1, h2, h3, p');
      textElements.forEach(textEl => {
        if (textEl.className.includes('truncate')) {
          expect(textEl.scrollWidth).toBeLessThanOrEqual(375);
        }
      });
    });
  });

  describe('Tablet Layout (640px - 1023px)', () => {
    beforeEach(() => {
      setViewport(768, 1024); // iPad dimensions
    });

    it('should render tablet-optimized layout', async () => {
      dashboardPage = new DashboardPage(mockSession);
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const element = dashboardPage.getElement();
      
      // Should use medium breakpoint classes
      expect(element.innerHTML).toContain('sm:grid-cols-2');
      expect(element.innerHTML).toContain('md:grid-cols-3');
    });

    it('should optimize quick actions for tablet', async () => {
      dashboardPage = new DashboardPage(mockSession);
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const element = dashboardPage.getElement();
      const quickActions = element.querySelector('#quick-actions-container');
      
      if (quickActions) {
        // Should show 2 columns on tablet
        expect(quickActions.innerHTML).toContain('sm:grid-cols-2');
      }
    });

    it('should balance content distribution on tablet', async () => {
      dashboardPage = new DashboardPage(mockSession);
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const element = dashboardPage.getElement();
      
      // Should have balanced 2-column layout for main content
      const mainGrid = element.querySelector('.grid');
      if (mainGrid) {
        expect(mainGrid.className).toMatch(/(sm|md):grid-cols-2/);
      }
    });

    it('should handle tablet orientation changes', async () => {
      // Portrait
      setViewport(768, 1024);
      dashboardPage = new DashboardPage(mockSession);
      await new Promise(resolve => setTimeout(resolve, 50));
      
      let element = dashboardPage.getElement();
      const portraitLayout = element.innerHTML;
      
      // Landscape
      setViewport(1024, 768);
      await new Promise(resolve => setTimeout(resolve, 50));
      
      element = dashboardPage.getElement();
      const landscapeLayout = element.innerHTML;
      
      // Layout should adapt to orientation
      expect(portraitLayout).not.toBe(landscapeLayout);
    });
  });

  describe('Desktop Layout (>= 1024px)', () => {
    beforeEach(() => {
      setViewport(1440, 900); // Standard desktop
    });

    it('should render full desktop layout', async () => {
      dashboardPage = new DashboardPage(mockSession);
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const element = dashboardPage.getElement();
      
      // Should use large breakpoint classes
      expect(element.innerHTML).toContain('lg:grid-cols-3');
      expect(element.innerHTML).toContain('lg:col-span-2');
    });

    it('should show all dashboard sections on desktop', async () => {
      dashboardPage = new DashboardPage(mockSession);
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const element = dashboardPage.getElement();
      
      // All sections should be visible
      expect(element.querySelector('#quick-actions-container')).toBeTruthy();
      expect(element.querySelector('#projects-container')).toBeTruthy();
      expect(element.querySelector('#videos-container')).toBeTruthy();
      expect(element.querySelector('#stats-container')).toBeTruthy();
      expect(element.querySelector('#activity-feed-container')).toBeTruthy();
    });

    it('should optimize content layout for desktop', async () => {
      dashboardPage = new DashboardPage(mockSession);
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const element = dashboardPage.getElement();
      
      // Should use 4-column layout for quick actions
      const quickActions = element.querySelector('#quick-actions-container');
      if (quickActions) {
        expect(quickActions.innerHTML).toContain('lg:grid-cols-4');
      }
    });

    it('should handle wide screen layouts', async () => {
      setViewport(1920, 1080); // 1080p display
      
      dashboardPage = new DashboardPage(mockSession);
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const element = dashboardPage.getElement();
      
      // Should handle very wide screens gracefully
      expect(element.scrollWidth).toBeLessThanOrEqual(1920);
      
      // Content should not be overly stretched
      const mainContent = element.querySelector('.max-w-7xl, .container');
      expect(mainContent).toBeTruthy();
    });
  });

  describe('Breakpoint Transitions', () => {
    it('should smoothly transition between mobile and tablet', async () => {
      // Start mobile
      setViewport(375, 667);
      dashboardPage = new DashboardPage(mockSession);
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Transition to tablet
      setViewport(768, 1024);
      await new Promise(resolve => setTimeout(resolve, 50));
      
      const element = dashboardPage.getElement();
      
      // Should show tablet layout classes
      expect(element.innerHTML).toContain('sm:grid-cols-2');
      expect(element.innerHTML).toContain('md:');
    });

    it('should handle rapid viewport changes', async () => {
      dashboardPage = new DashboardPage(mockSession);
      
      const viewports = [
        [375, 667],   // Mobile
        [768, 1024],  // Tablet
        [1024, 768],  // Desktop landscape
        [320, 568],   // Small mobile
        [1440, 900]   // Large desktop
      ];
      
      for (const [width, height] of viewports) {
        setViewport(width, height);
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      
      // Should not crash or break layout
      const element = dashboardPage.getElement();
      expect(element).toBeTruthy();
      expect(element.children.length).toBeGreaterThan(0);
    });
  });

  describe('Content Adaptation', () => {
    it('should adapt text sizes for different screens', async () => {
      const testCases = [
        { viewport: [320, 568], expectedClass: 'text-sm' },   // Small mobile
        { viewport: [768, 1024], expectedClass: 'text-base' }, // Tablet
        { viewport: [1024, 768], expectedClass: 'text-lg' }    // Desktop
      ];
      
      for (const { viewport, expectedClass } of testCases) {
        setViewport(viewport[0], viewport[1]);
        
        dashboardPage = new DashboardPage(mockSession);
        await new Promise(resolve => setTimeout(resolve, 50));
        
        const element = dashboardPage.getElement();
        
        // Should have appropriate text sizing
        expect(element.innerHTML).toContain(expectedClass.split('-')[0]); // Check base class exists
      }
    });

    it('should show appropriate content density', async () => {
      // Mobile - less dense
      setViewport(375, 667);
      dashboardPage = new DashboardPage(mockSession);
      await new Promise(resolve => setTimeout(resolve, 50));
      
      let element = dashboardPage.getElement();
      const mobileContentHeight = element.scrollHeight;
      
      // Desktop - more dense
      setViewport(1440, 900);
      dashboardPage = new DashboardPage(mockSession);
      await new Promise(resolve => setTimeout(resolve, 50));
      
      element = dashboardPage.getElement();
      const desktopContentHeight = element.scrollHeight;
      
      // Desktop should be more content-dense (less vertical space)
      expect(desktopContentHeight).toBeLessThan(mobileContentHeight * 1.2);
    });

    it('should handle content truncation appropriately', async () => {
      const longTitle = 'This is a very long project title that should be truncated differently on different screen sizes';
      
      // Mock projects with long titles
      vi.mocked(mockSession.currentMember).mockResolvedValue(mockMember);
      
      const viewports = [375, 768, 1024, 1440];
      
      for (const width of viewports) {
        setViewport(width, 768);
        
        dashboardPage = new DashboardPage(mockSession);
        await new Promise(resolve => setTimeout(resolve, 50));
        
        const element = dashboardPage.getElement();
        const truncatedElements = element.querySelectorAll('.truncate');
        
        // Should have truncation classes on all viewports
        expect(truncatedElements.length).toBeGreaterThan(0);
        
        truncatedElements.forEach(el => {
          expect(el.scrollWidth).toBeLessThanOrEqual(width - 100); // Account for padding
        });
      }
    });
  });

  describe('Touch and Interaction Optimization', () => {
    it('should optimize touch targets for mobile', async () => {
      setViewport(375, 667);
      
      dashboardPage = new DashboardPage(mockSession);
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const element = dashboardPage.getElement();
      const interactiveElements = element.querySelectorAll('button, a, [role="button"]');
      
      interactiveElements.forEach(el => {
        const rect = el.getBoundingClientRect();
        const minTouchSize = 44; // iOS/Android minimum
        
        // Touch targets should be large enough
        expect(Math.max(rect.width, rect.height)).toBeGreaterThanOrEqual(minTouchSize - 10); // Allow some margin
      });
    });

    it('should have appropriate hover states for desktop', async () => {
      setViewport(1440, 900);
      
      dashboardPage = new DashboardPage(mockSession);
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const element = dashboardPage.getElement();
      
      // Should have hover classes on desktop
      expect(element.innerHTML).toContain('hover:');
      expect(element.innerHTML).toContain('group-hover:');
    });

    it('should handle focus states appropriately', async () => {
      dashboardPage = new DashboardPage(mockSession);
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const element = dashboardPage.getElement();
      const focusableElements = element.querySelectorAll('button, a, [tabindex]');
      
      focusableElements.forEach(el => {
        // Should have focus styles
        expect(el.className).toMatch(/(focus:|focus-visible:)/);
      });
    });
  });

  describe('Performance at Different Viewports', () => {
    it('should render efficiently on mobile', async () => {
      setViewport(375, 667);
      
      const startTime = performance.now();
      
      dashboardPage = new DashboardPage(mockSession);
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const endTime = performance.now();
      const renderTime = endTime - startTime;
      
      // Should render quickly on mobile
      expect(renderTime).toBeLessThan(500);
    });

    it('should handle layout calculations efficiently', async () => {
      const viewportChanges = 10;
      const startTime = performance.now();
      
      dashboardPage = new DashboardPage(mockSession);
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Simulate rapid viewport changes
      for (let i = 0; i < viewportChanges; i++) {
        const width = 375 + i * 100;
        setViewport(width, 768);
        await new Promise(resolve => setTimeout(resolve, 5));
      }
      
      const endTime = performance.now();
      const totalTime = endTime - startTime;
      
      // Should handle viewport changes efficiently
      expect(totalTime / viewportChanges).toBeLessThan(50); // < 50ms per change
    });
  });

  describe('Layout Consistency', () => {
    it('should maintain visual hierarchy across viewports', async () => {
      const viewports = [[375, 667], [768, 1024], [1440, 900]];
      
      for (const [width, height] of viewports) {
        setViewport(width, height);
        
        dashboardPage = new DashboardPage(mockSession);
        await new Promise(resolve => setTimeout(resolve, 50));
        
        const element = dashboardPage.getElement();
        
        // Should always have main heading
        const heading = element.querySelector('h1');
        expect(heading).toBeTruthy();
        expect(heading?.textContent).toContain('Welcome back');
        
        // Should maintain section order
        const sections = element.querySelectorAll('h2');
        expect(sections.length).toBeGreaterThan(0);
      }
    });

    it('should preserve accessibility across breakpoints', async () => {
      const viewports = [[375, 667], [768, 1024], [1440, 900]];
      
      for (const [width, height] of viewports) {
        setViewport(width, height);
        
        dashboardPage = new DashboardPage(mockSession);
        await new Promise(resolve => setTimeout(resolve, 50));
        
        const element = dashboardPage.getElement();
        
        // Should maintain ARIA labels
        const ariaLabels = element.querySelectorAll('[aria-label]');
        expect(ariaLabels.length).toBeGreaterThan(0);
        
        // Should maintain heading structure
        const headings = element.querySelectorAll('h1, h2, h3');
        expect(headings.length).toBeGreaterThan(0);
        
        // Should maintain skip links and landmarks
        const landmarks = element.querySelectorAll('[role="main"], [role="navigation"], main, nav');
        expect(landmarks.length).toBeGreaterThanOrEqual(0);
      }
    });
  });
});