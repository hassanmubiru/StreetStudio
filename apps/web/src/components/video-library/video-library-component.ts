/**
 * Video Library Component
 * Implements Requirements 4.3, 4.7, 4.9, 4.10:
 * - Multiple view layouts (list, grid, timeline) with user preferences
 * - Bulk operations with batch selection and actions 
 * - Video metadata display with processing status indicators
 * - Real-time processing progress
 */

import { VideoDto, ProjectDto } from '@streetstudio/shared';
import { ViewLayoutController } from './view-layout-controller.js';
import { BulkOperationsController } from './bulk-operations-controller.js';
import { VideoMetadataRenderer } from './video-metadata-renderer.js';

export type ViewLayout = 'list' | 'grid' | 'timeline';
export type SortField = 'date' | 'name' | 'duration' | 'activity';
export type SortDirection = 'asc' | 'desc';

export interface VideoLibraryState {
  layout: ViewLayout;
  sortField: SortField;
  sortDirection: SortDirection;
  selectedVideos: Set<string>;
  filterText: string;
  showProcessingOnly: boolean;
}

export class VideoLibraryComponent {
  private state: VideoLibraryState;
  private videos: VideoDto[] = [];
  private currentProject: ProjectDto | null = null;
  private element: HTMLElement | null = null;
  private viewController: ViewLayoutController;
  private bulkController: BulkOperationsController;
  private metadataRenderer: VideoMetadataRenderer;

  constructor() {
    this.state = {
      layout: this.getUserPreferredLayout(),
      sortField: 'date',
      sortDirection: 'desc',
      selectedVideos: new Set(),
      filterText: '',
      showProcessingOnly: false
    };

    this.viewController = new ViewLayoutController();
    this.bulkController = new BulkOperationsController();
    this.metadataRenderer = new VideoMetadataRenderer();
    
    this.setupEventListeners();
  }

  public getElement(): HTMLElement {
    if (!this.element) {
      this.element = this.createElement();
    }
    return this.element;
  }

  public setProject(project: ProjectDto | null): void {
    this.currentProject = project;
    this.loadVideosForProject();
  }

  private createElement(): HTMLElement {
    const container = document.createElement('div');
    container.className = 'video-library flex flex-col h-full';
    
    // Toolbar with view controls, sorting, and filtering
    const toolbar = this.createToolbar();
    container.appendChild(toolbar);
    
    // Bulk operations bar (hidden by default)
    const bulkBar = this.createBulkOperationsBar();
    container.appendChild(bulkBar);
    
    // Main content area for video display
    const content = document.createElement('div');
    content.className = 'flex-1 overflow-auto';
    content.setAttribute('data-video-content', '');
    container.appendChild(content);
    
    this.renderVideoContent();
    
    return container;
  }
  private createToolbar(): HTMLElement {
    const toolbar = document.createElement('div');
    toolbar.className = 'flex items-center justify-between p-4 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700';
    
    // Left side: View layout toggles
    const leftSection = document.createElement('div');
    leftSection.className = 'flex items-center gap-4';
    
    // View layout buttons (Requirement 4.3)
    const viewToggle = document.createElement('div');
    viewToggle.className = 'flex bg-gray-100 dark:bg-gray-700 rounded-lg p-1';
    viewToggle.innerHTML = `
      <button class="view-toggle ${this.state.layout === 'list' ? 'bg-white dark:bg-gray-600 shadow-sm' : ''} px-3 py-1 rounded-md text-sm font-medium" 
              data-layout="list" title="List View">
        <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
          <path d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 10a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 16a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z"/>
        </svg>
      </button>
      <button class="view-toggle ${this.state.layout === 'grid' ? 'bg-white dark:bg-gray-600 shadow-sm' : ''} px-3 py-1 rounded-md text-sm font-medium" 
              data-layout="grid" title="Grid View">
        <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
          <path d="M5 3a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2V5a2 2 0 00-2-2H5zM5 11a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2v-2a2 2 0 00-2-2H5zM11 5a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V5zM11 13a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"/>
        </svg>
      </button>
      <button class="view-toggle ${this.state.layout === 'timeline' ? 'bg-white dark:bg-gray-600 shadow-sm' : ''} px-3 py-1 rounded-md text-sm font-medium" 
              data-layout="timeline" title="Timeline View">
        <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
          <path d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 10a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM9 16a1 1 0 011-1h6a1 1 0 110 2h-6a1 1 0 01-1-1z"/>
        </svg>
      </button>
    `;
    
    // Sort controls
    const sortControls = document.createElement('div');
    sortControls.className = 'flex items-center gap-2';
    sortControls.innerHTML = `
      <label class="text-sm font-medium text-gray-700 dark:text-gray-300">Sort:</label>
      <select class="sort-field rounded-md border-gray-300 dark:border-gray-600 dark:bg-gray-700 text-sm"
              data-field="sort">
        <option value="date" ${this.state.sortField === 'date' ? 'selected' : ''}>Date</option>
        <option value="name" ${this.state.sortField === 'name' ? 'selected' : ''}>Name</option>
        <option value="duration" ${this.state.sortField === 'duration' ? 'selected' : ''}>Duration</option>
        <option value="activity" ${this.state.sortField === 'activity' ? 'selected' : ''}>Activity</option>
      </select>
      <button class="sort-direction p-1 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700" 
              data-action="toggle-sort" title="Toggle sort direction">
        <svg class="w-4 h-4 transform ${this.state.sortDirection === 'desc' ? 'rotate-180' : ''}" 
             fill="currentColor" viewBox="0 0 20 20">
          <path d="M3 3a1 1 0 000 2h11a1 1 0 100-2H3zM3 7a1 1 0 000 2h5a1 1 0 000-2H3zM3 11a1 1 0 100 2h4a1 1 0 100-2H3zM13 16a1 1 0 102 0v-5.586l1.293 1.293a1 1 0 001.414-1.414l-3-3a1 1 0 00-1.414 0l-3 3a1 1 0 101.414 1.414L13 10.414V16z"/>
        </svg>
      </button>
    `;
    
    leftSection.appendChild(viewToggle);
    leftSection.appendChild(sortControls);
    
    // Right side: Search and filters
    const rightSection = document.createElement('div');
    rightSection.className = 'flex items-center gap-4';
    
    // Search input with filtering
    const searchContainer = document.createElement('div');
    searchContainer.className = 'relative';
    searchContainer.innerHTML = `
      <input type="text" 
             class="search-input w-64 pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
             placeholder="Search videos..."
             value="${this.state.filterText}">
      <svg class="absolute left-3 top-2.5 w-4 h-4 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
        <path fill-rule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z"/>
      </svg>
    `;
    
    // Filter toggles
    const filters = document.createElement('div');
    filters.className = 'flex items-center gap-3';
    filters.innerHTML = `
      <label class="flex items-center gap-2 text-sm">
        <input type="checkbox" 
               class="filter-processing rounded border-gray-300 dark:border-gray-600"
               ${this.state.showProcessingOnly ? 'checked' : ''}>
        <span class="text-gray-700 dark:text-gray-300">Processing only</span>
      </label>
    `;
    
    rightSection.appendChild(searchContainer);
    rightSection.appendChild(filters);
    
    toolbar.appendChild(leftSection);
    toolbar.appendChild(rightSection);
    
    return toolbar;
  }
  private createBulkOperationsBar(): HTMLElement {
    const bulkBar = document.createElement('div');
    bulkBar.className = 'bulk-operations-bar hidden bg-blue-50 dark:bg-blue-900/20 border-b border-blue-200 dark:border-blue-800 p-4';
    bulkBar.setAttribute('data-bulk-bar', '');
    
    bulkBar.innerHTML = `
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-4">
          <span class="selected-count text-sm font-medium text-blue-800 dark:text-blue-200"></span>
          <button class="clear-selection text-sm text-blue-600 dark:text-blue-400 hover:underline">
            Clear selection
          </button>
        </div>
        <div class="flex items-center gap-3">
          <button class="bulk-action px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm"
                  data-action="move">
            Move to Folder
          </button>
          <button class="bulk-action px-3 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 text-sm"
                  data-action="share">
            Share
          </button>
          <button class="bulk-action px-3 py-2 bg-yellow-600 text-white rounded-md hover:bg-yellow-700 text-sm"
                  data-action="download">
            Download
          </button>
          <button class="bulk-action px-3 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 text-sm"
                  data-action="delete">
            Delete
          </button>
        </div>
      </div>
    `;
    
    return bulkBar;
  }

  private setupEventListeners(): void {
    // Event delegation for dynamic content
    document.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      
      // View layout toggle
      if (target.closest('.view-toggle')) {
        const layout = target.closest('.view-toggle')?.getAttribute('data-layout') as ViewLayout;
        if (layout) {
          this.changeViewLayout(layout);
        }
        return;
      }
      
      // Sort direction toggle
      if (target.closest('[data-action="toggle-sort"]')) {
        this.toggleSortDirection();
        return;
      }
      
      // Video selection (for bulk operations)
      if (target.closest('.video-select')) {
        const videoId = target.closest('.video-item')?.getAttribute('data-video-id');
        if (videoId) {
          this.toggleVideoSelection(videoId);
        }
        return;
      }
      
      // Select all checkbox
      if (target.closest('.select-all')) {
        this.toggleSelectAll();
        return;
      }
      
      // Clear selection
      if (target.closest('.clear-selection')) {
        this.clearSelection();
        return;
      }
      
      // Bulk actions (Requirement 4.7)
      if (target.closest('.bulk-action')) {
        const action = target.closest('.bulk-action')?.getAttribute('data-action');
        if (action) {
          this.handleBulkAction(action);
        }
        return;
      }
    });

    // Sort field change
    document.addEventListener('change', (e) => {
      const target = e.target as HTMLSelectElement;
      if (target.matches('[data-field="sort"]')) {
        this.changeSortField(target.value as SortField);
        return;
      }
      
      if (target.matches('.filter-processing')) {
        this.toggleProcessingFilter(target.checked);
        return;
      }
    });

    // Search input
    document.addEventListener('input', (e) => {
      const target = e.target as HTMLInputElement;
      if (target.matches('.search-input')) {
        this.handleSearch(target.value);
        return;
      }
    });
  }