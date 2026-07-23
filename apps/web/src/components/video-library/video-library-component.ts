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