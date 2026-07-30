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
import { OrganizationSwitcher } from './components/organization-switcher';
import { WorkspaceContext } from './components/workspace-context';
import { EnhancedBreadcrumbNavigation } from './components/enhanced-breadcrumb-navigation';
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
  private organizationSwitcher?: OrganizationSwitcher;
  private workspaceContext?: WorkspaceContext;
  private enhancedBreadcrumbNavigation?: EnhancedBreadcrumbNavigation;
  private stateChangeListeners: Set<(state: NavigationState) => void> = new Set();
  private workspaceStore: any;
  private notificationStore: any;
  private uploadStore: any;
  private unsubscribeWorkspace?: () => void;
  private unsubscribeNotifications?: () => void;
  private unsubscribeUploads?: () => void;
  private routeChangeHandler?: () => void;
  private customRouteChangeHandler?: (event: Event) => void;
  private resizeHandler?: () => void;

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
   * Listen for browser route changes (back/forward navigation) and keep the
   * navigation state's current route — and the active nav items — in sync.
   */
  private setupRouteListener(): void {
    this.routeChangeHandler = () => {
      const path = window.location.pathname;
      if (path !== this.state.currentRoute) {
        this.updateState({ currentRoute: path });
        this.updateNavigationItems(this.getContextualNavigationItems());
      }
    };
    window.addEventListener("popstate", this.routeChangeHandler);

    // React to programmatic route changes dispatched by the router as a
    // 'route:changed' custom event carrying the new path in its detail.
    this.customRouteChangeHandler = (event: Event) => {
      const path = (event as CustomEvent).detail?.path;
      if (typeof path === "string" && path !== this.state.currentRoute) {
        this.updateState({ currentRoute: path });
        this.updateNavigationItems(this.getContextualNavigationItems());
      }
    };
    window.addEventListener("route:changed", this.customRouteChangeHandler);
  }

  /**
   * Collapse the mobile menu once the viewport grows past the mobile
   * breakpoint, so the menu never lingers open on desktop layouts.
   */
  private setupResizeListener(): void {
    const DESKTOP_BREAKPOINT = 1024;
    this.resizeHandler = () => {
      if (window.innerWidth >= DESKTOP_BREAKPOINT && this.state.mobileMenuOpen) {
        this.closeMobileMenu();
      }
    };
    window.addEventListener("resize", this.resizeHandler);
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

      // Setup enhanced organization switcher
      const orgSwitcherContainer = document.createElement('div');
      orgSwitcherContainer.id = 'organization-switcher-container';
      headerContainer.appendChild(orgSwitcherContainer);

      this.organizationSwitcher = new OrganizationSwitcher(orgSwitcherContainer, {
        onOrganizationChange: (orgId) => this.handleOrganizationSwitch(orgId),
        onCreateOrganization: () => this.handleCreateOrganization(),
        onManageOrganizations: () => this.handleManageOrganizations(),
        showCreateOption: true,
        showManageOption: true
      });
      this.organizationSwitcher.initialize();

      // Setup workspace context manager
      const workspaceContextContainer = document.createElement('div');
      workspaceContextContainer.id = 'workspace-context-container';
      headerContainer.appendChild(workspaceContextContainer);

      this.workspaceContext = new WorkspaceContext(workspaceContextContainer, {
        onWorkspaceChange: (workspace) => this.handleWorkspaceChange(workspace),
        onProjectChange: (project) => this.handleProjectChange(project),
        onFolderChange: (folder) => this.handleFolderChange(folder),
        onNavigationUpdate: (breadcrumbs) => this.handleBreadcrumbUpdate(breadcrumbs)
      });
      this.workspaceContext.initialize();
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

    // Setup enhanced breadcrumb navigation
    this.setupEnhancedBreadcrumbNavigation();
  }

  /**
   * Setup enhanced breadcrumb navigation
   */
  private setupEnhancedBreadcrumbNavigation(): void {
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
      // Use enhanced breadcrumb navigation for better features
      this.enhancedBreadcrumbNavigation = new EnhancedBreadcrumbNavigation(breadcrumbContainer);
      this.enhancedBreadcrumbNavigation.initialize();
      
      // Keep legacy breadcrumb for compatibility
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
    
    // Immediately call with current state. Guard against listener errors so a
    // single misbehaving subscriber cannot break registration for others.
    try {
      listener(this.state);
    } catch (error) {
      console.error('Navigation state change listener error:', error);
    }
    
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
    
    // Update both navigation components
    this.breadcrumbNavigation?.updateBreadcrumbs(breadcrumbs);
    
    // Also update enhanced navigation if available
    this.enhancedBreadcrumbNavigation?.updateBreadcrumbs(breadcrumbs);
  }

  /**
   * Set current organization and user with enhanced context
   */
  public setAuthContext(user: MemberDto, organization?: OrganizationDto): void {
    this.updateState({
      currentUser: user,
      currentOrganization: organization,
    });

    // Update all navigation components
    this.topNavigation?.updateAuthContext(user, organization);
    this.sidebarNavigation?.updateAuthContext(user, organization);
    this.mobileNavigation?.updateAuthContext(user, organization);
    
    // Update organization switcher
    this.organizationSwitcher?.updateContext(user, organization);
    
    // Refresh workspace context
    if (organization) {
      this.workspaceContext?.refresh();
    }
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
   * Handle workspace change
   */
  private handleWorkspaceChange(workspace: any): void {
    logger.info('Workspace changed', { workspaceId: workspace.id, workspaceName: workspace.name });
    
    // Update workspace in workspace store
    try {
      this.workspaceStore?.setCurrentWorkspace(workspace);
    } catch (error) {
      logger.warn('Failed to update workspace store', { error });
    }
    
    // Update navigation context
    this.updateWorkspaceContext();
  }

  /**
   * Handle project change
   */
  private handleProjectChange(project: any): void {
    if (project) {
      logger.info('Project changed', { projectId: project.id, projectName: project.name });
    } else {
      logger.info('Project cleared');
    }
    
    // Update navigation context
    this.updateWorkspaceContext();
  }

  /**
   * Handle folder change
   */
  private handleFolderChange(folder: any): void {
    if (folder) {
      logger.info('Folder changed', { folderId: folder.id, folderName: folder.name });
    } else {
      logger.info('Folder cleared');
    }
    
    // Update navigation context
    this.updateWorkspaceContext();
  }

  /**
   * Handle breadcrumb updates from workspace context
   */
  private handleBreadcrumbUpdate(breadcrumbs: BreadcrumbItem[]): void {
    this.setBreadcrumbs(breadcrumbs);
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
   * Update badge counts on sidebar and mobile navigation items
   */
  private updateNavigationBadges(badges: { notifications?: number }): void {
    if (badges.notifications !== undefined) {
      const badgeValue = badges.notifications > 0 ? badges.notifications : undefined;

      // Update top navigation badges (has updateBadges method)
      this.topNavigation?.updateBadges({ notifications: badges.notifications });

      // Update mobile navigation badges (has updateBadges method)
      this.mobileNavigation?.updateBadges({ notifications: badges.notifications });

      // For sidebar, refresh nav items to reflect badge counts
      const items = this.getContextualNavigationItems();
      if (badgeValue !== undefined) {
        // Add notifications item with badge if not present
        const notifItem = items.find(item => item.id === 'notifications');
        if (notifItem) {
          notifItem.badge = badgeValue;
        }
      }
      this.sidebarNavigation?.updateItems(items);
    }
  }

  /**
   * Show or update upload progress indicator in the header area
   */
  private updateUploadProgress(uploadState: any): void {
    let indicator = document.getElementById('upload-progress-indicator');

    if (uploadState.isUploading) {
      // Create indicator if it doesn't exist
      indicator = this.createUploadProgressIndicator();
      if (!indicator) return;

      const completedCount = uploadState.completedUploads || 0;
      const totalCount = uploadState.uploads?.length || 0;
      const progress = Math.round(uploadState.totalProgress || 0);

      indicator.innerHTML = `
        <svg class="animate-spin h-4 w-4 text-blue-600 dark:text-blue-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
        </svg>
        <span class="text-blue-700 dark:text-blue-300">
          Uploading ${completedCount}/${totalCount} (${progress}%)${
            uploadState.totalSpeed ? ` · ${this.formatSpeed(uploadState.totalSpeed)}` : ''
          }
        </span>
        <div class="w-20 h-1.5 bg-blue-200 dark:bg-blue-700 rounded-full overflow-hidden">
          <div class="h-full bg-blue-600 dark:bg-blue-400 rounded-full transition-all duration-300" style="width: ${progress}%"></div>
        </div>
      `;
      indicator.setAttribute('role', 'progressbar');
      indicator.setAttribute('aria-valuenow', String(progress));
      indicator.setAttribute('aria-valuemin', '0');
      indicator.setAttribute('aria-valuemax', '100');
      indicator.setAttribute('aria-label', `Upload progress: ${progress}%`);
    } else if (indicator) {
      // Remove indicator when no uploads are active
      indicator.parentNode?.removeChild(indicator);
    }
  }

  /**
   * Create (or return the existing) upload progress indicator element in the
   * header area. Returns null when there is no header container to host it.
   */
  private createUploadProgressIndicator(): HTMLElement | null {
    const headerContainer = document.getElementById('app-header');
    if (!headerContainer) return null;

    let indicator = document.getElementById('upload-progress-indicator');
    if (!indicator) {
      indicator = document.createElement('div');
      indicator.id = 'upload-progress-indicator';
      indicator.className = 'upload-progress-indicator flex items-center gap-2 px-3 py-1 bg-blue-50 dark:bg-blue-900 rounded text-sm';
      indicator.setAttribute('role', 'progressbar');
      headerContainer.appendChild(indicator);
    }

    return indicator;
  }

  /**
   * Format an upload speed (in bytes per second) into a human-readable string.
   */
  private formatSpeed(bytesPerSecond: number): string {
    if (bytesPerSecond < 1024) {
      return `${bytesPerSecond} B/s`;
    }
    if (bytesPerSecond < 1024 * 1024) {
      return `${Math.round(bytesPerSecond / 1024)} KB/s`;
    }
    return `${(bytesPerSecond / (1024 * 1024)).toFixed(1)} MB/s`;
  }

  /**
   * Register keyboard shortcuts for navigation
   */
  private setupKeyboardShortcuts(): void {
    const handler = (event: KeyboardEvent) => {
      // Ctrl+B or Cmd+B to toggle sidebar
      if ((event.ctrlKey || event.metaKey) && event.key === 'b') {
        event.preventDefault();
        this.toggleSidebar();
        return;
      }

      // Escape to close mobile menu
      if (event.key === 'Escape') {
        if (this.state.mobileMenuOpen) {
          event.preventDefault();
          this.closeMobileMenu();
          return;
        }
      }

      // Ctrl+K or Cmd+K for quick navigation/search
      if ((event.ctrlKey || event.metaKey) && event.key === 'k') {
        event.preventDefault();
        const searchEvent = new CustomEvent('navigate:quick-search');
        window.dispatchEvent(searchEvent);
        return;
      }
    };

    document.addEventListener('keydown', handler);

    // Store reference so we can remove it on destroy
    const originalDestroy = this.destroy.bind(this);
    this.destroy = () => {
      document.removeEventListener('keydown', handler);
      originalDestroy();
    };
  }

  /**
   * Load persisted navigation state from localStorage and apply it
   */
  private loadNavigationState(): void {
    try {
      const stored = localStorage.getItem('streetstudio_navigation_state');
      if (stored) {
        const savedState = JSON.parse(stored);

        if (savedState.sidebarCollapsed !== undefined) {
          this.state.sidebarCollapsed = savedState.sidebarCollapsed;
          this.sidebarNavigation?.setCollapsed(savedState.sidebarCollapsed);
        }
      }

      // Sync with workspace store state
      const workspaceState = this.workspaceStore?.getState();
      if (workspaceState) {
        if (workspaceState.breadcrumbs?.length > 0) {
          this.setBreadcrumbs(workspaceState.breadcrumbs);
        }
        if (workspaceState.sidebarCollapsed !== undefined) {
          this.state.sidebarCollapsed = workspaceState.sidebarCollapsed;
          this.sidebarNavigation?.setCollapsed(workspaceState.sidebarCollapsed);
        }
      }

      logger.debug('Navigation state loaded');
    } catch (error) {
      logger.warn('Failed to load navigation state', { error });
    }
  }

  /**
   * Handle user menu actions by dispatching appropriate navigation events
   */
  private handleUserMenuAction(action: string): void {
    switch (action) {
      case 'logout':
        window.dispatchEvent(new CustomEvent('navigate:logout'));
        break;
      case 'settings':
        this.handleNavigation('/settings');
        break;
      case 'profile':
        this.handleNavigation('/settings/profile');
        break;
      case 'billing':
        this.handleNavigation('/settings/billing');
        break;
      case 'help':
        window.dispatchEvent(new CustomEvent('navigate:help'));
        break;
      default:
        logger.warn('Unknown user menu action', { action });
        window.dispatchEvent(new CustomEvent('navigate:user-action', { detail: { action } }));
        break;
    }
  }

  /**
   * Handle organization switch by delegating to changeOrganization
   */
  private handleOrganizationSwitch(orgId: Uuid): void {
    this.changeOrganization(orgId);
  }

  /**
   * Navigate to organization creation page
   */
  private handleCreateOrganization(): void {
    this.handleNavigation('/organizations/new');
  }

  /**
   * Navigate to organizations management page
   */
  private handleManageOrganizations(): void {
    this.handleNavigation('/organizations');
  }

  /**
   * Refresh breadcrumbs and nav items based on current workspace/project/folder state
   */
  private updateWorkspaceContext(): void {
    try {
      const workspaceState = this.workspaceStore?.getState();
      if (!workspaceState) return;

      // Update breadcrumbs from workspace state
      if (workspaceState.breadcrumbs?.length > 0) {
        this.setBreadcrumbs(workspaceState.breadcrumbs);
      }

      // Refresh the workspace context component
      this.workspaceContext?.refresh();

      // Update navigation items to reflect current context
      this.updateNavigationItems(this.getContextualNavigationItems());

      logger.debug('Workspace context updated', {
        workspace: workspaceState.currentWorkspace?.id,
        project: workspaceState.currentProject?.id,
        folder: workspaceState.currentFolder?.id,
      });
    } catch (error) {
      logger.warn('Failed to update workspace context', { error });
    }
  }

  /**
   * Clean up resources
   */
  public destroy(): void {
    this.topNavigation?.destroy();
    this.sidebarNavigation?.destroy();
    this.mobileNavigation?.destroy();
    this.breadcrumbNavigation?.destroy();
    this.organizationSwitcher?.destroy();
    this.workspaceContext?.destroy();
    this.enhancedBreadcrumbNavigation?.destroy();
    
    // Unsubscribe from stores
    this.unsubscribeWorkspace?.();
    this.unsubscribeNotifications?.();
    this.unsubscribeUploads?.();

    // Remove window event listeners
    if (this.routeChangeHandler) {
      window.removeEventListener("popstate", this.routeChangeHandler);
    }
    if (this.customRouteChangeHandler) {
      window.removeEventListener("route:changed", this.customRouteChangeHandler);
    }
    if (this.resizeHandler) {
      window.removeEventListener("resize", this.resizeHandler);
    }
    
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