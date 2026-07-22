/**
 * Breadcrumb Navigation Component
 * 
 * Provides breadcrumb navigation for deep application states
 */

import type { BreadcrumbItem } from '../navigation-controller';

export class BreadcrumbNavigation {
  private container: HTMLElement;
  private breadcrumbs: BreadcrumbItem[] = [];

  constructor(container: HTMLElement) {
    this.container = container;
  }

  /**
   * Initialize breadcrumb navigation
   */
  public initialize(): void {
    this.render();
    this.setupAccessibility();
  }

  /**
   * Update breadcrumbs
   */
  public updateBreadcrumbs(breadcrumbs: BreadcrumbItem[]): void {
    this.breadcrumbs = breadcrumbs;
    this.render();
  }

  /**
   * Clean up resources
   */
  public destroy(): void {
    this.container.innerHTML = '';
  }

  /**
   * Render breadcrumb navigation
   */
  private render(): void {
    if (this.breadcrumbs.length === 0) {
      this.container.style.display = 'none';
      return;
    }

    this.container.style.display = 'block';
    this.container.innerHTML = `
      <nav class="flex" aria-label="Breadcrumb">
        <ol class="flex items-center space-x-2">
          ${this.breadcrumbs.map((item, index) => this.renderBreadcrumbItem(item, index)).join('')}
        </ol>
      </nav>
    `;
  }

  /**
   * Render individual breadcrumb item
   */
  private renderBreadcrumbItem(item: BreadcrumbItem, index: number): string {
    const isLast = index === this.breadcrumbs.length - 1;
    const isFirst = index === 0;

    if (isLast || !item.href) {
      // Current page or non-linkable item
      return `
        <li class="flex items-center">
          ${!isFirst ? this.renderSeparator() : ''}
          <span class="ml-2 text-sm font-medium text-gray-900 dark:text-white" aria-current="page">
            ${this.escapeHtml(item.label)}
          </span>
        </li>
      `;
    }

    // Linkable breadcrumb item
    return `
      <li class="flex items-center">
        ${!isFirst ? this.renderSeparator() : ''}
        <a
          href="${item.href}"
          class="ml-2 text-sm font-medium text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded"
          data-breadcrumb-link="${item.href}"
        >
          ${this.escapeHtml(item.label)}
        </a>
      </li>
    `;
  }

  /**
   * Render breadcrumb separator
   */
  private renderSeparator(): string {
    return `
      <div class="flex items-center">
        <svg class="flex-shrink-0 h-4 w-4 text-gray-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path fill-rule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clip-rule="evenodd" />
        </svg>
      </div>
    `;
  }

  /**
   * Setup accessibility features
   */
  private setupAccessibility(): void {
    // Add click handlers for breadcrumb links
    this.container.addEventListener('click', (e) => {
      const link = (e.target as HTMLElement).closest('[data-breadcrumb-link]') as HTMLAnchorElement;
      if (link) {
        e.preventDefault();
        const href = link.dataset.breadcrumbLink!;
        
        // Dispatch navigation event
        const event = new CustomEvent('navigate', { detail: { href } });
        window.dispatchEvent(event);
      }
    });

    // Keyboard navigation
    this.container.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        const target = e.target as HTMLElement;
        if (target.hasAttribute('data-breadcrumb-link')) {
          e.preventDefault();
          target.click();
        }
      }
    });
  }

  /**
   * Escape HTML to prevent XSS
   */
  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}