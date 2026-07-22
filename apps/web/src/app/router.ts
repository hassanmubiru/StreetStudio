/**
 * StreetStudio Router
 * 
 * Client-side router with authentication guards, lazy loading, and transition animations.
 */

export interface RouteParams {
  [key: string]: string;
}

export interface RouteHandler {
  (params: RouteParams): Promise<void> | void;
}

export interface RouteGuard {
  (path: string): boolean | Promise<boolean>;
}

export interface AuthenticationCheck {
  (): boolean;
}

export interface Route {
  path: string;
  handler: RouteHandler;
  isProtected: boolean;
  component?: string;
  loadingState?: boolean;
  transition?: 'slide' | 'fade' | 'none';
  title?: string;
  meta?: Record<string, any>;
}

export interface RouterConfig {
  baseUrl?: string;
  enableTransitions?: boolean;
  transitionDuration?: number;
  enablePrefetch?: boolean;
  scrollToTop?: boolean;
}

export class Router {
  private routes: Map<string, Route> = new Map();
  private protectedRoutes: Set<string> = new Set();
  private currentPath: string = '';
  private routeGuard?: RouteGuard;
  private authCheck?: AuthenticationCheck;
  private notFoundHandler?: RouteHandler;
  private config: RouterConfig;
  private isTransitioning = false;
  private prefetchedComponents = new Map<string, any>();
  private abortController?: AbortController;

  constructor(config: RouterConfig = {}) {
    this.config = {
      baseUrl: '',
      enableTransitions: true,
      transitionDuration: 300,
      enablePrefetch: true,
      scrollToTop: true,
      ...config,
    };

    // Bind methods to preserve context
    this.handlePopState = this.handlePopState.bind(this);
  }

  /**
   * Set authentication check function
   */
  public setAuthenticationCheck(authCheck: AuthenticationCheck): void {
    this.authCheck = authCheck;
  }

  /**
   * Add a regular route with metadata support
   */
  public addRoute(path: string, handler: RouteHandler, options: Partial<Route> = {}): void {
    this.routes.set(path, {
      path,
      handler,
      isProtected: false,
      transition: 'fade',
      title: options.title || this.generateTitleFromPath(path),
      ...options,
    });
  }

  /**
   * Add a protected route (requires authentication) with metadata support
   */
  public addProtectedRoute(path: string, handler: RouteHandler, options: Partial<Route> = {}): void {
    this.protectedRoutes.add(path);
    this.routes.set(path, {
      path,
      handler,
      isProtected: true,
      transition: 'slide',
      title: options.title || this.generateTitleFromPath(path),
      ...options,
    });
  }

  /**
   * Generate a title from path for accessibility
   */
  private generateTitleFromPath(path: string): string {
    const segments = path.split('/').filter(Boolean);
    if (segments.length === 0) return 'Home';
    
    return segments
      .map(segment => segment.charAt(0).toUpperCase() + segment.slice(1))
      .join(' - ');
  }

  /**
   * Set route guard function
   */
  public setRouteGuard(guard: RouteGuard): void {
    this.routeGuard = guard;
  }

  /**
   * Set 404 handler
   */
  public setNotFoundHandler(handler: RouteHandler): void {
    this.notFoundHandler = handler;
  }

  /**
   * Check if a route is protected
   */
  public isProtectedRoute(path: string): boolean {
    return this.protectedRoutes.has(path) || this.protectedRoutes.has(this.getPathPattern(path));
  }

  /**
   * Start the router
   */
  public start(): void {
    // Listen for browser back/forward navigation
    window.addEventListener('popstate', this.handlePopState);

    // Handle initial navigation
    this.handleInitialNavigation();

    // Setup prefetching if enabled
    if (this.config.enablePrefetch) {
      this.setupPrefetching();
    }

    // Setup link interception for SPA navigation
    this.setupLinkInterception();
  }

  /**
   * Navigate to a route programmatically with improved error handling and cancellation
   */
  public async navigate(path: string, options: { replace?: boolean; transition?: string; force?: boolean } = {}): Promise<void> {
    // Cancel any ongoing navigation
    if (this.abortController) {
      this.abortController.abort();
    }
    this.abortController = new AbortController();
    
    if (this.isTransitioning && !options.force) {
      return; // Prevent navigation during transitions unless forced
    }

    // Normalize path
    const normalizedPath = this.normalizePath(path);

    // Don't navigate if already at this path unless forced
    if (normalizedPath === this.currentPath && !options.force) {
      return;
    }

    // Check authentication for protected routes first
    if (this.isProtectedRoute(normalizedPath) && this.authCheck && !this.authCheck()) {
      // Redirect to login instead of blocking
      console.log('Redirecting unauthenticated user to login');
      this.navigate('/auth/login', { replace: true });
      return;
    }

    // Run additional route guard
    if (this.routeGuard) {
      try {
        const canNavigate = await this.routeGuard(normalizedPath);
        if (!canNavigate) {
          return;
        }
      } catch (error) {
        console.error('Route guard error:', error);
        this.handleNavigationError(error as Error);
        return;
      }
    }

    try {
      this.isTransitioning = true;

      // Update browser history
      if (options.replace) {
        window.history.replaceState({ path: normalizedPath }, '', normalizedPath);
      } else {
        window.history.pushState({ path: normalizedPath }, '', normalizedPath);
      }

      // Execute route with abort signal
      await this.executeRoute(normalizedPath, options.transition, this.abortController.signal);

      // Update current path
      this.currentPath = normalizedPath;

      // Scroll to top if enabled
      if (this.config.scrollToTop) {
        this.scrollToTop();
      }

    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        console.debug('Navigation cancelled');
        return;
      }
      console.error('Navigation failed:', error);
      this.handleNavigationError(error as Error);
    } finally {
      this.isTransitioning = false;
      this.abortController = undefined;
    }
  }

  /**
   * Get the current path
   */
  public getCurrentPath(): string {
    return this.currentPath;
  }

  /**
   * Refresh the current route
   */
  public async refresh(): Promise<void> {
    if (this.currentPath) {
      const route = this.findRoute(this.currentPath);
      if (route) {
        await this.executeRouteHandler(route, this.currentPath);
      }
    }
  }

  /**
   * Destroy the router and clean up resources
   */
  public destroy(): void {
    // Cancel any ongoing navigation
    if (this.abortController) {
      this.abortController.abort();
    }
    
    window.removeEventListener('popstate', this.handlePopState);
    this.routes.clear();
    this.protectedRoutes.clear();
    this.prefetchedComponents.clear();
    this.authCheck = undefined;
    this.routeGuard = undefined;
    this.notFoundHandler = undefined;
  }

  /**
   * Handle browser back/forward navigation
   */
  private handlePopState(event: PopStateEvent): void {
    const path = event.state?.path || window.location.pathname;
    this.executeRoute(path);
  }

  /**
   * Handle initial navigation when router starts
   */
  private handleInitialNavigation(): void {
    const initialPath = window.location.pathname + window.location.search + window.location.hash;
    this.executeRoute(initialPath);
  }

  /**
   * Scroll to top of page smoothly
   */
  private scrollToTop(): void {
    window.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
  }

  /**
   * Setup link interception for SPA navigation
   */
  private setupLinkInterception(): void {
    document.addEventListener('click', (event) => {
      const target = event.target as HTMLElement;
      const link = target.closest('a[href]') as HTMLAnchorElement;

      if (!link) return;

      // Only intercept internal links
      if (this.isInternalLink(link)) {
        event.preventDefault();
        this.navigate(link.getAttribute('href')!);
      }
    });
  }

  /**
   * Setup route prefetching on hover/focus
   */
  private setupPrefetching(): void {
    document.addEventListener('mouseover', (event) => {
      const target = event.target as HTMLElement;
      const link = target.closest('a[href]') as HTMLAnchorElement;

      if (link && this.isInternalLink(link)) {
        const href = link.getAttribute('href')!;
        this.prefetchRoute(href);
      }
    });

    document.addEventListener('focusin', (event) => {
      const target = event.target as HTMLElement;
      if (target.tagName === 'A' && this.isInternalLink(target as HTMLAnchorElement)) {
        const href = (target as HTMLAnchorElement).getAttribute('href')!;
        this.prefetchRoute(href);
      }
    });
  }

  /**
   * Prefetch a route's component
   */
  private async prefetchRoute(path: string): Promise<void> {
    const normalizedPath = this.normalizePath(path);
    const route = this.findRoute(normalizedPath);

    if (route && route.component && !this.prefetchedComponents.has(route.component)) {
      try {
        const component = await this.loadComponent(route.component);
        this.prefetchedComponents.set(route.component, component);
      } catch (error) {
        // Silently fail prefetch attempts
        console.debug('Prefetch failed for:', route.component);
      }
    }
  }

  /**
   * Execute a route with improved error handling and abort support
   */
  private async executeRoute(path: string, transitionType?: string, signal?: AbortSignal): Promise<void> {
    const normalizedPath = this.normalizePath(path);
    const route = this.findRoute(normalizedPath);

    if (route) {
      // Check if navigation was cancelled
      if (signal?.aborted) {
        throw new Error('Navigation cancelled');
      }

      // Update page title
      if (route.title) {
        document.title = route.title;
      }

      // Check route guard one more time
      if (this.routeGuard) {
        const canAccess = await this.routeGuard(normalizedPath);
        if (!canAccess) {
          return;
        }
      }

      // Show loading state if needed
      if (route.loadingState !== false) {
        this.showLoadingState();
      }

      // Execute transition out animation
      if (this.config.enableTransitions && this.currentPath) {
        await this.executeTransitionOut(transitionType || route.transition || 'fade');
      }

      // Check cancellation again before executing handler
      if (signal?.aborted) {
        throw new Error('Navigation cancelled');
      }

      // Execute route handler
      await this.executeRouteHandler(route, normalizedPath);

      // Check cancellation one final time
      if (signal?.aborted) {
        throw new Error('Navigation cancelled');
      }

      // Execute transition in animation
      if (this.config.enableTransitions) {
        await this.executeTransitionIn(transitionType || route.transition || 'fade');
      }

      // Hide loading state
      this.hideLoadingState();

    } else if (this.notFoundHandler) {
      await this.notFoundHandler({});
    } else {
      console.warn('No route found for:', normalizedPath);
      throw new Error(`Route not found: ${normalizedPath}`);
    }

    // Update current path
    this.currentPath = normalizedPath;
  }

  /**
   * Execute route handler with parameter extraction
   */
  private async executeRouteHandler(route: Route, path: string): Promise<void> {
    const params = this.extractParams(route.path, path);
    
    try {
      await route.handler(params);
    } catch (error) {
      console.error('Route handler failed:', error);
      this.handleNavigationError(error as Error);
    }
  }

  /**
   * Find matching route for a path
   */
  private findRoute(path: string): Route | undefined {
    // First try exact match
    if (this.routes.has(path)) {
      return this.routes.get(path);
    }

    // Then try pattern matching
    for (const [pattern, route] of this.routes) {
      if (this.matchesPattern(pattern, path)) {
        return route;
      }
    }

    return undefined;
  }

  /**
   * Get the pattern for a path (for protected route checking)
   */
  private getPathPattern(path: string): string {
    for (const pattern of this.protectedRoutes) {
      if (this.matchesPattern(pattern, path)) {
        return pattern;
      }
    }
    return path;
  }

  /**
   * Check if a path pattern matches a given path
   */
  private matchesPattern(pattern: string, path: string): boolean {
    // Convert route pattern to regex
    const regexPattern = pattern
      .replace(/:[^/]+/g, '([^/]+)') // Replace :param with capture group
      .replace(/\*/g, '.*'); // Replace * with any chars

    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(path);
  }

  /**
   * Extract parameters from path using route pattern
   */
  private extractParams(pattern: string, path: string): RouteParams {
    const params: RouteParams = {};
    
    // Extract parameter names from pattern
    const paramNames: string[] = [];
    const paramMatches = pattern.matchAll(/:([^/]+)/g);
    for (const match of paramMatches) {
      if (match[1]) {
        paramNames.push(match[1]);
      }
    }

    if (paramNames.length === 0) {
      return params;
    }

    // Create regex to extract values
    const regexPattern = pattern.replace(/:[^/]+/g, '([^/]+)');
    const regex = new RegExp(`^${regexPattern}$`);
    const matches = path.match(regex);

    if (matches) {
      // matches[0] is the full match, parameters start at index 1
      paramNames.forEach((name, index) => {
        const paramValue = matches[index + 1];
        if (paramValue !== undefined) {
          params[name] = paramValue;
        }
      });
    }

    return params;
  }

  /**
   * Normalize path by removing trailing slashes and adding leading slash
   */
  private normalizePath(path: string): string {
    if (!path.startsWith('/')) {
      path = '/' + path;
    }
    if (path.length > 1 && path.endsWith('/')) {
      path = path.slice(0, -1);
    }
    return path;
  }

  /**
   * Check if a link is internal (same origin)
   */
  private isInternalLink(link: HTMLAnchorElement): boolean {
    const href = link.getAttribute('href');
    if (!href) return false;

    // Skip external links, mailto, tel, etc.
    if (href.startsWith('http') || href.startsWith('mailto:') || href.startsWith('tel:')) {
      return false;
    }

    // Skip links with target="_blank"
    if (link.getAttribute('target') === '_blank') {
      return false;
    }

    return true;
  }

  /**
   * Load component dynamically with proper error handling
   */
  private async loadComponent(componentName: string): Promise<any> {
    // Check if already prefetched
    if (this.prefetchedComponents.has(componentName)) {
      return this.prefetchedComponents.get(componentName);
    }

    try {
      // Map component names to their actual import paths
      const componentPaths: Record<string, () => Promise<any>> = {
        'landing': () => import('../pages/landing/landing-page.js'),
        'login': () => import('../pages/auth/login-page.js'),
        'register': () => import('../pages/auth/register-page.js'),
        'forgot-password': () => import('../pages/auth/forgot-password-page.js'),
        'reset-password': () => import('../pages/auth/reset-password-page.js'),
        'dashboard': () => import('../pages/dashboard/dashboard-page.js'),
        'projects': () => import('../pages/projects/projects-page.js'),
        'project-detail': () => import('../pages/projects/project-detail-page.js'),
        'recordings': () => import('../pages/recordings/recordings-page.js'),
        'recording-detail': () => import('../pages/recordings/recording-detail-page.js'),
        'review': () => import('../pages/review/review-page.js'),
        'editor': () => import('../pages/editor/editor-page.js'),
        'search': () => import('../pages/search/search-page.js'),
        'notifications': () => import('../pages/notifications/notifications-page.js'),
        'settings': () => import('../pages/settings/settings-page.js'),
        'organization-settings': () => import('../pages/settings/organization-settings-page.js'),
        'profile-settings': () => import('../pages/settings/profile-settings-page.js'),
        'billing-settings': () => import('../pages/settings/billing-settings-page.js'),
        'not-found': () => import('../pages/not-found/not-found-page.js'),
      };

      const importFn = componentPaths[componentName];
      if (!importFn) {
        throw new Error(`Unknown component: ${componentName}`);
      }

      const module = await importFn();
      this.prefetchedComponents.set(componentName, module);
      return module;

    } catch (error) {
      console.error(`Failed to load component '${componentName}':`, error);
      throw new Error(`Component loading failed: ${componentName}`);
    }
  }

  /**
   * Execute transition out animation
   */
  private async executeTransitionOut(transitionType: string): Promise<void> {
    if (!this.config.enableTransitions) return;

    const appContainer = document.querySelector('[data-router-view]');
    if (!appContainer) return;

    return new Promise((resolve) => {
      const duration = this.config.transitionDuration || 300;

      switch (transitionType) {
        case 'slide':
          appContainer.classList.add('router-slide-out');
          break;
        case 'fade':
          appContainer.classList.add('router-fade-out');
          break;
        default:
          resolve();
          return;
      }

      setTimeout(() => {
        resolve();
      }, duration / 2); // Exit halfway through transition
    });
  }

  /**
   * Execute transition in animation
   */
  private async executeTransitionIn(transitionType: string): Promise<void> {
    if (!this.config.enableTransitions) return;

    const appContainer = document.querySelector('[data-router-view]');
    if (!appContainer) return;

    return new Promise((resolve) => {
      const duration = this.config.transitionDuration || 300;

      // Clean up exit classes
      appContainer.classList.remove('router-slide-out', 'router-fade-out');

      switch (transitionType) {
        case 'slide':
          appContainer.classList.add('router-slide-in');
          break;
        case 'fade':
          appContainer.classList.add('router-fade-in');
          break;
        default:
          resolve();
          return;
      }

      setTimeout(() => {
        appContainer.classList.remove('router-slide-in', 'router-fade-in');
        resolve();
      }, duration / 2);
    });
  }

  /**
   * Show loading state with accessibility support
   */
  private showLoadingState(): void {
    // Add loading indicator to app container
    const appContainer = document.querySelector('[data-router-view]');
    if (appContainer) {
      appContainer.classList.add('router-loading');
      // Set loading state for screen readers
      appContainer.setAttribute('aria-busy', 'true');
      appContainer.setAttribute('aria-live', 'polite');
    }

    // Announce to screen readers
    this.announceToScreenReader('Loading page...');

    // Focus management: move focus to loading indicator if present
    const loadingIndicator = document.querySelector('[data-loading-indicator]');
    if (loadingIndicator instanceof HTMLElement) {
      loadingIndicator.focus();
    }
  }

  /**
   * Hide loading state and restore focus
   */
  private hideLoadingState(): void {
    const appContainer = document.querySelector('[data-router-view]');
    if (appContainer) {
      appContainer.classList.remove('router-loading');
      appContainer.removeAttribute('aria-busy');
      
      // Focus management: move focus to main content
      const mainContent = appContainer.querySelector('[data-main-content]') as HTMLElement;
      if (mainContent) {
        // Ensure main content is focusable
        if (!mainContent.hasAttribute('tabindex')) {
          mainContent.setAttribute('tabindex', '-1');
        }
        mainContent.focus();
        
        // Announce page change to screen readers
        const pageTitle = mainContent.getAttribute('aria-label') || 
                         document.title || 
                         'Page loaded';
        this.announceToScreenReader(pageTitle);
      }
    }
  }

  /**
   * Handle navigation errors with proper error boundary integration
   */
  private handleNavigationError(error: Error): void {
    console.error('Navigation error:', error);
    
    // Add error state to router container
    const appContainer = document.querySelector('[data-router-view]');
    if (appContainer) {
      appContainer.classList.add('router-error');
    }

    // Try to show error page first, fallback to error boundary
    if (this.notFoundHandler) {
      try {
        this.notFoundHandler({});
      } catch (handlerError) {
        console.error('Error handler failed:', handlerError);
        this.fallbackToErrorBoundary(error);
      }
    } else {
      this.fallbackToErrorBoundary(error);
    }

    // Announce error to screen readers
    this.announceToScreenReader('Navigation failed. Please try again.');
  }

  /**
   * Fallback to error boundary when navigation completely fails
   */
  private fallbackToErrorBoundary(error: Error): void {
    // Dispatch custom event for error boundary to catch
    const errorEvent = new CustomEvent('router-error', {
      detail: { error, context: 'navigation' }
    });
    window.dispatchEvent(errorEvent);
  }

  /**
   * Announce messages to screen readers
   */
  private announceToScreenReader(message: string): void {
    const announcer = document.getElementById('announcements');
    if (announcer) {
      announcer.textContent = message;
      // Clear after announcement
      setTimeout(() => {
        announcer.textContent = '';
      }, 1000);
    }
  }
}