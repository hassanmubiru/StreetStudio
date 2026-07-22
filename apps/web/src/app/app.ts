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
    // Initialize keyboard shortcuts manager
    this.keyboardShortcuts = new KeyboardShortcuts({
      enableVisualIndicators: true,
      showHelpOverlay: true,
      preventDefaultBehavior: true,
    });

    // Global navigation shortcuts
    this.keyboardShortcuts.register([
      {
        key: 'k',
        modifiers: ['cmd', 'ctrl'],
        description: 'Open global search',
        handler: () => this.openGlobalSearch(),
        priority: 90,
      },
      {
        key: '/',
        description: 'Focus search input',
        handler: (event) => {
          // Only if not in input field
          if (!this.isInputFocused(event.target)) {
            this.focusSearch();
            return true;
          }
          return false;
        },
        preventDefault: false,
      },
      {
        key: 'n',
        modifiers: ['cmd', 'ctrl'],
        description: 'Start new recording',
        handler: () => this.startNewRecording(),
        priority: 80,
      },
      {
        key: 'Escape',
        description: 'Close modals and overlays',
        handler: () => this.closeOverlays(),
        priority: 100,
      },
      {
        key: 'd',
        modifiers: ['cmd', 'ctrl'],
        description: 'Go to dashboard',
        handler: () => {
          this.router.navigate('/dashboard');
          return true;
        },
      },
      {
        key: 'p',
        modifiers: ['cmd', 'ctrl'],
        description: 'Go to projects',
        handler: () => {
          this.router.navigate('/projects');
          return true;
        },
      },
      {
        key: 'r',
        modifiers: ['cmd', 'ctrl'],
        description: 'Go to recordings',
        handler: () => {
          this.router.navigate('/recordings');
          return true;
        },
      },
      {
        key: ',',
        modifiers: ['cmd', 'ctrl'],
        description: 'Open settings',
        handler: () => {
          this.router.navigate('/settings');
          return true;
        },
      },
      {
        key: 'i',
        modifiers: ['cmd', 'ctrl'],
        description: 'Open notifications',
        handler: () => {
          this.router.navigate('/notifications');
          return true;
        },
      },
    ]);

    // Setup context-sensitive shortcuts for different application states
    this.setupContextSensitiveShortcuts();

    // Listen for route changes to update context
    // Note: Assuming router has onRouteChange method, will be implemented in router
    if (this.router && typeof this.router.onRouteChange === 'function') {
      this.router.onRouteChange((path) => {
        this.updateKeyboardContext(path);
      });
    } else {
      // Fallback: Monitor URL changes manually
      let currentPath = window.location.pathname;
      setInterval(() => {
        const newPath = window.location.pathname;
        if (newPath !== currentPath) {
          currentPath = newPath;
          this.updateKeyboardContext(newPath);
        }
      }, 100);
    }
  }

  private setupContextSensitiveShortcuts(): void {
    // Dashboard context shortcuts
    this.keyboardShortcuts.register([
      {
        key: 'c',
        context: 'dashboard',
        description: 'Create new project',
        handler: () => this.createNewProject(),
      },
      {
        key: 'ArrowUp',
        context: 'dashboard',
        description: 'Navigate up in project list',
        handler: () => this.navigateProjectList('up'),
      },
      {
        key: 'ArrowDown',
        context: 'dashboard',
        description: 'Navigate down in project list',
        handler: () => this.navigateProjectList('down'),
      },
      {
        key: 'Enter',
        context: 'dashboard',
        description: 'Open selected project',
        handler: () => this.openSelectedProject(),
      },
    ]);

    // Video player context shortcuts
    this.keyboardShortcuts.register([
      {
        key: ' ',
        context: 'video-player',
        description: 'Play/pause video',
        handler: () => this.togglePlayback(),
      },
      {
        key: 'ArrowLeft',
        context: 'video-player',
        description: 'Seek backward 10 seconds',
        handler: () => this.seekVideo(-10),
      },
      {
        key: 'ArrowRight',
        context: 'video-player',
        description: 'Seek forward 10 seconds',
        handler: () => this.seekVideo(10),
      },
      {
        key: 'ArrowLeft',
        modifiers: ['shift'],
        context: 'video-player',
        description: 'Seek backward 30 seconds',
        handler: () => this.seekVideo(-30),
      },
      {
        key: 'ArrowRight',
        modifiers: ['shift'],
        context: 'video-player',
        description: 'Seek forward 30 seconds',
        handler: () => this.seekVideo(30),
      },
      {
        key: 'f',
        context: 'video-player',
        description: 'Toggle fullscreen',
        handler: () => this.toggleFullscreen(),
      },
      {
        key: 'm',
        context: 'video-player',
        description: 'Mute/unmute audio',
        handler: () => this.toggleMute(),
      },
      {
        key: 'c',
        context: 'video-player',
        description: 'Add comment at current time',
        handler: () => this.addTimestampComment(),
      },
    ]);

    // Timeline editor context shortcuts
    this.keyboardShortcuts.register([
      {
        key: ' ',
        context: 'timeline-editor',
        description: 'Play/pause timeline',
        handler: () => this.toggleTimelinePlayback(),
      },
      {
        key: 's',
        context: 'timeline-editor',
        description: 'Split video at playhead',
        handler: () => this.splitAtPlayhead(),
      },
      {
        key: 't',
        context: 'timeline-editor',
        description: 'Add text overlay',
        handler: () => this.addTextOverlay(),
      },
      {
        key: 'z',
        modifiers: ['cmd', 'ctrl'],
        context: 'timeline-editor',
        description: 'Undo last action',
        handler: () => this.undoEdit(),
        priority: 95,
      },
      {
        key: 'y',
        modifiers: ['cmd', 'ctrl'],
        context: 'timeline-editor',
        description: 'Redo last action',
        handler: () => this.redoEdit(),
        priority: 95,
      },
      {
        key: 'Delete',
        context: 'timeline-editor',
        description: 'Delete selected element',
        handler: () => this.deleteSelected(),
      },
    ]);

    // Recording interface context shortcuts
    this.keyboardShortcuts.register([
      {
        key: ' ',
        context: 'recording',
        description: 'Start/stop recording',
        handler: () => this.toggleRecording(),
      },
      {
        key: 'p',
        context: 'recording',
        description: 'Pause/resume recording',
        handler: () => this.pauseResumeRecording(),
      },
      {
        key: 'a',
        context: 'recording',
        description: 'Toggle annotation mode',
        handler: () => this.toggleAnnotationMode(),
      },
      {
        key: 'd',
        context: 'recording',
        description: 'Toggle drawing tools',
        handler: () => this.toggleDrawingTools(),
      },
    ]);

    // Search context shortcuts
    this.keyboardShortcuts.register([
      {
        key: 'Enter',
        context: 'search',
        description: 'Execute search',
        handler: () => this.executeSearch(),
      },
      {
        key: 'ArrowUp',
        context: 'search',
        description: 'Previous search result',
        handler: () => this.navigateSearchResults('up'),
      },
      {
        key: 'ArrowDown',
        context: 'search',
        description: 'Next search result',
        handler: () => this.navigateSearchResults('down'),
      },
    ]);
  }

  private updateKeyboardContext(path: string): void {
    let context = 'global';
    
    if (path === '/dashboard') {
      context = 'dashboard';
    } else if (path.includes('/recordings/') && path.includes('/review')) {
      context = 'video-player';
    } else if (path.includes('/recordings/') && path.includes('/edit')) {
      context = 'timeline-editor';
    } else if (path === '/recordings' && this.isRecording()) {
      context = 'recording';
    } else if (path === '/search') {
      context = 'search';
    }
    
    this.keyboardShortcuts.setContext(context);
  }

  private isInputFocused(target: EventTarget | null): boolean {
    if (!target || !(target instanceof Element)) return false;
    
    const tagName = target.tagName.toLowerCase();
    const isInput = tagName === 'input' || tagName === 'textarea' || tagName === 'select';
    const isContentEditable = target.getAttribute('contenteditable') === 'true';
    
    return isInput || isContentEditable;
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
    console.log('Opening global search...');
  }

  private focusSearch(): void {
    // TODO: Focus search input if visible
    const searchInput = document.querySelector('input[type="search"], input[placeholder*="search" i]') as HTMLInputElement;
    if (searchInput) {
      searchInput.focus();
      searchInput.select();
    }
  }

  private startNewRecording(): void {
    // TODO: Start recording flow
    this.router.navigate('/recordings');
    console.log('Starting new recording...');
  }

  private closeOverlays(): void {
    // Close any open modals, dropdowns, or overlays
    const modals = document.querySelectorAll('[role="dialog"], .modal, .dropdown-menu.show');
    modals.forEach(modal => {
      if (modal instanceof HTMLElement) {
        modal.style.display = 'none';
        modal.classList.remove('show', 'open');
        modal.setAttribute('aria-hidden', 'true');
      }
    });

    // Close keyboard shortcuts help overlay
    if (this.keyboardShortcuts) {
      const helpOverlay = document.querySelector('[role="dialog"][aria-labelledby="shortcut-help-title"]');
      if (helpOverlay && !helpOverlay.classList.contains('hidden')) {
        this.keyboardShortcuts.toggleHelpOverlay();
      }
    }
  }

  // Dashboard context handlers
  private createNewProject(): void {
    // TODO: Open project creation modal
    console.log('Creating new project...');
  }

  private navigateProjectList(direction: 'up' | 'down'): void {
    // TODO: Navigate project list with keyboard
    console.log(`Navigating project list ${direction}...`);
  }

  private openSelectedProject(): void {
    // TODO: Open currently selected project
    console.log('Opening selected project...');
  }

  // Video player context handlers
  private togglePlayback(): void {
    const video = document.querySelector('video') as HTMLVideoElement;
    if (video) {
      if (video.paused) {
        video.play();
      } else {
        video.pause();
      }
    }
  }

  private seekVideo(seconds: number): void {
    const video = document.querySelector('video') as HTMLVideoElement;
    if (video) {
      video.currentTime = Math.max(0, Math.min(video.duration, video.currentTime + seconds));
    }
  }

  private toggleFullscreen(): void {
    const videoContainer = document.querySelector('.video-player-container, video') as HTMLElement;
    if (videoContainer) {
      if (document.fullscreenElement) {
        document.exitFullscreen();
      } else {
        videoContainer.requestFullscreen();
      }
    }
  }

  private toggleMute(): void {
    const video = document.querySelector('video') as HTMLVideoElement;
    if (video) {
      video.muted = !video.muted;
    }
  }

  private addTimestampComment(): void {
    // TODO: Open comment interface with current timestamp
    console.log('Adding timestamp comment...');
  }

  // Timeline editor context handlers
  private toggleTimelinePlayback(): void {
    // TODO: Toggle timeline playback
    console.log('Toggling timeline playback...');
  }

  private splitAtPlayhead(): void {
    // TODO: Split video at current playhead position
    console.log('Splitting at playhead...');
  }

  private addTextOverlay(): void {
    // TODO: Add text overlay at current position
    console.log('Adding text overlay...');
  }

  private undoEdit(): void {
    // TODO: Undo last edit operation
    console.log('Undoing last edit...');
  }

  private redoEdit(): void {
    // TODO: Redo last edit operation
    console.log('Redoing last edit...');
  }

  private deleteSelected(): void {
    // TODO: Delete selected timeline element
    console.log('Deleting selected element...');
  }

  // Recording context handlers
  private toggleRecording(): void {
    // TODO: Start/stop recording
    console.log('Toggling recording...');
  }

  private pauseResumeRecording(): void {
    // TODO: Pause/resume current recording
    console.log('Pausing/resuming recording...');
  }

  private toggleAnnotationMode(): void {
    // TODO: Toggle annotation mode
    console.log('Toggling annotation mode...');
  }

  private toggleDrawingTools(): void {
    // TODO: Toggle drawing tools panel
    console.log('Toggling drawing tools...');
  }

  // Search context handlers
  private executeSearch(): void {
    const searchInput = document.querySelector('input[type="search"]') as HTMLInputElement;
    if (searchInput && searchInput.value.trim()) {
      // TODO: Execute search with current query
      console.log(`Executing search: ${searchInput.value}`);
    }
  }

  private navigateSearchResults(direction: 'up' | 'down'): void {
    // TODO: Navigate search results with keyboard
    console.log(`Navigating search results ${direction}...`);
  }

  // Utility methods
  private isRecording(): boolean {
    // TODO: Check if currently recording
    return false;
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