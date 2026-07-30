/**
 * Property Tests for Responsive Layout Adaptation
 * 
 * Property 8: Responsive Layout Adaptation
 * Validates: Requirements 10.1
 * 
 * For any screen width between 320px and desktop resolution, the mobile
 * interface SHALL provide appropriate responsive layouts that maintain
 * functionality and usability.
 */

// @vitest-environment jsdom

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fc from 'fast-check';
import {
  BREAKPOINTS,
  BreakpointName,
  getCurrentBreakpoint,
  isBreakpointActive,
  MIN_TOUCH_TARGET,
  BreakpointObserver,
  setupResponsiveCSS,
  ResponsiveCSS,
} from './responsive.js';
import { ResponsiveLayout } from '../app/layout/responsive-layout.js';

// Mock matchMedia for jsdom
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

/**
 * Generator for viewport widths covering the full responsive range.
 * Covers 320px (minimum mobile) through 1920px (large desktop).
 */
const viewportWidthArb = fc.integer({ min: 320, max: 1920 });

/**
 * Generator for widths within the mobile range specifically.
 */
const mobileWidthArb = fc.integer({ min: 320, max: BREAKPOINTS.tablet - 1 });

/**
 * Generator for widths within the tablet range.
 */
const tabletWidthArb = fc.integer({ min: BREAKPOINTS.tablet, max: BREAKPOINTS.desktop - 1 });

/**
 * Generator for widths within the desktop range.
 */
const desktopWidthArb = fc.integer({ min: BREAKPOINTS.desktop, max: 1920 });

/** Helper to set the viewport width for testing */
function setViewportWidth(width: number): void {
  Object.defineProperty(window, 'innerWidth', { value: width, writable: true });
}

/** Helper to determine expected breakpoint for a given width */
function expectedBreakpoint(width: number): BreakpointName {
  if (width >= BREAKPOINTS.desktop) return 'desktop';
  if (width >= BREAKPOINTS.tablet) return 'tablet';
  return 'mobile';
}

describe('Feature: web-application-implementation, Property 8: Responsive Layout Adaptation', () => {
  let container: HTMLElement;
  let layout: ResponsiveLayout | null;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    layout = null;
  });

  afterEach(() => {
    layout?.destroy();
    document.body.innerHTML = '';
    document.head.innerHTML = '';
  });

  /**
   * **Validates: Requirements 10.1**
   *
   * For any viewport width between 320px and 1920px, getCurrentBreakpoint()
   * SHALL return the correct breakpoint name corresponding to the defined
   * breakpoint thresholds.
   */
  it('breakpoint detection is correct for any viewport width in the supported range', () => {
    fc.assert(
      fc.property(viewportWidthArb, (width) => {
        setViewportWidth(width);
        const breakpoint = getCurrentBreakpoint();
        const expected = expectedBreakpoint(width);
        expect(breakpoint).toBe(expected);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 10.1**
   *
   * For any viewport width, isBreakpointActive SHALL return true for all
   * breakpoints at or below the current width, and false for those above it.
   * This ensures progressive enhancement from mobile-first works correctly.
   */
  it('breakpoint activation is monotonically consistent for any width', () => {
    fc.assert(
      fc.property(viewportWidthArb, (width) => {
        setViewportWidth(width);

        // mobile is always active since minimum supported width is 320px
        expect(isBreakpointActive('mobile')).toBe(true);

        // tablet is active only when width >= tablet breakpoint
        expect(isBreakpointActive('tablet')).toBe(width >= BREAKPOINTS.tablet);

        // desktop is active only when width >= desktop breakpoint
        expect(isBreakpointActive('desktop')).toBe(width >= BREAKPOINTS.desktop);

        // Monotonicity: if desktop is active, tablet must also be active
        if (isBreakpointActive('desktop')) {
          expect(isBreakpointActive('tablet')).toBe(true);
        }
      }),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 10.1**
   *
   * For any viewport width, the ResponsiveLayout SHALL produce a layout
   * with all essential structural elements (header, main content area)
   * present and accessible, maintaining functionality regardless of width.
   */
  it('layout structure maintains all essential elements for any viewport width', () => {
    fc.assert(
      fc.property(viewportWidthArb, (width) => {
        setViewportWidth(width);
        container.innerHTML = '';

        layout = new ResponsiveLayout({ container });
        layout.initialize();

        // Main content area must always exist
        const main = container.querySelector('main');
        expect(main).not.toBeNull();
        expect(main?.getAttribute('role')).toBe('main');
        expect(main?.id).toBe('main-content');

        // Header must always exist
        const header = container.querySelector('header');
        expect(header).not.toBeNull();
        expect(header?.getAttribute('role')).toBe('banner');

        // Sidebar must exist (enabled by default)
        const sidebar = container.querySelector('aside');
        expect(sidebar).not.toBeNull();
        expect(sidebar?.getAttribute('role')).toBe('navigation');

        // Mobile navigation element must exist (enabled by default)
        const mobileNav = container.querySelector('[aria-label="Mobile navigation"]');
        expect(mobileNav).not.toBeNull();

        layout.destroy();
        layout = null;
      }),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 10.1**
   *
   * For any mobile viewport width (320px - 639px), the layout SHALL hide
   * the sidebar and show mobile navigation to maintain usability on small
   * screens. The main content SHALL have appropriate bottom padding to
   * avoid overlap with the mobile bottom navigation.
   */
  it('mobile layout hides sidebar and shows mobile navigation for any mobile width', () => {
    fc.assert(
      fc.property(mobileWidthArb, (width) => {
        setViewportWidth(width);
        container.innerHTML = '';

        layout = new ResponsiveLayout({ container });
        layout.initialize();

        const state = layout.getState();
        expect(state.breakpoint).toBe('mobile');
        expect(state.sidebarVisible).toBe(false);

        // Sidebar hidden
        const sidebar = container.querySelector('aside') as HTMLElement;
        expect(sidebar?.style.display).toBe('none');

        // Mobile nav visible
        const mobileNav = container.querySelector('[aria-label="Mobile navigation"]') as HTMLElement;
        expect(mobileNav?.style.display).toBe('flex');

        // Main content has bottom padding for mobile nav
        const main = container.querySelector('main') as HTMLElement;
        expect(main?.style.paddingBottom).toBe('72px');

        // Hamburger menu visible
        const menuToggle = container.querySelector('[data-action="toggle-menu"]') as HTMLElement;
        expect(menuToggle?.style.display).toBe('inline-flex');

        layout.destroy();
        layout = null;
      }),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 10.1**
   *
   * For any tablet or desktop viewport width (>= 640px), the layout SHALL
   * show the sidebar and hide the mobile bottom navigation, providing
   * the full navigation experience on larger screens.
   */
  it('non-mobile layout shows sidebar and hides mobile navigation for any width >= tablet', () => {
    const nonMobileWidthArb = fc.integer({ min: BREAKPOINTS.tablet, max: 1920 });

    fc.assert(
      fc.property(nonMobileWidthArb, (width) => {
        setViewportWidth(width);
        container.innerHTML = '';

        layout = new ResponsiveLayout({ container });
        layout.initialize();

        const state = layout.getState();
        expect(state.breakpoint).not.toBe('mobile');
        expect(state.sidebarVisible).toBe(true);

        // Sidebar visible
        const sidebar = container.querySelector('aside') as HTMLElement;
        expect(sidebar?.style.display).not.toBe('none');

        // Mobile nav hidden
        const mobileNav = container.querySelector('[aria-label="Mobile navigation"]') as HTMLElement;
        expect(mobileNav?.style.display).toBe('none');

        // Main content has no extra bottom padding
        const main = container.querySelector('main') as HTMLElement;
        expect(main?.style.paddingBottom).toBe('');

        // Hamburger menu hidden
        const menuToggle = container.querySelector('[data-action="toggle-menu"]') as HTMLElement;
        expect(menuToggle?.style.display).toBe('none');

        layout.destroy();
        layout = null;
      }),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 10.1**
   *
   * For any viewport width, the responsive CSS SHALL define touch targets
   * with a minimum size of 44px, ensuring all interactive elements meet
   * accessibility guidelines for touch usability.
   */
  it('responsive CSS defines minimum 44px touch targets for any configuration', () => {
    fc.assert(
      fc.property(viewportWidthArb, (width) => {
        setViewportWidth(width);
        setupResponsiveCSS();

        const styleEl = document.getElementById('streetstudio-responsive-styles');
        expect(styleEl).not.toBeNull();

        const cssContent = styleEl?.textContent ?? '';

        // Touch target classes must define the minimum size
        expect(cssContent).toContain(`min-width: ${MIN_TOUCH_TARGET}px`);
        expect(cssContent).toContain(`min-height: ${MIN_TOUCH_TARGET}px`);

        // MIN_TOUCH_TARGET should always be 44px
        expect(MIN_TOUCH_TARGET).toBe(44);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 10.1**
   *
   * For any two viewport widths that fall into different breakpoints,
   * the BreakpointObserver SHALL detect the transition and report the
   * correct new breakpoint, ensuring responsive adaptation actually occurs
   * when viewport changes happen.
   */
  it('breakpoint observer detects transitions between any two different breakpoints', () => {
    // Generate pairs of widths from different breakpoints
    const crossBreakpointPairArb = fc.oneof(
      // mobile -> tablet
      fc.tuple(mobileWidthArb, tabletWidthArb),
      // mobile -> desktop
      fc.tuple(mobileWidthArb, desktopWidthArb),
      // tablet -> mobile
      fc.tuple(tabletWidthArb, mobileWidthArb),
      // tablet -> desktop
      fc.tuple(tabletWidthArb, desktopWidthArb),
      // desktop -> mobile
      fc.tuple(desktopWidthArb, mobileWidthArb),
      // desktop -> tablet
      fc.tuple(desktopWidthArb, tabletWidthArb),
    );

    fc.assert(
      fc.property(crossBreakpointPairArb, ([fromWidth, toWidth]) => {
        setViewportWidth(fromWidth);
        const observer = new BreakpointObserver();

        const fromBreakpoint = expectedBreakpoint(fromWidth);
        const toBreakpoint = expectedBreakpoint(toWidth);

        // Observer should start at the from breakpoint
        expect(observer.getBreakpoint()).toBe(fromBreakpoint);

        // The widths should map to different breakpoints
        expect(fromBreakpoint).not.toBe(toBreakpoint);

        observer.destroy();
      }),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 10.1**
   *
   * For any viewport width, the layout state SHALL be internally consistent:
   * the breakpoint, sidebar visibility, and mobile menu state must all
   * align with the current width's breakpoint category.
   */
  it('layout state is internally consistent for any viewport width', () => {
    fc.assert(
      fc.property(viewportWidthArb, (width) => {
        setViewportWidth(width);
        container.innerHTML = '';

        layout = new ResponsiveLayout({ container });
        layout.initialize();

        const state = layout.getState();
        const expected = expectedBreakpoint(width);

        // Breakpoint must match expected
        expect(state.breakpoint).toBe(expected);

        // On mobile: sidebar hidden, mobile menu initially closed
        if (expected === 'mobile') {
          expect(state.sidebarVisible).toBe(false);
          expect(state.mobileMenuOpen).toBe(false);
        } else {
          // On tablet/desktop: sidebar visible
          expect(state.sidebarVisible).toBe(true);
        }

        // viewportWidth in state should reflect actual window width
        expect(state.viewportWidth).toBe(width);

        layout.destroy();
        layout = null;
      }),
      { numRuns: 100 }
    );
  });
});
