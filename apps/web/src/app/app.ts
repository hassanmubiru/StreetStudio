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

      // Setup navigation
      await this.setupNavigation();

      // Setup authentication flow
      await this.setupAuthentication();

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
    // Define routes
    this.router.addRoute('/', () => this.renderLandingPage());
    
    // Authentication routes
    this.router.addRoute('/auth/login', () => this.renderLogin());
    this.router.addRoute('/auth/register', () => this.renderRegister());
    this.router.addRoute('/auth/forgot-password', () => this.renderForgotPassword());
    this.router.addRoute('/auth/reset-password', () => this.renderResetPassword());
    
    // Protected routes (require authentication)
    this.router.addProtectedRoute('/dashboard', () => this.renderDashboard());
    this.router.addProtectedRoute('/projects', () => this.renderProjects());
    this.router.addProtectedRoute('/projects/:projectId', (params) => this.renderProject(params.projectId));
    this.router.addProtectedRoute('/recordings', () => this.renderRecordings());
    this.router.addProtectedRoute('/recordings/:recordingId', (params) => this.renderRecording(params.recordingId));
    this.router.addProtectedRoute('/recordings/:recordingId/review', (params) => this.renderReview(params.recordingId));
    this.router.addProtectedRoute('/recordings/:recordingId/edit', (params) => this.renderEditor(params.recordingId));
    this.router.addProtectedRoute('/search', () => this.renderSearch());
    this.router.addProtectedRoute('/notifications', () => this.renderNotifications());
    this.router.addProtectedRoute('/settings', () => this.renderSettings());
    this.router.addProtectedRoute('/settings/organization', () => this.renderOrganizationSettings());
    this.router.addProtectedRoute('/settings/profile', () => this.renderProfileSettings());
    this.router.addProtectedRoute('/settings/billing', () => this.renderBillingSettings());
    
    // 404 handler
    this.router.setNotFoundHandler(() => this.render404());
    
    // Setup route guards
    this.router.setRouteGuard((path) => {
      // Check authentication for protected routes
      if (this.router.isProtectedRoute(path) && !this.session.isAuthenticated) {
        this.router.navigate('/auth/login');
        return false;
      }
      return true;
    });

    // Start router
    this.router.start();
  }

  // Route handlers
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
    const { RegisterPage } = await import('../pages/auth/register-page.js');
    const page = new RegisterPage(this.authController);
    this.layoutController.renderAuthPage(page.getElement());
  }

  private async renderForgotPassword(): Promise<void> {
    const { ForgotPasswordPage } = await import('../pages/auth/forgot-password-page.js');
    const page = new ForgotPasswordPage(this.authController);
    this.layoutController.renderAuthPage(page.getElement());
  }

  private async renderResetPassword(): Promise<void> {
    const { ResetPasswordPage } = await import('../pages/auth/reset-password-page.js');
    const page = new ResetPasswordPage(this.authController);
    this.layoutController.renderAuthPage(page.getElement());
  }

  private async renderDashboard(): Promise<void> {
    const { DashboardPage } = await import('../pages/dashboard/dashboard-page.js');
    const page = new DashboardPage(this.session);
    this.layoutController.renderAppPage(page.getElement());
  }

  private async renderProjects(): Promise<void> {
    const { ProjectsPage } = await import('../pages/projects/projects-page.js');
    const page = new ProjectsPage(this.session);
    this.layoutController.renderAppPage(page.getElement());
  }

  private async renderProject(projectId: string): Promise<void> {
    const { ProjectPage } = await import('../pages/projects/project-page.js');
    const page = new ProjectPage(this.session, projectId);
    this.layoutController.renderAppPage(page.getElement());
  }

  private async renderRecordings(): Promise<void> {
    const { RecordingsPage } = await import('../pages/recordings/recordings-page.js');
    const page = new RecordingsPage(this.session);
    this.layoutController.renderAppPage(page.getElement());
  }

  private async renderRecording(recordingId: string): Promise<void> {
    const { RecordingPage } = await import('../pages/recordings/recording-page.js');
    const page = new RecordingPage(this.session, recordingId);
    this.layoutController.renderAppPage(page.getElement());
  }

  private async renderReview(recordingId: string): Promise<void> {
    const { ReviewPage } = await import('../pages/review/review-page.js');
    const page = new ReviewPage(this.session, recordingId);
    this.layoutController.renderAppPage(page.getElement());
  }

  private async renderEditor(recordingId: string): Promise<void> {
    const { EditorPage } = await import('../pages/editor/editor-page.js');
    const page = new EditorPage(this.session, recordingId);
    this.layoutController.renderAppPage(page.getElement());
  }

  private async renderSearch(): Promise<void> {
    const { SearchPage } = await import('../pages/search/search-page.js');
    const page = new SearchPage(this.session);
    this.layoutController.renderAppPage(page.getElement());
  }

  private async renderNotifications(): Promise<void> {
    const { NotificationsPage } = await import('../pages/notifications/notifications-page.js');
    const page = new NotificationsPage(this.session);
    this.layoutController.renderAppPage(page.getElement());
  }

  private async renderSettings(): Promise<void> {
    const { SettingsPage } = await import('../pages/settings/settings-page.js');
    const page = new SettingsPage(this.session);
    this.layoutController.renderAppPage(page.getElement());
  }

  private async renderOrganizationSettings(): Promise<void> {
    const { OrganizationSettingsPage } = await import('../pages/settings/organization-settings-page.js');
    const page = new OrganizationSettingsPage(this.session);
    this.layoutController.renderAppPage(page.getElement());
  }

  private async renderProfileSettings(): Promise<void> {
    const { ProfileSettingsPage } = await import('../pages/settings/profile-settings-page.js');
    const page = new ProfileSettingsPage(this.session);
    this.layoutController.renderAppPage(page.getElement());
  }

  private async renderBillingSettings(): Promise<void> {
    const { BillingSettingsPage } = await import('../pages/settings/billing-settings-page.js');
    const page = new BillingSettingsPage(this.session);
    this.layoutController.renderAppPage(page.getElement());
  }

  private async render404(): Promise<void> {
    const { NotFoundPage } = await import('../pages/not-found/not-found-page.js');
    const page = new NotFoundPage();
    this.layoutController.renderPage(page.getElement());
  }

  // Keyboard shortcut handlers
  private openGlobalSearch(): void {
    // TODO: Implement global search modal
  }

  private focusSearch(): void {
    // TODO: Focus search input if visible
  }

  private startNewRecording(): void {
    // TODO: Start recording flow
  }

  private closeOverlays(): void {
    // TODO: Close any open modals or overlays
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