/**
 * Dashboard Navigation State Management Tests
 * 
 * Unit tests for navigation state management and context switching
 * functionality in the dashboard interface.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NavigationController } from '../../app/navigation/navigation-controller.js';
import type { OrganizationDto, MemberDto } from '@streetstudio/shared';

// Mock the stores
vi.mock('../../stores/workspace-store.js', () => ({
  getWorkspaceStore: vi.fn(() => ({
    subscribe: vi.fn(() => vi.fn()),
    setSidebarCollapsed: vi.fn(),
    setCurrentWorkspace: vi.fn(),
    navigateToRoute: vi.fn(),
    setDeepLinkState: vi.fn(),
    getState: vi.fn(() => ({
      breadcrumbs: [],
      sidebarCollapsed: false
    }))
  }))
}));

vi.mock('../../stores/notification-store.js', () => ({
  getNotificationStore: vi.fn(() => ({
    subscribe: vi.fn(() => vi.fn()),
    getState: vi.fn(() => ({ unreadCount: 0 }))
  }))
}));

vi.mock('../../stores/upload-store.js', () => ({
  getUploadStore: vi.fn(() => ({
    subscribe: vi.fn(() => vi.fn()),
    getState: vi.fn(() => ({ 
      isUploading: false,
      queuedUploads: 0 
    }))
  }))
}));

// Mock navigation components
vi.mock('../../app/navigation/components/top-navigation.js', () => ({
  TopNavigation: vi.fn().mockImplementation(() => ({
    initialize: vi.fn(),
    updateAuthContext: vi.fn(),
    destroy: vi.fn()
  }))
}));

vi.mock('../../app/navigation/components/sidebar-navigation.js', () => ({
  SidebarNavigation: vi.fn().mockImplementation(() => ({
    initialize: vi.fn(),
    updateAuthContext: vi.fn(),
    updateItems: vi.fn(),
    setCollapsed: vi.fn(),
    destroy: vi.fn()
  }))
}));

vi.mock('../../app/navigation/components/mobile-navigation.js', () => ({
  MobileNavigation: vi.fn().mockImplementation(() => ({
    initialize: vi.fn(),
    updateAuthContext: vi.fn(),
    updateItems: vi.fn(),
    setOpen: vi.fn(),
    destroy: vi.fn()
  }))
}));

vi.mock('../../app/navigation/components/breadcrumb-navigation.js', () => ({
  BreadcrumbNavigation: vi.fn().mockImplementation(() => ({
    initialize: vi.fn(),
    updateBreadcrumbs: vi.fn(),
    destroy: vi.fn()
  }))
}));

vi.mock('../../app/navigation/components/organization-switcher.js', () => ({
  OrganizationSwitcher: vi.fn().mockImplementation(() => ({
    initialize: vi.fn(),
    updateContext: vi.fn(),
    destroy: vi.fn()
  }))
}));

vi.mock('../../app/navigation/components/workspace-context.js', () => ({
  WorkspaceContext: vi.fn().mockImplementation(() => ({
    initialize: vi.fn(),
    refresh: vi.fn(),
    destroy: vi.fn()
  }))
}));

vi.mock('../../app/navigation/components/enhanced-breadcrumb-navigation.js', () => ({
  EnhancedBreadcrumbNavigation: vi.fn().mockImplementation(() => ({
    initialize: vi.fn(),
    updateBreadcrumbs: vi.fn(),
    destroy: vi.fn()
  }))
}));

// Mock client logger
vi.mock('../../app/client-logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}));

describe('Dashboard Navigation State Management', () => {
  let navigationController: NavigationController;
  let mockUser: MemberDto;
  let mockOrganization: OrganizationDto;

  beforeEach(() => {
    // Setup DOM elements
    document.body.innerHTML = `
      <div id="app-header"></div>
      <div id="app-sidebar"></div>
      <div id="app-main"></div>
    `;

    mockUser = {
      id: 'user-123',
      displayName: 'John Doe',
      email: 'john@example.com'
    } as MemberDto;

    mockOrganization = {
      id: 'org-123',
      name: 'Test Organization',
      slug: 'test-org'
    } as OrganizationDto;

    // Mock localStorage
    Object.defineProperty(window, 'localStorage', {
      writable: true,
      value: {
        getItem: vi.fn(),
        setItem: vi.fn(),
        removeItem: vi.fn(),
        clear: vi.fn(),
      }
    });

    // Mock location
    Object.defineProperty(window, 'location', {
      writable: true,
      value: {
        pathname: '/dashboard',
        search: '',
        hash: '',
        href: 'http://localhost:3000/dashboard'
      }
    });

    // Mock window events
    window.addEventListener = vi.fn();
    window.removeEventListener = vi.fn();
    window.dispatchEvent = vi.fn();
  });

  afterEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = '';
  });

  describe('Navigation Controller Initialization', () => {
    it('should initialize with default state', () => {
      navigationController = new NavigationController();
      
      const state = navigationController.getState();
      expect(state.sidebarCollapsed).toBe(false);
      expect(state.mobileMenuOpen).toBe(false);
      expect(state.breadcrumbs).toEqual([]);
      expect(state.currentRoute).toBe('/dashboard');
    });

    it('should initialize navigation components', () => {
      navigationController = new NavigationController();
      navigationController.initialize();
      
      // Verify components are created (mocked)
      expect(vi.mocked(require('../../app/navigation/components/top-navigation.js').TopNavigation)).toHaveBeenCalled();
      expect(vi.mocked(require('../../app/navigation/components/sidebar-navigation.js').SidebarNavigation)).toHaveBeenCalled();
      expect(vi.mocked(require('../../app/navigation/components/mobile-navigation.js').MobileNavigation)).toHaveBeenCalled();
    });

    it('should restore saved sidebar state', () => {
      vi.mocked(localStorage.getItem).mockReturnValue('true');
      
      navigationController = new NavigationController();
      
      const state = navigationController.getState();
      expect(state.sidebarCollapsed).toBe(true);
    });
  });

  describe('State Management', () => {
    beforeEach(() => {
      navigationController = new NavigationController();
    });

    it('should update navigation state', () => {
      const newBreadcrumbs = [
        { label: 'Dashboard', href: '/dashboard' },
        { label: 'Projects', href: '/projects', current: true }
      ];

      navigationController.updateState({
        breadcrumbs: newBreadcrumbs,
        currentRoute: '/projects'
      });

      const state = navigationController.getState();
      expect(state.breadcrumbs).toEqual(newBreadcrumbs);
      expect(state.currentRoute).toBe('/projects');
    });

    it('should notify state change listeners', () => {
      const listener = vi.fn();
      
      const unsubscribe = navigationController.onStateChange(listener);
      
      // Should call immediately with current state
      expect(listener).toHaveBeenCalledWith(expect.objectContaining({
        sidebarCollapsed: false,
        mobileMenuOpen: false
      }));

      // Should call on state update
      navigationController.updateState({ sidebarCollapsed: true });
      
      expect(listener).toHaveBeenCalledWith(expect.objectContaining({
        sidebarCollapsed: true
      }));

      unsubscribe();
    });

    it('should persist state to localStorage', () => {
      navigationController.updateState({ sidebarCollapsed: true });
      
      expect(localStorage.setItem).toHaveBeenCalledWith(
        'streetstudio_navigation_state',
        JSON.stringify({ sidebarCollapsed: true })
      );
    });
  });

  describe('Authentication Context', () => {
    beforeEach(() => {
      navigationController = new NavigationController();
      navigationController.initialize();
    });

    it('should set authentication context', () => {
      navigationController.setAuthContext(mockUser, mockOrganization);
      
      const state = navigationController.getState();
      expect(state.currentUser).toEqual(mockUser);
      expect(state.currentOrganization).toEqual(mockOrganization);
    });

    it('should update navigation components with auth context', () => {
      const mockTopNav = navigationController['topNavigation'];
      const mockSidebar = navigationController['sidebarNavigation'];
      const mockMobile = navigationController['mobileNavigation'];

      navigationController.setAuthContext(mockUser, mockOrganization);
      
      expect(mockTopNav?.updateAuthContext).toHaveBeenCalledWith(mockUser, mockOrganization);
      expect(mockSidebar?.updateAuthContext).toHaveBeenCalledWith(mockUser, mockOrganization);
      expect(mockMobile?.updateAuthContext).toHaveBeenCalledWith(mockUser, mockOrganization);
    });
  });

  describe('Organization Switching', () => {
    beforeEach(() => {
      navigationController = new NavigationController();
      navigationController.initialize();
    });

    it('should handle organization change', () => {
      const handler = vi.fn();
      const unsubscribe = navigationController.onOrganizationChange(handler);
      
      navigationController.changeOrganization('new-org-123');
      
      expect(handler).toHaveBeenCalledWith('new-org-123');
      
      unsubscribe();
    });

    it('should update navigation items after organization change', () => {
      const mockSidebar = navigationController['sidebarNavigation'];
      
      navigationController.changeOrganization('new-org-123');
      
      expect(mockSidebar?.updateItems).toHaveBeenCalled();
    });

    it('should handle multiple organization change handlers', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      
      navigationController.onOrganizationChange(handler1);
      navigationController.onOrganizationChange(handler2);
      
      navigationController.changeOrganization('new-org-123');
      
      expect(handler1).toHaveBeenCalledWith('new-org-123');
      expect(handler2).toHaveBeenCalledWith('new-org-123');
    });

    it('should handle handler errors gracefully', () => {
      const errorHandler = vi.fn(() => { throw new Error('Handler error'); });
      const normalHandler = vi.fn();
      
      vi.spyOn(console, 'error').mockImplementation(() => {});
      
      navigationController.onOrganizationChange(errorHandler);
      navigationController.onOrganizationChange(normalHandler);
      
      navigationController.changeOrganization('new-org-123');
      
      expect(normalHandler).toHaveBeenCalledWith('new-org-123');
      expect(console.error).toHaveBeenCalled();
    });
  });

  describe('Sidebar Management', () => {
    beforeEach(() => {
      navigationController = new NavigationController();
      navigationController.initialize();
    });

    it('should toggle sidebar collapsed state', () => {
      expect(navigationController.getState().sidebarCollapsed).toBe(false);
      
      navigationController.toggleSidebar();
      
      expect(navigationController.getState().sidebarCollapsed).toBe(true);
      expect(localStorage.setItem).toHaveBeenCalledWith(
        'streetstudio_sidebar_collapsed',
        'true'
      );
    });

    it('should update sidebar component on toggle', () => {
      const mockSidebar = navigationController['sidebarNavigation'];
      
      navigationController.toggleSidebar();
      
      expect(mockSidebar?.setCollapsed).toHaveBeenCalledWith(true);
    });
  });

  describe('Mobile Navigation', () => {
    beforeEach(() => {
      navigationController = new NavigationController();
      navigationController.initialize();
    });

    it('should toggle mobile menu', () => {
      expect(navigationController.getState().mobileMenuOpen).toBe(false);
      
      navigationController.toggleMobileMenu();
      
      expect(navigationController.getState().mobileMenuOpen).toBe(true);
    });

    it('should close mobile menu', () => {
      navigationController.updateState({ mobileMenuOpen: true });
      
      navigationController.closeMobileMenu();
      
      expect(navigationController.getState().mobileMenuOpen).toBe(false);
    });

    it('should update mobile navigation component', () => {
      const mockMobile = navigationController['mobileNavigation'];
      
      navigationController.toggleMobileMenu();
      
      expect(mockMobile?.setOpen).toHaveBeenCalledWith(true);
    });
  });

  describe('Breadcrumb Management', () => {
    beforeEach(() => {
      navigationController = new NavigationController();
      navigationController.initialize();
    });

    it('should set breadcrumbs', () => {
      const breadcrumbs = [
        { label: 'Dashboard', href: '/dashboard' },
        { label: 'Projects', href: '/projects' },
        { label: 'Project Alpha', current: true }
      ];

      navigationController.setBreadcrumbs(breadcrumbs);
      
      expect(navigationController.getState().breadcrumbs).toEqual(breadcrumbs);
    });

    it('should update breadcrumb components', () => {
      const mockBreadcrumb = navigationController['breadcrumbNavigation'];
      const mockEnhanced = navigationController['enhancedBreadcrumbNavigation'];
      
      const breadcrumbs = [{ label: 'Home', href: '/' }];
      
      navigationController.setBreadcrumbs(breadcrumbs);
      
      expect(mockBreadcrumb?.updateBreadcrumbs).toHaveBeenCalledWith(breadcrumbs);
      expect(mockEnhanced?.updateBreadcrumbs).toHaveBeenCalledWith(breadcrumbs);
    });
  });

  describe('Navigation Items Management', () => {
    beforeEach(() => {
      navigationController = new NavigationController();
      navigationController.initialize();
    });

    it('should update navigation items', () => {
      const items = [
        { id: 'dashboard', label: 'Dashboard', href: '/dashboard', icon: 'home' },
        { id: 'projects', label: 'Projects', href: '/projects', icon: 'folder' }
      ];

      navigationController.updateNavigationItems(items);
      
      const mockSidebar = navigationController['sidebarNavigation'];
      const mockMobile = navigationController['mobileNavigation'];
      
      expect(mockSidebar?.updateItems).toHaveBeenCalledWith(items);
      expect(mockMobile?.updateItems).toHaveBeenCalledWith(items);
    });

    it('should generate contextual navigation items', () => {
      navigationController.updateState({ currentRoute: '/projects' });
      
      const items = navigationController['getContextualNavigationItems']();
      
      expect(items).toEqual(expect.arrayContaining([
        expect.objectContaining({
          id: 'dashboard',
          label: 'Dashboard',
          href: '/dashboard',
          active: false
        }),
        expect.objectContaining({
          id: 'projects',
          label: 'Projects',
          href: '/projects',
          active: true
        })
      ]));
    });
  });

  describe('Deep Link Support', () => {
    beforeEach(() => {
      navigationController = new NavigationController();
    });

    it('should setup deep link support with query parameters', () => {
      Object.defineProperty(window, 'location', {
        writable: true,
        value: {
          pathname: '/projects',
          search: '?project=123&view=grid',
          hash: '#comments'
        }
      });

      const mockWorkspaceStore = {
        setDeepLinkState: vi.fn()
      };
      navigationController['workspaceStore'] = mockWorkspaceStore;

      navigationController.setupDeepLinkSupport();
      
      expect(mockWorkspaceStore.setDeepLinkState).toHaveBeenCalledWith(
        '/projects',
        {
          project: '123',
          view: 'grid',
          hash: 'comments'
        }
      );
    });

    it('should navigate with state preservation', () => {
      const mockWorkspaceStore = {
        setDeepLinkState: vi.fn(),
        navigateToRoute: vi.fn()
      };
      navigationController['workspaceStore'] = mockWorkspaceStore;

      const state = { project: '123', tab: 'settings' };
      
      navigationController.navigateWithState('/projects/123', state);
      
      expect(mockWorkspaceStore.setDeepLinkState).toHaveBeenCalledWith('/projects/123', state);
      expect(mockWorkspaceStore.navigateToRoute).toHaveBeenCalledWith('/projects/123', state);
    });
  });

  describe('Store Integration', () => {
    beforeEach(() => {
      navigationController = new NavigationController();
    });

    it('should handle store initialization errors gracefully', () => {
      // Mock store to throw error
      vi.mocked(require('../../stores/workspace-store.js').getWorkspaceStore).mockImplementation(() => {
        throw new Error('Store initialization failed');
      });

      expect(() => {
        navigationController = new NavigationController();
      }).not.toThrow();
    });

    it('should handle workspace store updates', () => {
      const mockWorkspaceStore = navigationController['workspaceStore'];
      
      // Simulate workspace store subscription callback
      const mockSubscriptionCallback = vi.fn();
      vi.mocked(mockWorkspaceStore.subscribe).mockImplementation((callback) => {
        mockSubscriptionCallback.mockImplementation(callback);
        return vi.fn();
      });

      navigationController = new NavigationController();

      // Simulate store state change
      mockSubscriptionCallback({
        breadcrumbs: [{ label: 'Test', href: '/test' }],
        sidebarCollapsed: true
      });

      expect(navigationController.getState().breadcrumbs).toEqual([{ label: 'Test', href: '/test' }]);
      expect(navigationController.getState().sidebarCollapsed).toBe(true);
    });
  });

  describe('Cleanup and Resource Management', () => {
    beforeEach(() => {
      navigationController = new NavigationController();
      navigationController.initialize();
    });

    it('should clean up resources on destroy', () => {
      const mockTopNav = navigationController['topNavigation'];
      const mockSidebar = navigationController['sidebarNavigation'];
      const mockMobile = navigationController['mobileNavigation'];

      navigationController.destroy();
      
      expect(mockTopNav?.destroy).toHaveBeenCalled();
      expect(mockSidebar?.destroy).toHaveBeenCalled();
      expect(mockMobile?.destroy).toHaveBeenCalled();
    });

    it('should clear all event handlers on destroy', () => {
      const handler = vi.fn();
      const stateListener = vi.fn();
      
      navigationController.onOrganizationChange(handler);
      navigationController.onStateChange(stateListener);
      
      navigationController.destroy();
      
      // Verify handlers are cleared
      navigationController.changeOrganization('test-org');
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    beforeEach(() => {
      navigationController = new NavigationController();
    });

    it('should handle localStorage errors gracefully', () => {
      vi.mocked(localStorage.setItem).mockImplementation(() => {
        throw new Error('Storage quota exceeded');
      });

      vi.spyOn(console, 'warn').mockImplementation(() => {});
      
      expect(() => {
        navigationController.updateState({ sidebarCollapsed: true });
      }).not.toThrow();

      expect(console.warn).toHaveBeenCalledWith('Failed to persist navigation state:', expect.any(Error));
    });

    it('should handle state change listener errors', () => {
      const errorListener = vi.fn(() => { throw new Error('Listener error'); });
      const normalListener = vi.fn();
      
      vi.spyOn(console, 'error').mockImplementation(() => {});
      
      navigationController.onStateChange(errorListener);
      navigationController.onStateChange(normalListener);
      
      navigationController.updateState({ sidebarCollapsed: true });
      
      expect(normalListener).toHaveBeenCalled();
      expect(console.error).toHaveBeenCalled();
    });
  });

  describe('Responsive Behavior', () => {
    beforeEach(() => {
      navigationController = new NavigationController();
      navigationController.initialize();
    });

    it('should close mobile menu on navigation', () => {
      navigationController.updateState({ mobileMenuOpen: true });
      
      navigationController['handleNavigation']('/projects');
      
      expect(navigationController.getState().mobileMenuOpen).toBe(false);
    });

    it('should update current route on navigation', () => {
      navigationController['handleNavigation']('/projects/123');
      
      expect(navigationController.getState().currentRoute).toBe('/projects/123');
    });

    it('should dispatch navigation event', () => {
      navigationController['handleNavigation']('/projects');
      
      expect(window.dispatchEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'navigate',
          detail: { href: '/projects' }
        })
      );
    });
  });
});