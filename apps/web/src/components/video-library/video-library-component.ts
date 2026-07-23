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
  private changeViewLayout(layout: ViewLayout): void {
    this.state.layout = layout;
    this.saveUserPreference('viewLayout', layout);
    this.updateViewToggleButtons();
    this.renderVideoContent();
  }

  private toggleSortDirection(): void {
    this.state.sortDirection = this.state.sortDirection === 'asc' ? 'desc' : 'asc';
    this.updateSortButton();
    this.renderVideoContent();
  }

  private changeSortField(field: SortField): void {
    this.state.sortField = field;
    this.renderVideoContent();
  }

  private handleSearch(query: string): void {
    this.state.filterText = query.trim();
    this.renderVideoContent();
  }

  private toggleProcessingFilter(enabled: boolean): void {
    this.state.showProcessingOnly = enabled;
    this.renderVideoContent();
  }

  private toggleVideoSelection(videoId: string): void {
    if (this.state.selectedVideos.has(videoId)) {
      this.state.selectedVideos.delete(videoId);
    } else {
      this.state.selectedVideos.add(videoId);
    }
    
    this.updateBulkOperationsBar();
    this.updateVideoSelectionUI();
  }

  private toggleSelectAll(): void {
    const filteredVideos = this.getFilteredAndSortedVideos();
    const allSelected = filteredVideos.every(v => this.state.selectedVideos.has(v.id));
    
    if (allSelected) {
      // Clear all selections
      filteredVideos.forEach(v => this.state.selectedVideos.delete(v.id));
    } else {
      // Select all filtered videos
      filteredVideos.forEach(v => this.state.selectedVideos.add(v.id));
    }
    
    this.updateBulkOperationsBar();
    this.updateVideoSelectionUI();
  }

  private clearSelection(): void {
    this.state.selectedVideos.clear();
    this.updateBulkOperationsBar();
    this.updateVideoSelectionUI();
  }

  private handleBulkAction(action: string): void {
    const selectedVideoIds = Array.from(this.state.selectedVideos);
    
    if (selectedVideoIds.length === 0) {
      return;
    }

    // Confirmation dialog for destructive actions
    if (action === 'delete') {
      const confirmed = confirm(`Are you sure you want to delete ${selectedVideoIds.length} video(s)?`);
      if (!confirmed) return;
    }

    this.bulkController.performAction(action, selectedVideoIds)
      .then(() => {
        this.clearSelection();
        this.loadVideosForProject(); // Refresh the list
      })
      .catch(error => {
        console.error(`Bulk action ${action} failed:`, error);
        // Show error notification
      });
  }

  private renderVideoContent(): void {
    const contentArea = this.element?.querySelector('[data-video-content]') as HTMLElement;
    if (!contentArea) return;

    const filteredVideos = this.getFilteredAndSortedVideos();
    
    // Clear current content
    contentArea.innerHTML = '';
    
    if (filteredVideos.length === 0) {
      this.renderEmptyState(contentArea);
      return;
    }
    
    // Render based on current layout (Requirement 4.3)
    switch (this.state.layout) {
      case 'list':
        this.renderListView(contentArea, filteredVideos);
        break;
      case 'grid':
        this.renderGridView(contentArea, filteredVideos);
        break;
      case 'timeline':
        this.renderTimelineView(contentArea, filteredVideos);
        break;
    }
  }
  private renderListView(container: HTMLElement, videos: VideoDto[]): void {
    const listContainer = document.createElement('div');
    listContainer.className = 'divide-y divide-gray-200 dark:divide-gray-700';
    
    // Header with select all checkbox
    const header = document.createElement('div');
    header.className = 'flex items-center p-4 bg-gray-50 dark:bg-gray-800 font-medium text-sm text-gray-700 dark:text-gray-300';
    header.innerHTML = `
      <div class="w-10">
        <input type="checkbox" class="select-all rounded border-gray-300 dark:border-gray-600">
      </div>
      <div class="flex-1">Name</div>
      <div class="w-24">Duration</div>
      <div class="w-32">Status</div>
      <div class="w-40">Created</div>
      <div class="w-20">Actions</div>
    `;
    
    listContainer.appendChild(header);
    
    // Video rows
    videos.forEach(video => {
      const row = document.createElement('div');
      row.className = 'video-item flex items-center p-4 hover:bg-gray-50 dark:hover:bg-gray-800';
      row.setAttribute('data-video-id', video.id);
      
      const isSelected = this.state.selectedVideos.has(video.id);
      const metadata = this.metadataRenderer.render(video);
      
      row.innerHTML = `
        <div class="w-10">
          <input type="checkbox" class="video-select rounded border-gray-300 dark:border-gray-600" 
                 ${isSelected ? 'checked' : ''}>
        </div>
        <div class="flex-1 flex items-center gap-3">
          <div class="w-16 h-12 bg-gray-200 dark:bg-gray-700 rounded overflow-hidden flex-shrink-0">
            <img src="/api/videos/${video.id}/thumbnail" alt="Thumbnail" class="w-full h-full object-cover"
                 onerror="this.style.display='none'">
          </div>
          <div class="flex-1 min-w-0">
            <h3 class="text-sm font-medium text-gray-900 dark:text-white truncate">${video.title}</h3>
            <p class="text-sm text-gray-500 dark:text-gray-400">${video.id}</p>
          </div>
        </div>
        <div class="w-24 text-sm text-gray-600 dark:text-gray-400">
          ${this.formatDuration(video.durationSeconds)}
        </div>
        <div class="w-32">
          ${metadata.statusBadge}
        </div>
        <div class="w-40 text-sm text-gray-600 dark:text-gray-400">
          ${this.formatDate(video.createdAt)}
        </div>
        <div class="w-20">
          <button class="text-blue-600 dark:text-blue-400 hover:underline text-sm" 
                  onclick="openVideo('${video.id}')">
            View
          </button>
        </div>
      `;
      
      listContainer.appendChild(row);
    });
    
    container.appendChild(listContainer);
  }

  private renderGridView(container: HTMLElement, videos: VideoDto[]): void {
    const gridContainer = document.createElement('div');
    gridContainer.className = 'grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 p-4';
    
    videos.forEach(video => {
      const card = document.createElement('div');
      card.className = 'video-item bg-white dark:bg-gray-800 rounded-lg shadow hover:shadow-md transition-shadow border border-gray-200 dark:border-gray-700';
      card.setAttribute('data-video-id', video.id);
      
      const isSelected = this.state.selectedVideos.has(video.id);
      const metadata = this.metadataRenderer.render(video);
      
      card.innerHTML = `
        <div class="relative">
          <div class="aspect-video bg-gray-200 dark:bg-gray-700 rounded-t-lg overflow-hidden">
            <img src="/api/videos/${video.id}/thumbnail" alt="Thumbnail" class="w-full h-full object-cover"
                 onerror="this.style.display='none'">
          </div>
          <div class="absolute top-2 left-2">
            <input type="checkbox" class="video-select rounded border-white bg-white/80 backdrop-blur-sm" 
                   ${isSelected ? 'checked' : ''}>
          </div>
          <div class="absolute bottom-2 right-2">
            <span class="bg-black/70 text-white text-xs px-2 py-1 rounded">
              ${this.formatDuration(video.durationSeconds)}
            </span>
          </div>
        </div>
        <div class="p-3">
          <h3 class="font-medium text-gray-900 dark:text-white truncate mb-1">${video.title}</h3>
          <div class="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 mb-2">
            <span>${this.formatDate(video.createdAt)}</span>
            ${metadata.statusBadge}
          </div>
          ${metadata.progressBar}
          <button class="w-full mt-2 px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm"
                  onclick="openVideo('${video.id}')">
            View Video
          </button>
        </div>
      `;
      
      gridContainer.appendChild(card);
    });
    
    container.appendChild(gridContainer);
  }
  private renderTimelineView(container: HTMLElement, videos: VideoDto[]): void {
    const timelineContainer = document.createElement('div');
    timelineContainer.className = 'timeline-view p-4';
    
    // Group videos by date
    const groupedVideos = this.groupVideosByDate(videos);
    
    Object.entries(groupedVideos).forEach(([date, dayVideos]) => {
      const dateGroup = document.createElement('div');
      dateGroup.className = 'mb-8';
      
      const dateHeader = document.createElement('div');
      dateHeader.className = 'flex items-center gap-4 mb-4';
      dateHeader.innerHTML = `
        <h3 class="text-lg font-semibold text-gray-900 dark:text-white">${date}</h3>
        <div class="flex-1 h-px bg-gray-200 dark:bg-gray-700"></div>
        <span class="text-sm text-gray-500 dark:text-gray-400">${dayVideos.length} videos</span>
      `;
      
      const videosList = document.createElement('div');
      videosList.className = 'space-y-3';
      
      dayVideos.forEach(video => {
        const item = document.createElement('div');
        item.className = 'video-item flex items-center gap-4 p-3 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700';
        item.setAttribute('data-video-id', video.id);
        
        const isSelected = this.state.selectedVideos.has(video.id);
        const metadata = this.metadataRenderer.render(video);
        
        item.innerHTML = `
          <input type="checkbox" class="video-select rounded border-gray-300 dark:border-gray-600" 
                 ${isSelected ? 'checked' : ''}>
          <div class="w-20 h-14 bg-gray-200 dark:bg-gray-700 rounded overflow-hidden flex-shrink-0">
            <img src="/api/videos/${video.id}/thumbnail" alt="Thumbnail" class="w-full h-full object-cover"
                 onerror="this.style.display='none'">
          </div>
          <div class="flex-1 min-w-0">
            <h3 class="font-medium text-gray-900 dark:text-white truncate">${video.title}</h3>
            <div class="flex items-center gap-4 mt-1">
              <span class="text-sm text-gray-500 dark:text-gray-400">${this.formatDuration(video.durationSeconds)}</span>
              <span class="text-sm text-gray-500 dark:text-gray-400">${this.formatTime(video.createdAt)}</span>
              ${metadata.statusBadge}
            </div>
            ${metadata.progressBar}
          </div>
          <button class="px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm"
                  onclick="openVideo('${video.id}')">
            View
          </button>
        `;
        
        videosList.appendChild(item);
      });
      
      dateGroup.appendChild(dateHeader);
      dateGroup.appendChild(videosList);
      timelineContainer.appendChild(dateGroup);
    });
    
    container.appendChild(timelineContainer);
  }

  private renderEmptyState(container: HTMLElement): void {
    container.innerHTML = `
      <div class="text-center py-12">
        <svg class="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" 
                d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"/>
        </svg>
        <h3 class="mt-2 text-sm font-medium text-gray-900 dark:text-white">No videos found</h3>
        <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
          ${this.state.filterText ? 'Try adjusting your search or filters.' : 'Get started by uploading your first video.'}
        </p>
        ${!this.state.filterText ? `
          <div class="mt-6">
            <button type="button" class="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500">
              <svg class="-ml-1 mr-2 h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
                <path fill-rule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z"/>
              </svg>
              Upload Video
            </button>
          </div>
        ` : ''}
      </div>
    `;
  }