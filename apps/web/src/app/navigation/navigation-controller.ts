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