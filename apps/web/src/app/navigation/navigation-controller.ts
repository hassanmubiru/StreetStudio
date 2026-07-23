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