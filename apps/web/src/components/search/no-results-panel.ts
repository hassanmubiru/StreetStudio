/**
 * No Results Panel Component
 * 
 * Displays a helpful "no results" state with alternative suggestions,
 * spelling corrections, related terms, and discovery recommendations.
 * Integrates with SearchDiscoveryService for intelligent suggestions.
 * 
 * Requirements: 14.10
 */

import {
  SearchDiscoveryService,
  SearchSuggestionItem,
  TrendingSearch,
} from '../../services/search-discovery.js';

export interface NoResultsPanelOptions {
  query: string;
  onSuggestionClick?: (suggestion: string) => void;
  discoveryService?: SearchDiscoveryService;
}

export class NoResultsPanel {
  private element: HTMLElement;
  private query: string;
  private suggestions: SearchSuggestionItem[] = [];
  private trendingSearches: TrendingSearch[] = [];
  private onSuggestionClick?: (suggestion: string) => void;
  private discoveryService: SearchDiscoveryService;

  constructor(options: NoResultsPanelOptions) {
    this.query = options.query;
    this.onSuggestionClick = options.onSuggestionClick;
    this.discoveryService = options.discoveryService ?? new SearchDiscoveryService();
    this.element = document.createElement('div');
    this.element.className = 'no-results-panel';
    this.element.setAttribute('role', 'status');
    this.element.setAttribute('aria-label', 'No search results');

    this.suggestions = this.discoveryService.getAlternativeSuggestions(this.query);
    this.render();
    this.loadTrending();
  }

  public getElement(): HTMLElement {
    return this.element;
  }

  public updateQuery(query: string): void {
    this.query = query;
    this.suggestions = this.discoveryService.getAlternativeSuggestions(query);
    this.render();
  }

  public destroy(): void {
    // Only destroy if we created the service internally
  }

  private async loadTrending(): Promise<void> {
    try {
      this.trendingSearches = await this.discoveryService.getTrendingSearches();
      this.render();
    } catch {
      // Trending is optional, fail silently
    }
  }

  private render(): void {
    this.element.innerHTML = `
      <div class="text-center py-12 max-w-lg mx-auto">
        <svg class="w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
        </svg>
        <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-2">
          No results for "${this.escapeHtml(this.query)}"
        </h3>
        <p class="text-sm text-gray-500 dark:text-gray-400 mb-6">
          We couldn't find anything matching your search. Here are some suggestions:
        </p>

        ${this.renderSuggestions()}
        ${this.renderSearchTips()}
        ${this.renderTrendingSection()}
      </div>
    `;

    this.attachEventListeners();
  }

  private renderSuggestions(): string {
    if (this.suggestions.length === 0) return '';

    return `
      <div class="mb-6 text-left" aria-label="Alternative suggestions">
        <h4 class="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Try instead:</h4>
        <div class="space-y-2">
          ${this.suggestions.map(suggestion => `
            <button
              class="flex items-center gap-2 w-full px-3 py-2 text-sm text-left bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg hover:border-blue-300 dark:hover:border-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
              data-action="use-suggestion"
              data-suggestion="${this.escapeAttr(suggestion.text)}"
              aria-label="${this.escapeAttr(suggestion.reason)}: ${this.escapeAttr(suggestion.text)}"
            >
              ${this.getSuggestionIcon(suggestion.type)}
              <span class="flex-1">
                <span class="text-gray-900 dark:text-white font-medium">${this.escapeHtml(suggestion.text)}</span>
                <span class="text-xs text-gray-500 dark:text-gray-400 ml-2">${this.escapeHtml(suggestion.reason)}</span>
              </span>
              <svg class="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>
              </svg>
            </button>
          `).join('')}
        </div>
      </div>
    `;
  }

  private renderSearchTips(): string {
    return `
      <div class="mb-6 text-left p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 rounded-lg">
        <h4 class="text-sm font-semibold text-blue-800 dark:text-blue-300 mb-2">Search tips</h4>
        <ul class="text-xs text-blue-700 dark:text-blue-400 space-y-1 list-disc list-inside">
          <li>Check your spelling and try again</li>
          <li>Try using fewer or more general keywords</li>
          <li>Use filters to narrow by content type or date</li>
          <li>Search within specific projects for scoped results</li>
        </ul>
      </div>
    `;
  }

  private renderTrendingSection(): string {
    if (this.trendingSearches.length === 0) return '';

    return `
      <div class="text-left" aria-label="Trending searches">
        <h4 class="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Trending searches:</h4>
        <div class="flex flex-wrap gap-2">
          ${this.trendingSearches.slice(0, 5).map(item => `
            <button
              class="inline-flex items-center gap-1 px-3 py-1.5 text-xs bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-full hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
              data-action="use-suggestion"
              data-suggestion="${this.escapeAttr(item.query)}"
              aria-label="Try trending search: ${this.escapeAttr(item.query)}"
            >
              <svg class="w-3 h-3 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"></path>
              </svg>
              ${this.escapeHtml(item.query)}
            </button>
          `).join('')}
        </div>
      </div>
    `;
  }

  private getSuggestionIcon(type: string): string {
    switch (type) {
      case 'spelling':
        return '<svg class="w-4 h-4 text-orange-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>';
      case 'related':
        return '<svg class="w-4 h-4 text-blue-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"></path></svg>';
      case 'broader':
        return '<svg class="w-4 h-4 text-green-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"></path></svg>';
      case 'narrower':
        return '<svg class="w-4 h-4 text-purple-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7"></path></svg>';
      default:
        return '<svg class="w-4 h-4 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>';
    }
  }

  private attachEventListeners(): void {
    this.element.querySelectorAll('[data-action="use-suggestion"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const suggestion = (btn as HTMLElement).dataset.suggestion;
        if (suggestion && this.onSuggestionClick) {
          this.onSuggestionClick(suggestion);
        }
      });
    });
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  private escapeAttr(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
}
