/**
 * Folder Breadcrumb Navigation Component
 * 
 * Provides navigation breadcrumbs showing the current folder path
 * with clickable navigation and visual hierarchy indicators.
 * 
 * Validates: Requirements 4.5 (navigation breadcrumbs and quick access)
 */

import type { FolderDto, ProjectDto } from '@streetstudio/shared';
import { logger } from '../../app/client-logger.js';

export interface BreadcrumbItem {
  id: string | null;
  name: string;
  type: 'project' | 'folder';
  depth?: number;
}

export interface FolderBreadcrumbsConfig {
  project: ProjectDto;
  currentPath: BreadcrumbItem[];
  onNavigate?: (folderId: string | null) => void;
}

export class FolderBreadcrumbs {
  private container: HTMLElement | null = null;
  private config: FolderBreadcrumbsConfig;
  
  constructor(config: FolderBreadcrumbsConfig) {
    this.config = config;
  }

  public getElement(): HTMLElement {
    if (!this.container) {
      this.container = this.createContainer();
    }
    return this.container;
  }

  private createContainer(): HTMLElement {
    const container = document.createElement('nav');
    container.className = 'folder-breadcrumbs flex items-center space-x-2 text-sm py-3 px-4 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700';
    container.setAttribute('aria-label', 'Folder navigation');
    
    this.renderBreadcrumbs();
    return container;
  }

  private renderBreadcrumbs(): void {
    if (!this.container) return;

    const items = [
      {
        id: null,
        name: this.config.project.name,
        type: 'project' as const,
        depth: -1
      },
      ...this.config.currentPath
    ];

    const breadcrumbHtml = items.map((item, index) => {
      const isLast = index === items.length - 1;
      const isClickable = !isLast;
      
      return `
        <div class="flex items-center">
          ${index > 0 ? `
            <svg class="flex-shrink-0 w-4 h-4 text-gray-400 mx-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
            </svg>
          ` : ''}
          
          <div class="flex items-center min-w-0">
            <!-- Item icon -->
            <div class="flex-shrink-0 mr-2">
              ${item.type === 'project' ? `
                <svg class="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                        d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/>
                </svg>
              ` : `
                <svg class="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                        d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-5l-2-2H5a2 2 0 00-2 2z"/>
                </svg>
              `}
            </div>
            
            <!-- Item name -->
            ${isClickable ? `
              <button class="text-left truncate hover:text-blue-600 dark:hover:text-blue-400 transition-colors focus:outline-none focus:underline ${
                isLast ? 'font-medium text-gray-900 dark:text-white' : 'text-gray-600 dark:text-gray-400'
              }"
                      data-navigate="${item.id || 'root'}"
                      title="${item.name}${item.depth !== undefined ? ` (Level ${item.depth + 1})` : ''}">
                ${item.name}
              </button>
            ` : `
              <span class="font-medium text-gray-900 dark:text-white truncate" 
                    title="${item.name}${item.depth !== undefined ? ` (Level ${item.depth + 1})` : ''}">
                ${item.name}
              </span>
            `}
            
            <!-- Depth indicator for folders -->
            ${item.type === 'folder' && item.depth !== undefined ? `
              <span class="ml-2 text-xs text-gray-400 bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">
                L${item.depth + 1}
              </span>
            ` : ''}
          </div>
        </div>
      `;
    }).join('');

    // Add quick actions
    const quickActions = `
      <div class="ml-auto flex items-center space-x-2">
        <!-- Path depth indicator -->
        <span class="text-xs text-gray-500 dark:text-gray-400">
          ${items.length - 1} level${items.length - 1 !== 1 ? 's' : ''} deep
        </span>
        
        <!-- Copy path button -->
        <button class="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded transition-colors"
                data-copy-path
                title="Copy folder path">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                  d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/>
          </svg>
        </button>
        
        <!-- Go up one level button -->
        ${items.length > 1 ? `
          <button class="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded transition-colors"
                  data-go-up
                  title="Go up one level">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                    d="M7 16l-4-4m0 0l4-4m-4 4h18"/>
            </svg>
          </button>
        ` : ''}
      </div>
    `;

    this.container.innerHTML = breadcrumbHtml + quickActions;
    this.attachEventListeners();
  }

  private attachEventListeners(): void {
    if (!this.container) return;

    // Navigation clicks
    this.container.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      
      // Navigate to breadcrumb item
      const navButton = target.closest('[data-navigate]');
      if (navButton) {
        const itemId = navButton.getAttribute('data-navigate');
        const folderId = itemId === 'root' ? null : itemId;
        this.navigateTo(folderId);
        return;
      }
      
      // Copy path
      const copyButton = target.closest('[data-copy-path]');
      if (copyButton) {
        this.copyPathToClipboard();
        return;
      }
      
      // Go up one level
      const upButton = target.closest('[data-go-up]');
      if (upButton) {
        this.goUpOneLevel();
        return;
      }
    });
  }

  private navigateTo(folderId: string | null): void {
    this.config.onNavigate?.(folderId);
    
    logger.debug('Breadcrumb navigation', { 
      folderId, 
      feature: 'folder-breadcrumbs' 
    });
  }

  private copyPathToClipboard(): void {
    const pathString = [
      this.config.project.name,
      ...this.config.currentPath.map(item => item.name)
    ].join(' / ');
    
    navigator.clipboard?.writeText(pathString).then(() => {
      // Show temporary feedback
      this.showCopyFeedback();
      
      logger.debug('Path copied to clipboard', { 
        path: pathString, 
        feature: 'folder-breadcrumbs' 
      });
    }).catch(() => {
      // Fallback for browsers without clipboard API
      this.fallbackCopyToClipboard(pathString);
    });
  }

  private showCopyFeedback(): void {
    const copyButton = this.container?.querySelector('[data-copy-path]');
    if (!copyButton) return;

    const originalTitle = copyButton.getAttribute('title');
    copyButton.setAttribute('title', 'Copied!');
    copyButton.classList.add('text-green-600', 'dark:text-green-400');
    
    setTimeout(() => {
      copyButton.setAttribute('title', originalTitle || 'Copy folder path');
      copyButton.classList.remove('text-green-600', 'dark:text-green-400');
    }, 2000);
  }

  private fallbackCopyToClipboard(text: string): void {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    textArea.style.top = '-999999px';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    
    try {
      document.execCommand('copy');
      this.showCopyFeedback();
    } catch (err) {
      console.warn('Could not copy path to clipboard');
    }
    
    document.body.removeChild(textArea);
  }

  private goUpOneLevel(): void {
    if (this.config.currentPath.length === 0) return;
    
    const parentItem = this.config.currentPath[this.config.currentPath.length - 2];
    const parentFolderId = parentItem ? parentItem.id : null;
    
    this.navigateTo(parentFolderId);
  }

  // Public methods
  public updatePath(newPath: BreadcrumbItem[]): void {
    this.config.currentPath = newPath;
    this.renderBreadcrumbs();
  }

  public getCurrentPath(): BreadcrumbItem[] {
    return [...this.config.currentPath];
  }

  public getPathString(): string {
    return [
      this.config.project.name,
      ...this.config.currentPath.map(item => item.name)
    ].join(' / ');
  }
}