/**
 * Projects Page Component
 * 
 * Provides comprehensive project management with searchable and filterable grid layout.
 * Includes project creation, member invitation, and organization capabilities.
 */

import { apiClient } from '../../services/api.js';
import type { ProjectDto, MemberDto, OrganizationDto } from '@streetstudio/shared';
import { handleError } from '../../app/error-handler.js';
import { logger } from '../../app/client-logger.js';

export interface ProjectWithMembers extends ProjectDto {
  memberCount: number;
  lastActivity: string;
  thumbnailUrl?: string;
}

export class ProjectsPage {
  private container: HTMLElement | null = null;
  private projects: ProjectWithMembers[] = [];
  private filteredProjects: ProjectWithMembers[] = [];
  private searchQuery = '';
  private sortBy: 'name' | 'created' | 'activity' | 'members' = 'activity';
  private sortOrder: 'asc' | 'desc' = 'desc';
  private viewMode: 'grid' | 'list' = 'grid';
  private isLoading = false;

  public async getElement(): Promise<HTMLElement> {
    if (!this.container) {
      this.container = this.createContainer();
      await this.loadProjects();
    }
    return this.container;
  }
  private createContainer(): HTMLElement {
    const container = document.createElement('div');
    container.className = 'flex-1 flex flex-col min-h-0';
    container.setAttribute('data-main-content', '');
    
    container.innerHTML = `
      <header class="flex-shrink-0 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
        <div class="px-6 py-4">
          <div class="flex items-center justify-between">
            <div class="flex items-center space-x-4">
              <h1 class="text-2xl font-bold text-gray-900 dark:text-white">Projects</h1>
              <span class="text-sm text-gray-500 dark:text-gray-400" data-projects-count>0 projects</span>
            </div>
            <button 
              class="btn btn-primary inline-flex items-center px-4 py-2 rounded-lg font-medium"
              data-create-project
              aria-label="Create new project"
            >
              <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"/>
              </svg>
              New Project
            </button>
          </div>
          
          <!-- Search and filter controls -->
          <div class="flex items-center justify-between mt-4 space-x-4">
            <div class="flex items-center space-x-4 flex-1">
              <div class="relative flex-1 max-w-md">
                <input
                  type="text"
                  placeholder="Search projects..."
                  class="form-input w-full pl-10"
                  data-search-input
                  aria-label="Search projects"
                />
                <svg class="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
                </svg>
              </div>
              
              <select class="form-select" data-sort-select aria-label="Sort projects">
                <option value="activity:desc">Latest Activity</option>
                <option value="created:desc">Newest First</option>
                <option value="created:asc">Oldest First</option>
                <option value="name:asc">Name A-Z</option>
                <option value="name:desc">Name Z-A</option>
                <option value="members:desc">Most Members</option>
              </select>
            </div>
            
            <div class="flex items-center space-x-2">
              <div class="flex border border-gray-300 dark:border-gray-600 rounded-lg p-1">
                <button 
                  class="p-2 rounded transition-colors view-toggle active"
                  data-view-grid
                  aria-label="Grid view"
                  title="Grid view"
                >
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"/>
                  </svg>
                </button>
                <button 
                  class="p-2 rounded transition-colors view-toggle"
                  data-view-list
                  aria-label="List view"
                  title="List view"
                >
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 10h16M4 14h16M4 18h16"/>
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>
      </header>
      
      <!-- Main content area -->
      <main class="flex-1 overflow-y-auto">
        <div class="p-6">
          <!-- Loading state -->
          <div class="loading-container hidden" data-loading>
            <div class="flex items-center justify-center py-12">
              <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              <span class="ml-3 text-gray-600 dark:text-gray-400">Loading projects...</span>
            </div>
          </div>
          
          <!-- Empty state -->
          <div class="empty-state hidden" data-empty-state>
            <div class="text-center py-12">
              <svg class="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/>
              </svg>
              <h3 class="mt-4 text-lg font-medium text-gray-900 dark:text-white">No projects found</h3>
              <p class="mt-2 text-sm text-gray-500 dark:text-gray-400">
                Get started by creating your first project to organize your videos.
              </p>
              <button 
                class="mt-4 btn btn-primary"
                data-create-project-empty
              >
                Create Project
              </button>
            </div>
          </div>
          
          <!-- Projects grid -->
          <div class="projects-grid grid gap-6" data-projects-grid>
            <!-- Projects will be rendered here -->
          </div>
          
          <!-- Projects list -->
          <div class="projects-list hidden" data-projects-list>
            <!-- Projects will be rendered here -->
          </div>
        </div>
      </main>
    `;

    this.attachEventListeners(container);
    return container;
  }
  private attachEventListeners(container: HTMLElement): void {
    // Search functionality
    const searchInput = container.querySelector('[data-search-input]') as HTMLInputElement;
    searchInput?.addEventListener('input', (e) => {
      this.searchQuery = (e.target as HTMLInputElement).value;
      this.filterProjects();
      this.renderProjects();
    });

    // Sort functionality
    const sortSelect = container.querySelector('[data-sort-select]') as HTMLSelectElement;
    sortSelect?.addEventListener('change', (e) => {
      const value = (e.target as HTMLSelectElement).value;
      const [sortBy, order] = value.split(':') as [typeof this.sortBy, typeof this.sortOrder];
      this.sortBy = sortBy;
      this.sortOrder = order;
      this.filterProjects();
      this.renderProjects();
    });

    // View mode toggles
    const gridViewBtn = container.querySelector('[data-view-grid]');
    const listViewBtn = container.querySelector('[data-view-list]');

    gridViewBtn?.addEventListener('click', () => {
      this.viewMode = 'grid';
      this.updateViewMode(container);
      this.renderProjects();
    });

    listViewBtn?.addEventListener('click', () => {
      this.viewMode = 'list';
      this.updateViewMode(container);
      this.renderProjects();
    });

    // Create project buttons
    const createButtons = container.querySelectorAll('[data-create-project], [data-create-project-empty]');
    createButtons.forEach(button => {
      button.addEventListener('click', () => this.showCreateProjectDialog());
    });

    // Keyboard shortcuts
    container.addEventListener('keydown', (e) => {
      if (e.ctrlKey || e.metaKey) {
        switch (e.key) {
          case 'k':
            e.preventDefault();
            searchInput?.focus();
            break;
          case 'n':
            e.preventDefault();
            this.showCreateProjectDialog();
            break;
        }
      }
    });
  }

  private updateViewMode(container: HTMLElement): void {
    const gridBtn = container.querySelector('[data-view-grid]');
    const listBtn = container.querySelector('[data-view-list]');
    const gridContainer = container.querySelector('[data-projects-grid]');
    const listContainer = container.querySelector('[data-projects-list]');

    // Update button states
    gridBtn?.classList.toggle('active', this.viewMode === 'grid');
    listBtn?.classList.toggle('active', this.viewMode === 'list');

    // Show/hide containers
    if (this.viewMode === 'grid') {
      gridContainer?.classList.remove('hidden');
      listContainer?.classList.add('hidden');
      gridContainer?.classList.add('grid', 'grid-cols-1', 'md:grid-cols-2', 'lg:grid-cols-3', 'xl:grid-cols-4', 'gap-6');
    } else {
      gridContainer?.classList.add('hidden');
      listContainer?.classList.remove('hidden');
    }
  }

  private async loadProjects(): Promise<void> {
    this.isLoading = true;
    this.showLoading();

    try {
      const response = await apiClient.get('/projects');
      this.projects = response.data.map(this.enrichProjectData);
      this.filterProjects();
      this.renderProjects();
      this.updateProjectCount();
    } catch (error) {
      handleError(error as Error, 'api', {
        feature: 'project-management',
        endpoint: '/projects'
      });
      this.showErrorState();
    } finally {
      this.isLoading = false;
      this.hideLoading();
    }
  }