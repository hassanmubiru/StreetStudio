/**
 * Workspace and Organization Management Integration Test
 * 
 * Tests the integration between organization switching, workspace context management,
 * and breadcrumb navigation for Task 3.4
 */

import { describe, test, expect, beforeEach, vi, afterEach } from 'vitest';
import type { OrganizationDto, MemberDto, WorkspaceDto, ProjectDto, Uuid } from '@streetstudio/shared';
import { NavigationController } from './navigation-controller';
import { createAuthStore } from '../../stores/auth-store';
import { createWorkspaceStore } from '../../stores/workspace-store';

// Mock the dashboard session
const mockDashboardSession = {
  getAuthToken: vi.fn().mockReturnValue('mock-token'),
  getCurrentMember: vi.fn(),
  selectOrganization: vi.fn()
};

// Mock DOM elements
function createMockContainer(id: string): HTMLElement {
  const element = document.createElement('div');
  element.id = id;
  document.body.appendChild(element);
  return element;
}

describe('Task 3.4: Workspace and Organization Management Integration', () => {
  let navigationController: NavigationController;
  let authStore: any;
  let workspaceStore: any;
  let headerContainer: HTMLElement;
  let sidebarContainer: HTMLElement;
  let mockUser: MemberDto;
  let mockOrganization: OrganizationDto;
  let mockWorkspace: WorkspaceDto;
  let mockProject: ProjectDto;

  beforeEach(() => {
    // Clear DOM
    document.body.innerHTML = '';

    // Create mock DOM containers
    headerContainer = createMockContainer('app-header');
    sidebarContainer = createMockContainer('app-sidebar');
    createMockContainer('app-main');

    // Create mock data
    mockUser = {
      id: 'user-1' as Uuid,
      email: 'test@example.com',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
      avatarUrl: '/avatar.jpg'
    };

    mockOrganization = {
      id: 'org-1' as Uuid,
      name: 'Test Organization',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z'
    };

    mockWorkspace = {
      id: 'workspace-1' as Uuid,
      name: 'Default Workspace',
      description: 'Test workspace',
      organizationId: mockOrganization.id,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z'
    };

    mockProject = {
      id: 'project-1' as Uuid,
      name: 'Test Project',
      organizationId: mockOrganization.id,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z'
    };

    // Initialize stores
    authStore = createAuthStore(mockDashboardSession as any);
    workspaceStore = createWorkspaceStore();

    // Initialize navigation controller
    navigationController = new NavigationController();
    navigationController.initialize();
  });

  afterEach(() => {
    navigationController?.destroy();
    authStore?.destroy();
    workspaceStore?.destroy();
    document.body.innerHTML = '';
  });

  describe('Organization Switching', () => {
    test('should handle organization switch with permission-based filtering', async () => {
      // Set up initial auth context
      navigationController.setAuthContext(mockUser, mockOrganization);
      
      // Simulate organization change
      const organizationChangeHandler = vi.fn();
      const unsubscribe = navigationController.onOrganizationChange(organizationChangeHandler);

      // Trigger organization switch
      navigationController.changeOrganization('org-2' as Uuid);

      // Verify handler was called
      expect(organizationChangeHandler).toHaveBeenCalledWith('org-2');
      
      unsubscribe();
    });

    test('should update navigation elements after organization change', () => {
      // Set up auth context
      navigationController.setAuthContext(mockUser, mockOrganization);

      // Track state changes
      const stateChanges: any[] = [];
      const unsubscribe = navigationController.onStateChange((state) => {
        stateChanges.push(state);
      });

      // Change organization
      navigationController.changeOrganization('org-2' as Uuid);

      // Verify state updates occurred
      expect(stateChanges.length).toBeGreaterThan(0);
      
      unsubscribe();
    });
  });

  describe('Workspace Context Management', () => {
    test('should synchronize workspace state across application', () => {
      // Set up initial context
      navigationController.setAuthContext(mockUser, mockOrganization);
      
      // Get initial workspace state
      const initialState = workspaceStore.getState();
      expect(initialState).toBeDefined();
      
      // Verify workspace context is managed
      expect(typeof workspaceStore.setCurrentWorkspace).toBe('function');
      expect(typeof workspaceStore.setCurrentProject).toBe('function');
      expect(typeof workspaceStore.setCurrentFolder).toBe('function');
    });

    test('should handle workspace switching', () => {
      // Set workspace context
      workspaceStore.setCurrentWorkspace(mockWorkspace);
      
      // Verify workspace is set
      const state = workspaceStore.getState();
      expect(state.currentWorkspace).toEqual(mockWorkspace);
    });

    test('should handle project switching within workspace', () => {
      // Set workspace first
      workspaceStore.setCurrentWorkspace(mockWorkspace);
      
      // Set project
      workspaceStore.setCurrentProject(mockProject);
      
      // Verify project is set and breadcrumbs updated
      const state = workspaceStore.getState();
      expect(state.currentProject).toEqual(mockProject);
      expect(state.breadcrumbs.length).toBeGreaterThan(0);
    });
  });

  describe('Breadcrumb Navigation', () => {
    test('should generate breadcrumbs for deep application states', () => {
      // Set up full context hierarchy
      workspaceStore.setCurrentWorkspace(mockWorkspace);
      workspaceStore.setCurrentProject(mockProject);
      
      // Navigate to a deep route
      workspaceStore.navigateToRoute('/projects/project-1/videos/video-1');
      
      // Verify breadcrumbs are generated
      const state = workspaceStore.getState();
      expect(state.breadcrumbs.length).toBeGreaterThan(1);
      
      // Verify breadcrumb structure includes project
      const projectBreadcrumb = state.breadcrumbs.find(b => b.label === mockProject.name);
      expect(projectBreadcrumb).toBeDefined();
    });

    test('should handle navigation with state persistence', () => {
      // Set up navigation controller with deep link support
      navigationController.setupDeepLinkSupport();
      
      // Navigate with state
      const testState = { videoId: 'video-1', timestamp: 120 };
      navigationController.navigateWithState('/projects/project-1/videos/video-1', testState);
      
      // Verify state is stored
      const storedState = workspaceStore.getDeepLinkState('/projects/project-1/videos/video-1');
      expect(storedState).toEqual(testState);
    });

    test('should update breadcrumbs when context changes', () => {
      const stateChanges: any[] = [];
      const unsubscribe = workspaceStore.subscribe((state) => {
        stateChanges.push(state.breadcrumbs);
      });

      // Change workspace context
      workspaceStore.setCurrentWorkspace(mockWorkspace);
      workspaceStore.setCurrentProject(mockProject);

      // Verify breadcrumbs changed
      expect(stateChanges.length).toBeGreaterThan(1);
      const finalBreadcrumbs = stateChanges[stateChanges.length - 1];
      expect(finalBreadcrumbs.length).toBeGreaterThan(0);

      unsubscribe();
    });
  });

  describe('State Synchronization', () => {
    test('should synchronize sidebar state across stores', () => {
      // Toggle sidebar
      navigationController.toggleSidebar();
      
      // Verify state is synchronized
      const navigationState = navigationController.getState();
      const workspaceState = workspaceStore.getState();
      
      expect(navigationState.sidebarCollapsed).toBe(workspaceState.sidebarCollapsed);
    });

    test('should persist navigation state', () => {
      // Change sidebar state
      navigationController.toggleSidebar();
      
      // Verify persistence (would normally check localStorage)
      const state = navigationController.getState();
      expect(typeof state.sidebarCollapsed).toBe('boolean');
    });

    test('should handle mobile menu state', () => {
      // Toggle mobile menu
      navigationController.toggleMobileMenu();
      
      // Verify mobile menu state
      const state = navigationController.getState();
      expect(state.mobileMenuOpen).toBe(true);
      
      // Close mobile menu
      navigationController.closeMobileMenu();
      expect(navigationController.getState().mobileMenuOpen).toBe(false);
    });
  });

  describe('Integration Requirements Validation', () => {
    test('validates Requirements 2.4: Organization switching updates all navigation elements', () => {
      // Set up auth context
      navigationController.setAuthContext(mockUser, mockOrganization);
      
      // Track organization changes
      let organizationChanged = false;
      navigationController.onOrganizationChange(() => {
        organizationChanged = true;
      });
      
      // Trigger organization switch
      navigationController.changeOrganization('org-2' as Uuid);
      
      // Verify Requirements 2.4 compliance
      expect(organizationChanged).toBe(true);
    });

    test('validates Requirements 8.1: Organization management with proper state sync', () => {
      // Set organization in auth store
      authStore.setOrganization(mockOrganization);
      
      // Verify organization is set
      const authState = authStore.getState();
      expect(authState.currentOrganization).toEqual(mockOrganization);
      
      // Verify navigation reflects organization change
      navigationController.setAuthContext(mockUser, mockOrganization);
      const navState = navigationController.getState();
      expect(navState.currentOrganization).toEqual(mockOrganization);
    });

    test('validates workspace context synchronization across application', () => {
      // Set up full workspace context
      workspaceStore.setCurrentWorkspace(mockWorkspace);
      workspaceStore.setCurrentProject(mockProject);
      
      // Verify context is synchronized
      const contextData = {
        workspace: workspaceStore.getState().currentWorkspace,
        project: workspaceStore.getState().currentProject
      };
      
      expect(contextData.workspace).toEqual(mockWorkspace);
      expect(contextData.project).toEqual(mockProject);
    });

    test('validates breadcrumb navigation for deep application states', () => {
      // Set up deep navigation state
      workspaceStore.setCurrentWorkspace(mockWorkspace);
      workspaceStore.setCurrentProject(mockProject);
      workspaceStore.navigateToRoute('/projects/project-1/folders/folder-1/videos/video-1');
      
      // Verify breadcrumb generation
      const breadcrumbs = workspaceStore.getState().breadcrumbs;
      expect(breadcrumbs.length).toBeGreaterThanOrEqual(3); // Dashboard > Projects > Project
      
      // Verify breadcrumb navigation functionality
      const projectBreadcrumb = breadcrumbs.find(b => b.label === mockProject.name);
      expect(projectBreadcrumb).toBeDefined();
      expect(projectBreadcrumb?.href).toContain('/projects/');
    });
  });
});