/**
 * Enhanced Breadcrumb Navigation Component
 * 
 * Supports deep application states, workspace context, and interactive navigation
 */

import type { BreadcrumbItem } from '../navigation-controller';
import { logger } from '../../client-logger';

export interface EnhancedBreadcrumbItem extends BreadcrumbItem {
  icon?: string;
  action?: string;
  metadata?: Record<string, any>;
  isDropdown?: boolean;
  dropdownItems?: BreadcrumbItem[];
}

export class EnhancedBreadcrumbNavigation {
  private container: HTMLElement;
  private currentBreadcrumbs: EnhancedBreadcrumbItem[] = [];
  private maxVisibleItems = 5;
  private isCompact = false;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  public initialize(): void {
    this.setupResponsive();
    this.render([]);
    this.setupEventListeners();
  }

  public updateBreadcrumbs(breadcrumbs: BreadcrumbItem[]): void {
    this.currentBreadcrumbs = breadcrumbs.map(item => ({
      ...item,
      isDropdown: false,
      dropdownItems: []
    }));
    this.render(this.currentBreadcrumbs);
  }

  /**
   * Update breadcrumbs with enhanced metadata and dropdown support
   */
  public updateEnhancedBreadcrumbs(breadcrumbs: EnhancedBreadcrumbItem[]): void {
    this.currentBreadcrumbs = breadcrumbs;
    this.render(breadcrumbs);
  }

  /**
   * Setup responsive behavior
   */
  private setupResponsive(): void {
    const checkWidth = () => {
      this.isCompact = window.innerWidth < 768; // md breakpoint
      this.maxVisibleItems = this.isCompact ? 2 : 5;
      this.render(this.currentBreadcrumbs);
    };

    window.addEventListener('resize', checkWidth);
    checkWidth();
  }

  /**
   * Render breadcrumb navigation
   */
  private render(breadcrumbs: EnhancedBreadcrumbItem[]): void {
    if (breadcrumbs.length === 0) {
      this.container.innerHTML = '';
      return;
    }

    const visibleBreadcrumbs = this.getVisibleBreadcrumbs(breadcrumbs);
    
    this.container.innerHTML = `
      <nav class="flex items-center space-x-1 text-sm" aria-label="Breadcrumb">
        <ol class="flex items-center space-x-1">
          ${visibleBreadcrumbs.map((item, index) => this.renderBreadcrumbItem(item, index, visibleBreadcrumbs.length)).join('')}
        </ol>
      </nav>
    `;
  }

  /**
   * Get visible breadcrumbs with overflow handling
   */
  private getVisibleBreadcrumbs(breadcrumbs: EnhancedBreadcrumbItem[]): EnhancedBreadcrumbItem[] {
    if (breadcrumbs.length <= this.maxVisibleItems) {
      return breadcrumbs;
    }

    // Always show first and last items, with overflow in middle
    const first = breadcrumbs[0];
    const last = breadcrumbs[breadcrumbs.length - 1];
    const remaining = breadcrumbs.slice(1, -1);
    
    if (remaining.length > this.maxVisibleItems - 2) {
      // Create overflow item
      const overflowItem: EnhancedBreadcrumbItem = {
        label: '...',
        current: false,
        isDropdown: true,
        dropdownItems: remaining.slice(0, -1) // All except the one we'll show
      };
      
      const lastVisible = remaining[remaining.length - 1];
      return [first, overflowItem, lastVisible, last];
    }

    return breadcrumbs;
  }

  /**
   * Render individual breadcrumb item
   */
  private renderBreadcrumbItem(item: EnhancedBreadcrumbItem, index: number, totalLength: number): string {
    const isLast = index === totalLength - 1;
    const hasHref = item.href && !item.current;

    return `
      <li class="flex items-center">
        ${index > 0 ? this.renderSeparator() : ''}
        
        ${item.isDropdown ? this.renderDropdownItem(item) : this.renderRegularItem(item, isLast, hasHref)}
      </li>
    `;
  }

  /**
   * Render separator between breadcrumb items
   */
  private renderSeparator(): string {
    return `
      <svg class="flex-shrink-0 h-4 w-4 text-gray-400 mx-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
      </svg>
    `;
  }

  /**
   * Render dropdown breadcrumb item for overflow
   */
  private renderDropdownItem(item: EnhancedBreadcrumbItem): string {
    return `
      <div class="relative group">
        <button
          type="button"
          class="flex items-center px-2 py-1 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          data-breadcrumb-dropdown="true"
        >
          <span class="font-medium">...</span>
          <svg class="ml-1 h-3 w-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        
        <!-- Dropdown menu -->
        <div class="hidden group-hover:block absolute top-full left-0 mt-1 w-56 rounded-md shadow-lg bg-white dark:bg-gray-800 ring-1 ring-black ring-opacity-5 focus:outline-none z-50">
          <div class="py-1">
            ${(item.dropdownItems || []).map(dropdownItem => `
              <a
                href="${dropdownItem.href || '#'}"
                class="block px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"
                data-breadcrumb-action="${dropdownItem.action || 'navigate'}"
              >
                <div class="flex items-center">
                  ${dropdownItem.icon ? `
                    <svg class="h-4 w-4 mr-3 text-gray-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      ${this.getIconPath(dropdownItem.icon)}
                    </svg>
                  ` : ''}
                  <span class="truncate">${dropdownItem.label}</span>
                </div>
              </a>
            `).join('')}
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Render regular breadcrumb item
   */
  private renderRegularItem(item: EnhancedBreadcrumbItem, isLast: boolean, hasHref: boolean): string {
    const baseClasses = `flex items-center px-2 py-1 rounded-md transition-colors duration-150 ${
      item.current 
        ? 'text-gray-900 dark:text-gray-100 font-medium bg-gray-100 dark:bg-gray-700' 
        : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-700'
    }`;

    const content = `
      <div class="flex items-center max-w-40">
        ${item.icon ? `
          <svg class="flex-shrink-0 h-4 w-4 mr-2 text-gray-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            ${this.getIconPath(item.icon)}
          </svg>
        ` : ''}
        <span class="truncate font-medium">${item.label}</span>
        ${item.metadata?.count ? `
          <span class="ml-1 inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300">
            ${item.metadata.count}
          </span>
        ` : ''}
      </div>
    `;

    if (hasHref) {
      return `
        <a
          href="${item.href}"
          class="${baseClasses}"
          data-breadcrumb-action="${item.action || 'navigate'}"
          ${item.current ? 'aria-current="page"' : ''}
        >
          ${content}
        </a>
      `;
    } else {
      return `
        <span class="${baseClasses}" ${item.current ? 'aria-current="page"' : ''}>
          ${content}
        </span>
      `;
    }
  }

  /**
   * Get SVG path for icon
   */
  private getIconPath(iconName: string): string {
    const icons: Record<string, string> = {
      home: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />',
      organization: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-4m-5 0H3m2 0h4M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 8v-2a2 2 0 012-2h2a2 2 0 012 2v2" />',
      workspace: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />',
      project: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />',
      folder: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />',
      video: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />',
      settings: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />'
    };

    return icons[iconName] || icons.folder;
  }

  /**
   * Setup event listeners
   */
  private setupEventListeners(): void {
    this.container.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      const link = target.closest('[data-breadcrumb-action]') as HTMLElement;
      
      if (!link) return;

      const action = link.dataset.breadcrumbAction;
      const href = link.getAttribute('href');

      // Prevent default for hash links or custom actions
      if (href === '#' || action !== 'navigate') {
        e.preventDefault();
      }

      // Handle custom actions
      this.handleBreadcrumbAction(action!, link, e);
    });

    // Handle keyboard navigation
    this.container.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        const target = e.target as HTMLElement;
        if (target.hasAttribute('data-breadcrumb-action')) {
          e.preventDefault();
          target.click();
        }
      }
    });
  }

  /**
   * Handle breadcrumb action
   */
  private handleBreadcrumbAction(action: string, element: HTMLElement, event: Event): void {
    switch (action) {
      case 'navigate':
        // Default navigation - let browser handle it
        break;

      case 'workspace-switch':
        const workspaceId = element.dataset.workspaceId;
        if (workspaceId) {
          this.dispatchWorkspaceSwitch(workspaceId);
        }
        break;

      case 'project-switch':
        const projectId = element.dataset.projectId;
        if (projectId) {
          this.dispatchProjectSwitch(projectId);
        }
        break;

      case 'folder-switch':
        const folderId = element.dataset.folderId;
        if (folderId) {
          this.dispatchFolderSwitch(folderId);
        }
        break;

      default:
        logger.warn('Unknown breadcrumb action', { action });
    }
  }

  /**
   * Dispatch workspace switch event
   */
  private dispatchWorkspaceSwitch(workspaceId: string): void {
    const event = new CustomEvent('workspace:switch', {
      detail: { workspaceId }
    });
    window.dispatchEvent(event);
  }

  /**
   * Dispatch project switch event
   */
  private dispatchProjectSwitch(projectId: string): void {
    const event = new CustomEvent('project:switch', {
      detail: { projectId }
    });
    window.dispatchEvent(event);
  }

  /**
   * Dispatch folder switch event
   */
  private dispatchFolderSwitch(folderId: string): void {
    const event = new CustomEvent('folder:switch', {
      detail: { folderId }
    });
    window.dispatchEvent(event);
  }

  /**
   * Set breadcrumbs from workspace context
   */
  public setWorkspaceContext(context: {
    organization?: { name: string; href?: string };
    workspace?: { name: string; href?: string };
    project?: { name: string; href?: string };
    folder?: { name: string; href?: string };
    current?: { name: string; href?: string };
  }): void {
    const breadcrumbs: EnhancedBreadcrumbItem[] = [];

    // Add organization
    if (context.organization) {
      breadcrumbs.push({
        label: context.organization.name,
        href: context.organization.href || '/dashboard',
        icon: 'organization',
        current: false
      });
    }

    // Add workspace
    if (context.workspace) {
      breadcrumbs.push({
        label: context.workspace.name,
        href: context.workspace.href,
        icon: 'workspace',
        current: false
      });
    }

    // Add project
    if (context.project) {
      breadcrumbs.push({
        label: context.project.name,
        href: context.project.href,
        icon: 'project',
        current: false
      });
    }

    // Add folder
    if (context.folder) {
      breadcrumbs.push({
        label: context.folder.name,
        href: context.folder.href,
        icon: 'folder',
        current: false
      });
    }

    // Add current page
    if (context.current) {
      breadcrumbs.push({
        label: context.current.name,
        href: context.current.href,
        current: true
      });
    }

    this.updateEnhancedBreadcrumbs(breadcrumbs);
  }

  /**
   * Clear all breadcrumbs
   */
  public clear(): void {
    this.currentBreadcrumbs = [];
    this.render([]);
  }

  public destroy(): void {
    this.container.innerHTML = '';
  }
}