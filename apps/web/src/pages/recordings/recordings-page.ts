/**
 * Recordings Page Component - Video Library Interface
 * Uses the VideoLibraryComponent for consistent video management experience
 */

import { VideoLibraryComponent } from '../../components/video-library/video-library-component.js';

export class RecordingsPage {
  private videoLibrary: VideoLibraryComponent;

  constructor() {
    this.videoLibrary = new VideoLibraryComponent();
  }

  public getElement(): HTMLElement {
    const container = document.createElement('div');
    container.className = 'p-8 h-full flex flex-col';
    container.setAttribute('data-main-content', '');
    
    // Header
    const header = document.createElement('div');
    header.className = 'mb-6';
    header.innerHTML = `
      <h1 class="text-2xl font-bold text-gray-900 dark:text-white mb-2">All Recordings</h1>
      <p class="text-gray-600 dark:text-gray-400">Browse and manage all your video recordings</p>
    `;
    
    // Video library component
    const libraryElement = this.videoLibrary.getElement();
    libraryElement.className = 'flex-1';
    
    container.appendChild(header);
    container.appendChild(libraryElement);
    
    return container;
  }
}