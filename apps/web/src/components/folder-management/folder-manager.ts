/**
 * Folder Management Component
 * 
 * Implements comprehensive folder management functionality including:
 * - Folder creation, renaming, and deletion
 * - Hierarchical nesting up to 10 levels deep
 * - Visual hierarchy indicators with expand/collapse
 * - Folder permissions and access control display
 * - Navigation breadcrumbs and quick access
 * 
 * Validates: Requirements 4.5
 */

import type { FolderDto, ProjectDto, Uuid } from '@streetstudio/shared';
import { apiClient } from '../../services/api.js';
import { handleError } from '../../app/error-handler.js';
import { logger } from '../../app/client-logger.js';

export interface FolderManagerConfig {
  projectId: string;
  currentFolderId?: string | null;
  onFolderSelect?: (folderId: string | null) => void;
  onFolderCreate?: (folder: FolderDto) => void;
  onFolderRename?: (folder: FolderDto) => void;
  onFolderDelete?: (folderId: string) => void;
}

export interface ExtendedFolderDto extends FolderDto {
  children?: ExtendedFolderDto[];
  isExpanded?: boolean;
  isSelected?: boolean;
  canCreateSubfolder?: boolean;
  canRename?: boolean;
  canDelete?: boolean;
}

export class FolderManager {
  private container: HTMLElement | null = null;
  private config: FolderManagerConfig;
  private folders: ExtendedFolderDto[] = [];
  private flatFolderMap = new Map<string, ExtendedFolderDto>();
  
  constructor(config: FolderManagerConfig) {
    this.config = config;
  }

  public async getElement(): Promise<HTMLElement> {
    if (!this.container) {
      this.container = this.createContainer();
      await this.loadFolders();
    }
    return this.container;
  }

  private createContainer(): HTMLElement {
    const container = document.createElement('div');
    container.className = 'folder-manager flex flex-col h-full';
    
    container.innerHTML = `
      <!-- Header with create folder button -->
      <div class="folder-manager-header flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
        <h3 class="text-sm font-semibold text-gray-900 dark:text-white uppercase tracking-wider">
          Folders
        </h3>
        <button class="btn-create-folder p-1 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 rounded"
                title="Create new folder"
                aria-label="Create new folder">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"/>
          </svg>
        </button>
      </div>
      
      <!-- Folder tree -->
      <div class="folder-tree flex-1 overflow-y-auto p-2" data-folder-tree>
        <div class="loading-indicator flex items-center justify-center py-8" data-loading>
          <div class="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
          <span class="ml-2 text-sm text-gray-500">Loading folders...</span>
        </div>
      </div>
    `;
    this.attachEventListeners(container);
    return container;
  }

  private attachEventListeners(container: HTMLElement): void {
    // Create folder button
    const createBtn = container.querySelector('.btn-create-folder');
    createBtn?.addEventListener('click', () => {
      this.showCreateFolderDialog(this.config.currentFolderId);
    });

    // Folder tree events - delegated
    const tree = container.querySelector('[data-folder-tree]');
    tree?.addEventListener('click', this.handleTreeClick.bind(this));
    tree?.addEventListener('dblclick', this.handleTreeDoubleClick.bind(this));
    
    // Context menu
    tree?.addEventListener('contextmenu', this.handleContextMenu.bind(this));
  }

  private async loadFolders(): Promise<void> {
    if (!this.container) return;

    const loadingEl = this.container.querySelector('[data-loading]');
    loadingEl?.classList.remove('hidden');

    try {
      const response = await apiClient.get(`/projects/${this.config.projectId}/folders`);
      const folders = response.data as FolderDto[];
      
      this.processFolders(folders);
      this.renderFolderTree();
      
    } catch (error) {
      handleError(error as Error, 'api', {
        feature: 'folder-management',
        operation: 'load-folders'
      });
    } finally {
      loadingEl?.classList.add('hidden');
    }
  }

  private processFolders(folders: FolderDto[]): void {
    // Reset state
    this.folders = [];
    this.flatFolderMap.clear();

    // Convert to extended folders with permissions
    const extendedFolders = folders.map(folder => this.createExtendedFolder(folder));
    
    // Build flat map
    extendedFolders.forEach(folder => {
      this.flatFolderMap.set(folder.id, folder);
    });

    // Build hierarchy
    const rootFolders: ExtendedFolderDto[] = [];
    
    extendedFolders.forEach(folder => {
      if (folder.parentFolderId) {
        const parent = this.flatFolderMap.get(folder.parentFolderId);
        if (parent) {
          if (!parent.children) parent.children = [];
          parent.children.push(folder);
        }
      } else {
        rootFolders.push(folder);
      }
    });

    this.folders = rootFolders;
  }

  private createExtendedFolder(folder: FolderDto): ExtendedFolderDto {
    return {
      ...folder,
      children: [],
      isExpanded: folder.depth < 2, // Expand first 2 levels by default
      isSelected: folder.id === this.config.currentFolderId,
      canCreateSubfolder: folder.depth < 9, // Max 10 levels (0-9)
      canRename: true, // TODO: Check permissions
      canDelete: true  // TODO: Check permissions and ensure folder is empty
    };
  }
  private renderFolderTree(): void {
    if (!this.container) return;

    const treeContainer = this.container.querySelector('[data-folder-tree]');
    if (!treeContainer) return;

    const html = this.folders.length > 0 
      ? this.renderFolderItems(this.folders, 0)
      : `<div class="empty-state text-center py-8 text-sm text-gray-500 dark:text-gray-400">
           <svg class="mx-auto h-8 w-8 mb-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
             <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-5l-2-2H5a2 2 0 00-2 2z"/>
           </svg>
           <p>No folders yet</p>
           <p class="text-xs mt-1">Create your first folder to organize content</p>
         </div>`;

    treeContainer.innerHTML = html;
  }

  private renderFolderItems(folders: ExtendedFolderDto[], level: number): string {
    return folders.map(folder => {
      const indent = level * 20;
      const hasChildren = folder.children && folder.children.length > 0;
      
      return `
        <div class="folder-item mb-1" data-folder-id="${folder.id}">
          <!-- Folder row -->
          <div class="folder-row flex items-center py-2 px-3 rounded-lg cursor-pointer transition-colors hover:bg-gray-100 dark:hover:bg-gray-800 ${
            folder.isSelected ? 'bg-blue-100 dark:bg-blue-900 text-blue-900 dark:text-blue-100' : ''
          }" 
               style="margin-left: ${indent}px"
               data-folder-item="${folder.id}"
               title="${folder.name} (Level ${folder.depth + 1})">
            
            <!-- Expand/Collapse button -->
            ${hasChildren ? `
              <button class="expand-btn flex-shrink-0 w-5 h-5 mr-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded transition-colors"
                      data-toggle="${folder.id}"
                      aria-label="${folder.isExpanded ? 'Collapse' : 'Expand'} folder">
                <svg class="w-4 h-4 transform transition-transform ${folder.isExpanded ? 'rotate-90' : ''}" 
                     fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
                </svg>
              </button>
            ` : '<div class="w-5 h-5 mr-2"></div>'}
            
            <!-- Folder icon -->
            <div class="flex-shrink-0 mr-2">
              <svg class="w-4 h-4 ${folder.isSelected ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400'}" 
                   fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                      d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-5l-2-2H5a2 2 0 00-2 2z"/>
              </svg>
            </div>
            
            <!-- Folder name -->
            <span class="folder-name flex-1 text-sm font-medium truncate" 
                  data-name="${folder.name}">${folder.name}</span>
            
            <!-- Depth indicator -->
            <span class="depth-indicator text-xs text-gray-400 mx-2">L${folder.depth + 1}</span>
            
            <!-- Actions menu -->
            <button class="actions-btn flex-shrink-0 w-6 h-6 opacity-0 group-hover:opacity-100 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded transition-opacity"
                    data-folder-menu="${folder.id}"
                    aria-label="Folder actions">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                      d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z"/>
              </svg>
            </button>
          </div>
          
          <!-- Children (if expanded) -->
          ${hasChildren && folder.isExpanded ? `
            <div class="folder-children">
              ${this.renderFolderItems(folder.children!, level + 1)}
            </div>
          ` : ''}
        </div>
      `;
    }).join('');
  }
  private handleTreeClick(e: Event): void {
    const target = e.target as HTMLElement;
    
    // Handle expand/collapse
    const toggleBtn = target.closest('[data-toggle]');
    if (toggleBtn) {
      e.stopPropagation();
      const folderId = toggleBtn.getAttribute('data-toggle')!;
      this.toggleFolder(folderId);
      return;
    }
    
    // Handle folder actions menu
    const menuBtn = target.closest('[data-folder-menu]');
    if (menuBtn) {
      e.stopPropagation();
      const folderId = menuBtn.getAttribute('data-folder-menu')!;
      this.showFolderMenu(folderId, e as MouseEvent);
      return;
    }
    
    // Handle folder selection
    const folderRow = target.closest('[data-folder-item]');
    if (folderRow) {
      const folderId = folderRow.getAttribute('data-folder-item')!;
      this.selectFolder(folderId);
    }
  }

  private handleTreeDoubleClick(e: Event): void {
    const target = e.target as HTMLElement;
    const folderRow = target.closest('[data-folder-item]');
    
    if (folderRow) {
      const folderId = folderRow.getAttribute('data-folder-item')!;
      this.navigateToFolder(folderId);
    }
  }

  private handleContextMenu(e: Event): void {
    e.preventDefault();
    const target = e.target as HTMLElement;
    const folderRow = target.closest('[data-folder-item]');
    
    if (folderRow) {
      const folderId = folderRow.getAttribute('data-folder-item')!;
      this.showFolderMenu(folderId, e as MouseEvent);
    } else {
      // Right-click on empty space - show root menu
      this.showCreateFolderDialog(this.config.currentFolderId);
    }
  }

  private toggleFolder(folderId: string): void {
    const folder = this.flatFolderMap.get(folderId);
    if (folder) {
      folder.isExpanded = !folder.isExpanded;
      this.renderFolderTree();
      
      logger.debug('Folder toggled', { 
        folderId, 
        expanded: folder.isExpanded,
        feature: 'folder-management' 
      });
    }
  }

  private selectFolder(folderId: string): void {
    // Update selection state
    this.flatFolderMap.forEach(folder => {
      folder.isSelected = folder.id === folderId;
    });
    
    this.config.currentFolderId = folderId;
    this.renderFolderTree();
    
    // Notify parent component
    this.config.onFolderSelect?.(folderId);
    
    logger.debug('Folder selected', { folderId, feature: 'folder-management' });
  }

  private navigateToFolder(folderId: string): void {
    this.selectFolder(folderId);
    // Additional navigation logic could be added here
  }