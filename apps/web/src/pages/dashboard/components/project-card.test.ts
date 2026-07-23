/**
 * Project Card Component Tests
 * 
 * Unit tests for the project card component including rendering, interaction,
 * accessibility, and responsive behavior.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ProjectCard } from './project-card.js';
import type { ProjectDto } from '@streetstudio/shared';

// Mock format-time utility
vi.mock('../../../utils/format-time.js', () => ({
  formatRelativeTime: vi.fn((timestamp: string) => 'a few minutes ago')
}));

describe('ProjectCard', () => {
  let mockProject: ProjectDto;
  let projectCard: ProjectCard;

  beforeEach(() => {
    mockProject = {
      id: 'project-123',
      name: 'Test Project',
      description: 'This is a test project description',
      thumbnailUrl: 'https://example.com/thumbnail.jpg',
      videoCount: 5,
      memberCount: 3,
      updatedAt: '2024-01-01T12:00:00Z',
    } as ProjectDto;

    // Setup DOM
    document.body.innerHTML = '<div id="test-container"></div>';
  });

  afterEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = '';
  });

  describe('Component Initialization', () => {
    it('should create project card element with correct structure', () => {
      projectCard = new ProjectCard(mockProject);
      
      const element = projectCard.getElement();
      expect(element).toBeInstanceOf(HTMLElement);
      expect(element.tagName).toBe('DIV');
      expect(element.className).toContain('group cursor-pointer');
      expect(element.getAttribute('data-project-id')).toBe('project-123');
    });

    it('should set proper accessibility attributes', () => {
      projectCard = new ProjectCard(mockProject);
      
      const element = projectCard.getElement();
      expect(element.getAttribute('role')).toBe('button');
      expect(element.getAttribute('aria-label')).toBe('Open project Test Project');
      expect(element.tabIndex).toBe(0);
    });
  });

  describe('Content Rendering', () => {
    beforeEach(() => {
      projectCard = new ProjectCard(mockProject);
    });

    it('should render project name correctly', () => {
      const element = projectCard.getElement();
      expect(element.innerHTML).toContain('Test Project');
    });

    it('should render project description when available', () => {
      const element = projectCard.getElement();
      expect(element.innerHTML).toContain('This is a test project description');
    });

    it('should render project thumbnail when available', () => {
      const element = projectCard.getElement();
      const img = element.querySelector('img');
      expect(img).toBeTruthy();
      expect(img?.src).toBe('https://example.com/thumbnail.jpg');
      expect(img?.alt).toBe('Test Project thumbnail');
      expect(img?.getAttribute('loading')).toBe('lazy');
    });

    it('should render placeholder icon when no thumbnail', () => {
      mockProject.thumbnailUrl = undefined;
      projectCard = new ProjectCard(mockProject);
      
      const element = projectCard.getElement();
      const img = element.querySelector('img');
      const svg = element.querySelector('svg');
      
      expect(img).toBeNull();
      expect(svg).toBeTruthy();
    });

    it('should display video count with proper icon', () => {
      const element = projectCard.getElement();
      expect(element.innerHTML).toContain('5 videos');
    });

    it('should display member count with proper icon', () => {
      const element = projectCard.getElement();
      expect(element.innerHTML).toContain('3 members');
    });

    it('should display relative timestamp', () => {
      const element = projectCard.getElement();
      expect(element.innerHTML).toContain('Updated a few minutes ago');
    });
  });

  describe('Empty States and Edge Cases', () => {
    it('should handle project with no description', () => {
      mockProject.description = undefined;
      projectCard = new ProjectCard(mockProject);
      
      const element = projectCard.getElement();
      expect(element.innerHTML).not.toContain('<p class="text-xs text-gray-600');
    });

    it('should handle zero video count', () => {
      mockProject.videoCount = 0;
      projectCard = new ProjectCard(mockProject);
      
      const element = projectCard.getElement();
      expect(element.innerHTML).toContain('0 videos');
    });

    it('should handle undefined video count', () => {
      mockProject.videoCount = undefined;
      projectCard = new ProjectCard(mockProject);
      
      const element = projectCard.getElement();
      expect(element.innerHTML).toContain('0 videos');
    });

    it('should handle zero member count', () => {
      mockProject.memberCount = 0;
      projectCard = new ProjectCard(mockProject);
      
      const element = projectCard.getElement();
      expect(element.innerHTML).toContain('0 members');
    });

    it('should handle undefined member count', () => {
      mockProject.memberCount = undefined;
      projectCard = new ProjectCard(mockProject);
      
      const element = projectCard.getElement();
      expect(element.innerHTML).toContain('0 members');
    });
  });

  describe('HTML Escaping and Security', () => {
    it('should escape HTML in project name', () => {
      mockProject.name = '<script>alert("xss")</script>';
      projectCard = new ProjectCard(mockProject);
      
      const element = projectCard.getElement();
      expect(element.innerHTML).toContain('&lt;script&gt;alert("xss")&lt;/script&gt;');
      expect(element.innerHTML).not.toContain('<script>alert("xss")</script>');
    });

    it('should escape HTML in project description', () => {
      mockProject.description = '<img src="x" onerror="alert(1)">';
      projectCard = new ProjectCard(mockProject);
      
      const element = projectCard.getElement();
      expect(element.innerHTML).toContain('&lt;img src="x" onerror="alert(1)"&gt;');
      expect(element.innerHTML).not.toContain('<img src="x" onerror="alert(1)">');
    });
  });

  describe('User Interactions', () => {
    beforeEach(() => {
      projectCard = new ProjectCard(mockProject);
      // Mock window.location.href
      Object.defineProperty(window, 'location', {
        writable: true,
        value: { href: '' }
      });
    });

    it('should navigate to project page on click', () => {
      const element = projectCard.getElement();
      element.click();
      
      expect(window.location.href).toBe('/projects/project-123');
    });

    it('should navigate to project page on Enter key', () => {
      const element = projectCard.getElement();
      const enterEvent = new KeyboardEvent('keydown', { key: 'Enter' });
      
      element.dispatchEvent(enterEvent);
      
      expect(window.location.href).toBe('/projects/project-123');
    });

    it('should navigate to project page on Space key', () => {
      const element = projectCard.getElement();
      const spaceEvent = new KeyboardEvent('keydown', { key: ' ' });
      
      element.dispatchEvent(spaceEvent);
      
      expect(window.location.href).toBe('/projects/project-123');
    });

    it('should not navigate on other keys', () => {
      const element = projectCard.getElement();
      const tabEvent = new KeyboardEvent('keydown', { key: 'Tab' });
      
      element.dispatchEvent(tabEvent);
      
      expect(window.location.href).toBe('');
    });

    it('should prevent default behavior on Space key', () => {
      const element = projectCard.getElement();
      const spaceEvent = new KeyboardEvent('keydown', { key: ' ' });
      const preventDefaultSpy = vi.spyOn(spaceEvent, 'preventDefault');
      
      element.dispatchEvent(spaceEvent);
      
      expect(preventDefaultSpy).toHaveBeenCalled();
    });
  });

  describe('Responsive Layout', () => {
    beforeEach(() => {
      projectCard = new ProjectCard(mockProject);
    });

    it('should have responsive classes for thumbnail', () => {
      const element = projectCard.getElement();
      const thumbnailDiv = element.querySelector('.w-full.h-32');
      expect(thumbnailDiv).toBeTruthy();
      expect(thumbnailDiv?.className).toContain('rounded-lg mb-3 overflow-hidden');
    });

    it('should have responsive text sizing', () => {
      const element = projectCard.getElement();
      
      const title = element.querySelector('h3');
      expect(title?.className).toContain('text-sm font-medium');
      expect(title?.className).toContain('truncate');
      
      const description = element.querySelector('p');
      expect(description?.className).toContain('text-xs');
      expect(description?.className).toContain('line-clamp-2');
      
      const metadata = element.querySelectorAll('.text-xs');
      expect(metadata.length).toBeGreaterThan(1);
    });

    it('should have hover states for interactivity', () => {
      const element = projectCard.getElement();
      const cardDiv = element.querySelector('.group-hover\\:bg-gray-100');
      expect(cardDiv).toBeTruthy();
    });
  });

  describe('Dark Mode Support', () => {
    beforeEach(() => {
      projectCard = new ProjectCard(mockProject);
    });

    it('should have dark mode classes', () => {
      const element = projectCard.getElement();
      
      expect(element.innerHTML).toContain('dark:bg-gray-700');
      expect(element.innerHTML).toContain('dark:group-hover:bg-gray-600');
      expect(element.innerHTML).toContain('dark:text-white');
      expect(element.innerHTML).toContain('dark:text-gray-400');
      expect(element.innerHTML).toContain('dark:bg-gray-600');
    });
  });

  describe('Performance and Memory', () => {
    it('should create minimal DOM structure', () => {
      projectCard = new ProjectCard(mockProject);
      
      const element = projectCard.getElement();
      const childCount = element.querySelectorAll('*').length;
      
      // Should not create excessive DOM nodes
      expect(childCount).toBeLessThan(20);
    });

    it('should reuse DOM element on multiple calls', () => {
      projectCard = new ProjectCard(mockProject);
      
      const element1 = projectCard.getElement();
      const element2 = projectCard.getElement();
      
      expect(element1).toBe(element2);
    });
  });

  describe('Accessibility Compliance', () => {
    beforeEach(() => {
      projectCard = new ProjectCard(mockProject);
    });

    it('should support keyboard navigation', () => {
      const element = projectCard.getElement();
      expect(element.tabIndex).toBe(0);
    });

    it('should have proper ARIA role', () => {
      const element = projectCard.getElement();
      expect(element.getAttribute('role')).toBe('button');
    });

    it('should have descriptive ARIA label', () => {
      const element = projectCard.getElement();
      expect(element.getAttribute('aria-label')).toContain('Test Project');
    });

    it('should have proper heading hierarchy', () => {
      const element = projectCard.getElement();
      const heading = element.querySelector('h3');
      expect(heading).toBeTruthy();
    });

    it('should have alt text for images', () => {
      const element = projectCard.getElement();
      const img = element.querySelector('img');
      expect(img?.alt).toBe('Test Project thumbnail');
    });

    it('should hide decorative icons from screen readers', () => {
      const element = projectCard.getElement();
      const svgs = element.querySelectorAll('svg');
      
      svgs.forEach(svg => {
        expect(svg.getAttribute('aria-hidden')).toBe('true');
      });
    });
  });
});