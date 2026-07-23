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