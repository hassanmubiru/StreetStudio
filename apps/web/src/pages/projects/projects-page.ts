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
  private async showCreateProjectDialog(): Promise<void> {
    const dialog = document.createElement('div');
    dialog.className = 'fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50';
    dialog.innerHTML = `
      <div class="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div class="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <h2 class="text-xl font-semibold text-gray-900 dark:text-white">Create New Project</h2>
          <button class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300" data-close-dialog>
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>
        
        <form class="p-6" data-create-project-form>
          <div class="space-y-4">
            <div>
              <label for="project-name" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Project Name *
              </label>
              <input
                type="text"
                id="project-name"
                name="name"
                required
                maxlength="100"
                class="form-input w-full"
                placeholder="Enter project name"
                aria-describedby="name-help"
              />
              <p id="name-help" class="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Choose a descriptive name for your project
              </p>
            </div>
            
            <div>
              <label for="project-description" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Description
              </label>
              <textarea
                id="project-description"
                name="description"
                rows="3"
                maxlength="500"
                class="form-textarea w-full"
                placeholder="Describe the purpose of this project (optional)"
              ></textarea>
            </div>
            
            <div>
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Privacy Settings
              </label>
              <div class="space-y-2">
                <label class="flex items-center">
                  <input type="radio" name="privacy" value="organization" class="form-radio" checked>
                  <span class="ml-2 text-sm text-gray-700 dark:text-gray-300">
                    <strong>Organization</strong> - All organization members can view
                  </span>
                </label>
                <label class="flex items-center">
                  <input type="radio" name="privacy" value="private" class="form-radio">
                  <span class="ml-2 text-sm text-gray-700 dark:text-gray-300">
                    <strong>Private</strong> - Only invited members can view
                  </span>
                </label>
              </div>
            </div>
            
            <div data-member-invitation-section>
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Invite Team Members
              </label>
              <div class="space-y-2">
                <div class="flex space-x-2">
                  <input
                    type="email"
                    placeholder="Enter email address"
                    class="form-input flex-1"
                    data-member-email-input
                  />
                  <button
                    type="button"
                    class="btn btn-secondary px-3"
                    data-add-member
                    aria-label="Add member"
                  >
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"/>
                    </svg>
                  </button>
                </div>
                <div class="invited-members-list" data-invited-members>
                  <!-- Invited members will appear here -->
                </div>
              </div>
            </div>
          </div>
          
          <div class="flex justify-end space-x-3 mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
            <button type="button" class="btn btn-secondary" data-close-dialog>
              Cancel
            </button>
            <button type="submit" class="btn btn-primary">
              <span data-submit-text>Create Project</span>
              <span data-loading-text class="hidden">Creating...</span>
            </button>
          </div>
        </form>
      </div>
    `;

    document.body.appendChild(dialog);

    // Handle form events
    const form = dialog.querySelector('[data-create-project-form]') as HTMLFormElement;
    const memberEmailInput = dialog.querySelector('[data-member-email-input]') as HTMLInputElement;
    const addMemberBtn = dialog.querySelector('[data-add-member]');
    const invitedMembersList = dialog.querySelector('[data-invited-members]');
    const closeButtons = dialog.querySelectorAll('[data-close-dialog]');

    let invitedEmails: string[] = [];

    // Close dialog handlers
    closeButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        document.body.removeChild(dialog);
      });
    });

    // Close on backdrop click
    dialog.addEventListener('click', (e) => {
      if (e.target === dialog) {
        document.body.removeChild(dialog);
      }
    });

    // Close on escape key
    const escapeHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        document.body.removeChild(dialog);
        document.removeEventListener('keydown', escapeHandler);
      }
    };
    document.addEventListener('keydown', escapeHandler);

    // Add member functionality
    const addMember = () => {
      const email = memberEmailInput.value.trim();
      if (email && this.isValidEmail(email) && !invitedEmails.includes(email)) {
        invitedEmails.push(email);
        memberEmailInput.value = '';
        this.renderInvitedMembers(invitedMembersList!, invitedEmails);
      }
    };

    addMemberBtn?.addEventListener('click', addMember);
    memberEmailInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        addMember();
      }
    });

    // Form submission
    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      await this.createProject(form, invitedEmails, dialog);
    });

    // Focus the name input
    setTimeout(() => {
      const nameInput = dialog.querySelector('#project-name') as HTMLInputElement;
      nameInput?.focus();
    }, 100);
  }

  private renderInvitedMembers(container: HTMLElement, emails: string[]): void {
    container.innerHTML = emails.map(email => `
      <div class="flex items-center justify-between bg-gray-50 dark:bg-gray-700 rounded-lg px-3 py-2">
        <div class="flex items-center">
          <div class="w-6 h-6 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center mr-2">
            <svg class="w-4 h-4 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
            </svg>
          </div>
          <span class="text-sm text-gray-700 dark:text-gray-300">${email}</span>
        </div>
        <button 
          type="button" 
          class="text-gray-400 hover:text-red-500 ml-2"
          data-remove-email="${email}"
          aria-label="Remove ${email}"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
          </svg>
        </button>
      </div>
    `).join('');

    // Attach remove handlers
    container.querySelectorAll('[data-remove-email]').forEach(button => {
      button.addEventListener('click', () => {
        const emailToRemove = button.getAttribute('data-remove-email');
        if (emailToRemove) {
          const index = emails.indexOf(emailToRemove);
          if (index > -1) {
            emails.splice(index, 1);
            this.renderInvitedMembers(container, emails);
          }
        }
      });
    });
  }

  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }
  private async createProject(form: HTMLFormElement, invitedEmails: string[], dialog: HTMLElement): Promise<void> {
    const formData = new FormData(form);
    const submitBtn = form.querySelector('button[type="submit"]');
    const submitText = submitBtn?.querySelector('[data-submit-text]');
    const loadingText = submitBtn?.querySelector('[data-loading-text]');

    try {
      // Update button state
      submitBtn?.setAttribute('disabled', 'true');
      submitText?.classList.add('hidden');
      loadingText?.classList.remove('hidden');

      const projectData = {
        name: formData.get('name') as string,
        description: formData.get('description') as string || undefined,
        isPrivate: formData.get('privacy') === 'private',
        invitedMembers: invitedEmails
      };

      const response = await apiClient.post('/projects', projectData);
      
      // Add new project to local state
      const newProject = this.enrichProjectData(response.data);
      this.projects.unshift(newProject);
      this.filterProjects();
      this.renderProjects();
      this.updateProjectCount();

      // Close dialog
      document.body.removeChild(dialog);

      // Show success message
      this.showToast('Project created successfully!', 'success');
      
      logger.info('Project created', { 
        projectId: response.data.id, 
        name: projectData.name,
        memberCount: invitedEmails.length 
      });

    } catch (error) {
      handleError(error as Error, 'api', {
        feature: 'project-management',
        endpoint: '/projects',
        action: 'create'
      });
      
      this.showToast('Failed to create project. Please try again.', 'error');
      
    } finally {
      // Reset button state
      submitBtn?.removeAttribute('disabled');
      submitText?.classList.remove('hidden');
      loadingText?.classList.add('hidden');
    }
  }

  private showToast(message: string, type: 'success' | 'error' | 'info' = 'info'): void {
    const toast = document.createElement('div');
    toast.className = `fixed top-4 right-4 z-50 max-w-sm w-full px-4 py-3 rounded-lg shadow-lg transition-all duration-300 transform translate-x-full`;
    
    const bgColor = type === 'success' ? 'bg-green-500' : type === 'error' ? 'bg-red-500' : 'bg-blue-500';
    toast.classList.add(bgColor, 'text-white');
    
    toast.innerHTML = `
      <div class="flex items-center">
        <div class="flex-shrink-0">
          ${type === 'success' ? `
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
            </svg>
          ` : type === 'error' ? `
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          ` : `
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>
          `}
        </div>
        <div class="ml-3 flex-1">
          <p class="text-sm font-medium">${message}</p>
        </div>
        <button class="ml-4 text-white hover:text-gray-200" onclick="this.parentElement.parentElement.remove()">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
          </svg>
        </button>
      </div>
    `;

    document.body.appendChild(toast);

    // Animate in
    setTimeout(() => {
      toast.classList.remove('translate-x-full');
    }, 100);

    // Auto remove after 5 seconds
    setTimeout(() => {
      toast.classList.add('translate-x-full');
      setTimeout(() => {
        if (toast.parentElement) {
          document.body.removeChild(toast);
        }
      }, 300);
    }, 5000);
  }

  private async showEditProjectDialog(projectId: string): Promise<void> {
    const project = this.projects.find(p => p.id === projectId);
    if (!project) return;

    // Implementation similar to create dialog but with pre-filled values
    // For brevity, showing just the structure
    const dialog = document.createElement('div');
    dialog.className = 'fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50';
    
    // Implementation would be similar to createProject dialog
    // but with edit-specific logic and pre-populated fields
    
    this.showToast('Edit functionality will be available in the next update', 'info');
  }

  private async showMemberManagementDialog(projectId: string): Promise<void> {
    const project = this.projects.find(p => p.id === projectId);
    if (!project) return;

    // Implementation for member management
    this.showToast('Member management functionality will be available in the next update', 'info');
  }

  private async showDeleteConfirmation(projectId: string): Promise<void> {
    const project = this.projects.find(p => p.id === projectId);
    if (!project) return;

    const dialog = document.createElement('div');
    dialog.className = 'fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50';
    dialog.innerHTML = `
      <div class="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4">
        <div class="p-6">
          <div class="flex items-center">
            <div class="flex-shrink-0">
              <svg class="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
              </svg>
            </div>
            <div class="ml-3">
              <h3 class="text-lg font-medium text-gray-900 dark:text-white">Delete Project</h3>
              <div class="mt-2">
                <p class="text-sm text-gray-500 dark:text-gray-400">
                  Are you sure you want to delete "<strong>${project.name}</strong>"? This action cannot be undone.
                </p>
              </div>
            </div>
          </div>
        </div>
        
        <div class="bg-gray-50 dark:bg-gray-700 px-6 py-3 flex justify-end space-x-3">
          <button type="button" class="btn btn-secondary" data-cancel-delete>
            Cancel
          </button>
          <button type="button" class="btn btn-danger" data-confirm-delete>
            Delete Project
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(dialog);

    const cancelBtn = dialog.querySelector('[data-cancel-delete]');
    const confirmBtn = dialog.querySelector('[data-confirm-delete]');

    cancelBtn?.addEventListener('click', () => {
      document.body.removeChild(dialog);
    });

    confirmBtn?.addEventListener('click', async () => {
      try {
        await apiClient.delete(`/projects/${projectId}`);
        
        // Remove from local state
        this.projects = this.projects.filter(p => p.id !== projectId);
        this.filterProjects();
        this.renderProjects();
        this.updateProjectCount();
        
        document.body.removeChild(dialog);
        this.showToast('Project deleted successfully', 'success');
        
        logger.info('Project deleted', { projectId, name: project.name });
        
      } catch (error) {
        handleError(error as Error, 'api', {
          feature: 'project-management',
          endpoint: `/projects/${projectId}`,
          action: 'delete'
        });
        
        this.showToast('Failed to delete project. Please try again.', 'error');
      }
    });

    // Close on backdrop click
    dialog.addEventListener('click', (e) => {
      if (e.target === dialog) {
        document.body.removeChild(dialog);
      }
    });
  }

  public refresh(): Promise<void> {
    return this.loadProjects();
  }
}