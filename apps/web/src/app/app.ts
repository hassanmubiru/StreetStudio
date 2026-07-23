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
import { apiClient } from '../services/api.js';
import { initializeCollaborationSocket } from '../services/websocket.js';
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
      // Setup error boundary first
      this.errorBoundary.initialize();

      // Configure API client
      apiClient.setDefaultHeaders({
        'X-Application': 'StreetStudio Web',
        'X-Version': '1.0.0',
      });

      // Initialize collaboration WebSocket
      if (this.config.wsBaseUrl) {
        try {
          initializeCollaborationSocket(this.config.wsBaseUrl);
        } catch (error) {
          console.warn('Failed to initialize collaboration socket:', error);
          // Continue without WebSocket - graceful degradation will handle it
        }
      }

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
      this.errorBoundary.handleError(error as Error, 'initialization');
      throw error;
    }
  }

  private setupKeyboardShortcuts(): void {
    // Global keyboard shortcuts
    this.keyboardShortcuts.register([
      {
        key: 'k',
        modifiers: ['cmd', 'ctrl'] as ('ctrl' | 'cmd' | 'alt' | 'shift')[],
        description: 'Open global search',
        handler: () => this.openGlobalSearch(),
        priority: 100,
      },
      {
        key: '/',
        description: 'Focus search input',
        handler: () => this.focusSearch(),
        priority: 90,
      },
      {
        key: 'n',
        modifiers: ['cmd', 'ctrl'] as ('ctrl' | 'cmd' | 'alt' | 'shift')[],
        description: 'Start new recording',
        handler: () => this.startNewRecording(),
        priority: 100,
      },
      {
        key: 'Escape',
        description: 'Close modals and overlays',
        handler: () => this.closeOverlays(),
        priority: 200, // High priority for escape
      },
      // Navigation shortcuts
      {
        key: 'd',
        modifiers: ['alt'] as ('ctrl' | 'cmd' | 'alt' | 'shift')[],
        description: 'Navigate to dashboard',
        handler: () => this.router.navigate('/dashboard'),
        priority: 80,
      },
      {
        key: 'p',
        modifiers: ['alt'] as ('ctrl' | 'cmd' | 'alt' | 'shift')[],
        description: 'Navigate to projects',
        handler: () => this.router.navigate('/projects'),
        priority: 80,
      },
      {
        key: 'r',
        modifiers: ['alt'] as ('ctrl' | 'cmd' | 'alt' | 'shift')[],
        description: 'Navigate to recordings',
        handler: () => this.router.navigate('/recordings'),
        priority: 80,
      },
      {
        key: 's',
        modifiers: ['alt'] as ('ctrl' | 'cmd' | 'alt' | 'shift')[],
        description: 'Navigate to settings',
        handler: () => this.router.navigate('/settings'),
        priority: 80,
      },
    ]);

    // Setup context-sensitive shortcuts based on current route
    this.setupContextSensitiveShortcuts();
  }

  private setupContextSensitiveShortcuts(): void {
    // Listen for route changes to update context
    this.router.onRouteChange((path) => {
      this.updateKeyboardContext(path);
    });

    // Set initial context
    this.updateKeyboardContext(this.router.getCurrentPath());
  }

  private updateKeyboardContext(path: string): void {
    let context = 'global';

    if (path.startsWith('/dashboard')) {
      context = 'dashboard';
      this.registerDashboardShortcuts();
    } else if (path.startsWith('/recordings')) {
      if (path.includes('/review')) {
        context = 'video-review';
        this.registerVideoReviewShortcuts();
      } else if (path.includes('/edit')) {
        context = 'video-editor';
        this.registerVideoEditorShortcuts();
      } else {
        context = 'recordings';
        this.registerRecordingsShortcuts();
      }
    } else if (path.startsWith('/projects')) {
      context = 'projects';
      this.registerProjectsShortcuts();
    } else if (path.startsWith('/search')) {
      context = 'search';
      this.registerSearchShortcuts();
    } else if (path.startsWith('/auth')) {
      context = 'auth';
      this.registerAuthShortcuts();
    }

    this.keyboardShortcuts.setContext(context);
  }

  private registerDashboardShortcuts(): void {
    this.keyboardShortcuts.register([
      {
        key: 'r',
        modifiers: ['cmd', 'ctrl'] as ('ctrl' | 'cmd' | 'alt' | 'shift')[],
        context: 'dashboard',
        description: 'Refresh dashboard',
        handler: () => this.router.refresh(),
      },
      {
        key: 'f',
        modifiers: ['cmd', 'ctrl'] as ('ctrl' | 'cmd' | 'alt' | 'shift')[],
        context: 'dashboard',
        description: 'Filter dashboard content',
        handler: () => this.focusDashboardFilter(),
      },
    ]);
  }

  private registerRecordingsShortcuts(): void {
    this.keyboardShortcuts.register([
      {
        key: ' ',
        context: 'recordings',
        description: 'Start/stop recording',
        handler: (event) => {
          event.preventDefault();
          this.toggleRecording();
        },
      },
      {
        key: 'Delete',
        context: 'recordings',
        description: 'Delete selected recording',
        handler: () => this.deleteSelectedRecording(),
      },
    ]);
  }

  private registerVideoReviewShortcuts(): void {
    this.keyboardShortcuts.register([
      {
        key: ' ',
        context: 'video-review',
        description: 'Play/pause video',
        handler: (event) => {
          event.preventDefault();
          this.toggleVideoPlayback();
        },
      },
      {
        key: 'ArrowLeft',
        context: 'video-review',
        description: 'Rewind 10 seconds',
        handler: (event) => {
          event.preventDefault();
          this.seekVideo(-10);
        },
      },
      {
        key: 'ArrowRight',
        context: 'video-review',
        description: 'Forward 10 seconds',
        handler: (event) => {
          event.preventDefault();
          this.seekVideo(10);
        },
      },
      {
        key: 'j',
        context: 'video-review',
        description: 'Rewind 10 seconds',
        handler: () => this.seekVideo(-10),
      },
      {
        key: 'l',
        context: 'video-review',
        description: 'Forward 10 seconds',
        handler: () => this.seekVideo(10),
      },
      {
        key: 'k',
        context: 'video-review',
        description: 'Play/pause video',
        handler: () => this.toggleVideoPlayback(),
      },
      {
        key: 'f',
        context: 'video-review',
        description: 'Toggle fullscreen',
        handler: () => this.toggleFullscreen(),
      },
      {
        key: 'c',
        context: 'video-review',
        description: 'Add comment at current time',
        handler: () => this.addCommentAtCurrentTime(),
      },
      {
        key: 'm',
        context: 'video-review',
        description: 'Toggle mute',
        handler: () => this.toggleMute(),
      },
    ]);
  }

  private registerVideoEditorShortcuts(): void {
    this.keyboardShortcuts.register([
      {
        key: ' ',
        context: 'video-editor',
        description: 'Play/pause timeline',
        handler: (event) => {
          event.preventDefault();
          this.toggleTimelinePlayback();
        },
      },
      {
        key: 'i',
        context: 'video-editor',
        description: 'Set in point',
        handler: () => this.setInPoint(),
      },
      {
        key: 'o',
        context: 'video-editor',
        description: 'Set out point',
        handler: () => this.setOutPoint(),
      },
      {
        key: 'x',
        context: 'video-editor',
        description: 'Cut at playhead',
        handler: () => this.cutAtPlayhead(),
      },
      {
        key: 'z',
        modifiers: ['cmd', 'ctrl'] as ('ctrl' | 'cmd' | 'alt' | 'shift')[],
        context: 'video-editor',
        description: 'Undo last action',
        handler: () => this.undoLastAction(),
      },
      {
        key: 'z',
        modifiers: ['cmd', 'shift'] as ('ctrl' | 'cmd' | 'alt' | 'shift')[],
        context: 'video-editor',
        description: 'Redo last action',
        handler: () => this.redoLastAction(),
      },
      {
        key: 's',
        modifiers: ['cmd', 'ctrl'] as ('ctrl' | 'cmd' | 'alt' | 'shift')[],
        context: 'video-editor',
        description: 'Save project',
        handler: (event) => {
          event.preventDefault();
          this.saveProject();
        },
      },
    ]);
  }

  private registerProjectsShortcuts(): void {
    this.keyboardShortcuts.register([
      {
        key: 'n',
        modifiers: ['cmd', 'ctrl'] as ('ctrl' | 'cmd' | 'alt' | 'shift')[],
        context: 'projects',
        description: 'Create new project',
        handler: () => this.createNewProject(),
      },
      {
        key: 'Delete',
        context: 'projects',
        description: 'Delete selected project',
        handler: () => this.deleteSelectedProject(),
      },
    ]);
  }

  private registerSearchShortcuts(): void {
    this.keyboardShortcuts.register([
      {
        key: 'Enter',
        context: 'search',
        description: 'Execute search',
        handler: () => this.executeSearch(),
      },
      {
        key: 'ArrowDown',
        context: 'search',
        description: 'Navigate to next result',
        handler: (event) => {
          event.preventDefault();
          this.navigateSearchResults(1);
        },
      },
      {
        key: 'ArrowUp',
        context: 'search',
        description: 'Navigate to previous result',
        handler: (event) => {
          event.preventDefault();
          this.navigateSearchResults(-1);
        },
      },
    ]);
  }

  private registerAuthShortcuts(): void {
    this.keyboardShortcuts.register([
      {
        key: 'Enter',
        context: 'auth',
        description: 'Submit form',
        handler: () => this.submitAuthForm(),
      },
    ]);
  }
  private async setupAuthentication(): Promise<void> {
    // Initialize authentication from stored tokens with automatic refresh
    const initialized = await this.authController.initializeFromStorage();
    
    if (!initialized) {
      // Check for stored authentication (legacy)
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
    
    // OAuth/SSO callback routes
    this.router.addRoute('/auth/oauth/callback', () => this.renderOAuthCallback(), {
      title: 'Completing Sign In - StreetStudio',
      component: 'oauth-callback'
    });
    this.router.addRoute('/auth/sso/callback', () => this.renderSSOCallback(), {
      title: 'Completing SSO Sign In - StreetStudio',
      component: 'sso-callback'
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
    const page = new ResetPasswordPage();
    this.layoutController.renderAuthPage(page.getElement());
  }

  private async renderOAuthCallback(): Promise<void> {
    const { OAuthCallbackPage } = await import('../pages/auth/oauth-callback-page.js');
    const page = new OAuthCallbackPage();
    this.layoutController.renderAuthPage(page.getElement());
  }

  private async renderSSOCallback(): Promise<void> {
    const { SSOCallbackPage } = await import('../pages/auth/sso-callback-page.js');
    const page = new SSOCallbackPage();
    this.layoutController.renderAuthPage(page.getElement());
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
    // For now, navigate to search page
    this.router.navigate('/search');
  }

  private focusSearch(): void {
    // Focus search input if visible
    const searchInput = document.querySelector('input[type="search"]') as HTMLInputElement;
    if (searchInput) {
      searchInput.focus();
    } else {
      // If no search input is visible, open global search
      this.openGlobalSearch();
    }
  }

  private startNewRecording(): void {
    // Start recording flow
    this.router.navigate('/recordings');
  }

  private closeOverlays(): void {
    // Close any open modals or overlays
    const modals = document.querySelectorAll('[role="dialog"]');
    modals.forEach(modal => {
      if (modal instanceof HTMLElement) {
        modal.style.display = 'none';
      }
    });

    // Close dropdowns
    const dropdowns = document.querySelectorAll('[aria-expanded="true"]');
    dropdowns.forEach(dropdown => {
      if (dropdown instanceof HTMLElement) {
        dropdown.setAttribute('aria-expanded', 'false');
      }
    });

    // Emit escape key event for any components listening
    document.dispatchEvent(new CustomEvent('keyboardshortcut:escape'));
  }

  // Dashboard context handlers
  private focusDashboardFilter(): void {
    const filterInput = document.querySelector('[data-dashboard-filter]') as HTMLInputElement;
    if (filterInput) {
      filterInput.focus();
    }
  }

  // Recording context handlers
  private toggleRecording(): void {
    // Toggle recording state
    console.log('Toggling recording...');
    document.dispatchEvent(new CustomEvent('keyboardshortcut:toggle-recording'));
  }

  private deleteSelectedRecording(): void {
    // Delete currently selected recording
    console.log('Deleting selected recording...');
    document.dispatchEvent(new CustomEvent('keyboardshortcut:delete-recording'));
  }

  // Video review context handlers
  private toggleVideoPlayback(): void {
    const video = document.querySelector('video') as HTMLVideoElement;
    if (video) {
      if (video.paused) {
        video.play();
      } else {
        video.pause();
      }
    }
    document.dispatchEvent(new CustomEvent('keyboardshortcut:toggle-playback'));
  }

  private seekVideo(seconds: number): void {
    const video = document.querySelector('video') as HTMLVideoElement;
    if (video) {
      video.currentTime = Math.max(0, Math.min(video.duration, video.currentTime + seconds));
    }
    document.dispatchEvent(new CustomEvent('keyboardshortcut:seek', { detail: { seconds } }));
  }

  private toggleFullscreen(): void {
    const videoContainer = document.querySelector('[data-video-container]') as HTMLElement;
    if (videoContainer) {
      if (document.fullscreenElement) {
        document.exitFullscreen();
      } else {
        videoContainer.requestFullscreen();
      }
    }
  }

  private addCommentAtCurrentTime(): void {
    console.log('Adding comment at current time...');
    document.dispatchEvent(new CustomEvent('keyboardshortcut:add-comment'));
  }

  private toggleMute(): void {
    const video = document.querySelector('video') as HTMLVideoElement;
    if (video) {
      video.muted = !video.muted;
    }
    document.dispatchEvent(new CustomEvent('keyboardshortcut:toggle-mute'));
  }

  // Video editor context handlers
  private toggleTimelinePlayback(): void {
    console.log('Toggling timeline playback...');
    document.dispatchEvent(new CustomEvent('keyboardshortcut:toggle-timeline'));
  }

  private setInPoint(): void {
    console.log('Setting in point...');
    document.dispatchEvent(new CustomEvent('keyboardshortcut:set-in-point'));
  }

  private setOutPoint(): void {
    console.log('Setting out point...');
    document.dispatchEvent(new CustomEvent('keyboardshortcut:set-out-point'));
  }

  private cutAtPlayhead(): void {
    console.log('Cutting at playhead...');
    document.dispatchEvent(new CustomEvent('keyboardshortcut:cut-at-playhead'));
  }

  private undoLastAction(): void {
    console.log('Undoing last action...');
    document.dispatchEvent(new CustomEvent('keyboardshortcut:undo'));
  }

  private redoLastAction(): void {
    console.log('Redoing last action...');
    document.dispatchEvent(new CustomEvent('keyboardshortcut:redo'));
  }

  private saveProject(): void {
    console.log('Saving project...');
    document.dispatchEvent(new CustomEvent('keyboardshortcut:save-project'));
  }

  // Projects context handlers
  private createNewProject(): void {
    console.log('Creating new project...');
    document.dispatchEvent(new CustomEvent('keyboardshortcut:new-project'));
  }

  private deleteSelectedProject(): void {
    console.log('Deleting selected project...');
    document.dispatchEvent(new CustomEvent('keyboardshortcut:delete-project'));
  }

  // Search context handlers
  private executeSearch(): void {
    const searchForm = document.querySelector('[data-search-form]') as HTMLFormElement;
    if (searchForm) {
      searchForm.requestSubmit();
    }
  }

  private navigateSearchResults(direction: number): void {
    console.log(`Navigating search results: ${direction > 0 ? 'next' : 'previous'}`);
    document.dispatchEvent(new CustomEvent('keyboardshortcut:navigate-results', { detail: { direction } }));
  }

  // Auth context handlers
  private submitAuthForm(): void {
    const authForm = document.querySelector('form') as HTMLFormElement;
    if (authForm) {
      authForm.requestSubmit();
    }
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
    this.authController.destroy();
    this.isInitialized = false;
  }
}