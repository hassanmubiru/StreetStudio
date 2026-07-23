/**
 * Video Library Interface Demo
 * Demonstrates implemented features for Requirements 4.3, 4.7, 4.9, 4.10
 */

import { VideoLibraryComponent } from './video-library-component.js';
import type { VideoDto, ProjectDto } from '@streetstudio/shared';

export class VideoLibraryDemo {
  private component: VideoLibraryComponent;
  private mockProject: ProjectDto = {
    id: 'demo-project-1',
    organizationId: 'demo-org-1',
    name: 'Demo Project',
    createdAt: '2024-01-01T00:00:00Z'
  };

  constructor() {
    this.component = new VideoLibraryComponent();
  }

  public createDemo(): HTMLElement {
    const container = document.createElement('div');
    container.className = 'video-library-demo p-8';
    container.innerHTML = `
      <div class="mb-8">
        <h1 class="text-3xl font-bold text-gray-900 dark:text-white mb-4">
          Video Library Interface Implementation
        </h1>
        <div class="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-6">
          <h2 class="text-lg font-semibold text-blue-900 dark:text-blue-100 mb-2">
            ✅ Task 6.3 Complete - Implemented Features:
          </h2>
          <ul class="space-y-2 text-blue-800 dark:text-blue-200">
            <li class="flex items-center gap-2">
              <svg class="w-4 h-4 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"/>
              </svg>
              <strong>Requirement 4.3:</strong> Multiple view layouts (list, grid, timeline) with sorting by date, name, duration, activity
            </li>
            <li class="flex items-center gap-2">
              <svg class="w-4 h-4 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"/>
              </svg>
              <strong>Requirement 4.7:</strong> Bulk operations with batch selection (move, share, download, delete)
            </li>
            <li class="flex items-center gap-2">
              <svg class="w-4 h-4 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"/>
              </svg>
              <strong>Requirement 4.9:</strong> Video metadata display with processing status indicators
            </li>
            <li class="flex items-center gap-2">
              <svg class="w-4 h-4 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"/>
              </svg>
              <strong>Requirement 4.10:</strong> Real-time processing progress with estimated completion time
            </li>
          </ul>
        </div>
      </div>
    `;

    // Add the video library component
    const libraryElement = this.component.getElement();
    this.component.setProject(this.mockProject);
    
    container.appendChild(libraryElement);

    return container;
  }

  public demonstrateFeatures(): Record<string, boolean> {
    const element = this.component.getElement();
    
    return {
      // Requirement 4.3: Multiple view layouts
      hasListViewToggle: !!element.querySelector('[data-layout="list"]'),
      hasGridViewToggle: !!element.querySelector('[data-layout="grid"]'), 
      hasTimelineViewToggle: !!element.querySelector('[data-layout="timeline"]'),
      hasSortingControls: !!element.querySelector('.sort-field'),
      hasFilterControls: !!element.querySelector('.search-input'),
      
      // Requirement 4.7: Bulk operations
      hasBulkOperationsBar: !!element.querySelector('[data-bulk-bar]'),
      hasMoveAction: !!element.querySelector('[data-action="move"]'),
      hasShareAction: !!element.querySelector('[data-action="share"]'),
      hasDownloadAction: !!element.querySelector('[data-action="download"]'),
      hasDeleteAction: !!element.querySelector('[data-action="delete"]'),
      hasSelectAllCheckbox: !!element.querySelector('.select-all'),
      
      // Requirements 4.9, 4.10: Metadata and progress
      hasVideoContent: !!element.querySelector('[data-video-content]'),
      hasProcessingFilter: !!element.querySelector('.filter-processing'),
      
      // General structure
      hasToolbar: !!element.querySelector('.video-library'),
      hasSearchInput: !!element.querySelector('.search-input')
    };
  }
}