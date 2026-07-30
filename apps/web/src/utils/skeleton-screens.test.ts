/**
 * Unit Tests: Skeleton Screens
 * 
 * Tests for skeleton screen components that provide loading state
 * placeholders for various UI contexts.
 * 
 * @vitest-environment jsdom
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  createSkeleton,
  createTextSkeleton,
  createCardSkeleton,
  createDashboardSkeleton,
  createVideoPlayerSkeleton,
  createTimelineEditorSkeleton,
  createListSkeleton,
  injectSkeletonStyles,
} from './skeleton-screens.js';

describe('Skeleton Screens', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    document.head.innerHTML = '';
  });

  describe('createSkeleton', () => {
    it('should create a skeleton element with default styles', () => {
      const el = createSkeleton();

      expect(el.tagName).toBe('DIV');
      expect(el.className).toContain('skeleton-element');
      expect(el.className).toContain('skeleton-pulse');
      expect(el.style.width).toBe('100%');
      expect(el.style.height).toBe('1em');
      expect(el.style.borderRadius).toBe('4px');
    });

    it('should accept custom dimensions', () => {
      const el = createSkeleton({ width: '200px', height: '50px' });

      expect(el.style.width).toBe('200px');
      expect(el.style.height).toBe('50px');
    });

    it('should accept custom border radius', () => {
      const el = createSkeleton({ borderRadius: '50%' });
      expect(el.style.borderRadius).toBe('50%');
    });

    it('should disable animation when animated is false', () => {
      const el = createSkeleton({ animated: false });
      expect(el.className).not.toContain('skeleton-pulse');
    });

    it('should be aria-hidden by default', () => {
      const el = createSkeleton();
      expect(el.getAttribute('aria-hidden')).toBe('true');
    });

    it('should add role and aria-label when ariaLabel is provided', () => {
      const el = createSkeleton({ ariaLabel: 'Loading content' });

      expect(el.getAttribute('aria-label')).toBe('Loading content');
      expect(el.getAttribute('role')).toBe('progressbar');
      expect(el.getAttribute('aria-hidden')).toBeNull();
    });

    it('should accept custom class name', () => {
      const el = createSkeleton({ className: 'custom-skeleton' });
      expect(el.className).toContain('custom-skeleton');
    });
  });

  describe('createTextSkeleton', () => {
    it('should create a container with specified number of lines', () => {
      const el = createTextSkeleton(4);
      const lines = el.querySelectorAll('.skeleton-text-line');

      expect(lines.length).toBe(4);
    });

    it('should default to 3 lines', () => {
      const el = createTextSkeleton();
      const lines = el.querySelectorAll('.skeleton-text-line');

      expect(lines.length).toBe(3);
    });

    it('should make the last line shorter', () => {
      const el = createTextSkeleton(3);
      const lines = el.querySelectorAll('.skeleton-text-line');
      const lastLine = lines[lines.length - 1] as HTMLElement;

      expect(lastLine.style.width).toBe('60%');
    });

    it('should have appropriate aria attributes', () => {
      const el = createTextSkeleton();

      expect(el.getAttribute('role')).toBe('progressbar');
      expect(el.getAttribute('aria-label')).toBe('Loading text content...');
    });

    it('should accept custom aria-label', () => {
      const el = createTextSkeleton(2, { ariaLabel: 'Loading description' });
      expect(el.getAttribute('aria-label')).toBe('Loading description');
    });
  });

  describe('createCardSkeleton', () => {
    it('should include thumbnail by default', () => {
      const el = createCardSkeleton();
      expect(el.querySelector('.skeleton-card-thumbnail')).not.toBeNull();
    });

    it('should skip thumbnail when showThumbnail is false', () => {
      const el = createCardSkeleton({ showThumbnail: false });
      expect(el.querySelector('.skeleton-card-thumbnail')).toBeNull();
    });

    it('should include title skeleton', () => {
      const el = createCardSkeleton();
      expect(el.querySelector('.skeleton-card-title')).not.toBeNull();
    });

    it('should have correct aria attributes', () => {
      const el = createCardSkeleton();

      expect(el.getAttribute('aria-label')).toBe('Loading content card...');
      expect(el.getAttribute('role')).toBe('progressbar');
    });

    it('should include text lines based on lines option', () => {
      const el = createCardSkeleton({ lines: 4 });
      const textLines = el.querySelectorAll('.skeleton-text-line');

      expect(textLines.length).toBe(4);
    });
  });

  describe('createDashboardSkeleton', () => {
    it('should create header with heading and button skeletons', () => {
      const el = createDashboardSkeleton();

      expect(el.querySelector('.skeleton-heading')).not.toBeNull();
      expect(el.querySelector('.skeleton-button')).not.toBeNull();
    });

    it('should create specified number of cards', () => {
      const el = createDashboardSkeleton(4);
      const cards = el.querySelectorAll('.skeleton-card');

      expect(cards.length).toBe(4);
    });

    it('should default to 6 cards', () => {
      const el = createDashboardSkeleton();
      const cards = el.querySelectorAll('.skeleton-card');

      expect(cards.length).toBe(6);
    });

    it('should have correct aria attributes', () => {
      const el = createDashboardSkeleton();

      expect(el.getAttribute('aria-label')).toBe('Loading dashboard...');
      expect(el.getAttribute('role')).toBe('progressbar');
    });

    it('should use grid layout', () => {
      const el = createDashboardSkeleton();
      expect(el.querySelector('.skeleton-grid')).not.toBeNull();
    });
  });

  describe('createVideoPlayerSkeleton', () => {
    it('should create video area with 16:9 aspect ratio', () => {
      const el = createVideoPlayerSkeleton();
      const videoArea = el.querySelector('.skeleton-video-area') as HTMLElement;

      expect(videoArea).not.toBeNull();
      expect(videoArea.style.paddingBottom).toBe('56.25%');
    });

    it('should include play button placeholder', () => {
      const el = createVideoPlayerSkeleton();
      expect(el.querySelector('.skeleton-play-button')).not.toBeNull();
    });

    it('should include controls bar', () => {
      const el = createVideoPlayerSkeleton();
      expect(el.querySelector('.skeleton-controls-bar')).not.toBeNull();
    });

    it('should have correct aria attributes', () => {
      const el = createVideoPlayerSkeleton();

      expect(el.getAttribute('aria-label')).toBe('Loading video player...');
      expect(el.getAttribute('role')).toBe('progressbar');
    });
  });

  describe('createTimelineEditorSkeleton', () => {
    it('should create preview area', () => {
      const el = createTimelineEditorSkeleton();
      expect(el.querySelector('.skeleton-editor-preview')).not.toBeNull();
    });

    it('should create timeline tracks', () => {
      const el = createTimelineEditorSkeleton();
      const tracks = el.querySelectorAll('.skeleton-track');

      expect(tracks.length).toBe(3);
    });

    it('should create editor controls', () => {
      const el = createTimelineEditorSkeleton();
      expect(el.querySelector('.skeleton-editor-controls')).not.toBeNull();
    });

    it('should have correct aria attributes', () => {
      const el = createTimelineEditorSkeleton();

      expect(el.getAttribute('aria-label')).toBe('Loading timeline editor...');
      expect(el.getAttribute('role')).toBe('progressbar');
    });
  });

  describe('createListSkeleton', () => {
    it('should create specified number of rows', () => {
      const el = createListSkeleton(3);
      const rows = el.querySelectorAll('.skeleton-list-row');

      expect(rows.length).toBe(3);
    });

    it('should default to 5 rows', () => {
      const el = createListSkeleton();
      const rows = el.querySelectorAll('.skeleton-list-row');

      expect(rows.length).toBe(5);
    });

    it('should include list content in each row', () => {
      const el = createListSkeleton(1);
      expect(el.querySelector('.skeleton-list-content')).not.toBeNull();
    });

    it('should have correct aria attributes', () => {
      const el = createListSkeleton();

      expect(el.getAttribute('aria-label')).toBe('Loading list...');
      expect(el.getAttribute('role')).toBe('progressbar');
    });
  });

  describe('injectSkeletonStyles', () => {
    it('should inject styles into document head', () => {
      injectSkeletonStyles();
      expect(document.getElementById('skeleton-styles')).not.toBeNull();
    });

    it('should not inject duplicate styles', () => {
      injectSkeletonStyles();
      injectSkeletonStyles();

      const styles = document.querySelectorAll('#skeleton-styles');
      expect(styles.length).toBe(1);
    });

    it('should include skeleton-pulse animation', () => {
      injectSkeletonStyles();
      const style = document.getElementById('skeleton-styles') as HTMLStyleElement;

      expect(style.textContent).toContain('skeleton-pulse');
      expect(style.textContent).toContain('@keyframes');
    });

    it('should include prefers-reduced-motion media query', () => {
      injectSkeletonStyles();
      const style = document.getElementById('skeleton-styles') as HTMLStyleElement;

      expect(style.textContent).toContain('prefers-reduced-motion');
    });
  });
});
