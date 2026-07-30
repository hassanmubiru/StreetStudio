/**
 * Unit tests for the Responsive Layout Controller
 * 
 * Tests adaptive layout behavior across breakpoints, sidebar visibility,
 * mobile navigation, and touch-friendly layout elements.
 * 
 * Requirements: 10.1, 10.2, 10.3
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ResponsiveLayout } from './responsive-layout.js';

describe('ResponsiveLayout', () => {
  let container: HTMLElement;
  let layout: ResponsiveLayout;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    layout?.destroy();
    document.body.innerHTML = '';
  });

  function createLayout(options?: Partial<Parameters<typeof ResponsiveLayout.prototype['initialize']>[0]>) {
    layout = new ResponsiveLayout({
      container,
      ...options,
    } as any);
    layout.initialize();
    return layout;
  }

  describe('initialization', () => {
    it('builds layout structure with header, main, and mobile nav', () => {
      Object.defineProperty(window, 'innerWidth', { value: 375, writable: true });
      createLayout();

      expect(container.querySelector('header')).not.toBeNull();
      expect(container.querySelector('main')).not.toBeNull();
      expect(container.querySelector('[aria-label="Mobile navigation"]')).not.toBeNull();
    });

    it('creates sidebar element with navigation role', () => {
      Object.defineProperty(window, 'innerWidth', { value: 1024, writable: true });
      createLayout();

      const sidebar = container.querySelector('aside');
      expect(sidebar).not.toBeNull();
      expect(sidebar?.getAttribute('role')).toBe('navigation');
      expect(sidebar?.getAttribute('aria-label')).toBe('Main navigation');
    });

    it('main element has role=main and proper id', () => {
      createLayout();

      const main = container.querySelector('main');
      expect(main?.getAttribute('role')).toBe('main');
      expect(main?.id).toBe('main-content');
    });

    it('header element has role=banner', () => {
      createLayout();

      const header = container.querySelector('header');
      expect(header?.getAttribute('role')).toBe('banner');
    });

    it('injects responsive CSS into document', () => {
      createLayout();

      const styleEl = document.getElementById('streetstudio-responsive-styles');
      expect(styleEl).not.toBeNull();
    });
  });

  describe('mobile layout (< 640px)', () => {
    beforeEach(() => {
      Object.defineProperty(window, 'innerWidth', { value: 375, writable: true });
    });

    it('hides sidebar on mobile', () => {
      createLayout();

      const sidebar = container.querySelector('aside') as HTMLElement;
      expect(sidebar?.style.display).toBe('none');
    });

    it('shows mobile bottom navigation', () => {
      createLayout();

      const mobileNav = container.querySelector('[aria-label="Mobile navigation"]') as HTMLElement;
      expect(mobileNav?.style.display).toBe('flex');
    });

    it('adds bottom padding to main content for mobile nav', () => {
      createLayout();

      const main = container.querySelector('main') as HTMLElement;
      expect(main?.style.paddingBottom).toBe('72px');
    });

    it('shows hamburger menu toggle button', () => {
      createLayout();

      const menuToggle = container.querySelector('[data-action="toggle-menu"]') as HTMLElement;
      expect(menuToggle?.style.display).toBe('inline-flex');
    });

    it('mobile nav links have minimum 44px touch targets', () => {
      createLayout();

      const navLinks = container.querySelectorAll('[data-mobile-bottom-nav]');
      navLinks.forEach(link => {
        expect(link.classList.contains('touch-target')).toBe(true);
      });
    });
  });

  describe('tablet layout (640px - 1023px)', () => {
    beforeEach(() => {
      Object.defineProperty(window, 'innerWidth', { value: 768, writable: true });
    });

    it('shows sidebar on tablet', () => {
      createLayout();

      const sidebar = container.querySelector('aside') as HTMLElement;
      expect(sidebar?.style.display).not.toBe('none');
    });

    it('hides mobile bottom navigation on tablet', () => {
      createLayout();

      const mobileNav = container.querySelector('[aria-label="Mobile navigation"]') as HTMLElement;
      expect(mobileNav?.style.display).toBe('none');
    });

    it('removes bottom padding from main content', () => {
      createLayout();

      const main = container.querySelector('main') as HTMLElement;
      expect(main?.style.paddingBottom).toBe('');
    });
  });

  describe('desktop layout (>= 1024px)', () => {
    beforeEach(() => {
      Object.defineProperty(window, 'innerWidth', { value: 1440, writable: true });
    });

    it('shows sidebar on desktop', () => {
      createLayout();

      const sidebar = container.querySelector('aside') as HTMLElement;
      expect(sidebar?.style.display).not.toBe('none');
    });

    it('hides mobile navigation on desktop', () => {
      createLayout();

      const mobileNav = container.querySelector('[aria-label="Mobile navigation"]') as HTMLElement;
      expect(mobileNav?.style.display).toBe('none');
    });

    it('hides hamburger menu on desktop', () => {
      createLayout();

      const menuToggle = container.querySelector('[data-action="toggle-menu"]') as HTMLElement;
      expect(menuToggle?.style.display).toBe('none');
    });
  });

  describe('state management', () => {
    it('getState returns current breakpoint', () => {
      Object.defineProperty(window, 'innerWidth', { value: 1024, writable: true });
      createLayout();

      expect(layout.getState().breakpoint).toBe('desktop');
    });

    it('getState returns sidebar visibility', () => {
      Object.defineProperty(window, 'innerWidth', { value: 1024, writable: true });
      createLayout();

      expect(layout.getState().sidebarVisible).toBe(true);
    });

    it('getState returns mobileMenuOpen status', () => {
      Object.defineProperty(window, 'innerWidth', { value: 375, writable: true });
      createLayout();

      expect(layout.getState().mobileMenuOpen).toBe(false);
    });

    it('toggleSidebar changes sidebar visibility', () => {
      Object.defineProperty(window, 'innerWidth', { value: 1024, writable: true });
      createLayout();

      layout.toggleSidebar();
      expect(layout.getState().sidebarVisible).toBe(false);

      layout.toggleSidebar();
      expect(layout.getState().sidebarVisible).toBe(true);
    });

    it('setMobileMenuOpen updates state', () => {
      Object.defineProperty(window, 'innerWidth', { value: 375, writable: true });
      createLayout();

      layout.setMobileMenuOpen(true);
      expect(layout.getState().mobileMenuOpen).toBe(true);

      layout.setMobileMenuOpen(false);
      expect(layout.getState().mobileMenuOpen).toBe(false);
    });

    it('onStateChange listener is called on state updates', () => {
      Object.defineProperty(window, 'innerWidth', { value: 1024, writable: true });
      createLayout();

      const listener = vi.fn();
      layout.onStateChange(listener);

      layout.toggleSidebar();
      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith(expect.objectContaining({ sidebarVisible: false }));
    });

    it('onStateChange unsubscribe removes listener', () => {
      Object.defineProperty(window, 'innerWidth', { value: 1024, writable: true });
      createLayout();

      const listener = vi.fn();
      const unsub = layout.onStateChange(listener);
      unsub();

      layout.toggleSidebar();
      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('element access', () => {
    it('getMainElement returns the main element', () => {
      createLayout();
      const main = layout.getMainElement();
      expect(main?.tagName).toBe('MAIN');
    });

    it('getSidebarElement returns the sidebar element', () => {
      createLayout();
      const sidebar = layout.getSidebarElement();
      expect(sidebar?.tagName).toBe('ASIDE');
    });

    it('getHeaderElement returns the header element', () => {
      createLayout();
      const header = layout.getHeaderElement();
      expect(header?.tagName).toBe('HEADER');
    });
  });

  describe('option: hasSidebar', () => {
    it('does not create sidebar when hasSidebar is false', () => {
      layout = new ResponsiveLayout({ container, hasSidebar: false });
      layout.initialize();

      expect(container.querySelector('aside')).toBeNull();
    });
  });

  describe('option: hasMobileNav', () => {
    it('does not create mobile nav when hasMobileNav is false', () => {
      layout = new ResponsiveLayout({ container, hasMobileNav: false });
      layout.initialize();

      expect(container.querySelector('[aria-label="Mobile navigation"]')).toBeNull();
    });
  });

  describe('breakpoint transitions', () => {
    it('calls onBreakpointChange callback when breakpoint changes', async () => {
      Object.defineProperty(window, 'innerWidth', { value: 1024, writable: true });
      const onBreakpointChange = vi.fn();
      layout = new ResponsiveLayout({ container, onBreakpointChange });
      layout.initialize();

      // Simulate resize to mobile
      Object.defineProperty(window, 'innerWidth', { value: 375, writable: true });
      window.dispatchEvent(new Event('resize'));

      await new Promise(resolve => setTimeout(resolve, 200));

      expect(onBreakpointChange).toHaveBeenCalledWith('mobile');
    });
  });

  describe('destroy', () => {
    it('destroys without errors', () => {
      createLayout();
      expect(() => layout.destroy()).not.toThrow();
    });
  });
});
