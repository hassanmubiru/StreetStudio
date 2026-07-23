/**
 * Project Detail Page Component
 * 
 * Provides hierarchical folder structure view with drag-and-drop organization
 * and real-time updates for collaborative project management.
 */

import { apiClient } from '../../services/api.js';
import type { ProjectDto, FolderDto, VideoDto } from '@streetstudio/shared';
import { handleError } from '../../app/error-handler.js';
import { logger } from '../../app/client-logger.js';

export interface FolderItem extends FolderDto {
  children?: FolderItem[];
  videos?: VideoDto[];
  isExpanded?: boolean;
  isSelected?: boolean;
}

export class ProjectDetailPage {
  private container: HTMLElement | null = null;
  private projectId: string = '';
  private project: ProjectDto | null = null;
  private folderTree: FolderItem[] = [];
  private currentFolderId: string | null = null;
  private draggedItem: { type: 'folder' | 'video'; id: string; element: HTMLElement } | null = null;
  private isLoading = false;

  constructor(projectId: string) {
    this.projectId = projectId;
  }

  public async getElement(): Promise<HTMLElement> {
    if (!this.container) {
      this.container = this.createContainer();
      await this.loadProject();
      await this.loadFolderStructure();
    }
    return this.container;
  }
  private createContainer(): HTMLElement {
    const container = document.createElement('div');
    container.className = 'flex-1 flex flex-col min-h-0';
    container.setAttribute('data-main-content', '');
    
    container.innerHTML = `
      <!-- Header -->
      <header class="flex-shrink-0 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
        <div class="px-6 py-4">
          <!-- Breadcrumb Navigation -->
          <nav class="flex items-center space-x-2 text-sm text-gray-600 dark:text-gray-400 mb-4" aria-label="Breadcrumb">
            <a href="/projects" class="hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
              Projects
            </a>
            <svg class="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
            </svg>
            <span class="text-gray-900 dark:text-white font-medium" data-project-name>Loading...</span>
          </nav>
          
          <!-- Project Header -->
          <div class="flex items-center justify-between">
            <div class="flex items-center space-x-4">
              <h1 class="text-2xl font-bold text-gray-900 dark:text-white" data-project-title>Loading...</h1>
              <span class="text-sm text-gray-500 dark:text-gray-400" data-project-stats>
                <!-- Project stats will be populated here -->
              </span>
            </div>
            
            <div class="flex items-center space-x-3">
              <button class="btn btn-secondary inline-flex items-center" data-invite-members>
                <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z"/>
                </svg>
                Invite Members
              </button>
              
              <div class="relative">
                <button class="btn btn-primary inline-flex items-center" data-new-content-btn>
                  <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"/>
                  </svg>
                  New
                  <svg class="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
                  </svg>
                </button>
                
                <!-- New content dropdown -->
                <div class="new-content-menu absolute right-0 top-full mt-2 w-48 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-2 z-50 hidden"
                     data-new-content-menu>
                  <button class="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center"
                          data-action="folder">
                    <svg class="w-4 h-4 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-5l-2-2H5a2 2 0 00-2 2z"/>
                    </svg>
                    New Folder
                  </button>
                  <button class="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center"
                          data-action="recording">
                    <svg class="w-4 h-4 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"/>
                    </svg>
                    Start Recording
                  </button>
                  <button class="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center"
                          data-action="upload">
                    <svg class="w-4 h-4 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/>
                    </svg>
                    Upload Video
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>
      
      <!-- Main Content -->
      <main class="flex-1 flex min-h-0">
        <!-- Sidebar - Folder Tree -->
        <aside class="w-80 border-r border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 flex flex-col">
          <div class="p-4 border-b border-gray-200 dark:border-gray-700">
            <h2 class="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-wider">
              Folder Structure
            </h2>
          </div>
          
          <div class="flex-1 overflow-y-auto p-4" data-folder-tree>
            <!-- Loading state -->
            <div class="loading-folders flex items-center justify-center py-8" data-loading-folders>
              <div class="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
              <span class="ml-2 text-sm text-gray-600 dark:text-gray-400">Loading folders...</span>
            </div>
            
            <!-- Folder tree will be rendered here -->
            <div class="folder-tree hidden" data-folder-tree-content></div>
          </div>
        </aside>
        
        <!-- Content Area -->
        <section class="flex-1 flex flex-col">
          <!-- Current path breadcrumbs -->
          <div class="flex-shrink-0 px-6 py-3 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
            <nav class="flex items-center space-x-2 text-sm" aria-label="Current location">
              <button class="text-blue-600 dark:text-blue-400 hover:underline" data-navigate-root>
                Project Root
              </button>
              <div class="current-path" data-current-path>
                <!-- Dynamic breadcrumbs will be rendered here -->
              </div>
            </nav>
          </div>
          
          <!-- Content grid -->
          <div class="flex-1 overflow-y-auto">
            <div class="p-6">
              <!-- Loading state -->
              <div class="loading-content hidden" data-loading-content>
                <div class="flex items-center justify-center py-12">
                  <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                  <span class="ml-3 text-gray-600 dark:text-gray-400">Loading content...</span>
                </div>
              </div>
              
              <!-- Empty state -->
              <div class="empty-folder hidden" data-empty-state>
                <div class="text-center py-12">
                  <svg class="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-5l-2-2H5a2 2 0 00-2 2z"/>
                  </svg>
                  <h3 class="mt-4 text-lg font-medium text-gray-900 dark:text-white">Folder is empty</h3>
                  <p class="mt-2 text-sm text-gray-500 dark:text-gray-400">
                    Add folders or upload videos to organize your project content.
                  </p>
                </div>
              </div>
              
              <!-- Content grid -->
              <div class="content-grid grid gap-4" data-content-grid>
                <!-- Folders and videos will be rendered here -->
              </div>
            </div>
          </div>
        </section>
      </main>
    `;

    this.attachEventListeners(container);
    return container;
  }
  private attachEventListeners(container: HTMLElement): void {
    // New content menu
    const newContentBtn = container.querySelector('[data-new-content-btn]');
    const newContentMenu = container.querySelector('[data-new-content-menu]');

    newContentBtn?.addEventListener('click', () => {
      newContentMenu?.classList.toggle('hidden');
    });

    // Close menu on outside click
    document.addEventListener('click', (e) => {
      if (!newContentBtn?.contains(e.target as Node) && !newContentMenu?.contains(e.target as Node)) {
        newContentMenu?.classList.add('hidden');
      }
    });

    // New content actions
    newContentMenu?.addEventListener('click', (e) => {
      const action = (e.target as HTMLElement).closest('[data-action]')?.getAttribute('data-action');
      if (action) {
        this.handleNewContentAction(action);
        newContentMenu.classList.add('hidden');
      }
    });

    // Navigate to root
    const navigateRoot = container.querySelector('[data-navigate-root]');
    navigateRoot?.addEventListener('click', () => {
      this.navigateToFolder(null);
    });

    // Invite members
    const inviteBtn = container.querySelector('[data-invite-members]');
    inviteBtn?.addEventListener('click', () => {
      this.showInviteMembersDialog();
    });

    // Setup drag and drop
    this.setupDragAndDrop(container);
  }

  private async loadProject(): Promise<void> {
    try {
      const response = await apiClient.get(`/projects/${this.projectId}`);
      this.project = response.data;
      this.updateProjectHeader();
    } catch (error) {
      handleError(error as Error, 'api', {
        feature: 'project-management',
        endpoint: `/projects/${this.projectId}`
      });
    }
  }

  private async loadFolderStructure(): Promise<void> {
    this.showFolderLoading();
    
    try {
      const response = await apiClient.get(`/projects/${this.projectId}/folders`);
      const folders = response.data as FolderDto[];
      
      this.folderTree = this.buildFolderTree(folders);
      this.renderFolderTree();
      
      // Load current folder content
      await this.loadFolderContent(this.currentFolderId);
      
    } catch (error) {
      handleError(error as Error, 'api', {
        feature: 'project-management',
        endpoint: `/projects/${this.projectId}/folders`
      });
    } finally {
      this.hideFolderLoading();
    }
  }

  private buildFolderTree(folders: FolderDto[]): FolderItem[] {
    const folderMap = new Map<string, FolderItem>();
    const rootFolders: FolderItem[] = [];

    // Create folder items
    folders.forEach(folder => {
      folderMap.set(folder.id, {
        ...folder,
        children: [],
        videos: [],
        isExpanded: folder.depth < 2 // Expand first 2 levels by default
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

  private renderFolderTree(): void {
    if (!this.container) return;

    const treeContainer = this.container.querySelector('[data-folder-tree-content]');
    if (!treeContainer) return;

    treeContainer.innerHTML = this.folderTree.length > 0 
      ? this.renderFolderTreeItems(this.folderTree)
      : '<div class="text-center py-4 text-sm text-gray-500 dark:text-gray-400">No folders yet</div>';
    
    treeContainer.classList.remove('hidden');

    // Attach folder tree event listeners
    this.attachFolderTreeEvents(treeContainer);
  }

  private renderFolderTreeItems(folders: FolderItem[], level = 0): string {
    return folders.map(folder => {
      const hasChildren = folder.children && folder.children.length > 0;
      const isSelected = folder.id === this.currentFolderId;
      const indent = level * 16;
      
      return `
        <div class="folder-item" data-folder-id="${folder.id}">
          <div class="flex items-center py-2 px-2 rounded-lg cursor-pointer transition-colors ${
            isSelected ? 'bg-blue-100 dark:bg-blue-900 text-blue-900 dark:text-blue-100' : 'hover:bg-gray-100 dark:hover:bg-gray-800'
          }" 
               style="margin-left: ${indent}px"
               data-folder-item="${folder.id}"
               draggable="true">
            
            ${hasChildren ? `
              <button class="flex-shrink-0 w-4 h-4 mr-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                      data-toggle-folder="${folder.id}"
                      aria-label="${folder.isExpanded ? 'Collapse' : 'Expand'} folder">
                <svg class="w-4 h-4 transform transition-transform ${folder.isExpanded ? 'rotate-90' : ''}" 
                     fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
                </svg>
              </button>
            ` : '<div class="w-4 h-4 mr-2"></div>'}
            
            <div class="flex items-center flex-1 min-w-0">
              <svg class="flex-shrink-0 w-4 h-4 mr-2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-5l-2-2H5a2 2 0 00-2 2z"/>
              </svg>
              <span class="text-sm font-medium truncate">${folder.name}</span>
            </div>
            
            <button class="flex-shrink-0 w-6 h-6 opacity-0 group-hover:opacity-100 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                    data-folder-menu="${folder.id}"
                    aria-label="Folder menu">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z"/>
              </svg>
            </button>
          </div>
          
          ${hasChildren && folder.isExpanded ? `
            <div class="folder-children">
              ${this.renderFolderTreeItems(folder.children!, level + 1)}
            </div>
          ` : ''}
        </div>
      `;
    }).join('');
  }

  private attachFolderTreeEvents(container: HTMLElement): void {
    // Folder selection
    container.addEventListener('click', (e) => {
      const folderItem = (e.target as HTMLElement).closest('[data-folder-item]');
      if (folderItem && !e.target?.closest('[data-toggle-folder]') && !e.target?.closest('[data-folder-menu]')) {
        const folderId = folderItem.getAttribute('data-folder-item');
        this.navigateToFolder(folderId);
      }
    });

    // Folder expand/collapse
    container.addEventListener('click', (e) => {
      const toggleButton = (e.target as HTMLElement).closest('[data-toggle-folder]');
      if (toggleButton) {
        e.stopPropagation();
        const folderId = toggleButton.getAttribute('data-toggle-folder');
        this.toggleFolder(folderId!);
      }
    });

    // Folder menus
    container.addEventListener('click', (e) => {
      const menuButton = (e.target as HTMLElement).closest('[data-folder-menu]');
      if (menuButton) {
        e.stopPropagation();
        const folderId = menuButton.getAttribute('data-folder-menu');
        this.showFolderMenu(folderId!, e as MouseEvent);
      }
    });
  }
  private async navigateToFolder(folderId: string | null): Promise<void> {
    this.currentFolderId = folderId;
    this.updateCurrentPath();
    this.renderFolderTree(); // Re-render to update selection
    await this.loadFolderContent(folderId);
  }

  private toggleFolder(folderId: string): void {
    const folder = this.findFolderById(folderId);
    if (folder) {
      folder.isExpanded = !folder.isExpanded;
      this.renderFolderTree();
    }
  }

  private findFolderById(id: string, folders: FolderItem[] = this.folderTree): FolderItem | null {
    for (const folder of folders) {
      if (folder.id === id) {
        return folder;
      }
      if (folder.children) {
        const found = this.findFolderById(id, folder.children);
        if (found) return found;
      }
    }
    return null;
  }

  private async loadFolderContent(folderId: string | null): Promise<void> {
    if (!this.container) return;

    const contentGrid = this.container.querySelector('[data-content-grid]');
    const loadingContent = this.container.querySelector('[data-loading-content]');
    const emptyState = this.container.querySelector('[data-empty-state]');

    // Show loading
    contentGrid?.classList.add('hidden');
    emptyState?.classList.add('hidden');
    loadingContent?.classList.remove('hidden');

    try {
      const endpoint = folderId 
        ? `/projects/${this.projectId}/folders/${folderId}/content`
        : `/projects/${this.projectId}/content`;
        
      const response = await apiClient.get(endpoint);
      const { folders, videos } = response.data;

      this.renderFolderContent(folders, videos);

    } catch (error) {
      handleError(error as Error, 'api', {
        feature: 'project-management',
        endpoint: folderId ? `/folders/${folderId}/content` : '/content'
      });
    } finally {
      loadingContent?.classList.add('hidden');
    }
  }

  private renderFolderContent(folders: FolderDto[], videos: VideoDto[]): void {
    if (!this.container) return;

    const contentGrid = this.container.querySelector('[data-content-grid]');
    const emptyState = this.container.querySelector('[data-empty-state]');

    if (!contentGrid) return;

    const hasContent = folders.length > 0 || videos.length > 0;

    if (!hasContent) {
      emptyState?.classList.remove('hidden');
      contentGrid.classList.add('hidden');
      return;
    }

    emptyState?.classList.add('hidden');
    contentGrid.classList.remove('hidden');
    contentGrid.classList.add('grid-cols-1', 'sm:grid-cols-2', 'md:grid-cols-3', 'lg:grid-cols-4');

    // Render folders first, then videos
    const folderItems = folders.map(folder => this.renderFolderCard(folder));
    const videoItems = videos.map(video => this.renderVideoCard(video));

    contentGrid.innerHTML = [...folderItems, ...videoItems].join('');

    // Attach content event listeners
    this.attachContentEvents(contentGrid);
  }

  private renderFolderCard(folder: FolderDto): string {
    return `
      <div class="folder-card group relative bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-600 hover:shadow-md transition-all duration-200 cursor-pointer"
           data-folder-card="${folder.id}"
           draggable="true"
           data-drag-type="folder"
           data-drag-id="${folder.id}">
        
        <div class="p-4">
          <div class="flex items-center justify-between mb-3">
            <div class="flex items-center">
              <div class="w-12 h-12 bg-blue-100 dark:bg-blue-900 rounded-lg flex items-center justify-center mr-3">
                <svg class="w-6 h-6 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-5l-2-2H5a2 2 0 00-2 2z"/>
                </svg>
              </div>
              <div class="flex-1 min-w-0">
                <h3 class="text-sm font-medium text-gray-900 dark:text-white truncate">${folder.name}</h3>
                <p class="text-xs text-gray-500 dark:text-gray-400">Folder • Level ${folder.depth + 1}</p>
              </div>
            </div>
            
            <button class="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-opacity"
                    data-folder-menu="${folder.id}"
                    aria-label="Folder options">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z"/>
              </svg>
            </button>
          </div>
          
          <!-- Drop zone indicator -->
          <div class="drop-zone absolute inset-0 border-2 border-dashed border-blue-400 bg-blue-50 dark:bg-blue-900/20 rounded-lg opacity-0 pointer-events-none transition-opacity"
               data-drop-zone="${folder.id}">
            <div class="flex items-center justify-center h-full">
              <span class="text-sm font-medium text-blue-600 dark:text-blue-400">Drop here to move</span>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  private renderVideoCard(video: VideoDto): string {
    const thumbnailUrl = `/api/videos/${video.id}/thumbnail`;
    const duration = this.formatDuration(video.durationSeconds);
    
    return `
      <div class="video-card group relative bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-600 hover:shadow-md transition-all duration-200 cursor-pointer"
           data-video-card="${video.id}"
           draggable="true"
           data-drag-type="video"
           data-drag-id="${video.id}">
        
        <!-- Thumbnail -->
        <div class="aspect-video rounded-t-lg bg-gray-100 dark:bg-gray-700 overflow-hidden relative">
          <img 
            src="${thumbnailUrl}" 
            alt="Video thumbnail"
            class="w-full h-full object-cover"
            onerror="this.style.display='none'; this.nextElementSibling.style.display='flex'"
          />
          <div class="absolute inset-0 flex items-center justify-center bg-gray-100 dark:bg-gray-700" style="display: none;">
            <svg class="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"/>
            </svg>
          </div>
          
          <!-- Duration badge -->
          <div class="absolute bottom-2 right-2 bg-black bg-opacity-75 text-white text-xs px-2 py-1 rounded">
            ${duration}
          </div>
          
          <!-- Status indicator -->
          ${video.status !== 'ready' ? `
            <div class="absolute top-2 left-2 bg-yellow-500 text-white text-xs px-2 py-1 rounded capitalize">
              ${video.status}
            </div>
          ` : ''}
          
          <!-- Play overlay -->
          <div class="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-30 transition-all duration-200 flex items-center justify-center">
            <button class="opacity-0 group-hover:opacity-100 bg-white bg-opacity-90 text-gray-900 rounded-full p-3 transition-all duration-200"
                    aria-label="Play video">
              <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.828 14.828a4 4 0 01-5.656 0M9 10h1.586a1 1 0 01.707.293l2.414 2.414a1 1 0 00.707.293H15M9 10V9a2 2 0 012-2h2a2 2 0 012 2v1M9 10v5a2 2 0 002 2h2a2 2 0 002-2v-5"/>
              </svg>
            </button>
          </div>
        </div>
        
        <!-- Content -->
        <div class="p-4">
          <h3 class="font-medium text-gray-900 dark:text-white text-sm mb-1 truncate">${video.title}</h3>
          <p class="text-xs text-gray-500 dark:text-gray-400">
            Video • ${this.formatRelativeTime(video.createdAt)}
          </p>
          
          ${video.developerMode ? `
            <div class="mt-2 flex items-center">
              <span class="inline-flex items-center px-2 py-1 rounded-full text-xs bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-300">
                <svg class="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 20l4-16m18 4l4 4-4 4M6 16l-4-4 4-4"/>
                </svg>
                Developer
              </span>
            </div>
          ` : ''}
        </div>
        
        <!-- Action menu -->
        <div class="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
          <button class="p-1 bg-white bg-opacity-90 dark:bg-gray-800 dark:bg-opacity-90 rounded-full text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
                  data-video-menu="${video.id}"
                  aria-label="Video menu">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z"/>
            </svg>
          </button>
        </div>
      </div>
    `;
  }
  private attachContentEvents(container: HTMLElement): void {
    // Folder navigation
    container.addEventListener('dblclick', (e) => {
      const folderCard = (e.target as HTMLElement).closest('[data-folder-card]');
      if (folderCard) {
        const folderId = folderCard.getAttribute('data-folder-card');
        this.navigateToFolder(folderId);
      }
    });

    // Video playback
    container.addEventListener('dblclick', (e) => {
      const videoCard = (e.target as HTMLElement).closest('[data-video-card]');
      if (videoCard) {
        const videoId = videoCard.getAttribute('data-video-card');
        this.playVideo(videoId!);
      }
    });

    // Context menus
    container.addEventListener('click', (e) => {
      const folderMenu = (e.target as HTMLElement).closest('[data-folder-menu]');
      if (folderMenu) {
        e.stopPropagation();
        const folderId = folderMenu.getAttribute('data-folder-menu');
        this.showFolderMenu(folderId!, e as MouseEvent);
      }

      const videoMenu = (e.target as HTMLElement).closest('[data-video-menu]');
      if (videoMenu) {
        e.stopPropagation();
        const videoId = videoMenu.getAttribute('data-video-menu');
        this.showVideoMenu(videoId!, e as MouseEvent);
      }
    });
  }

  private setupDragAndDrop(container: HTMLElement): void {
    // Drag start
    container.addEventListener('dragstart', (e) => {
      const draggable = (e.target as HTMLElement).closest('[draggable="true"]');
      if (draggable) {
        const type = draggable.getAttribute('data-drag-type') as 'folder' | 'video';
        const id = draggable.getAttribute('data-drag-id')!;
        
        this.draggedItem = { type, id, element: draggable as HTMLElement };
        
        // Visual feedback
        draggable.classList.add('opacity-50', 'scale-95');
        
        // Set drag data
        e.dataTransfer?.setData('text/plain', JSON.stringify({ type, id }));
        e.dataTransfer!.effectAllowed = 'move';
      }
    });

    // Drag end
    container.addEventListener('dragend', (e) => {
      if (this.draggedItem) {
        this.draggedItem.element.classList.remove('opacity-50', 'scale-95');
        this.draggedItem = null;
      }
      
      // Hide all drop zones
      container.querySelectorAll('[data-drop-zone]').forEach(zone => {
        zone.classList.remove('opacity-100');
        zone.classList.add('opacity-0');
      });
    });

    // Drag over (on potential drop targets)
    container.addEventListener('dragover', (e) => {
      e.preventDefault();
      
      const folderCard = (e.target as HTMLElement).closest('[data-folder-card]');
      if (folderCard && this.draggedItem) {
        const targetFolderId = folderCard.getAttribute('data-folder-card');
        
        // Don't allow dropping on self or invalid targets
        if (targetFolderId !== this.draggedItem.id) {
          e.dataTransfer!.dropEffect = 'move';
          
          // Show drop zone
          const dropZone = folderCard.querySelector('[data-drop-zone]');
          dropZone?.classList.remove('opacity-0');
          dropZone?.classList.add('opacity-100');
        }
      }
    });

    // Drag leave
    container.addEventListener('dragleave', (e) => {
      const folderCard = (e.target as HTMLElement).closest('[data-folder-card]');
      if (folderCard) {
        // Check if we're really leaving the folder card
        const rect = folderCard.getBoundingClientRect();
        const x = e.clientX;
        const y = e.clientY;
        
        if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
          const dropZone = folderCard.querySelector('[data-drop-zone]');
          dropZone?.classList.remove('opacity-100');
          dropZone?.classList.add('opacity-0');
        }
      }
    });

    // Drop
    container.addEventListener('drop', (e) => {
      e.preventDefault();
      
      const folderCard = (e.target as HTMLElement).closest('[data-folder-card]');
      if (folderCard && this.draggedItem) {
        const targetFolderId = folderCard.getAttribute('data-folder-card')!;
        
        if (targetFolderId !== this.draggedItem.id) {
          this.moveItem(this.draggedItem.type, this.draggedItem.id, targetFolderId);
        }
      }
      
      // Hide drop zones
      container.querySelectorAll('[data-drop-zone]').forEach(zone => {
        zone.classList.remove('opacity-100');
        zone.classList.add('opacity-0');
      });
    });
  }

  private async moveItem(type: 'folder' | 'video', itemId: string, targetFolderId: string): Promise<void> {
    try {
      const endpoint = type === 'folder' 
        ? `/folders/${itemId}/move`
        : `/videos/${itemId}/move`;
        
      await apiClient.patch(endpoint, { folderId: targetFolderId });
      
      // Refresh the view
      await this.loadFolderStructure();
      
      logger.info(`${type} moved successfully`, { 
        itemId, 
        targetFolderId, 
        projectId: this.projectId 
      });
      
    } catch (error) {
      handleError(error as Error, 'api', {
        feature: 'project-management',
        endpoint: `/move-${type}`,
        action: 'move'
      });
    }
  }

  private handleNewContentAction(action: string): void {
    switch (action) {
      case 'folder':
        this.showCreateFolderDialog();
        break;
      case 'recording':
        this.startRecording();
        break;
      case 'upload':
        this.showUploadDialog();
        break;
    }
  }

  private async showCreateFolderDialog(): Promise<void> {
    // Implementation similar to project creation but for folders
    const folderName = prompt('Enter folder name:');
    if (folderName && folderName.trim()) {
      try {
        await apiClient.post('/folders', {
          name: folderName.trim(),
          projectId: this.projectId,
          parentFolderId: this.currentFolderId
        });
        
        await this.loadFolderStructure();
        logger.info('Folder created', { name: folderName, projectId: this.projectId });
        
      } catch (error) {
        handleError(error as Error, 'api', {
          feature: 'project-management',
          action: 'create-folder'
        });
      }
    }
  }

  private startRecording(): void {
    // Navigate to recording page
    window.history.pushState(null, '', `/record?project=${this.projectId}`);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }

  private showUploadDialog(): void {
    // Implementation for upload dialog
    console.log('Upload dialog would open here');
  }

  private showInviteMembersDialog(): void {
    // Implementation for member invitation
    console.log('Member invitation dialog would open here');
  }

  private playVideo(videoId: string): void {
    // Navigate to video player
    window.history.pushState(null, '', `/videos/${videoId}`);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }