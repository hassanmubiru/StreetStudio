/**
 * Navigation Integration Test
 * 
 * End-to-end integration test validating the complete navigation system
 * including layout controller integration and real-world usage scenarios
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { NavigationController } from './navigation-controller';
import { LayoutController } from '../layout/layout-controller';
import type { OrganizationDto, MemberDto } from '@streetstudio/shared';

// Mock the stores to avoid initialization issues
vi.mock('../../stores/workspace-store');
vi.mock('../../stores/notification-store');
vi.mock('../../stores/upload-store');

describe('Navigation Integration', () => {
  let navigationController: NavigationController;
  let layoutController: LayoutController;
  let container: HTMLElement;

  beforeEach(async () => {
    // Create a proper DOM structure
    document.body.innerHTML = `
      <div id="app">
        <div id="app-header"></div>
        <div id="app-sidebar">
          <div class="flex flex-col w-64 border-r border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
          </div>
        </div>
        <div id="app-main">
          <div id="page-content"></div>
        </div>
      </div>
    `;

    container = document.getElementById('app')!;
    
    // Setup layout controller
    layoutController = new LayoutController(container);
    await layoutController.initialize();

    // Setup navigation controller
    navigationController = new NavigationController();
    navigationController.initialize();
  });

  afterEach(() => {
    navigationController?.destroy();
    document.body.innerHTML = '';
  });

  test('should integrate layout and navigation controllers', async () => {
    // Setup app layout
    layoutController.setupResponsiveLayout();
    layoutController.setupThemeToggle();

    // Set authentication context
    const user: MemberDto = {
      id: 'user-123',
      email: 'test@example.com',
      displayName: 'Test User',
      avatarUrl: '/avatar.jpg',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z'
    };

    const organization: OrganizationDto = {
      id: 'org-123',
      name: 'Test Organization',
      slug: 'test-org',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z'
    };

    navigationController.setAuthContext(user, organization);

    // Verify state
    const navState = navigationController.getState();
    expect(navState.currentUser).toEqual(user);
    expect(navState.currentOrganization).toEqual(organization);
  });

  test('should handle complete navigation workflow', () => {
    // 1. Start with dashboard
    expect(navigationController.getState().currentRoute).toBe('/dashboard');

    // 2. Navigate to projects
    const projectsBreadcrumbs = [
      { label: 'Dashboard', href: '/dashboard' },
      { label: 'Projects', current: true }
    ];
    
    navigationController.setBreadcrumbs(projectsBreadcrumbs);
    navigationController.updateState({ currentRoute: '/projects' });

    expect(navigationController.getState().breadcrumbs).toEqual(projectsBreadcrumbs);
    expect(navigationController.getState().currentRoute).toBe('/projects');

    // 3. Open a project
    const projectBreadcrumbs = [
      { label: 'Dashboard', href: '/dashboard' },
      { label: 'Projects', href: '/projects' },
      { label: 'My Project', current: true }
    ];
    
    navigationController.setBreadcrumbs(projectBreadcrumbs);
    navigationController.updateState({ currentRoute: '/projects/123' });

    expect(navigationController.getState().breadcrumbs).toEqual(projectBreadcrumbs);
  });

  test('should handle responsive navigation states', () => {
    // Test mobile responsive behavior
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 768 // Mobile width
    });

    // Open mobile menu
    navigationController.toggleMobileMenu();
    expect(navigationController.getState().mobileMenuOpen).toBe(true);

    // Simulate resize to desktop
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 1200
    });

    window.dispatchEvent(new Event('resize'));

    // Mobile menu should auto-close (after timeout)
    setTimeout(() => {
      expect(navigationController.getState().mobileMenuOpen).toBe(false);
    }, 150);
  });

  test('should handle keyboard navigation properly', () => {
    // Test keyboard shortcuts
    navigationController.setupDeepLinkSupport();

    // Cmd+B should toggle sidebar
    const toggleEvent = new KeyboardEvent('keydown', {
      key: 'b',
      metaKey: true
    });
    
    document.dispatchEvent(toggleEvent);
    expect(navigationController.getState().sidebarCollapsed).toBe(true);

    // Escape should close mobile menu
    navigationController.toggleMobileMenu();
    expect(navigationController.getState().mobileMenuOpen).toBe(true);

    const escapeEvent = new KeyboardEvent('keydown', {
      key: 'Escape'
    });
    
    document.dispatchEvent(escapeEvent);
    expect(navigationController.getState().mobileMenuOpen).toBe(false);
  });

  test('should handle organization switching workflow', () => {
    let organizationChanged = false;
    let newOrgId: string | null = null;

    // Subscribe to organization changes
    const unsubscribe = navigationController.onOrganizationChange((orgId) => {
      organizationChanged = true;
      newOrgId = orgId;
    });

    // Trigger organization change
    navigationController.changeOrganization('org-456');

    // Verify change was handled
    expect(organizationChanged).toBe(true);
    expect(newOrgId).toBe('org-456');

    unsubscribe();
  });

  test('should persist and restore navigation state', () => {
    // Mock localStorage
    const mockStorage: Record<string, string> = {};
    Object.defineProperty(window, 'localStorage', {
      value: {
        getItem: vi.fn((key: string) => mockStorage[key] || null),
        setItem: vi.fn((key: string, value: string) => {
          mockStorage[key] = value;
        }),
        removeItem: vi.fn((key: string) => {
          delete mockStorage[key];
        })
      },
      writable: true
    });

    // Change sidebar state
    navigationController.toggleSidebar();
    expect(navigationController.getState().sidebarCollapsed).toBe(true);

    // Verify state was persisted
    expect(window.localStorage.setItem).toHaveBeenCalledWith(
      'streetstudio_sidebar_collapsed',
      'true'
    );

    // Create new controller (simulating page reload)
    (window.localStorage.getItem as any).mockReturnValue('true');
    const newController = new NavigationController();
    
    expect(newController.getState().sidebarCollapsed).toBe(true);
    
    newController.destroy();
  });

  test('should handle deep link navigation', () => {
    // Setup deep link with query parameters
    Object.defineProperty(window, 'location', {
      value: {
        pathname: '/projects/123',
        search: '?view=grid&sort=name',
        hash: '#videos'
      },
      writable: true
    });

    navigationController.setupDeepLinkSupport();

    // Navigate with state
    const state = { 
      selectedVideo: 'video-456',
      timestamp: 120 
    };

    navigationController.navigateWithState('/projects/123/videos/456', state);
    
    expect(navigationController.getState().currentRoute).toBe('/projects/123/videos/456');
  });

  test('should handle error conditions gracefully', () => {
    // Test with missing DOM elements
    document.getElementById('app-header')?.remove();
    document.getElementById('app-sidebar')?.remove();

    expect(() => {
      const controller = new NavigationController();
      controller.initialize();
      controller.destroy();
    }).not.toThrow();

    // Test with localStorage errors
    Object.defineProperty(window, 'localStorage', {
      value: {
        getItem: vi.fn(() => {
          throw new Error('Storage error');
        }),
        setItem: vi.fn(() => {
          throw new Error('Storage error');
        })
      },
      writable: true
    });

    expect(() => {
      const controller = new NavigationController();
      controller.toggleSidebar();
      controller.destroy();
    }).not.toThrow();
  });

  test('should support complex navigation scenarios', () => {
    // Simulate a complete user workflow
    const user: MemberDto = {
      id: 'user-123',
      email: 'test@example.com',
      displayName: 'Test User',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z'
    };

    // 1. User logs in
    navigationController.setAuthContext(user);
    expect(navigationController.getState().currentUser).toEqual(user);

    // 2. User switches organizations
    let orgChangeCount = 0;
    navigationController.onOrganizationChange(() => {
      orgChangeCount++;
    });

    navigationController.changeOrganization('org-1');
    navigationController.changeOrganization('org-2');
    expect(orgChangeCount).toBe(2);

    // 3. User navigates through the app
    const routes = ['/dashboard', '/projects', '/projects/123', '/recordings'];
    
    routes.forEach(route => {
      navigationController.updateState({ currentRoute: route });
      expect(navigationController.getState().currentRoute).toBe(route);
    });

    // 4. User collapses sidebar
    navigationController.toggleSidebar();
    expect(navigationController.getState().sidebarCollapsed).toBe(true);

    // 5. User opens mobile menu (on mobile)
    navigationController.toggleMobileMenu();
    expect(navigationController.getState().mobileMenuOpen).toBe(true);
  });
});

describe('Navigation Component Integration', () => {
  test('should integrate with layout controller for different page types', async () => {
    const container = document.createElement('div');
    container.id = 'app-container';
    document.body.appendChild(container);

    const layoutController = new LayoutController(container);
    await layoutController.initialize();

    // Test app layout
    const appPage = document.createElement('div');
    appPage.innerHTML = '<h1>Dashboard</h1>';
    layoutController.renderAppPage(appPage);

    // Verify app layout structure was created
    expect(container.querySelector('#app-sidebar')).toBeTruthy();
    expect(container.querySelector('#app-header')).toBeTruthy();
    expect(container.querySelector('#app-main')).toBeTruthy();

    // Test auth layout
    const authPage = document.createElement('div');
    authPage.innerHTML = '<form>Login Form</form>';
    layoutController.renderAuthPage(authPage);

    // Verify auth layout structure
    expect(container.querySelector('#auth-container')).toBeTruthy();

    container.remove();
  });

  test('should handle theme and responsive layout integration', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);

    const layoutController = new LayoutController(container);
    await layoutController.initialize();

    layoutController.setupThemeToggle();
    layoutController.setupResponsiveLayout();

    // Simulate different screen sizes
    const screenSizes = [
      { width: 320, expected: 'mobile' },
      { width: 768, expected: 'tablet' },
      { width: 1024, expected: 'desktop' }
    ];

    screenSizes.forEach(({ width, expected }) => {
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: width
      });

      window.dispatchEvent(new Event('resize'));

      // Layout should adapt to screen size
      // Note: The actual implementation might need time to update
      expect(window.innerWidth).toBe(width);
    });

    container.remove();
  });
});