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
  private async setupRouter(): Promise<void> {
    // Configure router with authentication
    this.router.setAuthenticationCheck(() => this.authController.isAuthenticated());

    // Define routes
    this.router.addRoute('/', () => this.renderLandingPage(), { 
      title: 'StreetStudio - Video Recording & Collaboration',
      component: 'landing'
    });
    
    // Authentication routes
    this.router.addRoute('/auth/login', () => this.renderLogin(), {
      title: 'Sign In - StreetStudio',
      component: 'login'
    });
    this.router.addRoute('/auth/register', () => this.renderRegister(), {
      title: 'Sign Up - StreetStudio',
      component: 'register'
    });
    this.router.addRoute('/auth/forgot-password', () => this.renderForgotPassword(), {
      title: 'Forgot Password - StreetStudio',
      component: 'forgot-password'
    });
    this.router.addRoute('/auth/reset-password', () => this.renderResetPassword(), {
      title: 'Reset Password - StreetStudio',
      component: 'reset-password'
    });
    
    // Protected routes (require authentication)
    this.router.addProtectedRoute('/dashboard', () => this.renderDashboard(), {
      title: 'Dashboard - StreetStudio',
      component: 'dashboard'
    });
    this.router.addProtectedRoute('/projects', () => this.renderProjects(), {
      title: 'Projects - StreetStudio',
      component: 'projects'
    });
    this.router.addProtectedRoute('/projects/:projectId', (params) => {
      const projectId = params.projectId;
      if (projectId) {
        this.renderProject(projectId);
      }
    }, {
      title: 'Project Details - StreetStudio',
      component: 'project-detail'
    });
    this.router.addProtectedRoute('/recordings', () => this.renderRecordings(), {
      title: 'Recordings - StreetStudio',
      component: 'recordings'
    });
    this.router.addProtectedRoute('/recordings/:recordingId', (params) => {
      const recordingId = params.recordingId;
      if (recordingId) {
        this.renderRecording(recordingId);
      }
    }, {
      title: 'Recording Details - StreetStudio',
      component: 'recording-detail'
    });
    this.router.addProtectedRoute('/recordings/:recordingId/review', (params) => {
      const recordingId = params.recordingId;
      if (recordingId) {
        this.renderReview(recordingId);
      }
    }, {
      title: 'Review Recording - StreetStudio',
      component: 'review'
    });
    this.router.addProtectedRoute('/recordings/:recordingId/edit', (params) => {
      const recordingId = params.recordingId;
      if (recordingId) {
        this.renderEditor(recordingId);
      }
    }, {
      title: 'Edit Recording - StreetStudio',
      component: 'editor'
    });
    this.router.addProtectedRoute('/search', () => this.renderSearch(), {
      title: 'Search - StreetStudio',
      component: 'search'
    });
    this.router.addProtectedRoute('/notifications', () => this.renderNotifications(), {
      title: 'Notifications - StreetStudio',
      component: 'notifications'
    });
    this.router.addProtectedRoute('/settings', () => this.renderSettings(), {
      title: 'Settings - StreetStudio',
      component: 'settings'
    });
    this.router.addProtectedRoute('/settings/organization', () => this.renderOrganizationSettings(), {
      title: 'Organization Settings - StreetStudio',
      component: 'organization-settings'
    });
    this.router.addProtectedRoute('/settings/profile', () => this.renderProfileSettings(), {
      title: 'Profile Settings - StreetStudio',
      component: 'profile-settings'
    });
    this.router.addProtectedRoute('/settings/billing', () => this.renderBillingSettings(), {
      title: 'Billing Settings - StreetStudio',
      component: 'billing-settings'
    });
    
    // 404 handler
    this.router.setNotFoundHandler(() => this.render404());
    
    // Setup route guards
    this.router.setRouteGuard((path) => {
      // Additional route validation can go here
      // The authentication check is handled automatically by the router
      return true;
    });

    // Start router
    this.router.start();
  }

  // Route handlers - use lazy loading
  private async renderLandingPage(): Promise<void> {
    const { LandingPage } = await import('../pages/landing/landing-page.js');
    const page = new LandingPage();
    this.layoutController.renderPage(page.getElement());
  }

  private async renderLogin(): Promise<void> {
    const { LoginPage } = await import('../pages/auth/login-page.js');
    const page = new LoginPage(this.authController);
    this.layoutController.renderAuthPage(page.getElement());
  }

  private async renderRegister(): Promise<void> {
    // TODO: Create register page
    this.layoutController.renderAuthPage(this.createPlaceholderPage('Register'));
  }

  private async renderForgotPassword(): Promise<void> {
    // TODO: Create forgot password page
    this.layoutController.renderAuthPage(this.createPlaceholderPage('Forgot Password'));
  }

  private async renderResetPassword(): Promise<void> {
    // TODO: Create reset password page
    this.layoutController.renderAuthPage(this.createPlaceholderPage('Reset Password'));
  }

  private async renderDashboard(): Promise<void> {
    const { DashboardPage } = await import('../pages/dashboard/dashboard-page.js');
    const page = new DashboardPage(this.session);
    this.layoutController.renderAppPage(page.getElement());
  }
  private async renderProjects(): Promise<void> {
    // TODO: Create projects page
    this.layoutController.renderAppPage(this.createPlaceholderPage('Projects'));
  }

  private async renderProject(projectId: string): Promise<void> {
    // TODO: Create project page
    this.layoutController.renderAppPage(this.createPlaceholderPage(`Project ${projectId}`));
  }

  private async renderRecordings(): Promise<void> {
    // TODO: Create recordings page
    this.layoutController.renderAppPage(this.createPlaceholderPage('Recordings'));
  }

  private async renderRecording(recordingId: string): Promise<void> {
    // TODO: Create recording page
    this.layoutController.renderAppPage(this.createPlaceholderPage(`Recording ${recordingId}`));
  }

  private async renderReview(recordingId: string): Promise<void> {
    // TODO: Create review page
    this.layoutController.renderAppPage(this.createPlaceholderPage(`Review ${recordingId}`));
  }

  private async renderEditor(recordingId: string): Promise<void> {
    // TODO: Create editor page
    this.layoutController.renderAppPage(this.createPlaceholderPage(`Editor ${recordingId}`));
  }

  private async renderSearch(): Promise<void> {
    // TODO: Create search page
    this.layoutController.renderAppPage(this.createPlaceholderPage('Search'));
  }

  private async renderNotifications(): Promise<void> {
    // TODO: Create notifications page
    this.layoutController.renderAppPage(this.createPlaceholderPage('Notifications'));
  }

  private async renderSettings(): Promise<void> {
    // TODO: Create settings page
    this.layoutController.renderAppPage(this.createPlaceholderPage('Settings'));
  }

  private async renderOrganizationSettings(): Promise<void> {
    // TODO: Create organization settings page
    this.layoutController.renderAppPage(this.createPlaceholderPage('Organization Settings'));
  }

  private async renderProfileSettings(): Promise<void> {
    // TODO: Create profile settings page
    this.layoutController.renderAppPage(this.createPlaceholderPage('Profile Settings'));
  }

  private async renderBillingSettings(): Promise<void> {
    // TODO: Create billing settings page
    this.layoutController.renderAppPage(this.createPlaceholderPage('Billing Settings'));
  }
  private async render404(): Promise<void> {
    const { NotFoundPage } = await import('../pages/not-found/not-found-page.js');
    const page = new NotFoundPage();
    this.layoutController.renderPage(page.getElement());
  }

  // Helper method to create placeholder pages
  private createPlaceholderPage(title: string): HTMLElement {
    const page = document.createElement('div');
    page.className = 'p-8 text-center';
    page.innerHTML = `
      <h1 class="text-2xl font-bold text-gray-900 dark:text-white mb-4">${title}</h1>
      <p class="text-gray-600 dark:text-gray-400">This page is under development.</p>
      <button 
        onclick="history.back()" 
        class="mt-4 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
      >
        Go Back
      </button>
    `;
    return page;
  }

  // Keyboard shortcut handlers
  private openGlobalSearch(): void {
    // TODO: Implement global search modal
    console.log('Opening global search...');
  }

  private focusSearch(): void {
    // TODO: Focus search input if visible
    const searchInput = document.querySelector('input[type="search"]') as HTMLInputElement;
    if (searchInput) {
      searchInput.focus();
    }
  }

  private startNewRecording(): void {
    // TODO: Start recording flow
    this.router.navigate('/recordings');
  }

  private closeOverlays(): void {
    // TODO: Close any open modals or overlays
    const modals = document.querySelectorAll('[role="dialog"]');
    modals.forEach(modal => {
      if (modal instanceof HTMLElement) {
        modal.style.display = 'none';
      }
    });
  }
  // Authentication storage helpers
  private getStoredAuth(): { token: string } | null {
    try {
      const stored = localStorage.getItem('streetstudio_auth');
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  }

  private clearStoredAuth(): void {
    localStorage.removeItem('streetstudio_auth');
  }

  // Public API
  public getSession(): DashboardSession {
    return this.session;
  }

  public getRouter(): Router {
    return this.router;
  }

  public destroy(): void {
    this.router.destroy();
    this.keyboardShortcuts.destroy();
    this.notificationController.destroy();
    this.errorBoundary.destroy();
    this.isInitialized = false;
  }
}