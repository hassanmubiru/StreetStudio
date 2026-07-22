/**
 * Project Card Component
 * 
 * Displays project information with thumbnail, metadata, and member count
 * in a responsive card layout.
 */

import type { ProjectDto } from '@streetstudio/shared';
import { formatRelativeTime } from '../../../utils/format-time.js';

export class ProjectCard {
  private element: HTMLElement;
  private project: ProjectDto;

  constructor(project: ProjectDto) {
    this.project = project;
    this.element = document.createElement('div');
    this.render();
    this.setupEventListeners();
  }

  public getElement(): HTMLElement {
    return this.element;
  }

  private render(): void {
    this.element.className = 'group cursor-pointer';
    this.element.setAttribute('data-project-id', this.project.id);
    
    this.element.innerHTML = `
      <div class="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 transition-colors group-hover:bg-gray-100 dark:group-hover:bg-gray-600">
        <!-- Project Thumbnail -->
        <div class="w-full h-32 bg-gray-200 dark:bg-gray-600 rounded-lg mb-3 overflow-hidden">
          ${this.project.thumbnailUrl ? `
            <img 
              src="${this.project.thumbnailUrl}" 
              alt="${this.project.name} thumbnail"
              class="w-full h-full object-cover"
              loading="lazy"
            />
          ` : `
            <div class="w-full h-full flex items-center justify-center">
              <div class="w-12 h-12 bg-blue-100 dark:bg-blue-900 rounded-lg flex items-center justify-center">
                <svg class="w-6 h-6 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path>
                </svg>
              </div>
            </div>
          `}
        </div>

        <!-- Project Info -->
        <div class="min-w-0">
          <h3 class="text-sm font-medium text-gray-900 dark:text-white truncate mb-1">
            ${this.escapeHtml(this.project.name)}
          </h3>
          
          ${this.project.description ? `
            <p class="text-xs text-gray-600 dark:text-gray-400 line-clamp-2 mb-2">
              ${this.escapeHtml(this.project.description)}
            </p>
          ` : ''}

          <!-- Project Metadata -->
          <div class="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
            <span class="flex items-center">
              <svg class="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"></path>
              </svg>
              ${this.project.videoCount || 0} videos
            </span>
            
            <span class="flex items-center">
              <svg class="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"></path>
              </svg>
              ${this.project.memberCount || 0} members
            </span>
          </div>

          <!-- Last Updated -->
          <div class="mt-2 text-xs text-gray-500 dark:text-gray-400">
            Updated ${formatRelativeTime(this.project.updatedAt)}
          </div>
        </div>
      </div>
    `;
  }

  private setupEventListeners(): void {
    this.element.addEventListener('click', () => {
      this.handleProjectClick();
    });

    this.element.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        this.handleProjectClick();
      }
    });

    // Make the element focusable
    this.element.tabIndex = 0;
    this.element.setAttribute('role', 'button');
    this.element.setAttribute('aria-label', `Open project ${this.project.name}`);
  }

  private handleProjectClick(): void {
    // Navigate to project detail page
    window.location.href = `/projects/${this.project.id}`;
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}