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

export interface Route {
  path: string;
  handler: RouteHandler;
  isProtected: boolean;
  component?: string;
  loadingState?: boolean;
  transition?: 'slide' | 'fade' | 'none';
}

export interface RouterConfig {
  baseUrl?: string;
  enableTransitions?: boolean;
  transitionDuration?: number;
  enablePrefetch?: boolean;
}

export class Router {
  private routes: Map<string, Route> = new Map();
  private protectedRoutes: Set<string> = new Set();
  private currentPath: string = '';
  private routeGuard?: RouteGuard;
  private notFoundHandler?: RouteHandler;
  private config: RouterConfig;
  private isTransitioning = false;
  private prefetchedComponents = new Map<string, any>();

  constructor(config: RouterConfig = {}) {
    this.config = {
      baseUrl: '',
      enableTransitions: true,
      transitionDuration: 300,
      enablePrefetch: true,
      ...config,
    };

    // Bind methods to preserve context
    this.handlePopState = this.handlePopState.bind(this);
  }

  /**
   * Add a regular route
   */
  public addRoute(path: string, handler: RouteHandler, options: Partial<Route> = {}): void {
    this.routes.set(path, {
      path,
      handler,
      isProtected: false,
      transition: 'fade',
      ...options,
    });
  }

  /**
   * Add a protected route (requires authentication)
   */
  public addProtectedRoute(path: string, handler: RouteHandler, options: Partial<Route> = {}): void {
    this.protectedRoutes.add(path);
    this.routes.set(path, {
      path,
      handler,
      isProtected: true,
      transition: 'slide',
      ...options,
    });
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
   * Navigate to a route programmatically
   */
  public async navigate(path: string, options: { replace?: boolean; transition?: string } = {}): Promise<void> {
    if (this.isTransitioning) {
      return; // Prevent navigation during transitions
    }

    // Normalize path
    const normalizedPath = this.normalizePath(path);

    // Don't navigate if already at this path
    if (normalizedPath === this.currentPath) {
      return;
    }

    // Run route guard
    if (this.routeGuard) {
      const canNavigate = await this.routeGuard(normalizedPath);
      if (!canNavigate) {
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

      // Execute route
      await this.executeRoute(normalizedPath, options.transition);

      // Update current path
      this.currentPath = normalizedPath;

    } catch (error) {
      console.error('Navigation failed:', error);
      this.handleNavigationError(error as Error);
    } finally {
      this.isTransitioning = false;
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
   * Destroy the router
   */
  public destroy(): void {
    window.removeEventListener('popstate', this.handlePopState);
    this.routes.clear();
    this.protectedRoutes.clear();
    this.prefetchedComponents.clear();
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
   * Execute a route
   */
  private async executeRoute(path: string, transitionType?: string): Promise<void> {
    const normalizedPath = this.normalizePath(path);
    const route = this.findRoute(normalizedPath);

    if (route) {
      // Check route guard
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

      // Execute route handler
      await this.executeRouteHandler(route, normalizedPath);

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
      paramNames.push(match[1]);
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
        params[name] = matches[index + 1];
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
   * Load component dynamically
   */
  private async loadComponent(componentName: string): Promise<any> {
    // Check if already prefetched
    if (this.prefetchedComponents.has(componentName)) {
      return this.prefetchedComponents.get(componentName);
    }

    // Dynamic import based on component name
    const component = await import(`../pages/${componentName}.js`);
    return component;
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
   * Show loading state
   */
  private showLoadingState(): void {
    // Add loading indicator to app container
    const appContainer = document.querySelector('[data-router-view]');
    if (appContainer) {
      appContainer.classList.add('router-loading');
    }

    // Announce to screen readers
    this.announceToScreenReader('Loading page...');
  }

  /**
   * Hide loading state
   */
  private hideLoadingState(): void {
    const appContainer = document.querySelector('[data-router-view]');
    if (appContainer) {
      appContainer.classList.remove('router-loading');
    }
  }

  /**
   * Handle navigation errors
   */
  private handleNavigationError(error: Error): void {
    console.error('Navigation error:', error);
    
    // Show error state or redirect to error page
    if (this.notFoundHandler) {
      this.notFoundHandler({});
    }

    // Announce error to screen readers
    this.announceToScreenReader('Navigation failed. Please try again.');
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