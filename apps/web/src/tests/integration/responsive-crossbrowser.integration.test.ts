/**
 * Cross-Browser Responsive Behavior Integration Tests
 *
 * Tests responsive breakpoint behavior, touch vs mouse interactions,
 * and viewport size adaptations across the application modules.
 *
 * Requirements: 10.1
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../../app/client-logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
  },
}));

import {
  BREAKPOINTS,
  MEDIA_QUERIES,
  MIN_TOUCH_TARGET,
  getCurrentBreakpoint,
  isBreakpointActive,
  isTouchDevice,
  BreakpointObserver,
  setupResponsiveCSS,
} from '../../styles/responsive.js';

describe('Cross-Browser Responsive Integration', () => {
  let originalInnerWidth: number;

  beforeEach(() => {
    originalInnerWidth = window.innerWidth;
    document.body.innerHTML = '';
    document.head.innerHTML = '';
  });

  afterEach(() => {
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: originalInnerWidth,
    });
  });

  function setViewportWidth(width: number) {
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: width,
    });
  }

  describe('Breakpoint System Integration', () => {
    it('should correctly identify mobile breakpoint at 320px', () => {
      setViewportWidth(320);
      expect(getCurrentBreakpoint()).toBe('mobile');
      expect(isBreakpointActive('mobile')).toBe(true);
      expect(isBreakpointActive('tablet')).toBe(false);
      expect(isBreakpointActive('desktop')).toBe(false);
    });

    it('should correctly identify mobile breakpoint at 639px', () => {
      setViewportWidth(639);
      expect(getCurrentBreakpoint()).toBe('mobile');
    });

    it('should correctly identify tablet breakpoint at 640px', () => {
      setViewportWidth(640);
      expect(getCurrentBreakpoint()).toBe('tablet');
      expect(isBreakpointActive('tablet')).toBe(true);
      expect(isBreakpointActive('desktop')).toBe(false);
    });

    it('should correctly identify tablet breakpoint at 1023px', () => {
      setViewportWidth(1023);
      expect(getCurrentBreakpoint()).toBe('tablet');
    });

    it('should correctly identify desktop breakpoint at 1024px', () => {
      setViewportWidth(1024);
      expect(getCurrentBreakpoint()).toBe('desktop');
      expect(isBreakpointActive('desktop')).toBe(true);
    });

    it('should correctly identify desktop breakpoint at 1920px', () => {
      setViewportWidth(1920);
      expect(getCurrentBreakpoint()).toBe('desktop');
    });

    it('should handle all widths from 320px to desktop without crashing', () => {
      const testWidths = [320, 375, 414, 540, 639, 640, 768, 800, 1023, 1024, 1280, 1440, 1920];

      for (const width of testWidths) {
        setViewportWidth(width);
        const breakpoint = getCurrentBreakpoint();
        expect(['mobile', 'tablet', 'desktop']).toContain(breakpoint);
      }
    });
  });

  describe('BreakpointObserver Integration', () => {
    let observer: BreakpointObserver;

    beforeEach(() => {
      setViewportWidth(1024);
      observer = new BreakpointObserver();
    });

    afterEach(() => {
      observer.destroy();
    });

    it('should notify listeners when breakpoint changes on resize', async () => {
      const listener = vi.fn();
      observer.onChange(listener);
      observer.start();

      // Simulate resize to mobile
      setViewportWidth(400);
      window.dispatchEvent(new Event('resize'));

      // Wait for debounce
      await new Promise(resolve => setTimeout(resolve, 200));

      expect(listener).toHaveBeenCalledWith('mobile', 400);
    });

    it('should not notify when width changes within same breakpoint', async () => {
      setViewportWidth(1024);
      observer = new BreakpointObserver();
      const listener = vi.fn();
      observer.onChange(listener);
      observer.start();

      // Resize but stay in desktop breakpoint
      setViewportWidth(1280);
      window.dispatchEvent(new Event('resize'));

      await new Promise(resolve => setTimeout(resolve, 200));

      expect(listener).not.toHaveBeenCalled();
    });

    it('should clean up properly when destroyed', () => {
      const listener = vi.fn();
      observer.onChange(listener);
      observer.start();
      observer.destroy();

      setViewportWidth(400);
      window.dispatchEvent(new Event('resize'));

      // Listener should not be called after destroy
      expect(listener).not.toHaveBeenCalled();
    });

    it('should support multiple listeners with unsubscribe', async () => {
      const listener1 = vi.fn();
      const listener2 = vi.fn();

      const unsub1 = observer.onChange(listener1);
      observer.onChange(listener2);
      observer.start();

      // Unsubscribe listener1
      unsub1();

      // Trigger breakpoint change
      setViewportWidth(400);
      window.dispatchEvent(new Event('resize'));

      await new Promise(resolve => setTimeout(resolve, 200));

      expect(listener1).not.toHaveBeenCalled();
      expect(listener2).toHaveBeenCalled();
    });
  });

  describe('Touch vs Mouse Interaction Detection', () => {
    it('should detect touch device based on pointer media query', () => {
      // Default mock returns false (non-touch)
      expect(isTouchDevice()).toBe(false);
    });

    it('should correctly reference touch media query', () => {
      expect(MEDIA_QUERIES.touch).toBe('(pointer: coarse)');
      expect(MEDIA_QUERIES.fine).toBe('(pointer: fine)');
    });

    it('should define minimum touch target size at 44px', () => {
      expect(MIN_TOUCH_TARGET).toBe(44);
    });
  });

  describe('Responsive CSS Injection Integration', () => {
    it('should inject responsive styles into document head', () => {
      setupResponsiveCSS();

      const styleElement = document.getElementById('streetstudio-responsive-styles');
      expect(styleElement).not.toBeNull();
      expect(styleElement?.tagName.toLowerCase()).toBe('style');
    });

    it('should include mobile-first responsive grid styles', () => {
      setupResponsiveCSS();

      const styleElement = document.getElementById('streetstudio-responsive-styles');
      const content = styleElement?.textContent || '';

      expect(content).toContain('.responsive-grid');
      expect(content).toContain('grid-template-columns: 1fr');
      expect(content).toContain('repeat(2, 1fr)');
      expect(content).toContain('repeat(3, 1fr)');
    });

    it('should include touch-friendly control styles with 44px minimum', () => {
      setupResponsiveCSS();

      const styleElement = document.getElementById('streetstudio-responsive-styles');
      const content = styleElement?.textContent || '';

      expect(content).toContain('.touch-target');
      expect(content).toContain(`min-width: ${MIN_TOUCH_TARGET}px`);
      expect(content).toContain(`min-height: ${MIN_TOUCH_TARGET}px`);
    });

    it('should include responsive navigation styles', () => {
      setupResponsiveCSS();

      const styleElement = document.getElementById('streetstudio-responsive-styles');
      const content = styleElement?.textContent || '';

      expect(content).toContain('.responsive-nav');
      expect(content).toContain('.responsive-nav--mobile');
      expect(content).toContain('.responsive-nav--sidebar');
    });

    it('should not duplicate styles on repeated injection', () => {
      setupResponsiveCSS();
      setupResponsiveCSS();
      setupResponsiveCSS();

      const styleElements = document.querySelectorAll('#streetstudio-responsive-styles');
      expect(styleElements.length).toBe(1);
    });

    it('should include reduced motion media query for accessibility', () => {
      setupResponsiveCSS();

      expect(MEDIA_QUERIES.reducedMotion).toBe('(prefers-reduced-motion: reduce)');
    });
  });

  describe('Responsive Layout Behavior Across Viewports', () => {
    it('should define correct breakpoint thresholds', () => {
      expect(BREAKPOINTS.mobile).toBe(320);
      expect(BREAKPOINTS.tablet).toBe(640);
      expect(BREAKPOINTS.desktop).toBe(1024);
    });

    it('should provide all necessary media query helpers', () => {
      expect(MEDIA_QUERIES.mobile).toContain('320px');
      expect(MEDIA_QUERIES.tablet).toContain('640px');
      expect(MEDIA_QUERIES.desktop).toContain('1024px');
      expect(MEDIA_QUERIES.mobileOnly).toContain('639px');
      expect(MEDIA_QUERIES.tabletUp).toContain('640px');
      expect(MEDIA_QUERIES.desktopUp).toContain('1024px');
    });

    it('should correctly classify edge-case viewport widths', () => {
      // Test exact boundary conditions
      setViewportWidth(BREAKPOINTS.tablet - 1); // 639
      expect(getCurrentBreakpoint()).toBe('mobile');

      setViewportWidth(BREAKPOINTS.tablet); // 640
      expect(getCurrentBreakpoint()).toBe('tablet');

      setViewportWidth(BREAKPOINTS.desktop - 1); // 1023
      expect(getCurrentBreakpoint()).toBe('tablet');

      setViewportWidth(BREAKPOINTS.desktop); // 1024
      expect(getCurrentBreakpoint()).toBe('desktop');
    });
  });
});
