/**
 * StreetStudio Web Application
 * 
 * Main application class that orchestrates the entire SPA experience.
 */

import { DashboardSession } from '@streetstudio/dashboard';
import { Router } from './router.js';
import { AuthController } from './auth/auth-controller.js';
import { LayoutController } from './layout/layout-controller.js';
import { NavigationController } from './navigation/navigation-controller.js';
import { NotificationController } from './notifications/notification-controller.js';
import { ErrorBoundary } from './error-boundary.js';
import { KeyboardShortcuts } from './keyboard-shortcuts.js';
import type { Uuid } from '@streetstudio/shared';

export interface AppConfig {
  apiBaseUrl: string;
  wsBaseUrl: string;
  environment: string;
  enableAnalytics: boolean;
  enableDevTools: boolean;
}

export interface AppOptions {
  container: HTMLElement;
  config: AppConfig;
}

export class StreetStudioApp {
  private container: HTMLElement;
  private config: AppConfig;
  private session: DashboardSession;
  private router: Router;
  private authController: AuthController;
  private layoutController: LayoutController;
  private navigationController: NavigationController;
  private notificationController: NotificationController;
  private errorBoundary: ErrorBoundary;
  private keyboardShortcuts: KeyboardShortcuts;
  private isInitialized = false;

  constructor(options: AppOptions) {
    this.container = options.container;
    this.config = options.config;

    // Initialize dashboard session
    this.session = new DashboardSession({
      baseUrl: this.config.apiBaseUrl,
      // TODO: Add realtime transport when websockets are implemented
    });

    // Initialize core controllers
    this.router = new Router();
    this.authController = new AuthController(this.session);
    this.layoutController = new LayoutController(this.container);
    this.navigationController = new NavigationController();
    this.notificationController = new NotificationController();
    this.errorBoundary = new ErrorBoundary(this.container);
    this.keyboardShortcuts = new KeyboardShortcuts();
  }
  public async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      // Setup error boundary
      this.errorBoundary.initialize();

      // Initialize keyboard shortcuts
      this.setupKeyboardShortcuts();

      // Setup authentication flow
      await this.setupAuthentication();

      // Setup navigation
      await this.setupNavigation();

      // Setup layout
      await this.setupLayout();

      // Setup router
      await this.setupRouter();

      // Initialize notifications
      this.notificationController.initialize();

      // Mark as initialized
      this.isInitialized = true;

      // Log successful initialization
      if (this.config.enableDevTools) {
        console.log('✅ StreetStudio application initialized successfully');
      }

    } catch (error) {
      console.error('Failed to initialize StreetStudio application:', error);
      this.errorBoundary.handleError(error as Error);
      throw error;
    }
  }

  private setupKeyboardShortcuts(): void {
    // Global keyboard shortcuts
    this.keyboardShortcuts.register([
      {
        key: 'k',
        modifiers: ['cmd', 'ctrl'],
        description: 'Open search',
        handler: () => this.openGlobalSearch(),
      },
      {
        key: '/',
        description: 'Focus search',
        handler: () => this.focusSearch(),
      },
      {
        key: 'n',
        modifiers: ['cmd', 'ctrl'],
        description: 'New recording',
        handler: () => this.startNewRecording(),
      },
      {
        key: 'Escape',
        description: 'Close modals/overlays',
        handler: () => this.closeOverlays(),
      },
    ]);
  }
  private async setupAuthentication(): Promise<void> {
    // Check for stored authentication
    const storedAuth = this.getStoredAuth();
    if (storedAuth) {
      try {
        this.session.useBearerToken(storedAuth.token);
        await this.session.currentMember(); // Validate token
        this.authController.setState({ isAuthenticated: true });
      } catch (error) {
        // Invalid token, clear storage
        this.clearStoredAuth();
        this.authController.setState({ isAuthenticated: false });
      }
    }

    // Setup auth event listeners
    this.authController.onAuthStateChange((state) => {
      if (state.isAuthenticated) {
        // Redirect to dashboard if on auth pages
        if (this.router.getCurrentPath().startsWith('/auth')) {
          this.router.navigate('/dashboard');
        }
      } else {
        // Redirect to login if accessing protected routes
        const currentPath = this.router.getCurrentPath();
        if (!currentPath.startsWith('/auth') && currentPath !== '/') {
          this.router.navigate('/auth/login');
        }
      }
    });
  }

  private async setupNavigation(): Promise<void> {
    this.navigationController.initialize();

    // Setup organization selector
    this.navigationController.onOrganizationChange((orgId: Uuid) => {
      this.session.selectOrganization(orgId);
      // Refresh current page data
      this.router.refresh();
    });
  }

  private async setupLayout(): Promise<void> {
    await this.layoutController.initialize();
    
    // Setup responsive behavior
    this.layoutController.setupResponsiveLayout();
    
    // Setup theme management
    this.layoutController.setupThemeToggle();
  }