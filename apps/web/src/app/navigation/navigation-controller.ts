/**
 * Navigation Controller
 * 
 * Manages navigation state, organization switching, and navigation UI.
 */

import type { Uuid, OrganizationDto, MemberDto } from '@streetstudio/shared';
import { TopNavigation } from './components/top-navigation';
import { SidebarNavigation } from './components/sidebar-navigation';
import { MobileNavigation } from './components/mobile-navigation';
import { BreadcrumbNavigation } from './components/breadcrumb-navigation';
import { getWorkspaceStore, type WorkspaceState } from '../../stores/workspace-store';
import { getNotificationStore } from '../../stores/notification-store';
import { getUploadStore } from '../../stores/upload-store';
import { logger } from '../client-logger';

export interface OrganizationChangeHandler {
  (organizationId: Uuid): void;
}

export interface NavigationState {
  currentOrganization?: OrganizationDto;
  currentUser?: MemberDto;
  sidebarCollapsed: boolean;
  mobileMenuOpen: boolean;
  breadcrumbs: BreadcrumbItem[];
  currentRoute: string;
}

export interface BreadcrumbItem {
  label: string;
  href?: string;
  current?: boolean;
}

export interface NavigationItem {
  id: string;
  label: string;
  href: string;
  icon?: string;
  badge?: string | number;
  children?: NavigationItem[];
  permissions?: string[];
  active?: boolean;
}

export class NavigationController {
  private orgChangeHandlers: Set<OrganizationChangeHandler> = new Set();
  private state: NavigationState;
  private topNavigation?: TopNavigation;
  private sidebarNavigation?: SidebarNavigation;
  private mobileNavigation?: MobileNavigation;
  private breadcrumbNavigation?: BreadcrumbNavigation;
  private stateChangeListeners: Set<(state: NavigationState) => void> = new Set();
  private workspaceStore: any;
  private notificationStore: any;
  private uploadStore: any;
  private unsubscribeWorkspace?: () => void;
  private unsubscribeNotifications?: () => void;
  private unsubscribeUploads?: () => void;

  constructor() {
    this.state = {
      sidebarCollapsed: this.getSavedSidebarState(),
      mobileMenuOpen: false,
      breadcrumbs: [],
      currentRoute: window.location.pathname,
    };

    // Initialize stores
    this.initializeStores();

    // Listen for route changes
    this.setupRouteListener();
    this.setupResizeListener();
  }

  /**
   * Initialize store connections
   */
  private initializeStores(): void {
    try {
      this.workspaceStore = getWorkspaceStore();
      this.notificationStore = getNotificationStore();
      this.uploadStore = getUploadStore();

      // Subscribe to workspace changes for breadcrumbs and state
      this.unsubscribeWorkspace = this.workspaceStore.subscribe((workspaceState: WorkspaceState) => {
        this.updateState({
          breadcrumbs: workspaceState.breadcrumbs,
          sidebarCollapsed: workspaceState.sidebarCollapsed
        });
      });

      // Subscribe to notification changes for badges
      this.unsubscribeNotifications = this.notificationStore.subscribe((notificationState: any) => {
        this.updateNavigationBadges({
          notifications: notificationState.unreadCount
        });
      });

      // Subscribe to upload changes for progress indicators
      this.unsubscribeUploads = this.uploadStore.subscribe((uploadState: any) => {
        this.updateUploadProgress(uploadState);
      });

      logger.debug('Navigation stores initialized');
    } catch (error) {
      logger.warn('Failed to initialize navigation stores', { error });
      // Continue without store integration
    }
  }

  /**
   * Initialize navigation controller
   */
  public initialize(): void {
    this.setupNavigationComponents();
    this.setupKeyboardShortcuts();
    this.loadNavigationState();
  }

  /**
   * Setup all navigation components
   */
  private setupNavigationComponents(): void {
    const headerContainer = document.getElementById('app-header');
    const sidebarContainer = document.getElementById('app-sidebar');

    if (headerContainer) {
      this.topNavigation = new TopNavigation(headerContainer, {
        onOrganizationChange: (orgId) => this.changeOrganization(orgId),
        onMobileMenuToggle: () => this.toggleMobileMenu(),
        onUserMenuAction: (action) => this.handleUserMenuAction(action),
      });
      this.topNavigation.initialize();
    }

    if (sidebarContainer) {
      this.sidebarNavigation = new SidebarNavigation(sidebarContainer, {
        collapsed: this.state.sidebarCollapsed,
        onCollapseToggle: () => this.toggleSidebar(),
        onNavigate: (href) => this.handleNavigation(href),
      });
      this.sidebarNavigation.initialize();
    }

    // Setup mobile navigation overlay
    this.mobileNavigation = new MobileNavigation(document.body, {
      isOpen: this.state.mobileMenuOpen,
      onClose: () => this.closeMobileMenu(),
      onNavigate: (href) => this.handleNavigation(href),
    });
    this.mobileNavigation.initialize();

    // Setup breadcrumb navigation
    this.setupBreadcrumbNavigation();
  }

  /**
   * Setup breadcrumb navigation
   */
  private setupBreadcrumbNavigation(): void {
    // Find or create breadcrumb container
    let breadcrumbContainer = document.getElementById('breadcrumb-navigation');
    if (!breadcrumbContainer) {
      const mainContent = document.getElementById('app-main');
      if (mainContent) {
        breadcrumbContainer = document.createElement('div');
        breadcrumbContainer.id = 'breadcrumb-navigation';
        breadcrumbContainer.className = 'border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-3';
        mainContent.insertBefore(breadcrumbContainer, mainContent.firstChild);
      }
    }

    if (breadcrumbContainer) {
      this.breadcrumbNavigation = new BreadcrumbNavigation(breadcrumbContainer);
      this.breadcrumbNavigation.initialize();
    }
  }

  /**
   * Handle organization change events
   */
  public onOrganizationChange(handler: OrganizationChangeHandler): () => void {
    this.orgChangeHandlers.add(handler);
    
    return () => {
      this.orgChangeHandlers.delete(handler);
    };
  }

  /**
   * Subscribe to navigation state changes
   */
  public onStateChange(listener: (state: NavigationState) => void): () => void {
    this.stateChangeListeners.add(listener);
    
    // Immediately call with current state
    listener(this.state);
    
    return () => {
      this.stateChangeListeners.delete(listener);
    };
  }

  /**
   * Get current navigation state
   */
  public getState(): NavigationState {
    return { ...this.state };
  }

  /**
   * Update navigation state
   */
  public updateState(updates: Partial<NavigationState>): void {
    this.state = { ...this.state, ...updates };
    this.notifyStateChange();
    this.persistState();
  }

  /**
   * Set current organization and user
   */
  public setAuthContext(user: MemberDto, organization?: OrganizationDto): void {
    this.updateState({
      currentUser: user,
      currentOrganization: organization,
    });

    // Update navigation components
    this.topNavigation?.updateAuthContext(user, organization);
    this.sidebarNavigation?.updateAuthContext(user, organization);
    this.mobileNavigation?.updateAuthContext(user, organization);
  }

  /**
   * Update navigation items based on permissions and context
   */
  public updateNavigationItems(items: NavigationItem[]): void {
    this.sidebarNavigation?.updateItems(items);
    this.mobileNavigation?.updateItems(items);
  }

  /**
   * Set breadcrumb navigation
   */
  public setBreadcrumbs(breadcrumbs: BreadcrumbItem[]): void {
    this.updateState({ breadcrumbs });
    this.breadcrumbNavigation?.updateBreadcrumbs(breadcrumbs);
  }

  /**
   * Trigger organization change
   */
  public changeOrganization(organizationId: Uuid): void {
    logger.info('Organization change triggered', { organizationId });
    
    for (const handler of this.orgChangeHandlers) {
      try {
        handler(organizationId);
      } catch (error) {
        console.error('Organization change handler error:', error);
      }
    }
    
    // Update navigation elements after organization change
    this.updateNavigationItems(this.getContextualNavigationItems());
  }

  /**
   * Toggle sidebar collapsed state
   */
  public toggleSidebar(): void {
    const collapsed = !this.state.sidebarCollapsed;
    this.updateState({ sidebarCollapsed: collapsed });
    this.sidebarNavigation?.setCollapsed(collapsed);
    this.saveSidebarState(collapsed);
    
    // Update workspace store
    try {
      this.workspaceStore?.setSidebarCollapsed(collapsed);
    } catch (error) {
      logger.warn('Failed to update workspace store sidebar state', { error });
    }
  }

  /**
   * Toggle mobile menu
   */
  public toggleMobileMenu(): void {
    const isOpen = !this.state.mobileMenuOpen;
    this.updateState({ mobileMenuOpen: isOpen });
    this.mobileNavigation?.setOpen(isOpen);
  }

  /**
   * Close mobile menu
   */
  public closeMobileMenu(): void {
    if (this.state.mobileMenuOpen) {
      this.updateState({ mobileMenuOpen: false });
      this.mobileNavigation?.setOpen(false);
    }
  }

  /**
   * Handle navigation to new route
   */
  private handleNavigation(href: string): void {
    // Close mobile menu if open
    this.closeMobileMenu();
    
    // Update workspace store with navigation
    try {
      this.workspaceStore?.navigateToRoute(href);
    } catch (error) {
      logger.warn('Failed to update workspace store navigation', { error });
    }
    
    // Update current route
    this.updateState({ currentRoute: href });
    
    // Let router handle the actual navigation
    const event = new CustomEvent('navigate', { detail: { href } });
    window.dispatchEvent(event);
  }

  /**
   * Update navigation badges (notifications, uploads, etc.)
   */
  private updateNavigationBadges(badges: { notifications?: number; uploads?: number }): void {
    this.topNavigation?.updateBadges?.(badges);
    this.mobileNavigation?.updateBadges?.(badges);
  }

  /**
   * Update upload progress in navigation
   */
  private updateUploadProgress(uploadState: any): void {
    if (uploadState.isUploading) {
      this.showUploadProgress(uploadState.totalProgress, uploadState.totalSpeed);
    } else {
      this.hideUploadProgress();
    }
  }

  /**
   * Show upload progress in navigation
   */
  private showUploadProgress(progress: number, speed: number): void {
    // Add upload progress indicator to navigation
    const indicator = document.getElementById('upload-progress-indicator');
    if (!indicator) {
      this.createUploadProgressIndicator();
    }
    
    this.updateUploadProgressIndicator(progress, speed);
  }

  /**
   * Hide upload progress indicator
   */
  private hideUploadProgress(): void {
    const indicator = document.getElementById('upload-progress-indicator');
    if (indicator) {
      indicator.style.display = 'none';
    }
  }

  /**
   * Create upload progress indicator
   */
  private createUploadProgressIndicator(): void {
    const headerContainer = document.getElementById('app-header');
    if (!headerContainer) return;

    const indicator = document.createElement('div');
    indicator.id = 'upload-progress-indicator';
    indicator.className = 'fixed top-16 right-4 bg-blue-600 text-white px-4 py-2 rounded-lg shadow-lg z-50 transition-all duration-200';
    indicator.style.display = 'none';
    
    indicator.innerHTML = `
      <div class="flex items-center space-x-2">
        <svg class="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        <span class="text-sm font-medium" id="upload-progress-text">Uploading...</span>
      </div>
      <div class="mt-1 bg-blue-700 rounded-full h-1">
        <div id="upload-progress-bar" class="bg-white h-1 rounded-full transition-all duration-200" style="width: 0%"></div>
      </div>
    `;

    document.body.appendChild(indicator);
  }

  /**
   * Update upload progress indicator
   */
  private updateUploadProgressIndicator(progress: number, speed: number): void {
    const indicator = document.getElementById('upload-progress-indicator');
    const progressText = document.getElementById('upload-progress-text');
    const progressBar = document.getElementById('upload-progress-bar');
    
    if (!indicator || !progressText || !progressBar) return;

    indicator.style.display = 'block';
    
    const speedText = speed > 0 ? ` (${this.formatSpeed(speed)})` : '';
    progressText.textContent = `Uploading ${Math.round(progress)}%${speedText}`;
    progressBar.style.width = `${progress}%`;
  }

  /**
   * Format upload speed for display
   */
  private formatSpeed(bytesPerSecond: number): string {
    if (bytesPerSecond < 1024) {
      return `${Math.round(bytesPerSecond)} B/s`;
    } else if (bytesPerSecond < 1024 * 1024) {
      return `${Math.round(bytesPerSecond / 1024)} KB/s`;
    } else {
      return `${Math.round(bytesPerSecond / (1024 * 1024) * 10) / 10} MB/s`;
    }
  }

  /**
   * Handle user menu actions
   */
  private handleUserMenuAction(action: string): void {
    switch (action) {
      case 'profile':
        this.handleNavigation('/settings/profile');
        break;
      case 'settings':
        this.handleNavigation('/settings');
        break;
      case 'logout':
        // Dispatch logout event
        const event = new CustomEvent('auth:logout');
        window.dispatchEvent(event);
        break;
      default:
        console.warn('Unknown user menu action:', action);
    }
  }

  /**
   * Setup route change listener
   */
  private setupRouteListener(): void {
    // Listen for popstate events (back/forward)
    window.addEventListener('popstate', () => {
      this.updateState({ currentRoute: window.location.pathname });
    });

    // Listen for custom navigation events
    window.addEventListener('route:changed' as any, (event: CustomEvent) => {
      this.updateState({ currentRoute: event.detail.path });
    });
  }

  /**
   * Setup resize listener for responsive behavior
   */
  private setupResizeListener(): void {
    let resizeTimeout: number;
    
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = window.setTimeout(() => {
        // Auto-close mobile menu on desktop
        if (window.innerWidth >= 1024 && this.state.mobileMenuOpen) {
          this.closeMobileMenu();
        }
      }, 100);
    });
  }

  /**
   * Setup keyboard shortcuts for navigation
   */
  private setupKeyboardShortcuts(): void {
    document.addEventListener('keydown', (event) => {
      // Cmd/Ctrl + B to toggle sidebar
      if ((event.metaKey || event.ctrlKey) && event.key === 'b') {
        event.preventDefault();
        this.toggleSidebar();
      }

      // Escape to close mobile menu
      if (event.key === 'Escape' && this.state.mobileMenuOpen) {
        event.preventDefault();
        this.closeMobileMenu();
      }

      // Cmd/Ctrl + K for global search (handled by search component)
      if ((event.metaKey || event.ctrlKey) && event.key === 'k') {
        // Let search component handle this
        return;
      }
    });
  }

  /**
   * Load navigation state from storage
   */
  private loadNavigationState(): void {
    try {
      const stored = localStorage.getItem('streetstudio_navigation_state');
      if (stored) {
        const parsed = JSON.parse(stored);
        this.updateState({
          sidebarCollapsed: parsed.sidebarCollapsed ?? this.state.sidebarCollapsed,
        });
      }
    } catch (error) {
      console.warn('Failed to load navigation state:', error);
    }
  }

  /**
   * Persist important navigation state
   */
  private persistState(): void {
    try {
      const stateToSave = {
        sidebarCollapsed: this.state.sidebarCollapsed,
      };
      localStorage.setItem('streetstudio_navigation_state', JSON.stringify(stateToSave));
    } catch (error) {
      console.warn('Failed to persist navigation state:', error);
    }
  }

  /**
   * Get saved sidebar state from storage
   */
  private getSavedSidebarState(): boolean {
    try {
      const stored = localStorage.getItem('streetstudio_sidebar_collapsed');
      return stored ? JSON.parse(stored) : false;
    } catch {
      return false;
    }
  }

  /**
   * Save sidebar state to storage
   */
  private saveSidebarState(collapsed: boolean): void {
    try {
      localStorage.setItem('streetstudio_sidebar_collapsed', JSON.stringify(collapsed));
    } catch (error) {
      console.warn('Failed to save sidebar state:', error);
    }
  }

  /**
   * Notify all listeners of state changes
   */
  private notifyStateChange(): void {
    for (const listener of this.stateChangeListeners) {
      try {
        listener(this.state);
      } catch (error) {
        console.error('Navigation state change listener error:', error);
      }
    }
  }

  /**
   * Get contextual navigation items based on current state
   */
  private getContextualNavigationItems(): NavigationItem[] {
    const baseItems: NavigationItem[] = [
      {
        id: 'dashboard',
        label: 'Dashboard',
        href: '/dashboard',
        icon: 'home',
        active: this.state.currentRoute === '/dashboard'
      },
      {
        id: 'projects',
        label: 'Projects',
        href: '/projects',
        icon: 'folder',
        active: this.state.currentRoute.startsWith('/projects')
      },
      {
        id: 'recordings',
        label: 'Recordings',
        href: '/recordings',
        icon: 'video',
        active: this.state.currentRoute.startsWith('/recordings')
      },
      {
        id: 'library',
        label: 'Library',
        href: '/library',
        icon: 'collection',
        active: this.state.currentRoute.startsWith('/library')
      }
    ];

    // Add upload status if uploads are active
    try {
      const uploadState = this.uploadStore?.getState();
      if (uploadState?.isUploading) {
        baseItems.push({
          id: 'uploads',
          label: 'Uploads',
          href: '/uploads',
          icon: 'upload',
          badge: uploadState.queuedUploads + (uploadState.isUploading ? 1 : 0)
        });
      }
    } catch (error) {
      logger.warn('Failed to get upload state for navigation', { error });
    }

    return baseItems;
  }

  /**
   * Setup deep link support
   */
  public setupDeepLinkSupport(): void {
    // Handle direct URL access with query parameters and hash
    const urlParams = new URLSearchParams(window.location.search);
    const hash = window.location.hash;
    
    if (urlParams.size > 0 || hash) {
      const deepLinkState: Record<string, any> = {};
      
      // Parse query parameters
      urlParams.forEach((value, key) => {
        deepLinkState[key] = value;
      });
      
      // Parse hash if present
      if (hash) {
        deepLinkState.hash = hash.substring(1);
      }
      
      // Store deep link state
      try {
        this.workspaceStore?.setDeepLinkState(window.location.pathname, deepLinkState);
      } catch (error) {
        logger.warn('Failed to set deep link state', { error });
      }
    }
  }

  /**
   * Navigate with state preservation
   */
  public navigateWithState(path: string, state?: Record<string, any>): void {
    // Update workspace store with state
    try {
      if (state) {
        this.workspaceStore?.setDeepLinkState(path, state);
      }
      this.workspaceStore?.navigateToRoute(path, state);
    } catch (error) {
      logger.warn('Failed to navigate with state', { error });
    }
    
    // Trigger navigation
    this.handleNavigation(path);
  }

  /**
   * Clean up resources
   */
  public destroy(): void {
    this.topNavigation?.destroy();
    this.sidebarNavigation?.destroy();
    this.mobileNavigation?.destroy();
    this.breadcrumbNavigation?.destroy();
    
    // Unsubscribe from stores
    this.unsubscribeWorkspace?.();
    this.unsubscribeNotifications?.();
    this.unsubscribeUploads?.();
    
    this.orgChangeHandlers.clear();
    this.stateChangeListeners.clear();
    
    // Remove upload progress indicator
    const indicator = document.getElementById('upload-progress-indicator');
    if (indicator?.parentNode) {
      indicator.parentNode.removeChild(indicator);
    }
    
    logger.debug('Navigation controller destroyed');
  }
}