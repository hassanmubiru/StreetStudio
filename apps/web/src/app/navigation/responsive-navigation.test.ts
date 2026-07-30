/**
 * Unit tests for Responsive Navigation Controller
 * 
 * Tests slide-out menu, breadcrumb optimization, focus trapping,
 * and touch-friendly navigation elements.
 * 
 * Requirements: 10.1, 10.2, 10.3
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ResponsiveNavigation, BreadcrumbItem } from './responsive-navigation.js';

describe('ResponsiveNavigation', () => {
  let menuContainer: HTMLElement;
  let breadcrumbContainer: HTMLElement;
  let nav: ResponsiveNavigation;

  beforeEach(() => {
    menuContainer = document.createElement('div');
    breadcrumbContainer = document.createElement('div');
    document.body.appendChild(menuContainer);
    document.body.appendChild(breadcrumbContainer);
  });

  afterEach(() => {
    nav?.destroy();
    document.body.innerHTML = '';
  });

  function createNav(options?: Partial<ConstructorParameters<typeof ResponsiveNavigation>[0]>) {
    nav = new ResponsiveNavigation({
      menuContainer,
      breadcrumbContainer,
      ...options,
    });
    nav.initialize();
    return nav;
  }

  describe('initialization', () => {
    it('creates the slide-out menu overlay', () => {
      createNav();

      const overlay = menuContainer.querySelector('[role="dialog"]');
      expect(overlay).not.toBeNull();
    });

    it('overlay has aria-modal=true', () => {
      createNav();

      const overlay = menuContainer.querySelector('[role="dialog"]');
      expect(overlay?.getAttribute('aria-modal')).toBe('true');
    });

    it('overlay has proper aria-label', () => {
      createNav();

      const overlay = menuContainer.querySelector('[role="dialog"]');
      expect(overlay?.getAttribute('aria-label')).toBe('Navigation menu');
    });

    it('menu is hidden by default', () => {
      createNav();

      const overlay = menuContainer.querySelector('[role="dialog"]') as HTMLElement;
      expect(overlay?.style.display).toBe('none');
    });

    it('close button has aria-label', () => {
      createNav();

      const closeBtn = menuContainer.querySelector('[data-menu-close]');
      expect(closeBtn?.getAttribute('aria-label')).toBe('Close menu');
    });

    it('menu panel has navigation role', () => {
      createNav();

      const navElement = menuContainer.querySelector('[data-menu-content]');
      expect(navElement?.getAttribute('aria-label')).toBe('Slide-out navigation');
    });
  });

  describe('openMenu / closeMenu', () => {
    it('openMenu shows the overlay', () => {
      createNav();
      nav.openMenu();

      const overlay = menuContainer.querySelector('[role="dialog"]') as HTMLElement;
      expect(overlay?.style.display).toBe('block');
    });

    it('openMenu sets isMenuOpen to true', () => {
      createNav();
      nav.openMenu();
      expect(nav.isMenuOpen()).toBe(true);
    });

    it('openMenu prevents body scroll', () => {
      createNav();
      nav.openMenu();
      expect(document.body.style.overflow).toBe('hidden');
    });

    it('closeMenu hides the overlay after transition', async () => {
      createNav();
      nav.openMenu();
      nav.closeMenu();

      expect(nav.isMenuOpen()).toBe(false);
      expect(document.body.style.overflow).toBe('');
    });

    it('toggleMenu alternates open/close', () => {
      createNav();
      
      nav.toggleMenu();
      expect(nav.isMenuOpen()).toBe(true);

      nav.toggleMenu();
      expect(nav.isMenuOpen()).toBe(false);
    });

    it('calls onMenuToggle callback on open', () => {
      const onMenuToggle = vi.fn();
      createNav({ onMenuToggle });
      
      nav.openMenu();
      expect(onMenuToggle).toHaveBeenCalledWith(true);
    });

    it('calls onMenuToggle callback on close', () => {
      const onMenuToggle = vi.fn();
      createNav({ onMenuToggle });
      
      nav.openMenu();
      nav.closeMenu();
      expect(onMenuToggle).toHaveBeenCalledWith(false);
    });
  });

  describe('close interactions', () => {
    it('closes menu on Escape key', () => {
      createNav();
      nav.openMenu();

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      expect(nav.isMenuOpen()).toBe(false);
    });

    it('closes menu when close button is clicked', () => {
      createNav();
      nav.openMenu();

      const closeBtn = menuContainer.querySelector('[data-menu-close]') as HTMLElement;
      closeBtn?.click();
      expect(nav.isMenuOpen()).toBe(false);
    });

    it('closes menu when backdrop is clicked', () => {
      createNav();
      nav.openMenu();

      const backdrop = menuContainer.querySelector('[data-menu-backdrop]') as HTMLElement;
      backdrop?.click();
      expect(nav.isMenuOpen()).toBe(false);
    });
  });

  describe('navigation item clicks', () => {
    it('calls onNavigate when a link is clicked', () => {
      const onNavigate = vi.fn();
      createNav({ onNavigate });

      // Add a link to the menu
      nav.setMenuContent('<a href="/dashboard">Dashboard</a>');
      nav.openMenu();

      const link = menuContainer.querySelector('a[href="/dashboard"]') as HTMLElement;
      link?.click();

      expect(onNavigate).toHaveBeenCalledWith('/dashboard');
    });

    it('closes menu after navigation', () => {
      const onNavigate = vi.fn();
      createNav({ onNavigate });

      nav.setMenuContent('<a href="/projects">Projects</a>');
      nav.openMenu();

      const link = menuContainer.querySelector('a[href="/projects"]') as HTMLElement;
      link?.click();

      expect(nav.isMenuOpen()).toBe(false);
    });
  });

  describe('breadcrumb optimization', () => {
    it('renders all breadcrumbs on desktop', () => {
      Object.defineProperty(window, 'innerWidth', { value: 1024, writable: true });
      createNav();

      const breadcrumbs: BreadcrumbItem[] = [
        { label: 'Home', href: '/' },
        { label: 'Projects', href: '/projects' },
        { label: 'My Project', href: '/projects/123' },
        { label: 'Video', isCurrent: true },
      ];
      nav.setBreadcrumbs(breadcrumbs);

      expect(breadcrumbContainer.textContent).toContain('Home');
      expect(breadcrumbContainer.textContent).toContain('Projects');
      expect(breadcrumbContainer.textContent).toContain('My Project');
      expect(breadcrumbContainer.textContent).toContain('Video');
    });

    it('collapses middle items on mobile when exceeding maxMobileBreadcrumbs', () => {
      Object.defineProperty(window, 'innerWidth', { value: 375, writable: true });
      createNav({ maxMobileBreadcrumbs: 2 });

      const breadcrumbs: BreadcrumbItem[] = [
        { label: 'Home', href: '/' },
        { label: 'Projects', href: '/projects' },
        { label: 'My Project', href: '/projects/123' },
        { label: 'Video', isCurrent: true },
      ];
      nav.setBreadcrumbs(breadcrumbs);

      // Should show first and last only, with ellipsis
      expect(breadcrumbContainer.textContent).toContain('Home');
      expect(breadcrumbContainer.textContent).toContain('Video');
      expect(breadcrumbContainer.textContent).toContain('…');
      expect(breadcrumbContainer.textContent).not.toContain('My Project');
    });

    it('shows all breadcrumbs on mobile when count <= maxMobileBreadcrumbs', () => {
      Object.defineProperty(window, 'innerWidth', { value: 375, writable: true });
      createNav({ maxMobileBreadcrumbs: 2 });

      const breadcrumbs: BreadcrumbItem[] = [
        { label: 'Home', href: '/' },
        { label: 'Projects', isCurrent: true },
      ];
      nav.setBreadcrumbs(breadcrumbs);

      expect(breadcrumbContainer.textContent).toContain('Home');
      expect(breadcrumbContainer.textContent).toContain('Projects');
      expect(breadcrumbContainer.textContent).not.toContain('…');
    });

    it('renders breadcrumb nav with aria-label', () => {
      Object.defineProperty(window, 'innerWidth', { value: 1024, writable: true });
      createNav();

      nav.setBreadcrumbs([{ label: 'Home', href: '/' }, { label: 'Page', isCurrent: true }]);

      const navEl = breadcrumbContainer.querySelector('[aria-label="Breadcrumb"]');
      expect(navEl).not.toBeNull();
    });

    it('marks current breadcrumb with aria-current=page', () => {
      Object.defineProperty(window, 'innerWidth', { value: 1024, writable: true });
      createNav();

      nav.setBreadcrumbs([
        { label: 'Home', href: '/' },
        { label: 'Current', isCurrent: true },
      ]);

      const current = breadcrumbContainer.querySelector('[aria-current="page"]');
      expect(current?.textContent).toBe('Current');
    });

    it('renders empty when no breadcrumbs set', () => {
      createNav();
      nav.setBreadcrumbs([]);
      expect(breadcrumbContainer.innerHTML).toBe('');
    });
  });

  describe('setMenuContent', () => {
    it('updates the menu nav content', () => {
      createNav();
      nav.setMenuContent('<a href="/test">Test Link</a>');

      const content = menuContainer.querySelector('[data-menu-content]');
      expect(content?.innerHTML).toContain('Test Link');
    });
  });

  describe('getState', () => {
    it('returns current navigation state', () => {
      Object.defineProperty(window, 'innerWidth', { value: 1024, writable: true });
      createNav();

      const state = nav.getState();
      expect(state.isMenuOpen).toBe(false);
      expect(state.breakpoint).toBe('desktop');
      expect(state.breadcrumbs).toEqual([]);
    });
  });

  describe('destroy', () => {
    it('removes overlay element', () => {
      createNav();
      nav.destroy();

      const overlay = menuContainer.querySelector('[role="dialog"]');
      expect(overlay).toBeNull();
    });

    it('restores body scroll', () => {
      createNav();
      nav.openMenu();
      nav.destroy();

      expect(document.body.style.overflow).toBe('');
    });
  });
});
