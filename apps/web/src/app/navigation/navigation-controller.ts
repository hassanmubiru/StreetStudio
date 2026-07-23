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

  constructor() {
    this.state = {
      sidebarCollapsed: this.getSavedSidebarState(),
      mobileMenuOpen: false,
      breadcrumbs: [],
      currentRoute: window.location.pathname,
    };

    // Listen for route changes
    this.setupRouteListener();
    this.setupResizeListener();
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
    for (const handler of this.orgChangeHandlers) {
      try {
        handler(organizationId);
      } catch (error) {
        console.error('Organization change handler error:', error);
      }
    }
  }

  /**
   * Toggle sidebar collapsed state
   */
  public toggleSidebar(): void {
    const collapsed = !this.state.sidebarCollapsed;
    this.updateState({ sidebarCollapsed: collapsed });
    this.sidebarNavigation?.setCollapsed(collapsed);
    this.saveSidebarState(collapsed);
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
    
    // Update current route
    this.updateState({ currentRoute: href });
    
    // Let router handle the actual navigation
    const event = new CustomEvent('navigate', { detail: { href } });
    window.dispatchEvent(event);
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
   * Clean up resources
   */
  public destroy(): void {
    this.topNavigation?.destroy();
    this.sidebarNavigation?.destroy();
    this.mobileNavigation?.destroy();
    this.breadcrumbNavigation?.destroy();
    
    this.orgChangeHandlers.clear();
    this.stateChangeListeners.clear();
  }
}