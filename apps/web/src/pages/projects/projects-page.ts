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