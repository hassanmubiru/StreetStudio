/**
 * Layout Controller
 * 
 * Manages application layout, themes, and page rendering.
 */

export class LayoutController {
  private container: HTMLElement;
  private currentLayout: 'app' | 'auth' | 'landing' = 'landing';

  constructor(container: HTMLElement) {
    this.container = container;
  }

  /**
   * Initialize layout controller
   */
  public async initialize(): Promise<void> {
    // Set up initial layout structure
    this.setupLayoutStructure();
    
    // Load router transition styles
    await this.loadRouterStyles();
  }

  /**
   * Setup responsive layout handling
   */
  public setupResponsiveLayout(): void {
    // Add responsive classes and listeners
    this.updateLayoutClasses();
    
    window.addEventListener('resize', () => {
      this.updateLayoutClasses();
    });
  }

  /**
   * Setup theme toggle functionality
   */
  public setupThemeToggle(): void {
    // Check for saved theme preference
    const savedTheme = localStorage.getItem('streetstudio_theme');
    const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    
    const theme = savedTheme || (systemPrefersDark ? 'dark' : 'light');
    this.setTheme(theme);

    // Listen for system theme changes
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
      if (!localStorage.getItem('streetstudio_theme')) {
        this.setTheme(e.matches ? 'dark' : 'light');
      }
    });
  }

  /**
   * Render a page in the main application layout
   */
  public renderAppPage(pageElement: HTMLElement): void {
    this.switchToLayout('app');
    this.renderPageContent(pageElement);
  }

  /**
   * Render a page in the authentication layout
   */
  public renderAuthPage(pageElement: HTMLElement): void {
    this.switchToLayout('auth');
    this.renderPageContent(pageElement);
  }

  /**
   * Render a page in the basic layout (landing, 404, etc.)
   */
  public renderPage(pageElement: HTMLElement): void {
    this.switchToLayout('landing');
    this.renderPageContent(pageElement);
  }

  /**
   * Setup the basic layout structure
   */
  private setupLayoutStructure(): void {
    this.container.innerHTML = `
      <div id="layout-root" class="min-h-screen bg-gray-50 dark:bg-gray-900">
        <div id="router-view" data-router-view class="w-full min-h-screen">
          <!-- Page content will be rendered here -->
        </div>
      </div>
    `;

    // Add layout classes
    this.container.className = 'streetstudio-app';
  }

  /**
   * Switch between different layout modes
   */
  private switchToLayout(layout: 'app' | 'auth' | 'landing'): void {
    if (this.currentLayout === layout) return;

    const layoutRoot = document.getElementById('layout-root');
    if (!layoutRoot) return;

    // Remove existing layout classes
    layoutRoot.classList.remove('layout-app', 'layout-auth', 'layout-landing');
    
    // Add new layout class
    layoutRoot.classList.add(`layout-${layout}`);
    
    this.currentLayout = layout;

    // Add layout-specific structure if needed
    if (layout === 'app') {
      this.setupAppLayout();
    } else if (layout === 'auth') {
      this.setupAuthLayout();
    } else {
      this.setupBasicLayout();
    }
  }

  /**
   * Setup application layout with navigation
   */
  private setupAppLayout(): void {
    const routerView = document.getElementById('router-view');
    if (!routerView) return;

    routerView.className = 'flex min-h-screen bg-gray-50 dark:bg-gray-900';
    routerView.innerHTML = `
      <div id="app-sidebar" class="hidden lg:flex lg:flex-shrink-0">
        <div class="flex flex-col w-64 border-r border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
          <!-- Sidebar content will be added by navigation controller -->
        </div>
      </div>
      <div class="flex flex-col flex-1 overflow-hidden">
        <div id="app-header" class="flex-shrink-0 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
          <!-- Header content will be added by navigation controller -->
        </div>
        <main id="app-main" class="flex-1 relative overflow-y-auto focus:outline-none" tabindex="-1">
          <div id="page-content" class="w-full h-full">
            <!-- Page content will be rendered here -->
          </div>
        </main>
      </div>
    `;
  }

  /**
   * Setup authentication layout
   */
  private setupAuthLayout(): void {
    const routerView = document.getElementById('router-view');
    if (!routerView) return;

    routerView.className = 'min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 py-12 px-4 sm:px-6 lg:px-8';
    routerView.innerHTML = `
      <div id="auth-container" class="max-w-md w-full space-y-8">
        <div id="page-content" class="w-full">
          <!-- Auth page content will be rendered here -->
        </div>
      </div>
    `;
  }

  /**
   * Setup basic layout for landing pages, 404, etc.
   */
  private setupBasicLayout(): void {
    const routerView = document.getElementById('router-view');
    if (!routerView) return;

    routerView.className = 'w-full min-h-screen';
    routerView.innerHTML = `
      <div id="page-content" class="w-full min-h-screen">
        <!-- Page content will be rendered here -->
      </div>
    `;
  }

  /**
   * Render page content in the appropriate container
   */
  private renderPageContent(pageElement: HTMLElement): void {
    const pageContent = document.getElementById('page-content');
    if (!pageContent) return;

    // Clear existing content
    pageContent.innerHTML = '';
    
    // Add new content
    pageContent.appendChild(pageElement);

    // Focus management for accessibility
    this.manageFocus(pageElement);
  }

  /**
   * Update layout classes based on screen size
   */
  private updateLayoutClasses(): void {
    const layoutRoot = document.getElementById('layout-root');
    if (!layoutRoot) return;

    const isMobile = window.innerWidth < 768;
    const isTablet = window.innerWidth >= 768 && window.innerWidth < 1024;
    const isDesktop = window.innerWidth >= 1024;

    layoutRoot.classList.toggle('mobile', isMobile);
    layoutRoot.classList.toggle('tablet', isTablet);
    layoutRoot.classList.toggle('desktop', isDesktop);
  }

  /**
   * Set theme (light/dark/system)
   */
  private setTheme(theme: string): void {
    const html = document.documentElement;
    
    html.classList.remove('light', 'dark');
    
    if (theme === 'system') {
      localStorage.removeItem('streetstudio_theme');
      const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      html.classList.add(systemPrefersDark ? 'dark' : 'light');
    } else {
      localStorage.setItem('streetstudio_theme', theme);
      html.classList.add(theme);
    }
  }

  /**
   * Manage focus for accessibility during page transitions
   */
  private manageFocus(pageElement: HTMLElement): void {
    // Look for a main heading to focus on
    const heading = pageElement.querySelector('h1, h2, [role="heading"]') as HTMLElement;
    if (heading && heading.tabIndex !== -1) {
      // Make heading focusable and focus it
      heading.tabIndex = -1;
      heading.focus();
      return;
    }

    // Look for a main content area
    const mainContent = pageElement.querySelector('main, [role="main"]') as HTMLElement;
    if (mainContent) {
      mainContent.tabIndex = -1;
      mainContent.focus();
      return;
    }

    // Focus the page element itself
    pageElement.tabIndex = -1;
    pageElement.focus();
  }

  /**
   * Load router transition styles
   */
  private async loadRouterStyles(): Promise<void> {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/src/styles/router-transitions.css';
    document.head.appendChild(link);
  }
}