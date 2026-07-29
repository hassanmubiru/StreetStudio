/**
 * Search Page Component
 * 
 * Full-page search interface displaying results from global search queries.
 * Supports URL-based search (via ?q= parameter), result display with
 * previews, and integration with the global search modal.
 * 
 * Requirements: 14.1, 14.5
 */

import { SearchService, SearchResult, SearchResponse } from '../../services/search.js';

export class SearchPage {
  private element: HTMLElement;
  private searchService: SearchService;
  private query = '';
  private results: SearchResult[] = [];
  private isLoading = false;
  private totalCount = 0;

  constructor() {
    this.searchService = new SearchService({ debounceMs: 300 });
    this.element = document.createElement('div');
    this.element.className = 'p-8 max-w-5xl mx-auto';
    this.element.setAttribute('data-main-content', '');

    // Parse query from URL
    const urlParams = new URLSearchParams(window.location.search);
    this.query = urlParams.get('q') || '';

    this.render();

    if (this.query) {
      this.performSearch(this.query);
    }
  }

  public getElement(): HTMLElement {
    return this.element;
  }

  public destroy(): void {
    this.searchService.destroy();
  }

  private async performSearch(query: string): Promise<void> {
    this.isLoading = true;
    this.render();

    try {
      const response = await this.searchService.searchImmediate(query);
      this.results = response.results;
      this.totalCount = response.totalCount;
    } catch (error) {
      console.error('Search failed:', error);
      this.results = [];
      this.totalCount = 0;
    } finally {
      this.isLoading = false;
      this.render();
    }
  }

  private render(): void {
    this.element.innerHTML = `
      <div>
        <h1 class="text-2xl font-bold text-gray-900 dark:text-white mb-2">Search</h1>
        ${this.query ? `
          <p class="text-gray-600 dark:text-gray-400 mb-6">
            ${this.isLoading ? 'Searching for' : `${this.totalCount} results for`}
            "<span class="font-medium">${this.escapeHtml(this.query)}</span>"
          </p>
        ` : `
          <p class="text-gray-600 dark:text-gray-400 mb-6">
            Use <kbd class="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded text-xs font-mono">Cmd/Ctrl+K</kbd> for quick search, or browse below.
          </p>
        `}

        ${this.isLoading ? this.renderLoadingState() : ''}
        ${!this.isLoading && this.results.length > 0 ? this.renderResults() : ''}
        ${!this.isLoading && this.query && this.results.length === 0 ? this.renderNoResults() : ''}
        ${!this.query ? this.renderDefaultState() : ''}
      </div>
    `;
  }

  private renderResults(): string {
    return `
      <div class="space-y-4">
        ${this.results.map(result => `
          <a href="${this.escapeHtml(result.url)}" class="block p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-700 transition-colors">
            <div class="flex items-start gap-4">
              ${result.thumbnailUrl ? `
                <div class="shrink-0 w-16 h-12 bg-gray-200 dark:bg-gray-700 rounded overflow-hidden">
                  <img src="${this.escapeHtml(result.thumbnailUrl)}" alt="" class="w-full h-full object-cover" />
                </div>
              ` : ''}
              <div class="flex-1 min-w-0">
                <h3 class="text-sm font-medium text-gray-900 dark:text-white truncate">
                  ${this.searchService.highlightMatch(result.title, this.query)}
                </h3>
                ${result.description ? `
                  <p class="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">
                    ${this.searchService.highlightMatch(result.description, this.query)}
                  </p>
                ` : ''}
                <div class="flex items-center gap-2 mt-2">
                  <span class="text-xs font-medium px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 capitalize">${result.type}</span>
                  ${result.timestamp ? `<span class="text-xs text-gray-400">${result.timestamp}</span>` : ''}
                </div>
              </div>
            </div>
          </a>
        `).join('')}
      </div>
    `;
  }

  private renderLoadingState(): string {
    return `
      <div class="space-y-4">
        ${Array.from({ length: 3 }, () => `
          <div class="p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 animate-pulse">
            <div class="flex items-start gap-4">
              <div class="w-16 h-12 bg-gray-200 dark:bg-gray-700 rounded"></div>
              <div class="flex-1">
                <div class="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4 mb-2"></div>
                <div class="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/2"></div>
              </div>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }

  private renderNoResults(): string {
    return `
      <div class="text-center py-12">
        <svg class="w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
        </svg>
        <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-1">No results found</h3>
        <p class="text-sm text-gray-500 dark:text-gray-400">
          Try different keywords or check for typos
        </p>
      </div>
    `;
  }

  private renderDefaultState(): string {
    return `
      <div class="text-center py-12">
        <svg class="w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
        </svg>
        <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-1">Search StreetStudio</h3>
        <p class="text-sm text-gray-500 dark:text-gray-400">
          Find videos, projects, comments, and team members
        </p>
      </div>
    `;
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}
