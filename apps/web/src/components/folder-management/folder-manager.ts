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
  private showFolderMenu(folderId: string, event: MouseEvent): void {
    const folder = this.flatFolderMap.get(folderId);
    if (!folder) return;

    // Remove any existing menu
    document.querySelectorAll('.folder-context-menu').forEach(menu => menu.remove());

    const menu = document.createElement('div');
    menu.className = 'folder-context-menu absolute bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg py-2 z-50 min-w-48';
    
    const menuItems = [
      {
        label: 'Open',
        icon: 'M8 4H6a2 2 0 00-2 2v12a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-2m-4-1v8m0 0l3-3m-3 3L9 8',
        action: () => this.navigateToFolder(folderId)
      }
    ];

    if (folder.canCreateSubfolder) {
      menuItems.push({
        label: 'New Subfolder',
        icon: 'M12 6v6m0 0v6m0-6h6m-6 0H6',
        action: () => this.showCreateFolderDialog(folderId)
      });
    }

    if (folder.canRename) {
      menuItems.push({
        label: 'Rename',
        icon: 'M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z',
        action: () => this.showRenameFolderDialog(folderId)
      });
    }

    if (folder.canDelete) {
      menuItems.push({
        label: 'Delete',
        icon: 'M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16',
        action: () => this.showDeleteFolderDialog(folderId),
        className: 'text-red-600 dark:text-red-400'
      });
    }

    menu.innerHTML = menuItems.map(item => `
      <button class="w-full px-4 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center transition-colors ${item.className || 'text-gray-700 dark:text-gray-300'}"
              data-action="${item.label.toLowerCase().replace(' ', '-')}">
        <svg class="w-4 h-4 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="${item.icon}"/>
        </svg>
        ${item.label}
      </button>
    `).join('');

    // Position the menu
    menu.style.left = `${event.clientX}px`;
    menu.style.top = `${event.clientY}px`;
    
    // Add to document
    document.body.appendChild(menu);

    // Attach event listeners
    menuItems.forEach((item, index) => {
      const button = menu.children[index] as HTMLElement;
      button.addEventListener('click', () => {
        menu.remove();
        item.action();
      });
    });

    // Close menu on outside click
    const closeMenu = (e: Event) => {
      if (!menu.contains(e.target as Node)) {
        menu.remove();
        document.removeEventListener('click', closeMenu);
      }
    };
    setTimeout(() => document.addEventListener('click', closeMenu), 0);
  }

  private showCreateFolderDialog(parentFolderId?: string | null): void {
    const dialog = this.createFolderDialog('Create Folder', '', parentFolderId);
    
    const nameInput = dialog.querySelector('[data-folder-name]') as HTMLInputElement;
    const createBtn = dialog.querySelector('[data-create-folder]') as HTMLButtonElement;
    
    createBtn.addEventListener('click', async () => {
      const name = nameInput.value.trim();
      if (name) {
        await this.createFolder(name, parentFolderId || null);
        dialog.remove();
      }
    });

    document.body.appendChild(dialog);
    nameInput.focus();
  }
  private showRenameFolderDialog(folderId: string): void {
    const folder = this.flatFolderMap.get(folderId);
    if (!folder) return;

    const dialog = this.createFolderDialog('Rename Folder', folder.name, null, true);
    
    const nameInput = dialog.querySelector('[data-folder-name]') as HTMLInputElement;
    const saveBtn = dialog.querySelector('[data-create-folder]') as HTMLButtonElement;
    
    saveBtn.textContent = 'Save';
    nameInput.select(); // Select existing text for easy replacement
    
    saveBtn.addEventListener('click', async () => {
      const name = nameInput.value.trim();
      if (name && name !== folder.name) {
        await this.renameFolder(folderId, name);
        dialog.remove();
      }
    });

    document.body.appendChild(dialog);
    nameInput.focus();
  }

  private showDeleteFolderDialog(folderId: string): void {
    const folder = this.flatFolderMap.get(folderId);
    if (!folder) return;

    const hasChildren = folder.children && folder.children.length > 0;
    
    const dialog = document.createElement('div');
    dialog.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
    
    dialog.innerHTML = `
      <div class="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-md mx-4">
        <div class="flex items-start mb-4">
          <div class="flex-shrink-0">
            <svg class="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.664-.833-2.464 0L4.35 16.5c-.77.833.192 2.5 1.732 2.5z"/>
            </svg>
          </div>
          <div class="ml-3">
            <h3 class="text-lg font-medium text-gray-900 dark:text-white">
              Delete "${folder.name}"?
            </h3>
            <div class="mt-2 text-sm text-gray-600 dark:text-gray-400">
              ${hasChildren 
                ? `<p class="text-red-600 dark:text-red-400 font-medium">This folder contains ${folder.children!.length} subfolder(s) and cannot be deleted.</p>
                   <p class="mt-2">Please move or delete all subfolders first.</p>`
                : `<p>This action cannot be undone. The folder will be permanently removed.</p>`
              }
            </div>
          </div>
        </div>
        
        <div class="flex justify-end space-x-3">
          <button class="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-md transition-colors"
                  data-cancel>
            Cancel
          </button>
          ${!hasChildren ? `
            <button class="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-md transition-colors"
                    data-delete-confirm>
              Delete Folder
            </button>
          ` : ''}
        </div>
      </div>
    `;

    // Event listeners
    const cancelBtn = dialog.querySelector('[data-cancel]');
    const deleteBtn = dialog.querySelector('[data-delete-confirm]');

    cancelBtn?.addEventListener('click', () => dialog.remove());
    
    if (deleteBtn && !hasChildren) {
      deleteBtn.addEventListener('click', async () => {
        await this.deleteFolder(folderId);
        dialog.remove();
      });
    }

    // Close on backdrop click
    dialog.addEventListener('click', (e) => {
      if (e.target === dialog) dialog.remove();
    });

    document.body.appendChild(dialog);
  }