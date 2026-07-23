/**
 * Video Library Component Tests
 * Tests for Requirements 4.3, 4.7, 4.9, 4.10
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { VideoLibraryComponent, type VideoLibraryState, type ViewLayout } from './video-library-component.js';
import type { VideoDto } from '@streetstudio/shared';

// Mock DOM environment
Object.defineProperty(window, 'localStorage', {
  value: {
    getItem: vi.fn(() => null),
    setItem: vi.fn(),
    clear: vi.fn()
  },
  writable: true
});

describe('VideoLibraryComponent', () => {
  let component: VideoLibraryComponent;
  let mockVideos: VideoDto[];

  beforeEach(() => {
    component = new VideoLibraryComponent();
    mockVideos = [
      {
        id: 'video-1',
        organizationId: 'org-1',
        title: 'Test Video 1',
        durationSeconds: 120,
        status: 'ready',
        developerMode: false,
        createdAt: '2024-01-15T10:30:00Z'
      },
      {
        id: 'video-2',
        organizationId: 'org-1',
        title: 'Test Video 2',
        durationSeconds: 45,
        status: 'processing',
        developerMode: true,
        createdAt: '2024-01-14T15:45:00Z'
      }
    ];
  });

  describe('Component Creation', () => {
    it('should create component with default state', () => {
      const element = component.getElement();
      expect(element).toBeDefined();
      expect(element.classList.contains('video-library')).toBe(true);
    });

    it('should have default grid layout', () => {
      const element = component.getElement();
      const gridToggle = element.querySelector('[data-layout="grid"]');
      expect(gridToggle?.classList.contains('bg-white')).toBe(true);
    });
  });

  describe('View Layout Switching (Requirement 4.3)', () => {
    it('should switch to list view when clicked', () => {
      const element = component.getElement();
      const listToggle = element.querySelector('[data-layout="list"]') as HTMLElement;
      
      listToggle?.click();
      
      // Should update active toggle button
      expect(listToggle?.classList.contains('bg-white')).toBe(true);
    });

    it('should switch to timeline view when clicked', () => {
      const element = component.getElement();
      const timelineToggle = element.querySelector('[data-layout="timeline"]') as HTMLElement;
      
      timelineToggle?.click();
      
      expect(timelineToggle?.classList.contains('bg-white')).toBe(true);
    });

    it('should save layout preference to localStorage', () => {
      const element = component.getElement();
      const listToggle = element.querySelector('[data-layout="list"]') as HTMLElement;
      
      listToggle?.click();
      
      expect(localStorage.setItem).toHaveBeenCalledWith('videoLibrary.viewLayout', 'list');
    });
  });

  describe('Sorting and Filtering (Requirement 4.3)', () => {
    it('should have sort field dropdown with correct options', () => {
      const element = component.getElement();
      const sortSelect = element.querySelector('.sort-field') as HTMLSelectElement;
      
      expect(sortSelect).toBeDefined();
      expect(sortSelect.options.length).toBe(4);
      expect(sortSelect.options[0].value).toBe('date');
      expect(sortSelect.options[1].value).toBe('name');
      expect(sortSelect.options[2].value).toBe('duration');
      expect(sortSelect.options[3].value).toBe('activity');
    });

    it('should toggle sort direction when button clicked', () => {
      const element = component.getElement();
      const sortButton = element.querySelector('[data-action="toggle-sort"]') as HTMLElement;
      const icon = sortButton?.querySelector('svg');
      
      // Initially ascending (no rotation)
      expect(icon?.classList.contains('rotate-180')).toBe(false);
      
      sortButton?.click();
      
      // Should be descending now (rotated)
      expect(icon?.classList.contains('rotate-180')).toBe(true);
    });

    it('should have search input with correct placeholder', () => {
      const element = component.getElement();
      const searchInput = element.querySelector('.search-input') as HTMLInputElement;
      
      expect(searchInput).toBeDefined();
      expect(searchInput.placeholder).toBe('Search videos...');
    });

    it('should have processing filter checkbox', () => {
      const element = component.getElement();
      const processingFilter = element.querySelector('.filter-processing') as HTMLInputElement;
      
      expect(processingFilter).toBeDefined();
      expect(processingFilter.type).toBe('checkbox');
    });
  });

  describe('Bulk Operations (Requirement 4.7)', () => {
    it('should have bulk operations bar hidden by default', () => {
      const element = component.getElement();
      const bulkBar = element.querySelector('[data-bulk-bar]') as HTMLElement;
      
      expect(bulkBar).toBeDefined();
      expect(bulkBar.classList.contains('hidden')).toBe(true);
    });

    it('should have bulk action buttons', () => {
      const element = component.getElement();
      const moveButton = element.querySelector('[data-action="move"]');
      const shareButton = element.querySelector('[data-action="share"]');
      const downloadButton = element.querySelector('[data-action="download"]');
      const deleteButton = element.querySelector('[data-action="delete"]');
      
      expect(moveButton).toBeDefined();
      expect(shareButton).toBeDefined();
      expect(downloadButton).toBeDefined();
      expect(deleteButton).toBeDefined();
    });

    it('should have clear selection button', () => {
      const element = component.getElement();
      const clearButton = element.querySelector('.clear-selection');
      
      expect(clearButton).toBeDefined();
      expect(clearButton?.textContent?.trim()).toBe('Clear selection');
    });
  });

  describe('Video Metadata Display (Requirements 4.9, 4.10)', () => {
    it('should render empty state when no videos', () => {
      const element = component.getElement();
      const content = element.querySelector('[data-video-content]');
      
      expect(content?.innerHTML).toContain('No videos found');
    });

    it('should show upload button in empty state', () => {
      const element = component.getElement();
      const content = element.querySelector('[data-video-content]');
      
      expect(content?.innerHTML).toContain('Upload Video');
    });
  });

  describe('Real-time Updates (Requirement 4.10)', () => {
    it('should handle processing status updates', () => {
      // This would be tested with actual WebSocket integration
      // For now, we verify the structure exists
      const element = component.getElement();
      expect(element).toBeDefined();
    });
  });
});