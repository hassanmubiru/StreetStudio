/**
 * Responsive Navigation Controller
 * 
 * Enhances the existing navigation system with responsive behavior including:
 * - Slide-out mobile menu with proper accessibility
 * - Breadcrumb optimization for mobile (collapse middle items)
 * - Touch-friendly navigation targets
 * - Adaptive navigation patterns per breakpoint
 * 
 * Requirements: 10.1, 10.2, 10.3
 */

import {
  BreakpointObserver,
  BreakpointName,
  getCurrentBreakpoint,
  MIN_TOUCH_TARGET,
  MEDIA_QUERIES,
} from '../../styles/responsive.js';

export interface BreadcrumbItem {
  label: string;
  href?: string;
  isCurrent?: boolean;
}

export interface ResponsiveNavigationOptions {
  /** Container for the slide-out menu */
  menuContainer: HTMLElement;
  /** Container for breadcrumbs */
  breadcrumbContainer?: HTMLElement;
  /** Callback when a navigation item is selected */
  onNavigate?: (href: string) => void;
  /** Callback when menu opens/closes */
  onMenuToggle?: (isOpen: boolean) => void;
  /** Maximum breadcrumb items to show on mobile before collapsing */
  maxMobileBreadcrumbs?: number;
}

export interface NavigationState {
  isMenuOpen: boolean;
  breakpoint: BreakpointName;
  breadcrumbs: BreadcrumbItem[];
}

/**
 * ResponsiveNavigation
 * 
 * Manages the slide-out mobile menu and breadcrumb optimization.
 */
export class ResponsiveNavigation {
  private options: ResponsiveNavigationOptions;
  private observer: BreakpointObserver;
  private state: NavigationState;
  private overlayElement?: HTMLElement;
  private menuPanelElement?: HTMLElement;
  private focusTrapElements: HTMLElement[] = [];

  constructor(options: ResponsiveNavigationOptions) {
    this.options = options;
    this.observer = new BreakpointObserver();
    this.state = {
      isMenuOpen: false,
      breakpoint: getCurrentBreakpoint(),
      breadcrumbs: [],
    };
  }

  /** Initialize the responsive navigation */
  public initialize(): void {
    this.createSlideOutMenu();
    this.setupEventListeners();
    this.observer.onChange((breakpoint) => {
      this.state.breakpoint = breakpoint;
      // Auto-close menu when switching to tablet/desktop
      if (breakpoint !== 'mobile' && this.state.isMenuOpen) {
        this.closeMenu();
      }
      this.updateBreadcrumbDisplay();
    });
    this.observer.start();
  }

  /** Open the slide-out menu */
  public openMenu(): void {
    this.state.isMenuOpen = true;
    this.showMenu();
    this.options.onMenuToggle?.(true);
  }

  /** Close the slide-out menu */
  public closeMenu(): void {
    this.state.isMenuOpen = false;
    this.hideMenu();
    this.options.onMenuToggle?.(false);
  }

  /** Toggle the slide-out menu */
  public toggleMenu(): void {
    if (this.state.isMenuOpen) {
      this.closeMenu();
    } else {
      this.openMenu();
    }
  }

  /** Check if menu is open */
  public isMenuOpen(): boolean {
    return this.state.isMenuOpen;
  }

  /** Update breadcrumb items */
  public setBreadcrumbs(breadcrumbs: BreadcrumbItem[]): void {
    this.state.breadcrumbs = breadcrumbs;
    this.updateBreadcrumbDisplay();
  }

  /** Get current navigation state */
  public getState(): NavigationState {
    return { ...this.state };
  }

  /** Set navigation items for the menu */
  public setMenuContent(html: string): void {
    const navContent = this.menuPanelElement?.querySelector('[data-menu-content]');
    if (navContent) {
      navContent.innerHTML = html;
    }
  }

  /** Destroy and clean up */
  public destroy(): void {
    this.observer.destroy();
    if (this.overlayElement?.parentNode) {
      this.overlayElement.parentNode.removeChild(this.overlayElement);
    }
    document.body.style.overflow = '';
  }

  private createSlideOutMenu(): void {
    this.overlayElement = document.createElement('div');
    this.overlayElement.className = 'responsive-slide-menu';
    this.overlayElement.setAttribute('role', 'dialog');
    this.overlayElement.setAttribute('aria-modal', 'true');
    this.overlayElement.setAttribute('aria-label', 'Navigation menu');
    this.overlayElement.style.cssText = `
      position: fixed;
      inset: 0;
      z-index: 100;
      display: none;
    `;

    this.overlayElement.innerHTML = `
      <div data-menu-backdrop style="
        position: absolute;
        inset: 0;
        background: rgba(0, 0, 0, 0.5);
        opacity: 0;
        transition: opacity 0.3s ease;
      "></div>
      <div data-menu-panel style="
        position: absolute;
        top: 0;
        left: 0;
        bottom: 0;
        width: 280px;
        max-width: 85vw;
        background: white;
        transform: translateX(-100%);
        transition: transform 0.3s ease;
        display: flex;
        flex-direction: column;
        overflow-y: auto;
      ">
        <div style="
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 16px;
          border-bottom: 1px solid #e5e7eb;
          min-height: ${MIN_TOUCH_TARGET}px;
        ">
          <span style="font-weight: 600; font-size: 1rem;">Menu</span>
          <button
            data-menu-close
            class="touch-target--icon"
            aria-label="Close menu"
            style="
              min-width: ${MIN_TOUCH_TARGET}px;
              min-height: ${MIN_TOUCH_TARGET}px;
              display: inline-flex;
              align-items: center;
              justify-content: center;
              border: none;
              background: none;
              cursor: pointer;
              border-radius: 50%;
            "
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <nav data-menu-content aria-label="Slide-out navigation" style="flex: 1; padding: 8px;">
          <!-- Navigation items will be injected here -->
        </nav>
      </div>
    `;

    this.options.menuContainer.appendChild(this.overlayElement);
    this.menuPanelElement = this.overlayElement.querySelector('[data-menu-panel]') as HTMLElement;
  }

  private setupEventListeners(): void {
    if (!this.overlayElement) return;

    // Close button
    const closeBtn = this.overlayElement.querySelector('[data-menu-close]');
    closeBtn?.addEventListener('click', () => this.closeMenu());

    // Backdrop click
    const backdrop = this.overlayElement.querySelector('[data-menu-backdrop]');
    backdrop?.addEventListener('click', () => this.closeMenu());

    // Escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.state.isMenuOpen) {
        this.closeMenu();
      }
    });

    // Focus trap
    this.overlayElement.addEventListener('keydown', (e) => {
      if (e.key === 'Tab' && this.state.isMenuOpen) {
        this.handleFocusTrap(e);
      }
    });

    // Navigation item clicks
    this.overlayElement.addEventListener('click', (e) => {
      const link = (e.target as HTMLElement).closest('a[href]') as HTMLAnchorElement;
      if (link) {
        e.preventDefault();
        const href = link.getAttribute('href');
        if (href) {
          this.options.onNavigate?.(href);
          this.closeMenu();
        }
      }
    });
  }

  private showMenu(): void {
    if (!this.overlayElement || !this.menuPanelElement) return;

    this.overlayElement.style.display = 'block';
    document.body.style.overflow = 'hidden';

    // Animate in
    requestAnimationFrame(() => {
      const backdrop = this.overlayElement!.querySelector('[data-menu-backdrop]') as HTMLElement;
      if (backdrop) backdrop.style.opacity = '1';
      if (this.menuPanelElement) this.menuPanelElement.style.transform = 'translateX(0)';
    });

    // Focus the close button
    setTimeout(() => {
      const closeBtn = this.overlayElement?.querySelector('[data-menu-close]') as HTMLElement;
      closeBtn?.focus();
    }, 100);
  }

  private hideMenu(): void {
    if (!this.overlayElement || !this.menuPanelElement) return;

    const backdrop = this.overlayElement.querySelector('[data-menu-backdrop]') as HTMLElement;
    if (backdrop) backdrop.style.opacity = '0';
    if (this.menuPanelElement) this.menuPanelElement.style.transform = 'translateX(-100%)';

    document.body.style.overflow = '';

    // Hide after animation
    setTimeout(() => {
      if (this.overlayElement) this.overlayElement.style.display = 'none';
    }, 300);
  }

  private handleFocusTrap(e: KeyboardEvent): void {
    if (!this.menuPanelElement) return;

    const focusable = this.menuPanelElement.querySelectorAll(
      'button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    if (focusable.length === 0) return;

    const first = focusable[0] as HTMLElement;
    const last = focusable[focusable.length - 1] as HTMLElement;

    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  /** Update breadcrumb display based on current breakpoint */
  private updateBreadcrumbDisplay(): void {
    const container = this.options.breadcrumbContainer;
    if (!container) return;

    const { breadcrumbs } = this.state;
    if (breadcrumbs.length === 0) {
      container.innerHTML = '';
      return;
    }

    const maxMobile = this.options.maxMobileBreadcrumbs ?? 2;
    const isMobile = this.state.breakpoint === 'mobile';

    let itemsToShow: BreadcrumbItem[];
    let hasCollapsed = false;

    if (isMobile && breadcrumbs.length > maxMobile) {
      // On mobile, show first and last items with "..." in between
      const first = breadcrumbs[0]!;
      const last = breadcrumbs[breadcrumbs.length - 1]!;
      itemsToShow = [first, last];
      hasCollapsed = true;
    } else {
      itemsToShow = breadcrumbs;
    }

    const html = this.renderBreadcrumbs(itemsToShow, hasCollapsed);
    container.innerHTML = html;
  }

  private renderBreadcrumbs(items: BreadcrumbItem[], hasCollapsed: boolean): string {
    const separator = `<span aria-hidden="true" style="color: #9ca3af; margin: 0 4px;">/</span>`;

    const renderedItems = items.map((item, index) => {
      const isLast = index === items.length - 1;
      const classes = isLast
        ? 'responsive-breadcrumbs__item--current'
        : 'responsive-breadcrumbs__item--parent';

      if (isLast || !item.href) {
        return `<span class="${classes}" aria-current="${isLast ? 'page' : ''}" style="color: ${isLast ? '#111827' : '#6b7280'}; font-weight: ${isLast ? '500' : '400'};">${item.label}</span>`;
      }

      return `<a href="${item.href}" class="${classes}" style="color: #6b7280; text-decoration: none; min-height: ${MIN_TOUCH_TARGET}px; display: inline-flex; align-items: center;">${item.label}</a>`;
    });

    if (hasCollapsed && renderedItems.length >= 2) {
      // Insert collapsed indicator between first and last
      const collapsed = `<span class="responsive-breadcrumbs__item--collapsed" aria-label="Collapsed breadcrumb items" style="color: #9ca3af;">…</span>`;
      renderedItems.splice(1, 0, collapsed);
    }

    return `<nav aria-label="Breadcrumb" class="responsive-breadcrumbs">${renderedItems.join(separator)}</nav>`;
  }
}
