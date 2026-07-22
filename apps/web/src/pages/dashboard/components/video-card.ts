/**
 * Video Card Component
 * 
 * Displays video information with thumbnail, metadata, duration, and comment count
 * in a horizontal card layout for the recent videos section.
 */

import type { VideoDto } from '@streetstudio/shared';
import { formatRelativeTime, formatDuration } from '../../../utils/format-time.js';

export class VideoCard {
  private element: HTMLElement;
  private video: VideoDto;

  constructor(video: VideoDto) {
    this.video = video;
    this.element = document.createElement('div');
    this.render();
    this.setupEventListeners();
  }

  public getElement(): HTMLElement {
    return this.element;
  }

  private render(): void {
    this.element.className = 'group cursor-pointer';
    this.element.setAttribute('data-video-id', this.video.id);
    
    this.element.innerHTML = `
      <div class="flex items-center p-3 bg-gray-50 dark:bg-gray-700 rounded-lg transition-colors group-hover:bg-gray-100 dark:group-hover:bg-gray-600">
        <!-- Video Thumbnail -->
        <div class="flex-shrink-0 w-20 h-12 bg-gray-200 dark:bg-gray-600 rounded overflow-hidden mr-3">
          ${this.video.thumbnailUrl ? `
            <img 
              src="${this.video.thumbnailUrl}" 
              alt="${this.video.title} thumbnail"
              class="w-full h-full object-cover"
              loading="lazy"
            />
          ` : `
            <div class="w-full h-full flex items-center justify-center">
              <svg class="w-4 h-4 text-gray-400 dark:text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.828 14.828a4 4 0 01-5.656 0M9 10h1m4 0h1m-6 4h8m-3-9a9 9 0 110 18 9 9 0 010-18z"></path>
              </svg>
            </div>
          `}
          
          <!-- Duration overlay -->
          ${this.video.duration ? `
            <div class="relative -mt-6 mr-1 flex justify-end">
              <span class="bg-black bg-opacity-70 text-white text-xs px-1 py-0.5 rounded text-right">
                ${formatDuration(this.video.duration)}
              </span>
            </div>
          ` : ''}
        </div>

        <!-- Video Info -->
        <div class="flex-1 min-w-0">
          <h3 class="text-sm font-medium text-gray-900 dark:text-white truncate mb-1">
            ${this.escapeHtml(this.video.title)}
          </h3>
          
          ${this.video.description ? `
            <p class="text-xs text-gray-600 dark:text-gray-400 line-clamp-1 mb-1">
              ${this.escapeHtml(this.video.description)}
            </p>
          ` : ''}

          <!-- Video Metadata -->
          <div class="flex items-center space-x-3 text-xs text-gray-500 dark:text-gray-400">
            ${this.video.commentCount ? `
              <span class="flex items-center" data-comment-count>
                <svg class="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"></path>
                </svg>
                ${this.video.commentCount} comments
              </span>
            ` : ''}
            
            ${this.video.viewCount ? `
              <span class="flex items-center">
                <svg class="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path>
                </svg>
                ${this.video.viewCount} views
              </span>
            ` : ''}
            
            <span>
              ${formatRelativeTime(this.video.createdAt)}
            </span>
          </div>
        </div>

        <!-- Status Indicator -->
        <div class="flex-shrink-0 ml-3">
          ${this.renderStatusIndicator()}
        </div>
      </div>
    `;
  }
  private renderStatusIndicator(): string {
    switch (this.video.status) {
      case 'ready':
        return `
          <div class="w-2 h-2 bg-green-400 rounded-full" title="Video is ready to view"></div>
        `;
      case 'processing':
        return `
          <div class="w-2 h-2 bg-yellow-400 rounded-full animate-pulse" title="Video is processing"></div>
        `;
      case 'uploading':
        return `
          <div class="w-2 h-2 bg-blue-400 rounded-full animate-pulse" title="Video is uploading"></div>
        `;
      case 'error':
        return `
          <div class="w-2 h-2 bg-red-400 rounded-full" title="Video processing failed"></div>
        `;
      default:
        return `
          <div class="w-2 h-2 bg-gray-400 rounded-full" title="Unknown status"></div>
        `;
    }
  }

  private setupEventListeners(): void {
    this.element.addEventListener('click', () => {
      this.handleVideoClick();
    });

    this.element.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        this.handleVideoClick();
      }
    });

    // Make the element focusable
    this.element.tabIndex = 0;
    this.element.setAttribute('role', 'button');
    this.element.setAttribute('aria-label', `Open video ${this.video.title}`);
  }

  private handleVideoClick(): void {
    // Navigate to video review/detail page
    if (this.video.status === 'ready') {
      window.location.href = `/recordings/${this.video.id}/review`;
    } else {
      // For non-ready videos, go to the video detail page
      window.location.href = `/recordings/${this.video.id}`;
    }
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}