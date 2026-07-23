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