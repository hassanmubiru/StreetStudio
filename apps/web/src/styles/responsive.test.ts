/**
 * Unit tests for the Responsive Design System
 * 
 * Tests breakpoint logic, media query generation, BreakpointObserver,
 * and CSS injection.
 * 
 * Requirements: 10.1, 10.2, 10.3
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  BREAKPOINTS,
  MEDIA_QUERIES,
  MIN_TOUCH_TARGET,
  getCurrentBreakpoint,
  isBreakpointActive,
  isTouchDevice,
  BreakpointObserver,
  setupResponsiveCSS,
  ResponsiveCSS,
} from './responsive.js';

describe('Responsive Design System', () => {
  describe('BREAKPOINTS', () => {
    it('defines mobile breakpoint at 320px', () => {
      expect(BREAKPOINTS.mobile).toBe(320);
    });

    it('defines tablet breakpoint at 640px', () => {
      expect(BREAKPOINTS.tablet).toBe(640);
    });

    it('defines desktop breakpoint at 1024px', () => {
      expect(BREAKPOINTS.desktop).toBe(1024);
    });

    it('breakpoints are ordered ascending', () => {
      expect(BREAKPOINTS.mobile).toBeLessThan(BREAKPOINTS.tablet);
      expect(BREAKPOINTS.tablet).toBeLessThan(BREAKPOINTS.desktop);
    });
  });

  describe('MIN_TOUCH_TARGET', () => {
    it('is set to 44px', () => {
      expect(MIN_TOUCH_TARGET).toBe(44);
    });
  });

  describe('MEDIA_QUERIES', () => {
    it('generates correct mobile query', () => {
      expect(MEDIA_QUERIES.mobile).toContain('min-width: 320px');
      expect(MEDIA_QUERIES.mobile).toContain('max-width: 639px');
    });

    it('generates correct tablet query', () => {
      expect(MEDIA_QUERIES.tablet).toContain('min-width: 640px');
      expect(MEDIA_QUERIES.tablet).toContain('max-width: 1023px');
    });

    it('generates correct desktop query', () => {
      expect(MEDIA_QUERIES.desktop).toContain('min-width: 1024px');
    });

    it('generates mobileOnly query for below tablet', () => {
      expect(MEDIA_QUERIES.mobileOnly).toContain('max-width: 639px');
    });

    it('generates tabletUp query from 640px', () => {
      expect(MEDIA_QUERIES.tabletUp).toContain('min-width: 640px');
    });

    it('generates desktopUp query from 1024px', () => {
      expect(MEDIA_QUERIES.desktopUp).toContain('min-width: 1024px');
    });

    it('includes touch media query', () => {
      expect(MEDIA_QUERIES.touch).toBe('(pointer: coarse)');
    });

    it('includes fine pointer media query', () => {
      expect(MEDIA_QUERIES.fine).toBe('(pointer: fine)');
    });

    it('includes reduced motion media query', () => {
      expect(MEDIA_QUERIES.reducedMotion).toBe('(prefers-reduced-motion: reduce)');
    });
  });

  describe('getCurrentBreakpoint', () => {
    it('returns mobile for widths below 640px', () => {
      Object.defineProperty(window, 'innerWidth', { value: 375, writable: true });
      expect(getCurrentBreakpoint()).toBe('mobile');
    });

    it('returns mobile for minimum 320px', () => {
      Object.defineProperty(window, 'innerWidth', { value: 320, writable: true });
      expect(getCurrentBreakpoint()).toBe('mobile');
    });

    it('returns tablet for widths 640px to 1023px', () => {
      Object.defineProperty(window, 'innerWidth', { value: 768, writable: true });
      expect(getCurrentBreakpoint()).toBe('tablet');
    });

    it('returns tablet at exactly 640px', () => {
      Object.defineProperty(window, 'innerWidth', { value: 640, writable: true });
      expect(getCurrentBreakpoint()).toBe('tablet');
    });

    it('returns desktop for widths >= 1024px', () => {
      Object.defineProperty(window, 'innerWidth', { value: 1440, writable: true });
      expect(getCurrentBreakpoint()).toBe('desktop');
    });

    it('returns desktop at exactly 1024px', () => {
      Object.defineProperty(window, 'innerWidth', { value: 1024, writable: true });
      expect(getCurrentBreakpoint()).toBe('desktop');
    });
  });

  describe('isBreakpointActive', () => {
    it('mobile is always active for any width >= 320', () => {
      Object.defineProperty(window, 'innerWidth', { value: 500, writable: true });
      expect(isBreakpointActive('mobile')).toBe(true);
    });

    it('tablet is active for width >= 640', () => {
      Object.defineProperty(window, 'innerWidth', { value: 800, writable: true });
      expect(isBreakpointActive('tablet')).toBe(true);
    });

    it('tablet is not active for width < 640', () => {
      Object.defineProperty(window, 'innerWidth', { value: 500, writable: true });
      expect(isBreakpointActive('tablet')).toBe(false);
    });

    it('desktop is active for width >= 1024', () => {
      Object.defineProperty(window, 'innerWidth', { value: 1024, writable: true });
      expect(isBreakpointActive('desktop')).toBe(true);
    });

    it('desktop is not active for width < 1024', () => {
      Object.defineProperty(window, 'innerWidth', { value: 800, writable: true });
      expect(isBreakpointActive('desktop')).toBe(false);
    });
  });

  describe('isTouchDevice', () => {
    it('returns false when matchMedia returns false', () => {
      (window.matchMedia as any).mockReturnValue({ matches: false });
      expect(isTouchDevice()).toBe(false);
    });

    it('returns true when matchMedia detects coarse pointer', () => {
      (window.matchMedia as any).mockReturnValue({ matches: true });
      expect(isTouchDevice()).toBe(true);
    });
  });

  describe('BreakpointObserver', () => {
    let observer: BreakpointObserver;

    beforeEach(() => {
      Object.defineProperty(window, 'innerWidth', { value: 1024, writable: true });
      observer = new BreakpointObserver();
    });

    afterEach(() => {
      observer.destroy();
    });

    it('initializes with the current breakpoint', () => {
      expect(observer.getBreakpoint()).toBe('desktop');
    });

    it('notifies listeners when breakpoint changes', async () => {
      const listener = vi.fn();
      observer.onChange(listener);
      observer.start();

      // Simulate resize to mobile
      Object.defineProperty(window, 'innerWidth', { value: 375, writable: true });
      window.dispatchEvent(new Event('resize'));

      // Wait for debounce
      await new Promise(resolve => setTimeout(resolve, 200));

      expect(listener).toHaveBeenCalledWith('mobile', 375);
    });

    it('does not notify when width changes within same breakpoint', async () => {
      const listener = vi.fn();
      observer.onChange(listener);
      observer.start();

      // Resize within desktop range
      Object.defineProperty(window, 'innerWidth', { value: 1200, writable: true });
      window.dispatchEvent(new Event('resize'));

      await new Promise(resolve => setTimeout(resolve, 200));

      expect(listener).not.toHaveBeenCalled();
    });

    it('unsubscribe function removes listener', async () => {
      const listener = vi.fn();
      const unsub = observer.onChange(listener);
      observer.start();

      unsub();

      Object.defineProperty(window, 'innerWidth', { value: 375, writable: true });
      window.dispatchEvent(new Event('resize'));

      await new Promise(resolve => setTimeout(resolve, 200));

      expect(listener).not.toHaveBeenCalled();
    });

    it('stop() removes the resize listener', async () => {
      const listener = vi.fn();
      observer.onChange(listener);
      observer.start();
      observer.stop();

      Object.defineProperty(window, 'innerWidth', { value: 375, writable: true });
      window.dispatchEvent(new Event('resize'));

      await new Promise(resolve => setTimeout(resolve, 200));

      expect(listener).not.toHaveBeenCalled();
    });

    it('destroy() clears all listeners', () => {
      const listener = vi.fn();
      observer.onChange(listener);
      observer.destroy();

      // Verify observer is cleaned up (no errors)
      expect(observer.getBreakpoint()).toBe('desktop');
    });
  });

  describe('setupResponsiveCSS', () => {
    it('injects a style element into the document head', () => {
      setupResponsiveCSS();
      const styleEl = document.getElementById('streetstudio-responsive-styles');
      expect(styleEl).not.toBeNull();
      expect(styleEl?.tagName).toBe('STYLE');
    });

    it('does not create duplicate style elements', () => {
      setupResponsiveCSS();
      setupResponsiveCSS();
      const elements = document.querySelectorAll('#streetstudio-responsive-styles');
      expect(elements.length).toBe(1);
    });

    it('style element contains responsive CSS content', () => {
      setupResponsiveCSS();
      const styleEl = document.getElementById('streetstudio-responsive-styles');
      expect(styleEl?.textContent).toContain('.touch-target');
      expect(styleEl?.textContent).toContain('.responsive-container');
      expect(styleEl?.textContent).toContain('.responsive-grid');
    });
  });

  describe('ResponsiveCSS content', () => {
    it('includes touch target class with 44px minimum', () => {
      expect(ResponsiveCSS).toContain('min-width: 44px');
      expect(ResponsiveCSS).toContain('min-height: 44px');
    });

    it('includes responsive container class', () => {
      expect(ResponsiveCSS).toContain('.responsive-container');
    });

    it('includes responsive grid class', () => {
      expect(ResponsiveCSS).toContain('.responsive-grid');
    });

    it('includes responsive navigation classes', () => {
      expect(ResponsiveCSS).toContain('.responsive-nav--mobile');
      expect(ResponsiveCSS).toContain('.responsive-nav--sidebar');
    });

    it('includes responsive breadcrumbs classes', () => {
      expect(ResponsiveCSS).toContain('.responsive-breadcrumbs');
      expect(ResponsiveCSS).toContain('.responsive-breadcrumbs__item--current');
      expect(ResponsiveCSS).toContain('.responsive-breadcrumbs__item--collapsed');
    });

    it('includes responsive layout classes', () => {
      expect(ResponsiveCSS).toContain('.responsive-layout');
      expect(ResponsiveCSS).toContain('.responsive-layout__main');
    });

    it('includes visibility utilities', () => {
      expect(ResponsiveCSS).toContain('.hide-mobile');
      expect(ResponsiveCSS).toContain('.show-mobile');
      expect(ResponsiveCSS).toContain('.hide-desktop');
      expect(ResponsiveCSS).toContain('.show-desktop');
    });

    it('targets coarse pointer for touch device styles', () => {
      expect(ResponsiveCSS).toContain('pointer: coarse');
    });

    it('sets font-size 16px on inputs for touch to prevent iOS zoom', () => {
      expect(ResponsiveCSS).toContain('font-size: 16px');
    });
  });
});
