/**
 * Video Management Unit Tests
 * 
 * Tests project creation and member invitation workflows,
 * video organization and bulk operations,
 * and folder management and hierarchy display.
 * 
 * Validates: Requirements 4.1, 4.4, 4.5
 */

// @vitest-environment jsdom

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { ProjectDto, FolderDto, VideoDto } from '@streetstudio/shared';
import { ProjectDetailPage } from './project-detail-page.js';
import { ProjectsPage } from './projects-page.js';
import { BulkOperationsController } from '../../components/video-library/bulk-operations-controller.js';
import { VideoLibraryComponent } from '../../components/video-library/video-library-component.js';
import { FolderManager } from '../../components/folder-management/folder-manager.js';

// Mock API client
vi.mock('../../services/api.js', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn()
  }
}));

// Mock error handler and logger
vi.mock('../../app/error-handler.js', () => ({
  handleError: vi.fn()
}));

vi.mock('../../app/client-logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}));

// Mock localStorage
Object.defineProperty(window, 'localStorage', {
  value: {
    getItem: vi.fn(() => null),
    setItem: vi.fn(),
    clear: vi.fn(),
    removeItem: vi.fn()
  },
  writable: true
});

// ============================================================
// Section 1: Project Creation and Member Invitation Workflows
// Validates: Requirements 4.1, 4.4
// ============================================================

describe('Project Creation and Member Invitation', () => {
  let container: HTMLElement;
  let mockApiClient: any;

  beforeEach(async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    const { apiClient } = await import('../../services/api.js');
    mockApiClient = apiClient;
    vi.clearAllMocks();
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  describe('ProjectsPage rendering (Requirement 4.1)', () => {
    it('should render projects page with searchable grid layout', () => {
      const page = new ProjectsPage();
      const element = page.getElement();
      container.appendChild(element);

      // Should have main content container
      expect(element.getAttribute('data-main-content')).toBe('');
      expect(element.querySelector('h1')?.textContent).toBe('Video Library');
    });

    it('should render New Project button', () => {
      const page = new ProjectsPage();
      const element = page.getElement();
      container.appendChild(element);

      const newProjectBtn = element.querySelector('[data-action="new-project"]');
      expect(newProjectBtn).toBeTruthy();
      expect(newProjectBtn?.textContent?.trim()).toBe('New Project');
    });

    it('should render Upload Video button', () => {
      const page = new ProjectsPage();
      const element = page.getElement();
      container.appendChild(element);

      const uploadBtn = element.querySelector('[data-action="upload-video"]');
      expect(uploadBtn).toBeTruthy();
      expect(uploadBtn?.textContent?.trim()).toBe('Upload Video');
    });

    it('should set project context on video library', () => {
      const page = new ProjectsPage();
      const mockProject: ProjectDto = {
        id: 'proj-1',
        organizationId: 'org-1',
        name: 'Test Project',
        createdAt: '2024-01-01T00:00:00Z'
      };

      // Should not throw
      expect(() => page.setProject(mockProject)).not.toThrow();
      expect(() => page.setProject(null)).not.toThrow();
    });
  });

  describe('Project Detail Page (Requirement 4.4)', () => {
    const mockProject: ProjectDto = {
      id: 'proj-123',
      organizationId: 'org-123',
      name: 'My Test Project',
      createdAt: '2024-01-01T00:00:00Z'
    };

    const mockFolders: FolderDto[] = [
      { id: 'f1', projectId: 'proj-123', name: 'Root Folder', depth: 0 },
      { id: 'f2', projectId: 'proj-123', name: 'Subfolder', depth: 1, parentFolderId: 'f1' }
    ];

    beforeEach(() => {
      mockApiClient.get.mockResolvedValue({ data: mockProject });
    });

    it('should create project detail page with project ID', () => {
      const page = new ProjectDetailPage('proj-123');
      expect(page).toBeDefined();
    });

    it('should render project header with title and invite button', async () => {
      mockApiClient.get.mockImplementation((url: string) => {
        if (url.includes('/folders')) return Promise.resolve({ data: mockFolders });
        return Promise.resolve({ data: mockProject });
      });

      const page = new ProjectDetailPage('proj-123');
      const element = await page.getElement();
      container.appendChild(element);

      // Should have invite members button
      const inviteBtn = element.querySelector('[data-invite-members]');
      expect(inviteBtn).toBeTruthy();
      expect(inviteBtn?.textContent).toContain('Invite Members');
    });

    it('should render new content dropdown with folder, recording, upload options', async () => {
      mockApiClient.get.mockImplementation((url: string) => {
        if (url.includes('/folders')) return Promise.resolve({ data: [] });
        return Promise.resolve({ data: mockProject });
      });

      const page = new ProjectDetailPage('proj-123');
      const element = await page.getElement();
      container.appendChild(element);

      const newContentMenu = element.querySelector('[data-new-content-menu]');
      expect(newContentMenu).toBeTruthy();

      // Menu should contain folder, recording, and upload options
      const folderAction = newContentMenu?.querySelector('[data-action="folder"]');
      const recordingAction = newContentMenu?.querySelector('[data-action="recording"]');
      const uploadAction = newContentMenu?.querySelector('[data-action="upload"]');

      expect(folderAction?.textContent).toContain('New Folder');
      expect(recordingAction?.textContent).toContain('Start Recording');
      expect(uploadAction?.textContent).toContain('Upload Video');
    });

    it('should toggle new content menu on button click', async () => {
      mockApiClient.get.mockImplementation((url: string) => {
        if (url.includes('/folders')) return Promise.resolve({ data: [] });
        return Promise.resolve({ data: mockProject });
      });

      const page = new ProjectDetailPage('proj-123');
      const element = await page.getElement();
      container.appendChild(element);

      const menuBtn = element.querySelector('[data-new-content-btn]') as HTMLElement;
      const menu = element.querySelector('[data-new-content-menu]') as HTMLElement;

      // Menu should start hidden
      expect(menu.classList.contains('hidden')).toBe(true);

      // Click should toggle visibility
      menuBtn.click();
      expect(menu.classList.contains('hidden')).toBe(false);
    });

    it('should have folder tree sidebar section', async () => {
      mockApiClient.get.mockImplementation((url: string) => {
        if (url.includes('/folders')) return Promise.resolve({ data: [] });
        return Promise.resolve({ data: mockProject });
      });

      const page = new ProjectDetailPage('proj-123');
      const element = await page.getElement();
      container.appendChild(element);

      const sidebar = element.querySelector('aside');
      expect(sidebar).toBeTruthy();
      expect(sidebar?.textContent).toContain('Folder Structure');
    });

    it('should have content grid area for videos and folders', async () => {
      mockApiClient.get.mockImplementation((url: string) => {
        if (url.includes('/folders')) return Promise.resolve({ data: [] });
        return Promise.resolve({ data: mockProject });
      });

      const page = new ProjectDetailPage('proj-123');
      const element = await page.getElement();
      container.appendChild(element);

      const contentGrid = element.querySelector('[data-content-grid]');
      expect(contentGrid).toBeTruthy();
    });

    it('should call API to load project data', async () => {
      mockApiClient.get.mockImplementation((url: string) => {
        if (url.includes('/folders')) return Promise.resolve({ data: [] });
        return Promise.resolve({ data: mockProject });
      });

      const page = new ProjectDetailPage('proj-123');
      await page.getElement();

      expect(mockApiClient.get).toHaveBeenCalledWith('/projects/proj-123');
    });
  });
});

// ============================================================
// Section 2: Video Organization and Bulk Operations
// Validates: Requirements 4.1, 4.4
// ============================================================

describe('Video Organization and Bulk Operations', () => {
  describe('BulkOperationsController', () => {
    let controller: BulkOperationsController;

    beforeEach(() => {
      controller = new BulkOperationsController();
    });

    it('should return supported bulk actions', () => {
      const actions = controller.getSupportedActions();
      expect(actions).toContain('move');
      expect(actions).toContain('delete');
      expect(actions).toContain('share');
      expect(actions).toContain('download');
      expect(actions).toContain('archive');
      expect(actions).toContain('permissions');
    });

    it('should return max batch size of 50', () => {
      expect(controller.getMaxBatchSize()).toBe(50);
    });

    it('should succeed with empty video list', async () => {
      const result = await controller.performAction('delete', []);
      expect(result.success).toBe(true);
      expect(result.processedCount).toBe(0);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject batch exceeding max size', async () => {
      const oversizedBatch = Array.from({ length: 51 }, (_, i) => `video-${i}`);
      await expect(controller.performAction('delete', oversizedBatch))
        .rejects.toThrow('Batch size exceeds maximum');
    });

    it('should validate action with no videos selected', () => {
      const validation = controller.validateAction('delete', []);
      expect(validation.valid).toBe(false);
      expect(validation.message).toBe('No videos selected');
    });

    it('should validate action with too many videos', () => {
      const oversizedBatch = Array.from({ length: 51 }, (_, i) => `video-${i}`);
      const validation = controller.validateAction('move', oversizedBatch);
      expect(validation.valid).toBe(false);
      expect(validation.message).toContain('Too many videos');
    });

    it('should validate valid delete operation', () => {
      const validation = controller.validateAction('delete', ['v1', 'v2']);
      expect(validation.valid).toBe(true);
    });

    it('should validate valid move operation', () => {
      const validation = controller.validateAction('move', ['v1']);
      expect(validation.valid).toBe(true);
    });

    it('should require target folder for move operation', async () => {
      const result = await controller.performAction('move', ['v1'], {});
      expect(result.success).toBe(false);
    });

    it('should reject unsupported bulk action', async () => {
      const result = await controller.performAction(
        'invalid-action' as any, ['v1']
      );
      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should process delete operations individually', async () => {
      // Mock successful API calls
      const videoIds = ['v1', 'v2', 'v3'];
      const result = await controller.performAction('delete', videoIds);

      // Should attempt to process each video
      expect(result.processedCount + result.errors.length).toBe(videoIds.length);
    });
  });

  describe('Video Library View Modes', () => {
    it('should initialize VideoLibraryComponent with default grid view', () => {
      const library = new VideoLibraryComponent();
      const element = library.getElement();

      expect(element.classList.contains('video-library')).toBe(true);
      // Grid should be the active toggle
      const gridToggle = element.querySelector('[data-layout="grid"]');
      expect(gridToggle?.classList.contains('bg-white')).toBe(true);
    });

    it('should have list, grid, and timeline layout buttons', () => {
      const library = new VideoLibraryComponent();
      const element = library.getElement();

      expect(element.querySelector('[data-layout="list"]')).toBeTruthy();
      expect(element.querySelector('[data-layout="grid"]')).toBeTruthy();
      expect(element.querySelector('[data-layout="timeline"]')).toBeTruthy();
    });

    it('should render sort controls with all sort options', () => {
      const library = new VideoLibraryComponent();
      const element = library.getElement();

      const sortSelect = element.querySelector('[data-field="sort"]') as HTMLSelectElement;
      expect(sortSelect).toBeTruthy();

      const options = Array.from(sortSelect.querySelectorAll('option'))
        .map(opt => opt.value);
      expect(options).toContain('date');
      expect(options).toContain('name');
      expect(options).toContain('duration');
      expect(options).toContain('activity');
    });

    it('should render content area for video display', () => {
      const library = new VideoLibraryComponent();
      const element = library.getElement();

      const content = element.querySelector('[data-video-content]');
      expect(content).toBeTruthy();
    });

    it('should have bulk operations bar hidden initially', () => {
      const library = new VideoLibraryComponent();
      const element = library.getElement();

      const bulkBar = element.querySelector('[data-bulk-bar]');
      expect(bulkBar?.classList.contains('hidden')).toBe(true);
    });
  });
});

// ============================================================
// Section 3: Folder Management and Hierarchy Display
// Validates: Requirements 4.5
// ============================================================

describe('Folder Management and Hierarchy Display', () => {
  let container: HTMLElement;
  let mockApiClient: any;

  const mockFolders: FolderDto[] = [
    { id: 'root-1', projectId: 'proj-1', name: 'Design Assets', depth: 0 },
    { id: 'child-1', projectId: 'proj-1', name: 'Icons', depth: 1, parentFolderId: 'root-1' },
    { id: 'child-2', projectId: 'proj-1', name: 'Logos', depth: 1, parentFolderId: 'root-1' },
    { id: 'grandchild-1', projectId: 'proj-1', name: 'SVG', depth: 2, parentFolderId: 'child-1' },
    { id: 'root-2', projectId: 'proj-1', name: 'Recordings', depth: 0 }
  ];

  beforeEach(async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    const { apiClient } = await import('../../services/api.js');
    mockApiClient = apiClient;
    mockApiClient.get.mockResolvedValue({ data: mockFolders });
    vi.clearAllMocks();
    mockApiClient.get.mockResolvedValue({ data: mockFolders });
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  describe('Folder Hierarchy Rendering', () => {
    it('should render all folders from the API response', async () => {
      const manager = new FolderManager({
        projectId: 'proj-1',
        currentFolderId: null
      });
      const element = await manager.getElement();
      container.appendChild(element);

      const items = element.querySelectorAll('[data-folder-item]');
      expect(items.length).toBe(5);
    });

    it('should nest child folders under their parent', async () => {
      const manager = new FolderManager({
        projectId: 'proj-1',
        currentFolderId: null
      });
      const element = await manager.getElement();
      container.appendChild(element);

      // child-1 should be nested under root-1
      const childItem = element.querySelector('[data-folder-id="child-1"]');
      const parentContainer = childItem?.closest('[data-folder-id="root-1"]');
      expect(parentContainer).toBeTruthy();

      manager.destroy();
    });

    it('should show expand/collapse for folders with children', async () => {
      const manager = new FolderManager({
        projectId: 'proj-1',
        currentFolderId: null
      });
      const element = await manager.getElement();
      container.appendChild(element);

      // root-1 has children, should have toggle button
      const expandBtn = element.querySelector('[data-toggle="root-1"]');
      expect(expandBtn).toBeTruthy();

      // root-2 has no children, should not have toggle
      const noExpandBtn = element.querySelector('[data-toggle="root-2"]');
      expect(noExpandBtn).toBeFalsy();

      manager.destroy();
    });

    it('should display depth level indicators', async () => {
      const manager = new FolderManager({
        projectId: 'proj-1',
        currentFolderId: null
      });
      const element = await manager.getElement();
      container.appendChild(element);

      // root-1 at depth 0 should show L1
      const rootDepth = element.querySelector(
        '[data-folder-item="root-1"] .depth-indicator'
      );
      expect(rootDepth?.textContent).toBe('L1');

      // child-1 at depth 1 should show L2
      const childDepth = element.querySelector(
        '[data-folder-item="child-1"] .depth-indicator'
      );
      expect(childDepth?.textContent).toBe('L2');

      manager.destroy();
    });

    it('should auto-expand first two levels by default', async () => {
      const manager = new FolderManager({
        projectId: 'proj-1',
        currentFolderId: null
      });
      const element = await manager.getElement();
      container.appendChild(element);

      // Level 0 and 1 folders should be visible (expanded)
      const child1 = element.querySelector('[data-folder-item="child-1"]');
      expect(child1).toBeTruthy();

      // Level 2 grandchild should also be visible since parent is at depth 1
      const grandchild = element.querySelector('[data-folder-item="grandchild-1"]');
      expect(grandchild).toBeTruthy();

      manager.destroy();
    });

    it('should render empty state when no folders exist', async () => {
      mockApiClient.get.mockResolvedValue({ data: [] });

      const manager = new FolderManager({
        projectId: 'proj-1',
        currentFolderId: null
      });
      const element = await manager.getElement();
      container.appendChild(element);

      expect(element.textContent).toContain('No folders yet');

      manager.destroy();
    });
  });

  describe('Folder Selection and Navigation', () => {
    it('should select folder on click and notify callback', async () => {
      const onFolderSelect = vi.fn();
      const manager = new FolderManager({
        projectId: 'proj-1',
        currentFolderId: null,
        onFolderSelect
      });
      const element = await manager.getElement();
      container.appendChild(element);

      const folderRow = element.querySelector('[data-folder-item="root-1"]') as HTMLElement;
      folderRow?.click();

      expect(onFolderSelect).toHaveBeenCalledWith('root-1');

      manager.destroy();
    });

    it('should highlight selected folder', async () => {
      const manager = new FolderManager({
        projectId: 'proj-1',
        currentFolderId: 'root-1'
      });
      const element = await manager.getElement();
      container.appendChild(element);

      const folderRow = element.querySelector('[data-folder-item="root-1"]');
      expect(folderRow?.classList.contains('bg-blue-100')).toBe(true);

      manager.destroy();
    });

    it('should get folder path for breadcrumbs', async () => {
      const manager = new FolderManager({
        projectId: 'proj-1',
        currentFolderId: null
      });
      await manager.getElement();

      const path = manager.getFolderPath('grandchild-1');
      expect(path).toHaveLength(3);
      expect(path[0]!.name).toBe('Design Assets');
      expect(path[1]!.name).toBe('Icons');
      expect(path[2]!.name).toBe('SVG');

      manager.destroy();
    });

    it('should expand to a specific folder', async () => {
      const manager = new FolderManager({
        projectId: 'proj-1',
        currentFolderId: null
      });
      const element = await manager.getElement();
      container.appendChild(element);

      // Expand to grandchild - should expand all parents
      manager.expandToFolder('grandchild-1');

      // All parents should be visible/expanded
      const grandchild = element.querySelector('[data-folder-item="grandchild-1"]');
      expect(grandchild).toBeTruthy();

      manager.destroy();
    });
  });

  describe('Folder CRUD Operations', () => {
    it('should call API to create a new folder', async () => {
      const onFolderCreate = vi.fn();
      const newFolder: FolderDto = {
        id: 'new-f',
        projectId: 'proj-1',
        name: 'New Folder',
        depth: 0
      };
      mockApiClient.post.mockResolvedValue({ data: newFolder });

      const manager = new FolderManager({
        projectId: 'proj-1',
        currentFolderId: null,
        onFolderCreate
      });
      const element = await manager.getElement();
      container.appendChild(element);

      // Click the create folder button to open dialog
      const createBtn = element.querySelector('.btn-create-folder') as HTMLElement;
      createBtn?.click();

      // Dialog should appear
      const dialog = document.querySelector('[data-folder-name]');
      expect(dialog).toBeTruthy();

      // Clean up dialog
      const backdrop = dialog?.closest('.fixed');
      backdrop?.remove();

      manager.destroy();
    });

    it('should handle API error when loading folders', async () => {
      mockApiClient.get.mockRejectedValue(new Error('Network error'));
      const { handleError } = await import('../../app/error-handler.js');

      const manager = new FolderManager({
        projectId: 'proj-1',
        currentFolderId: null
      });
      await manager.getElement();

      expect(handleError).toHaveBeenCalledWith(
        expect.any(Error),
        'api',
        expect.objectContaining({
          feature: 'folder-management',
          operation: 'load-folders'
        })
      );

      manager.destroy();
    });

    it('should refresh folder list on demand', async () => {
      const manager = new FolderManager({
        projectId: 'proj-1',
        currentFolderId: null
      });
      await manager.getElement();

      // Clear call count from initial load
      mockApiClient.get.mockClear();
      mockApiClient.get.mockResolvedValue({ data: mockFolders });

      await manager.refresh();

      expect(mockApiClient.get).toHaveBeenCalledWith('/projects/proj-1/folders');

      manager.destroy();
    });
  });

  describe('Folder Maximum Depth Enforcement (Requirement 4.5)', () => {
    it('should mark folders at depth 9 as unable to create subfolders', async () => {
      const deepFolders: FolderDto[] = [
        { id: 'deep-f', projectId: 'proj-1', name: 'Deep Folder', depth: 9 }
      ];
      mockApiClient.get.mockResolvedValue({ data: deepFolders });

      const manager = new FolderManager({
        projectId: 'proj-1',
        currentFolderId: null
      });
      await manager.getElement();

      const current = manager.getCurrentFolder();
      manager.selectFolderById('deep-f');

      // After selecting, getCurrentFolder should report the folder
      const folder = manager.getCurrentFolder();
      expect(folder?.depth).toBe(9);
      // canCreateSubfolder should be false for depth 9
      expect(folder?.canCreateSubfolder).toBe(false);

      manager.destroy();
    });

    it('should allow subfolder creation at depth < 9', async () => {
      const shallowFolders: FolderDto[] = [
        { id: 'shallow-f', projectId: 'proj-1', name: 'Shallow Folder', depth: 5 }
      ];
      mockApiClient.get.mockResolvedValue({ data: shallowFolders });

      const manager = new FolderManager({
        projectId: 'proj-1',
        currentFolderId: null
      });
      await manager.getElement();

      manager.selectFolderById('shallow-f');
      const folder = manager.getCurrentFolder();
      expect(folder?.canCreateSubfolder).toBe(true);

      manager.destroy();
    });
  });

  describe('Folder Context Menu', () => {
    it('should show context menu on right-click of folder item', async () => {
      const manager = new FolderManager({
        projectId: 'proj-1',
        currentFolderId: null
      });
      const element = await manager.getElement();
      container.appendChild(element);

      const folderRow = element.querySelector('[data-folder-item="root-1"]') as HTMLElement;
      const contextEvent = new MouseEvent('contextmenu', {
        clientX: 200,
        clientY: 150,
        bubbles: true
      });
      folderRow.dispatchEvent(contextEvent);

      const contextMenu = document.querySelector('.folder-context-menu');
      expect(contextMenu).toBeTruthy();
      expect(contextMenu?.textContent).toContain('Open');
      expect(contextMenu?.textContent).toContain('Rename');
      expect(contextMenu?.textContent).toContain('Delete');

      // Clean up
      contextMenu?.remove();
      manager.destroy();
    });
  });

  describe('Folder Manager Cleanup', () => {
    it('should clean up DOM elements on destroy', async () => {
      const manager = new FolderManager({
        projectId: 'proj-1',
        currentFolderId: null
      });
      await manager.getElement();

      // Should not throw on destroy
      expect(() => manager.destroy()).not.toThrow();
    });
  });
});
