/**
 * Property-Based Tests for Project Organization Consistency
 * 
 * **Property 5: Project Organization Consistency**
 * **Validates: Requirements 4.2**
 * 
 * For any valid project structure, the hierarchical display SHALL correctly represent 
 * folder nesting and drag-and-drop organization SHALL work consistently regardless 
 * of project complexity.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fc from 'fast-check';
import { ProjectDetailPage, type FolderItem } from './project-detail-page.js';
import type { ProjectDto, FolderDto, VideoDto } from '@streetstudio/shared';

// Mock dependencies
vi.mock('../../services/api.js', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn()
  }
}));

vi.mock('../../app/error-handler.js', () => ({
  handleError: vi.fn(),
}));

vi.mock('../../app/client-logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }
}));

// Helper types for test generation
interface TestProjectStructure {
  project: ProjectDto;
  folders: FolderDto[];
  videos: VideoDto[];
}

/**
 * Arbitrary generator for folder names (realistic project folder names)
 */
const folderNameArbitrary = fc.oneof(
  // Common development folder patterns
  fc.constantFrom('src', 'lib', 'components', 'pages', 'utils', 'tests', 'assets', 'docs'),
  fc.constantFrom('frontend', 'backend', 'api', 'database', 'config', 'scripts'),
  fc.constantFrom('v1', 'v2', 'release', 'staging', 'production', 'development'),
  // Descriptive folder names
  fc.string({ minLength: 3, maxLength: 30 })
    .filter(s => /^[a-zA-Z0-9][a-zA-Z0-9\s\-_.]*[a-zA-Z0-9]$/.test(s))
    .map(s => s.replace(/\s+/g, '-').toLowerCase()),
  // Date-based folders
  fc.date({ min: new Date('2020-01-01'), max: new Date('2024-12-31') })
    .map(d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'))
);

/**
 * Arbitrary generator for video titles
 */
const videoTitleArbitrary = fc.oneof(
  fc.constantFrom(
    'Screen Recording Demo',
    'Project Walkthrough',
    'Bug Reproduction',
    'Feature Demo',
    'Code Review Session',
    'User Testing',
    'Meeting Recording'
  ),
  fc.string({ minLength: 5, maxLength: 100 })
    .filter(s => s.trim().length >= 5 && !/[<>{}]/.test(s))
);

/**
 * Generate a valid hierarchical folder structure
 */
const projectStructureArbitrary: fc.Arbitrary<TestProjectStructure> = fc.integer({ min: 1, max: 50 })
  .chain(folderCount => {
    return fc.record({
      project: fc.record({
        id: fc.uuid(),
        name: fc.string({ minLength: 3, max: 50 }).filter(s => s.trim().length >= 3),
        description: fc.option(fc.string({ maxLength: 200 })),
        isPrivate: fc.boolean(),
        createdAt: fc.date().map(d => d.toISOString()),
        updatedAt: fc.date().map(d => d.toISOString()),
        organizationId: fc.uuid(),
        memberCount: fc.integer({ min: 1, max: 100 })
      }),
      
      folders: fc.array(
        fc.record({
          id: fc.uuid(),
          name: folderNameArbitrary,
          projectId: fc.constant(''), // Will be set later
          parentFolderId: fc.constant(null as string | null), // Will be set during hierarchy building
          depth: fc.constant(0), // Will be calculated
          createdAt: fc.date().map(d => d.toISOString()),
          updatedAt: fc.date().map(d => d.toISOString()),
          createdBy: fc.uuid()
        }),
        { minLength: 0, maxLength: folderCount }
      ),
      
      videos: fc.array(
        fc.record({
          id: fc.uuid(),
          title: videoTitleArbitrary,
          description: fc.option(fc.string({ maxLength: 500 })),
          durationSeconds: fc.integer({ min: 10, max: 7200 }), // 10 seconds to 2 hours
          status: fc.constantFrom('uploading', 'processing', 'ready', 'failed'),
          developerMode: fc.boolean(),
          folderId: fc.constant(null as string | null), // Will be assigned to folders
          projectId: fc.constant(''), // Will be set later
          createdAt: fc.date().map(d => d.toISOString()),
          updatedAt: fc.date().map(d => d.toISOString()),
          createdBy: fc.uuid(),
          organizationId: fc.uuid()
        }),
        { minLength: 0, maxLength: 20 }
      )
    }).map(({ project, folders, videos }) => {
      // Set project IDs consistently
      folders.forEach(folder => {
        folder.projectId = project.id;
      });
      videos.forEach(video => {
        video.projectId = project.id;
      });

      // Build valid hierarchy (max 10 levels deep per requirements)
      if (folders.length > 0) {
        const hierarchicalFolders = buildValidHierarchy(folders, 10);
        
        // Assign some videos to folders
        const foldersWithVideos = hierarchicalFolders.filter(f => f.depth < 8); // Don't put videos too deep
        videos.forEach((video, index) => {
          if (foldersWithVideos.length > 0 && index % 3 === 0) { // Assign 1/3 of videos to folders
            const randomFolder = foldersWithVideos[index % foldersWithVideos.length];
            video.folderId = randomFolder.id;
          }
        });
        
        return { project, folders: hierarchicalFolders, videos };
      }

      return { project, folders, videos };
    });
  });

/**
 * Build a valid folder hierarchy with proper depth calculation
 */
function buildValidHierarchy(folders: FolderDto[], maxDepth: number): FolderDto[] {
  if (folders.length === 0) return [];
  
  const result = [...folders];
  const maxFoldersPerLevel = Math.max(1, Math.ceil(folders.length / maxDepth));
  
  // Create hierarchy by assigning parent-child relationships
  for (let depth = 1; depth < maxDepth && depth * maxFoldersPerLevel < result.length; depth++) {
    const startIndex = depth * maxFoldersPerLevel;
    const endIndex = Math.min(startIndex + maxFoldersPerLevel, result.length);
    
    for (let i = startIndex; i < endIndex; i++) {
      // Assign to a parent from the previous level
      const parentIndex = Math.floor(Math.random() * Math.min(maxFoldersPerLevel, startIndex));
      if (parentIndex < startIndex) {
        result[i].parentFolderId = result[parentIndex].id;
        result[i].depth = depth;
      }
    }
  }
  
  // Ensure root folders have depth 0 and no parent
  result.forEach(folder => {
    if (!folder.parentFolderId) {
      folder.depth = 0;
    }
  });
  
  return result;
}

/**
 * Drag and drop operation arbitrary
 */
const dragDropOperationArbitrary = fc.record({
  sourceType: fc.constantFrom('folder', 'video') as fc.Arbitrary<'folder' | 'video'>,
  sourceId: fc.uuid(),
  targetFolderId: fc.option(fc.uuid()),
  dropPosition: fc.constantFrom('inside', 'before', 'after') as fc.Arbitrary<'inside' | 'before' | 'after'>
});

describe('Project Organization Consistency Properties', () => {
  let container: HTMLElement;
  let mockApiClient: any;

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Create fresh container for each test
    container = document.createElement('div');
    container.setAttribute('data-testid', 'project-organization-test');
    document.body.appendChild(container);
    
    // Setup API client mock
    mockApiClient = {
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
      delete: vi.fn()
    };
    
    // Mock successful API responses
    mockApiClient.get.mockImplementation((url: string) => {
      if (url.includes('/folders')) {
        return Promise.resolve({ data: [] });
      }
      if (url.includes('/content')) {
        return Promise.resolve({ data: { folders: [], videos: [] } });
      }
      return Promise.resolve({ data: {} });
    });
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  /**
   * **Validates: Requirements 4.2**
   * 
   * Property 5: Project Organization Consistency
   * For any valid project structure, the hierarchical display SHALL correctly represent 
   * folder nesting and drag-and-drop organization SHALL work consistently regardless 
   * of project complexity.
   */
  it('Property 5: Project Organization Consistency - Hierarchical display correctly represents folder nesting', () => {
    fc.assert(
      fc.property(
        projectStructureArbitrary,
        async (structure: TestProjectStructure) => {
          // Create project detail page with mock data
          const projectPage = new ProjectDetailPage(structure.project.id);
          
          // Mock the API responses with our test data
          mockApiClient.get.mockImplementation((url: string) => {
            if (url.includes('/folders')) {
              return Promise.resolve({ data: structure.folders });
            }
            if (url.includes('/content')) {
              return Promise.resolve({ 
                data: { 
                  folders: structure.folders.filter(f => !f.parentFolderId), 
                  videos: structure.videos.filter(v => !v.folderId) 
                } 
              });
            }
            if (url.includes(`/projects/${structure.project.id}`)) {
              return Promise.resolve({ data: structure.project });
            }
            return Promise.resolve({ data: {} });
          });

          try {
            // Get the page element and wait for it to load
            const pageElement = await projectPage.getElement();
            container.appendChild(pageElement);
            
            // Allow time for async operations to complete
            await new Promise(resolve => setTimeout(resolve, 10));

            // Verify hierarchical display consistency
            const folderTree = pageElement.querySelector('[data-folder-tree-content]');
            expect(folderTree).toBeTruthy();

            // Test folder hierarchy representation
            if (structure.folders.length > 0) {
              const hierarchy = buildFolderTreeFromStructure(structure.folders);
              const isHierarchyValid = validateFolderHierarchy(hierarchy);
              expect(isHierarchyValid).toBe(true);
              
              // Verify depth calculation consistency
              structure.folders.forEach(folder => {
                expect(folder.depth).toBeGreaterThanOrEqual(0);
                expect(folder.depth).toBeLessThanOrEqual(10); // Max depth per requirements
                
                if (folder.parentFolderId) {
                  const parent = structure.folders.find(f => f.id === folder.parentFolderId);
                  if (parent) {
                    expect(folder.depth).toBe(parent.depth + 1);
                  }
                }
              });
            }

            // Verify content organization consistency
            const contentGrid = pageElement.querySelector('[data-content-grid]');
            if (contentGrid) {
              // Folders should be displayed before videos in the grid
              const folderCards = contentGrid.querySelectorAll('[data-folder-card]');
              const videoCards = contentGrid.querySelectorAll('[data-video-card]');
              
              // Check that the display order respects the folder-first convention
              if (folderCards.length > 0 && videoCards.length > 0) {
                const allCards = contentGrid.querySelectorAll('[data-folder-card], [data-video-card]');
                let foundVideo = false;
                for (let i = 0; i < allCards.length; i++) {
                  const isVideo = allCards[i].hasAttribute('data-video-card');
                  if (isVideo) foundVideo = true;
                  if (foundVideo && !isVideo) {
                    // Found a folder after a video - this breaks organization consistency
                    return false;
                  }
                }
              }
            }

            return true;
          } catch (error) {
            console.error('Property test failed:', error);
            return false;
          }
        }
      ),
      { 
        numRuns: 100, // Minimum 100 iterations as per requirements
        verbose: 0,
        seed: 42
      }
    );
  });

  it('Property 5a: Drag-and-drop organization works consistently across project complexity', () => {
    fc.assert(
      fc.property(
        projectStructureArbitrary,
        dragDropOperationArbitrary,
        async (structure: TestProjectStructure, operation: any) => {
          const projectPage = new ProjectDetailPage(structure.project.id);
          
          // Mock API responses
          mockApiClient.get.mockImplementation((url: string) => {
            if (url.includes('/folders')) {
              return Promise.resolve({ data: structure.folders });
            }
            return Promise.resolve({ data: structure.project });
          });

          try {
            const pageElement = await projectPage.getElement();
            container.appendChild(pageElement);
            
            // Find a valid source and target for drag-and-drop
            const sourceItems = structure.folders.concat(structure.videos as any);
            const targetFolders = structure.folders.filter(f => f.depth < 9); // Avoid max depth issues
            
            if (sourceItems.length === 0 || targetFolders.length === 0) {
              return true; // No items to test with
            }

            const sourceItem = sourceItems[0];
            const targetFolder = targetFolders[0];

            // Simulate drag-and-drop operation
            const dragResult = simulateDragAndDrop(
              pageElement,
              sourceItem.id,
              operation.sourceType,
              targetFolder.id
            );

            // Verify drag-and-drop consistency
            expect(dragResult.canDrop).toBeDefined();
            expect(dragResult.validTarget).toBeDefined();

            // If it's a valid operation, verify no circular references for folders
            if (operation.sourceType === 'folder' && dragResult.canDrop) {
              const wouldCreateCircularRef = checkCircularReference(
                sourceItem as FolderDto,
                targetFolder,
                structure.folders
              );
              expect(wouldCreateCircularRef).toBe(false);
            }

            // Verify depth constraints are respected
            if (dragResult.canDrop) {
              const newDepth = targetFolder.depth + 1;
              expect(newDepth).toBeLessThanOrEqual(10); // Max depth per requirements
            }

            return true;
          } catch (error) {
            console.error('Drag-drop property test failed:', error);
            return false;
          }
        }
      ),
      { 
        numRuns: 50, // Fewer runs for complex drag-drop operations
        seed: 43
      }
    );
  });

  it('Property 5b: Folder expansion/collapse maintains hierarchy visualization', () => {
    fc.assert(
      fc.property(
        projectStructureArbitrary.filter(s => s.folders.length > 0),
        async (structure: TestProjectStructure) => {
          const projectPage = new ProjectDetailPage(structure.project.id);
          
          mockApiClient.get.mockImplementation((url: string) => {
            if (url.includes('/folders')) {
              return Promise.resolve({ data: structure.folders });
            }
            return Promise.resolve({ data: structure.project });
          });

          try {
            const pageElement = await projectPage.getElement();
            container.appendChild(pageElement);
            
            await new Promise(resolve => setTimeout(resolve, 10));

            // Test folder expansion/collapse for each folder with children
            const foldersWithChildren = structure.folders.filter(folder => {
              return structure.folders.some(child => child.parentFolderId === folder.id);
            });

            for (const folder of foldersWithChildren.slice(0, 5)) { // Test first 5 to avoid timeout
              const folderElement = pageElement.querySelector(`[data-folder-item="${folder.id}"]`);
              if (folderElement) {
                // Test expand operation
                const expandResult = simulateFolderToggle(pageElement, folder.id, true);
                expect(expandResult.success).toBe(true);
                
                // Test collapse operation  
                const collapseResult = simulateFolderToggle(pageElement, folder.id, false);
                expect(collapseResult.success).toBe(true);
                
                // Verify hierarchy remains consistent after toggle
                const hierarchyValid = validateFolderHierarchyDisplay(pageElement, structure.folders);
                expect(hierarchyValid).toBe(true);
              }
            }

            return true;
          } catch (error) {
            console.error('Folder toggle property test failed:', error);
            return false;
          }
        }
      ),
      { 
        numRuns: 30, // Fewer runs for UI interaction tests
        seed: 44
      }
    );
  });

  it('Property 5c: Project complexity does not affect organization operation performance', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 100 }).chain(complexity =>
          fc.record({
            complexity,
            structure: projectStructureArbitrary
          })
        ),
        async ({ complexity, structure }: { complexity: number, structure: TestProjectStructure }) => {
          const projectPage = new ProjectDetailPage(structure.project.id);
          
          mockApiClient.get.mockImplementation((url: string) => {
            if (url.includes('/folders')) {
              return Promise.resolve({ data: structure.folders });
            }
            return Promise.resolve({ data: structure.project });
          });

          try {
            const startTime = performance.now();
            
            const pageElement = await projectPage.getElement();
            container.appendChild(pageElement);
            
            await new Promise(resolve => setTimeout(resolve, 5));
            
            const loadTime = performance.now() - startTime;
            
            // Organization operations should complete within reasonable time regardless of complexity
            // Allow more time for higher complexity but set reasonable bounds
            const maxAllowableTime = Math.min(1000, 100 + (complexity * 5)); // Max 1 second
            expect(loadTime).toBeLessThan(maxAllowableTime);
            
            // Verify functionality is not degraded with complexity
            const folderTree = pageElement.querySelector('[data-folder-tree-content]');
            const contentGrid = pageElement.querySelector('[data-content-grid]');
            
            expect(folderTree).toBeTruthy();
            if (structure.folders.length > 0 || structure.videos.length > 0) {
              expect(contentGrid).toBeTruthy();
            }

            return true;
          } catch (error) {
            console.error('Performance property test failed:', error);
            return false;
          }
        }
      ),
      { 
        numRuns: 20, // Fewer runs for performance tests
        seed: 45
      }
    );
  });
});

// Helper functions for property testing

function buildFolderTreeFromStructure(folders: FolderDto[]): FolderItem[] {
  const folderMap = new Map<string, FolderItem>();
  const rootFolders: FolderItem[] = [];

  // Create folder items
  folders.forEach(folder => {
    folderMap.set(folder.id, {
      ...folder,
      children: [],
      videos: [],
      isExpanded: folder.depth < 2
    });
  });

  // Build hierarchy
  folders.forEach(folder => {
    const folderItem = folderMap.get(folder.id)!;
    
    if (folder.parentFolderId) {
      const parent = folderMap.get(folder.parentFolderId);
      if (parent) {
        parent.children!.push(folderItem);
      }
    } else {
      rootFolders.push(folderItem);
    }
  });

  return rootFolders;
}

function validateFolderHierarchy(folders: FolderItem[]): boolean {
  for (const folder of folders) {
    // Check depth consistency
    if (folder.children && folder.children.length > 0) {
      for (const child of folder.children) {
        if (child.depth !== folder.depth + 1) {
          return false;
        }
      }
      
      // Recursively validate children
      if (!validateFolderHierarchy(folder.children)) {
        return false;
      }
    }
  }
  return true;
}

function simulateDragAndDrop(
  container: HTMLElement, 
  sourceId: string, 
  sourceType: 'folder' | 'video',
  targetId: string
): { canDrop: boolean; validTarget: boolean } {
  const sourceSelector = sourceType === 'folder' ? `[data-folder-card="${sourceId}"]` : `[data-video-card="${sourceId}"]`;
  const targetSelector = `[data-drop-zone="${targetId}"], [data-folder-card="${targetId}"]`;
  
  const sourceElement = container.querySelector(sourceSelector);
  const targetElement = container.querySelector(targetSelector);
  
  return {
    canDrop: sourceElement !== null && targetElement !== null,
    validTarget: targetElement !== null
  };
}

function simulateFolderToggle(
  container: HTMLElement, 
  folderId: string, 
  expand: boolean
): { success: boolean } {
  const toggleButton = container.querySelector(`[data-toggle-folder="${folderId}"]`);
  
  if (toggleButton) {
    // Simulate click event
    const clickEvent = new MouseEvent('click', { bubbles: true });
    toggleButton.dispatchEvent(clickEvent);
    return { success: true };
  }
  
  return { success: false };
}

function validateFolderHierarchyDisplay(container: HTMLElement, folders: FolderDto[]): boolean {
  // Check that folder elements are present and properly nested
  for (const folder of folders) {
    const folderElement = container.querySelector(`[data-folder-item="${folder.id}"]`);
    if (!folderElement) {
      continue; // Folder might not be expanded/visible
    }
    
    // Check parent-child relationship in DOM
    if (folder.parentFolderId) {
      const parentFolderContainer = container.querySelector(`[data-folder-id="${folder.parentFolderId}"]`);
      if (parentFolderContainer) {
        const isChildOfParent = parentFolderContainer.contains(folderElement) || 
                                parentFolderContainer.nextElementSibling?.contains(folderElement);
        if (!isChildOfParent) {
          return false;
        }
      }
    }
  }
  
  return true;
}

function checkCircularReference(
  sourceFolder: FolderDto, 
  targetFolder: FolderDto, 
  allFolders: FolderDto[]
): boolean {
  // Check if moving sourceFolder into targetFolder would create a circular reference
  let currentFolder = targetFolder;
  
  while (currentFolder.parentFolderId) {
    if (currentFolder.parentFolderId === sourceFolder.id) {
      return true; // Circular reference detected
    }
    
    const parent = allFolders.find(f => f.id === currentFolder.parentFolderId);
    if (!parent) break;
    currentFolder = parent;
  }
  
  return false;
}