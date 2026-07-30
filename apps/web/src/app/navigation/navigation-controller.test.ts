/**
 * Navigation Controller Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NavigationController } from './navigation-controller';
import type { OrganizationDto, MemberDto } from '@streetstudio/shared';

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

// jsdom returns a fresh localStorage wrapper on each property access, so
// vi.spyOn does not stick. Provide a stable, faithful in-memory Storage backed
// by a real Map (round-trips values correctly) whose methods are spies so we
// can assert calls. This is a complete key/value store, not a behavior mask.
function createLocalStorageStub(): Storage {
  const store = new Map<string, string>();
  return {
    getItem: vi.fn((key: string) => (store.has(key) ? store.get(key)! : null)),
    setItem: vi.fn((key: string, value: string) => {
      store.set(key, String(value));
    }),
    removeItem: vi.fn((key: string) => {
      store.delete(key);
    }),
    clear: vi.fn(() => {
      store.clear();
    }),
    key: vi.fn((index: number) => Array.from(store.keys())[index] ?? null),
    get length() {
      return store.size;
    },
  } as Storage;
}

describe('NavigationController', () => {
  let navigationController: NavigationController;
  let mockHeaderContainer: HTMLElement;
  let mockSidebarContainer: HTMLElement;

  beforeEach(() => {
    vi.clearAllMocks();

    // Create real DOM containers the controller looks up by id, and append
    // them so document.getElementById resolves them against the real jsdom DOM.
    document.body.innerHTML = '';
    mockHeaderContainer = document.createElement('div');
    mockHeaderContainer.id = 'app-header';
    mockSidebarContainer = document.createElement('div');
    mockSidebarContainer.id = 'app-sidebar';
    const mainContainer = document.createElement('div');
    mainContainer.id = 'app-main';
    document.body.append(mockHeaderContainer, mockSidebarContainer, mainContainer);

    // Stub the localStorage global with a stable in-memory Storage.
    vi.stubGlobal('localStorage', createLocalStorageStub());

    navigationController = new NavigationController();
  });

  afterEach(() => {
    navigationController?.destroy();
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
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
      createdAt: '2023-01-01T00:00:00Z' as any,
    };

    const mockOrganization: OrganizationDto = {
      id: 'org-1' as any,
      name: 'Test Org',
      settings: {},
      createdAt: '2023-01-01T00:00:00Z' as any,
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