/**
 * Projects Page Component - Video Library Interface
 * Implements Requirements 4.3, 4.7, 4.9, 4.10 for video management
 */

import { VideoDto, ProjectDto } from '@streetstudio/shared';
import { VideoLibraryComponent } from '../../components/video-library/video-library-component.js';

export class ProjectsPage {
  private videoLibrary: VideoLibraryComponent;
  private currentProject: ProjectDto | null = null;

  constructor() {
    this.videoLibrary = new VideoLibraryComponent();
  }

  public getElement(): HTMLElement {
    const container = document.createElement('div');
    container.className = 'p-8 h-full flex flex-col';
    container.setAttribute('data-main-content', '');
    
    // Header with title and controls
    const header = this.createHeader();
    container.appendChild(header);
    
    // Video library component
    const libraryElement = this.videoLibrary.getElement();
    libraryElement.className = 'flex-1 mt-6';
    container.appendChild(libraryElement);
    
    return container;
  }

  private createHeader(): HTMLElement {
    const header = document.createElement('div');
    header.className = 'flex items-center justify-between mb-6';
    
    const titleSection = document.createElement('div');
    titleSection.innerHTML = `
      <h1 class="text-2xl font-bold text-gray-900 dark:text-white">Video Library</h1>
      <p class="text-gray-600 dark:text-gray-400 mt-1">Manage and organize your video content</p>
    `;
    
    const actions = document.createElement('div');
    actions.className = 'flex gap-3';
    actions.innerHTML = `
      <button class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2" 
              data-action="new-project">
        New Project
      </button>
      <button class="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
              data-action="upload-video">
        Upload Video
      </button>
    `;
    
    header.appendChild(titleSection);
    header.appendChild(actions);
    
    return header;
  }

  public setProject(project: ProjectDto | null): void {
    this.currentProject = project;
    this.videoLibrary.setProject(project);
  }
}
  private enrichProjectData(project: ProjectDto): ProjectWithMembers {
    return {
      ...project,
      memberCount: Math.floor(Math.random() * 10) + 1, // Mock data - should come from API
      lastActivity: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000).toISOString(),
      thumbnailUrl: `/api/projects/${project.id}/thumbnail`
    };
  }

  private filterProjects(): void {
    let filtered = [...this.projects];

    // Apply search filter
    if (this.searchQuery) {
      const query = this.searchQuery.toLowerCase();
      filtered = filtered.filter(project => 
        project.name.toLowerCase().includes(query)
      );
    }

    // Apply sorting
    filtered.sort((a, b) => {
      let result = 0;
      
      switch (this.sortBy) {
        case 'name':
          result = a.name.localeCompare(b.name);
          break;
        case 'created':
          result = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
          break;
        case 'activity':
          result = new Date(a.lastActivity).getTime() - new Date(b.lastActivity).getTime();
          break;
        case 'members':
          result = a.memberCount - b.memberCount;
          break;
      }

      return this.sortOrder === 'desc' ? -result : result;
    });

    this.filteredProjects = filtered;
  }

  private renderProjects(): void {
    if (!this.container) return;

    const gridContainer = this.container.querySelector('[data-projects-grid]');
    const listContainer = this.container.querySelector('[data-projects-list]');
    const emptyState = this.container.querySelector('[data-empty-state]');

    if (this.filteredProjects.length === 0) {
      emptyState?.classList.remove('hidden');
      gridContainer?.classList.add('hidden');
      listContainer?.classList.add('hidden');
      return;
    }

    emptyState?.classList.add('hidden');

    if (this.viewMode === 'grid') {
      gridContainer?.classList.remove('hidden');
      listContainer?.classList.add('hidden');
      this.renderProjectsGrid(gridContainer as HTMLElement);
    } else {
      gridContainer?.classList.add('hidden');
      listContainer?.classList.remove('hidden');
      this.renderProjectsList(listContainer as HTMLElement);
    }
  }

  private renderProjectsGrid(container: HTMLElement): void {
    container.innerHTML = this.filteredProjects.map(project => `
      <div class="project-card group relative bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-600 hover:shadow-lg transition-all duration-200 cursor-pointer"
           data-project-id="${project.id}"
           tabindex="0"
           role="button"
           aria-label="Open project ${project.name}">
        
        <!-- Thumbnail -->
        <div class="aspect-video rounded-t-xl bg-gray-100 dark:bg-gray-700 overflow-hidden relative">
          <img 
            src="${project.thumbnailUrl}" 
            alt="Project thumbnail"
            class="w-full h-full object-cover"
            onerror="this.style.display='none'; this.nextElementSibling.style.display='flex'"
          />
          <div class="absolute inset-0 flex items-center justify-center bg-gray-100 dark:bg-gray-700" style="display: none;">
            <svg class="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/>
            </svg>
          </div>
          
          <!-- Hover overlay -->
          <div class="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-20 transition-all duration-200 flex items-center justify-center">
            <button class="opacity-0 group-hover:opacity-100 bg-white bg-opacity-90 text-gray-900 rounded-full p-2 transition-all duration-200"
                    aria-label="Open project">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
              </svg>
            </button>
          </div>
        </div>
        
        <!-- Content -->
        <div class="p-4">
          <h3 class="font-semibold text-gray-900 dark:text-white text-lg mb-2 truncate">${project.name}</h3>
          
          <div class="flex items-center text-sm text-gray-500 dark:text-gray-400 mb-3">
            <svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z"/>
            </svg>
            <span>${project.memberCount} member${project.memberCount !== 1 ? 's' : ''}</span>
            
            <span class="mx-2">•</span>
            
            <svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>
            <span>${this.formatRelativeTime(project.lastActivity)}</span>
          </div>
          
          <div class="text-xs text-gray-400 dark:text-gray-500">
            Created ${this.formatRelativeTime(project.createdAt)}
          </div>
        </div>
        
        <!-- Action menu -->
        <div class="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
          <button class="p-1 bg-white bg-opacity-90 dark:bg-gray-800 dark:bg-opacity-90 rounded-full text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
                  data-project-menu="${project.id}"
                  aria-label="Project menu"
                  title="More options">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z"/>
            </svg>
          </button>
        </div>
      </div>
    `).join('');

    // Attach event listeners to project cards
    container.querySelectorAll('.project-card').forEach(card => {
      card.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        if (!target.closest('[data-project-menu]')) {
          const projectId = card.getAttribute('data-project-id');
          this.openProject(projectId!);
        }
      });

      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          const projectId = card.getAttribute('data-project-id');
          this.openProject(projectId!);
        }
      });
    });

    // Attach menu event listeners
    container.querySelectorAll('[data-project-menu]').forEach(button => {
      button.addEventListener('click', (e) => {
        e.stopPropagation();
        const projectId = button.getAttribute('data-project-menu');
        this.showProjectMenu(projectId!, e as MouseEvent);
      });
    });
  }
  private renderProjectsList(container: HTMLElement): void {
    container.innerHTML = `
      <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
        <table class="w-full">
          <thead class="bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
            <tr>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Project
              </th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Members
              </th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Last Activity
              </th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Created
              </th>
              <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
            ${this.filteredProjects.map(project => `
              <tr class="hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer project-row"
                  data-project-id="${project.id}"
                  tabindex="0"
                  role="button"
                  aria-label="Open project ${project.name}">
                <td class="px-6 py-4 whitespace-nowrap">
                  <div class="flex items-center">
                    <div class="flex-shrink-0 h-10 w-10">
                      <img 
                        src="${project.thumbnailUrl}" 
                        alt="Project thumbnail"
                        class="h-10 w-10 rounded-lg object-cover"
                        onerror="this.style.display='none'; this.nextElementSibling.style.display='flex'"
                      />
                      <div class="h-10 w-10 bg-gray-100 dark:bg-gray-600 rounded-lg flex items-center justify-center" style="display: none;">
                        <svg class="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/>
                        </svg>
                      </div>
                    </div>
                    <div class="ml-4">
                      <div class="text-sm font-medium text-gray-900 dark:text-white">${project.name}</div>
                    </div>
                  </div>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                  <div class="flex items-center">
                    <svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z"/>
                    </svg>
                    ${project.memberCount}
                  </div>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                  ${this.formatRelativeTime(project.lastActivity)}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                  ${this.formatRelativeTime(project.createdAt)}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  <button class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                          data-project-menu="${project.id}"
                          aria-label="Project menu"
                          title="More options">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z"/>
                    </svg>
                  </button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;

    // Attach event listeners to project rows
    container.querySelectorAll('.project-row').forEach(row => {
      row.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        if (!target.closest('[data-project-menu]')) {
          const projectId = row.getAttribute('data-project-id');
          this.openProject(projectId!);
        }
      });

      row.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          const projectId = row.getAttribute('data-project-id');
          this.openProject(projectId!);
        }
      });
    });

    // Attach menu event listeners
    container.querySelectorAll('[data-project-menu]').forEach(button => {
      button.addEventListener('click', (e) => {
        e.stopPropagation();
        const projectId = button.getAttribute('data-project-menu');
        this.showProjectMenu(projectId!, e as MouseEvent);
      });
    });
  }

  private formatRelativeTime(timestamp: string): string {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) {
      return `${days} day${days !== 1 ? 's' : ''} ago`;
    } else if (hours > 0) {
      return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
    } else if (minutes > 0) {
      return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;
    } else {
      return 'Just now';
    }
  }
  private openProject(projectId: string): void {
    // Navigate to project detail page
    window.history.pushState(null, '', `/projects/${projectId}`);
    window.dispatchEvent(new PopStateEvent('popstate'));
    logger.info('Navigated to project', { projectId });
  }

  private showProjectMenu(projectId: string, event: MouseEvent): void {
    const project = this.projects.find(p => p.id === projectId);
    if (!project) return;

    // Create context menu
    const menu = document.createElement('div');
    menu.className = 'fixed bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-2 z-50 min-w-48';
    menu.innerHTML = `
      <button class="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center"
              data-action="open">
        <svg class="w-4 h-4 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
        </svg>
        Open Project
      </button>
      <button class="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center"
              data-action="edit">
        <svg class="w-4 h-4 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
        </svg>
        Edit Details
      </button>
      <button class="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center"
              data-action="members">
        <svg class="w-4 h-4 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z"/>
        </svg>
        Manage Members
      </button>
      <hr class="my-1 border-gray-200 dark:border-gray-600">
      <button class="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20 flex items-center"
              data-action="delete">
        <svg class="w-4 h-4 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
        </svg>
        Delete Project
      </button>
    `;

    // Position the menu
    const rect = (event.target as HTMLElement).getBoundingClientRect();
    menu.style.left = `${rect.right - 200}px`;
    menu.style.top = `${rect.bottom + 5}px`;

    document.body.appendChild(menu);

    // Handle menu actions
    menu.addEventListener('click', (e) => {
      const action = (e.target as HTMLElement).closest('[data-action]')?.getAttribute('data-action');
      if (action) {
        this.handleProjectAction(projectId, action);
        this.closeContextMenu();
      }
    });

    // Close menu on outside click
    const closeHandler = (e: Event) => {
      if (!menu.contains(e.target as Node)) {
        this.closeContextMenu();
      }
    };

    setTimeout(() => {
      document.addEventListener('click', closeHandler);
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          this.closeContextMenu();
        }
      });
    }, 10);

    // Store cleanup function
    menu.dataset.closeHandler = 'true';
  }

  private closeContextMenu(): void {
    const menu = document.querySelector('.fixed.bg-white.dark\\:bg-gray-800');
    if (menu) {
      document.removeEventListener('click', this.closeContextMenu);
      menu.remove();
    }
  }

  private handleProjectAction(projectId: string, action: string): void {
    switch (action) {
      case 'open':
        this.openProject(projectId);
        break;
      case 'edit':
        this.showEditProjectDialog(projectId);
        break;
      case 'members':
        this.showMemberManagementDialog(projectId);
        break;
      case 'delete':
        this.showDeleteConfirmation(projectId);
        break;
    }
  }

  private showLoading(): void {
    if (this.container) {
      const loadingEl = this.container.querySelector('[data-loading]');
      const gridEl = this.container.querySelector('[data-projects-grid]');
      const listEl = this.container.querySelector('[data-projects-list]');
      const emptyEl = this.container.querySelector('[data-empty-state]');

      loadingEl?.classList.remove('hidden');
      gridEl?.classList.add('hidden');
      listEl?.classList.add('hidden');
      emptyEl?.classList.add('hidden');
    }
  }

  private hideLoading(): void {
    if (this.container) {
      const loadingEl = this.container.querySelector('[data-loading]');
      loadingEl?.classList.add('hidden');
    }
  }

  private showErrorState(): void {
    if (this.container) {
      const mainContent = this.container.querySelector('main .p-6');
      if (mainContent) {
        mainContent.innerHTML = `
          <div class="text-center py-12">
            <svg class="mx-auto h-12 w-12 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>
            <h3 class="mt-4 text-lg font-medium text-gray-900 dark:text-white">Unable to load projects</h3>
            <p class="mt-2 text-sm text-gray-500 dark:text-gray-400">
              There was an error loading your projects. Please try again.
            </p>
            <button 
              class="mt-4 btn btn-primary"
              onclick="window.location.reload()"
            >
              Retry
            </button>
          </div>
        `;
      }
    }
  }

  private updateProjectCount(): void {
    if (this.container) {
      const countEl = this.container.querySelector('[data-projects-count]');
      if (countEl) {
        const count = this.filteredProjects.length;
        countEl.textContent = `${count} project${count !== 1 ? 's' : ''}`;
      }
    }
  }