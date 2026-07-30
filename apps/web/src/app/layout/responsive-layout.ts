/**
 * Responsive Layout Controller
 * 
 * Manages adaptive layouts that scale from 320px mobile to desktop resolution.
 * Provides layout composition with responsive sidebar, main content area,
 * and mobile-optimized navigation.
 * 
 * Requirements: 10.1, 10.2, 10.3
 */

import {
  BreakpointObserver,
  BreakpointName,
  getCurrentBreakpoint,
  isTouchDevice,
  BREAKPOINTS,
  MIN_TOUCH_TARGET,
  setupResponsiveCSS,
} from '../../styles/responsive.js';

export interface ResponsiveLayoutOptions {
  /** Container element for the layout */
  container: HTMLElement;
  /** Whether to show sidebar on desktop */
  hasSidebar?: boolean;
  /** Whether to show bottom navigation on mobile */
  hasMobileNav?: boolean;
  /** Callback when breakpoint changes */
  onBreakpointChange?: (breakpoint: BreakpointName) => void;
}

export interface LayoutState {
  breakpoint: BreakpointName;
  sidebarVisible: boolean;
  mobileMenuOpen: boolean;
  isTouchDevice: boolean;
  viewportWidth: number;
}

/**
 * ResponsiveLayout
 * 
 * Builds an adaptive layout container that responds to viewport changes.
 * Mobile-first: starts with single-column stacked layout, adds sidebar
 * at tablet breakpoint, full layout at desktop.
 */
export class ResponsiveLayout {
  private options: ResponsiveLayoutOptions;
  private observer: BreakpointObserver;
  private state: LayoutState;
  private mainElement?: HTMLElement;
  private sidebarElement?: HTMLElement;
  private mobileNavElement?: HTMLElement;
  private headerElement?: HTMLElement;
  private stateListeners: Set<(state: LayoutState) => void> = new Set();

  constructor(options: ResponsiveLayoutOptions) {
    this.options = options;
    this.observer = new BreakpointObserver();
    this.state = {
      breakpoint: getCurrentBreakpoint(),
      sidebarVisible: getCurrentBreakpoint() !== 'mobile',
      mobileMenuOpen: false,
      isTouchDevice: isTouchDevice(),
      viewportWidth: window.innerWidth,
    };
  }

  /** Initialize the responsive layout */
  public initialize(): void {
    setupResponsiveCSS();
    this.buildLayout();
    this.observer.onChange((breakpoint, width) => {
      this.updateState({
        breakpoint,
        viewportWidth: width,
        sidebarVisible: breakpoint !== 'mobile',
        mobileMenuOpen: breakpoint !== 'mobile' ? false : this.state.mobileMenuOpen,
      });
      this.options.onBreakpointChange?.(breakpoint);
    });
    this.observer.start();
  }

  /** Get current layout state */
  public getState(): LayoutState {
    return { ...this.state };
  }

  /** Register a listener for state changes */
  public onStateChange(listener: (state: LayoutState) => void): () => void {
    this.stateListeners.add(listener);
    return () => this.stateListeners.delete(listener);
  }

  /** Toggle sidebar visibility */
  public toggleSidebar(): void {
    this.updateState({ sidebarVisible: !this.state.sidebarVisible });
  }

  /** Open/close mobile menu */
  public setMobileMenuOpen(open: boolean): void {
    this.updateState({ mobileMenuOpen: open });
  }

  /** Get the main content container element */
  public getMainElement(): HTMLElement | undefined {
    return this.mainElement;
  }

  /** Get the sidebar container element */
  public getSidebarElement(): HTMLElement | undefined {
    return this.sidebarElement;
  }

  /** Get the header element */
  public getHeaderElement(): HTMLElement | undefined {
    return this.headerElement;
  }

  /** Destroy the layout and release resources */
  public destroy(): void {
    this.observer.destroy();
    this.stateListeners.clear();
  }

  private buildLayout(): void {
    const { container } = this.options;
    container.innerHTML = '';
    container.className = 'responsive-layout';

    // Header / top bar
    this.headerElement = document.createElement('header');
    this.headerElement.className = 'responsive-layout__header';
    this.headerElement.setAttribute('role', 'banner');
    this.headerElement.innerHTML = this.renderHeader();
    container.appendChild(this.headerElement);

    // Body wrapper (sidebar + main)
    const bodyWrapper = document.createElement('div');
    bodyWrapper.className = 'responsive-layout__body';
    bodyWrapper.style.display = 'flex';
    bodyWrapper.style.flex = '1';
    bodyWrapper.style.minHeight = '0';

    // Sidebar
    if (this.options.hasSidebar !== false) {
      this.sidebarElement = document.createElement('aside');
      this.sidebarElement.className = 'responsive-nav--sidebar';
      this.sidebarElement.setAttribute('role', 'navigation');
      this.sidebarElement.setAttribute('aria-label', 'Main navigation');
      bodyWrapper.appendChild(this.sidebarElement);
    }

    // Main content
    this.mainElement = document.createElement('main');
    this.mainElement.className = 'responsive-layout__main';
    this.mainElement.setAttribute('role', 'main');
    this.mainElement.id = 'main-content';
    bodyWrapper.appendChild(this.mainElement);

    container.appendChild(bodyWrapper);

    // Mobile bottom navigation
    if (this.options.hasMobileNav !== false) {
      this.mobileNavElement = document.createElement('nav');
      this.mobileNavElement.className = 'responsive-nav--mobile';
      this.mobileNavElement.setAttribute('role', 'navigation');
      this.mobileNavElement.setAttribute('aria-label', 'Mobile navigation');
      this.mobileNavElement.innerHTML = this.renderMobileBottomNav();
      container.appendChild(this.mobileNavElement);
    }

    this.applyStateToDOM();
  }

  private renderHeader(): string {
    return `
      <div style="display: flex; align-items: center; padding: 8px 16px; border-bottom: 1px solid #e5e7eb; min-height: ${MIN_TOUCH_TARGET}px;">
        <button
          class="touch-target--icon show-mobile"
          aria-label="Open menu"
          data-action="toggle-menu"
          style="min-width: ${MIN_TOUCH_TARGET}px; min-height: ${MIN_TOUCH_TARGET}px;"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M3 12h18M3 6h18M3 18h18" />
          </svg>
        </button>
        <div style="flex: 1; display: flex; align-items: center; gap: 8px;">
          <span style="font-weight: 600; font-size: 1.125rem;">StreetStudio</span>
        </div>
        <div class="responsive-breadcrumbs" id="layout-breadcrumbs" aria-label="Breadcrumb">
        </div>
      </div>
    `;
  }

  private renderMobileBottomNav(): string {
    const items = [
      { id: 'home', label: 'Home', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
      { id: 'projects', label: 'Projects', icon: 'M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z' },
      { id: 'record', label: 'Record', icon: 'M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z' },
      { id: 'notifications', label: 'Alerts', icon: 'M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9' },
    ];

    return items.map(item => `
      <a
        href="/${item.id === 'home' ? 'dashboard' : item.id}"
        class="touch-target"
        style="flex-direction: column; gap: 2px; padding: 4px 8px; text-decoration: none; color: #6b7280; font-size: 0.75rem;"
        data-mobile-bottom-nav="${item.id}"
        aria-label="${item.label}"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" d="${item.icon}" />
        </svg>
        <span>${item.label}</span>
      </a>
    `).join('');
  }

  private updateState(partial: Partial<LayoutState>): void {
    this.state = { ...this.state, ...partial };
    this.applyStateToDOM();
    this.stateListeners.forEach(l => l(this.getState()));
  }

  private applyStateToDOM(): void {
    // Sidebar visibility
    if (this.sidebarElement) {
      if (this.state.breakpoint === 'mobile') {
        this.sidebarElement.style.display = 'none';
      } else {
        this.sidebarElement.style.display = this.state.sidebarVisible ? 'flex' : 'none';
      }
    }

    // Mobile nav visibility
    if (this.mobileNavElement) {
      this.mobileNavElement.style.display = this.state.breakpoint === 'mobile' ? 'flex' : 'none';
    }

    // Main content bottom padding (for mobile nav)
    if (this.mainElement) {
      this.mainElement.style.paddingBottom = this.state.breakpoint === 'mobile' ? '72px' : '';
    }

    // Menu toggle button visibility
    const menuToggle = this.headerElement?.querySelector('[data-action="toggle-menu"]') as HTMLElement;
    if (menuToggle) {
      menuToggle.style.display = this.state.breakpoint === 'mobile' ? 'inline-flex' : 'none';
    }
  }
}
