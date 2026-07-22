/**
 * Navigation Controller Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NavigationController } from './navigation-controller';
import type { OrganizationDto, MemberDto } from '@streetstudio/shared';

// Mock DOM
const mockDocument = {
  getElementById: vi.fn(),
  createElement: vi.fn(),
  body: document.body,
  addEventListener: vi.fn(),
};

// Mock window
const mockWindow = {
  location: { pathname: '/dashboard' },
  addEventListener: vi.fn(),
  dispatchEvent: vi.fn(),
  innerWidth: 1024,
  localStorage: {
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn(),
  },
};

// Mock navigation components
const mockTopNavigation = {
  initialize: vi.fn(),
  updateAuthContext: vi.fn(),
  destroy: vi.fn(),
};

const mockSidebarNavigation = {
  initialize: vi.fn(),
  updateItems: vi.fn(),
  updateAuthContext: vi.fn(),
  setCollapsed: vi.fn(),
  destroy: vi.fn(),
};

const mockMobileNavigation = {
  initialize: vi.fn(),
  updateItems: vi.fn(),
  updateAuthContext: vi.fn(),
  setOpen: vi.fn(),
  destroy: vi.fn(),
};

const mockBreadcrumbNavigation = {
  initialize: vi.fn(),
  updateBreadcrumbs: vi.fn(),
  destroy: vi.fn(),
};

// Mock implementations
vi.mock('./components/top-navigation', () => ({
  TopNavigation: vi.fn(() => mockTopNavigation),
}));

vi.mock('./components/sidebar-navigation', () => ({
  SidebarNavigation: vi.fn(() => mockSidebarNavigation),
}));

vi.mock('./components/mobile-navigation', () => ({
  MobileNavigation: vi.fn(() => mockMobileNavigation),
}));

vi.mock('./components/breadcrumb-navigation', () => ({
  BreadcrumbNavigation: vi.fn(() => mockBreadcrumbNavigation),
}));

describe('NavigationController', () => {
  let navigationController: NavigationController;
  let mockHeaderContainer: HTMLElement;
  let mockSidebarContainer: HTMLElement;

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup mock DOM elements
    mockHeaderContainer = document.createElement('div');
    mockHeaderContainer.id = 'app-header';
    mockSidebarContainer = document.createElement('div');
    mockSidebarContainer.id = 'app-sidebar';

    // Mock document.getElementById
    vi.mocked(document.getElementById).mockImplementation((id) => {
      switch (id) {
        case 'app-header':
          return mockHeaderContainer;
        case 'app-sidebar':
          return mockSidebarContainer;
        case 'app-main':
          return document.createElement('div');
        default:
          return null;
      }
    });

    // Mock localStorage
    vi.mocked(window.localStorage.getItem).mockReturnValue('false');

    navigationController = new NavigationController();
  });

  afterEach(() => {
    navigationController?.destroy();
  });

  describe('initialization', () => {
    it('should initialize navigation components', () => {
      navigationController.initialize();

      expect(mockTopNavigation.initialize).toHaveBeenCalled();
      expect(mockSidebarNavigation.initialize).toHaveBeenCalled();
      expect(mockMobileNavigation.initialize).toHaveBeenCalled();
      expect(mockBreadcrumbNavigation.initialize).toHaveBeenCalled();
    });

    it('should load saved sidebar state', () => {
      vi.mocked(window.localStorage.getItem).mockReturnValue('true');
      const controller = new NavigationController();
      
      const state = controller.getState();
      expect(state.sidebarCollapsed).toBe(true);
    });
  });

  describe('state management', () => {
    beforeEach(() => {
      navigationController.initialize();
    });

    it('should update navigation state', () => {
      const updates = {
        sidebarCollapsed: true,
        mobileMenuOpen: true,
      };

      navigationController.updateState(updates);
      const state = navigationController.getState();

      expect(state.sidebarCollapsed).toBe(true);
      expect(state.mobileMenuOpen).toBe(true);
    });

    it('should notify state change listeners', () => {
      const listener = vi.fn();
      navigationController.onStateChange(listener);

      navigationController.updateState({ sidebarCollapsed: true });

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({ sidebarCollapsed: true })
      );
    });

    it('should persist sidebar state to localStorage', () => {
      navigationController.updateState({ sidebarCollapsed: true });

      expect(window.localStorage.setItem).toHaveBeenCalledWith(
        'streetstudio_navigation_state',
        expect.stringContaining('"sidebarCollapsed":true')
      );
    });
  });

  describe('authentication context', () => {
    const mockUser: MemberDto = {
      id: 'user-1' as any,
      email: 'test@example.com',
      displayName: 'Test User',
      avatarUrl: '/avatar.jpg',
      createdAt: '2023-01-01T00:00:00Z' as any,
      updatedAt: '2023-01-01T00:00:00Z' as any,
    };

    const mockOrganization: OrganizationDto = {
      id: 'org-1' as any,
      name: 'Test Org',
      slug: 'test-org',
      createdAt: '2023-01-01T00:00:00Z' as any,
      updatedAt: '2023-01-01T00:00:00Z' as any,
    };

    beforeEach(() => {
      navigationController.initialize();
    });

    it('should set authentication context', () => {
      navigationController.setAuthContext(mockUser, mockOrganization);

      const state = navigationController.getState();
      expect(state.currentUser).toBe(mockUser);
      expect(state.currentOrganization).toBe(mockOrganization);
    });

    it('should update navigation components with auth context', () => {
      navigationController.setAuthContext(mockUser, mockOrganization);

      expect(mockTopNavigation.updateAuthContext).toHaveBeenCalledWith(
        mockUser,
        mockOrganization
      );
      expect(mockSidebarNavigation.updateAuthContext).toHaveBeenCalledWith(
        mockUser,
        mockOrganization
      );
      expect(mockMobileNavigation.updateAuthContext).toHaveBeenCalledWith(
        mockUser,
        mockOrganization
      );
    });
  });

  describe('navigation items', () => {
    const mockNavItems = [
      {
        id: 'dashboard',
        label: 'Dashboard',
        href: '/dashboard',
        icon: 'home',
      },
      {
        id: 'projects',
        label: 'Projects',
        href: '/projects',
        icon: 'folder',
      },
    ];

    beforeEach(() => {
      navigationController.initialize();
    });

    it('should update navigation items', () => {
      navigationController.updateNavigationItems(mockNavItems);

      expect(mockSidebarNavigation.updateItems).toHaveBeenCalledWith(mockNavItems);
      expect(mockMobileNavigation.updateItems).toHaveBeenCalledWith(mockNavItems);
    });
  });

  describe('breadcrumbs', () => {
    const mockBreadcrumbs = [
      { label: 'Dashboard', href: '/dashboard' },
      { label: 'Projects', href: '/projects' },
      { label: 'Current Project', current: true },
    ];

    beforeEach(() => {
      navigationController.initialize();
    });

    it('should set breadcrumbs', () => {
      navigationController.setBreadcrumbs(mockBreadcrumbs);

      const state = navigationController.getState();
      expect(state.breadcrumbs).toBe(mockBreadcrumbs);
      expect(mockBreadcrumbNavigation.updateBreadcrumbs).toHaveBeenCalledWith(
        mockBreadcrumbs
      );
    });
  });

  describe('sidebar control', () => {
    beforeEach(() => {
      navigationController.initialize();
    });

    it('should toggle sidebar collapsed state', () => {
      expect(navigationController.getState().sidebarCollapsed).toBe(false);

      navigationController.toggleSidebar();

      expect(navigationController.getState().sidebarCollapsed).toBe(true);
      expect(mockSidebarNavigation.setCollapsed).toHaveBeenCalledWith(true);
    });

    it('should save sidebar state when toggled', () => {
      navigationController.toggleSidebar();

      expect(window.localStorage.setItem).toHaveBeenCalledWith(
        'streetstudio_sidebar_collapsed',
        'true'
      );
    });
  });

  describe('mobile menu control', () => {
    beforeEach(() => {
      navigationController.initialize();
    });

    it('should toggle mobile menu', () => {
      expect(navigationController.getState().mobileMenuOpen).toBe(false);

      navigationController.toggleMobileMenu();

      expect(navigationController.getState().mobileMenuOpen).toBe(true);
      expect(mockMobileNavigation.setOpen).toHaveBeenCalledWith(true);
    });

    it('should close mobile menu', () => {
      navigationController.updateState({ mobileMenuOpen: true });

      navigationController.closeMobileMenu();

      expect(navigationController.getState().mobileMenuOpen).toBe(false);
      expect(mockMobileNavigation.setOpen).toHaveBeenCalledWith(false);
    });
  });

  describe('organization change', () => {
    beforeEach(() => {
      navigationController.initialize();
    });

    it('should handle organization change events', () => {
      const handler = vi.fn();
      navigationController.onOrganizationChange(handler);

      navigationController.changeOrganization('new-org-id' as any);

      expect(handler).toHaveBeenCalledWith('new-org-id');
    });

    it('should remove organization change handler', () => {
      const handler = vi.fn();
      const unsubscribe = navigationController.onOrganizationChange(handler);

      unsubscribe();
      navigationController.changeOrganization('new-org-id' as any);

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('cleanup', () => {
    beforeEach(() => {
      navigationController.initialize();
    });

    it('should destroy all navigation components', () => {
      navigationController.destroy();

      expect(mockTopNavigation.destroy).toHaveBeenCalled();
      expect(mockSidebarNavigation.destroy).toHaveBeenCalled();
      expect(mockMobileNavigation.destroy).toHaveBeenCalled();
      expect(mockBreadcrumbNavigation.destroy).toHaveBeenCalled();
    });
  });
});