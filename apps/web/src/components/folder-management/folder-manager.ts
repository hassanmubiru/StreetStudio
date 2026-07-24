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