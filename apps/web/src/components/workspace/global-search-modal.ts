/**
 * Global Search Modal
 * 
 * A command-palette-style search modal accessible via Cmd/Ctrl+K shortcut.
 * Provides instant search with real-time results, autocomplete suggestions,
 * recent searches, and result previews with contextual information.
 * 
 * Requirements: 14.1, 14.3, 14.5
 */

import { SearchService, SearchResult, SearchSuggestion, SearchResponse } from '../../services/search.js';

export interface GlobalSearchModalOptions {
  onNavigate?: (url: string) => void;
  onClose?: () => void;
  debounceMs?: number;
  maxResults?: number;
}

export class GlobalSearchModal {
  private element: HTMLElement;
  private searchService: SearchService;
  private options: GlobalSearchModalOptions;
  private isOpen = false;
  private query = '';
  private results: SearchResult[] = [];
  private suggestions: SearchSuggestion[] = [];
  private selectedIndex = -1;
  private isLoading = false;
  private totalCount = 0;
  private executionTimeMs = 0;
  private keydownHandler: ((e: KeyboardEvent) => void) | null = null;

  constructor(options: GlobalSearchModalOptions = {}) {
    this.options = {
      maxResults: 10,
      ...options,
    };

    this.searchService = new SearchService({
      debounceMs: options.debounceMs ?? 300,
    });

    this.element = document.createElement('div');
    this.element.className = 'global-search-modal';
    this.element.setAttribute('role', 'dialog');
    this.element.setAttribute('aria-modal', 'true');
    this.element.setAttribute('aria-label', 'Global search');
    this.element.setAttribute('data-testid', 'global-search-modal');

    this.render();
    this.registerGlobalShortcut();
  }

  public getElement(): HTMLElement {
    return this.element;
  }

  public open(): void {
    if (this.isOpen) return;

    this.isOpen = true;
    this.query = '';
    this.results = [];
    this.selectedIndex = -1;
    this.isLoading = false;
    this.totalCount = 0;

    // Load suggestions (recent searches)
    this.suggestions = this.searchService.getSuggestions('');

    this.render();

    // Focus the search input
    requestAnimationFrame(() => {
      const input = this.element.querySelector('[data-testid="search-input"]') as HTMLInputElement;
      if (input) {
        input.focus();
      }
    });

    // Prevent body scroll
    document.body.style.overflow = 'hidden';
  }

  public close(): void {
    if (!this.isOpen) return;

    this.isOpen = false;
    this.searchService.cancel();
    this.render();

    // Restore body scroll
    document.body.style.overflow = '';

    this.options.onClose?.();
  }

  public isModalOpen(): boolean {
    return this.isOpen;
  }

  public getQuery(): string {
    return this.query;
  }

  public getResults(): SearchResult[] {
    return this.results;
  }

  public getSelectedIndex(): number {
    return this.selectedIndex;
  }

  public destroy(): void {
    this.close();
    this.searchService.destroy();

    if (this.keydownHandler) {
      document.removeEventListener('keydown', this.keydownHandler);
      this.keydownHandler = null;
    }

    this.element.remove();
  }

  private registerGlobalShortcut(): void {
    this.keydownHandler = (event: KeyboardEvent) => {
      // Cmd/Ctrl+K to open
      if ((event.metaKey || event.ctrlKey) && event.key === 'k') {
        event.preventDefault();
        event.stopPropagation();

        if (this.isOpen) {
          this.close();
        } else {
          this.open();
        }
      }
    };

    document.addEventListener('keydown', this.keydownHandler);
  }

  private handleInput(value: string): void {
    this.query = value;
    this.selectedIndex = -1;

    if (!value.trim()) {
      this.results = [];
      this.totalCount = 0;
      this.isLoading = false;
      this.suggestions = this.searchService.getSuggestions('');
      this.render();
      return;
    }

    this.isLoading = true;
    this.suggestions = this.searchService.getSuggestions(value);
    this.render();

    this.searchService.search(value, (response, error) => {
      this.isLoading = false;

      if (error) {
        this.results = [];
        this.totalCount = 0;
        this.render();
        return;
      }

      if (response) {
        this.results = response.results.slice(0, this.options.maxResults);
        this.totalCount = response.totalCount;
        this.executionTimeMs = response.executionTimeMs;
      } else {
        this.results = [];
        this.totalCount = 0;
      }

      this.render();
    });
  }

  private handleKeydown(event: KeyboardEvent): void {
    const totalItems = this.getNavigableItemCount();

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this.selectedIndex = Math.min(this.selectedIndex + 1, totalItems - 1);
        this.render();
        this.scrollSelectedIntoView();
        break;

      case 'ArrowUp':
        event.preventDefault();
        this.selectedIndex = Math.max(this.selectedIndex - 1, -1);
        this.render();
        this.scrollSelectedIntoView();
        break;

      case 'Enter':
        event.preventDefault();
        this.handleSelect();
        break;

      case 'Escape':
        event.preventDefault();
        this.close();
        break;
    }
  }

  private getNavigableItemCount(): number {
    if (this.results.length > 0) {
      return this.results.length;
    }
    return this.suggestions.length;
  }

  private handleSelect(): void {
    if (this.selectedIndex < 0) {
      // Submit search
      if (this.query.trim()) {
        this.searchService.addToRecentSearches(this.query.trim());
        this.options.onNavigate?.(`/search?q=${encodeURIComponent(this.query.trim())}`);
        this.close();
      }
      return;
    }

    if (this.results.length > 0 && this.selectedIndex < this.results.length) {
      const result = this.results[this.selectedIndex];
      if (result) {
        this.searchService.addToRecentSearches(this.query.trim());
        this.options.onNavigate?.(result.url);
        this.close();
      }
    } else if (this.suggestions.length > 0 && this.selectedIndex < this.suggestions.length) {
      const suggestion = this.suggestions[this.selectedIndex];
      if (suggestion) {
        this.query = suggestion.text;
        this.selectedIndex = -1;
        this.handleInput(suggestion.text);
      }
    }
  }

  private handleResultClick(result: SearchResult): void {
    this.searchService.addToRecentSearches(this.query.trim());
    this.options.onNavigate?.(result.url);
    this.close();
  }

  private handleSuggestionClick(suggestion: SearchSuggestion): void {
    this.query = suggestion.text;
    this.selectedIndex = -1;
    this.handleInput(suggestion.text);

    // Focus input
    const input = this.element.querySelector('[data-testid="search-input"]') as HTMLInputElement;
    if (input) {
      input.value = suggestion.text;
      input.focus();
    }
  }

  private handleRemoveRecent(query: string, event: Event): void {
    event.stopPropagation();
    this.searchService.removeFromRecentSearches(query);
    this.suggestions = this.searchService.getSuggestions(this.query);
    this.render();
  }

  private handleClearRecentSearches(): void {
    this.searchService.clearRecentSearches();
    this.suggestions = [];
    this.render();
  }

  private scrollSelectedIntoView(): void {
    const selected = this.element.querySelector('[data-selected="true"]');
    if (selected && typeof (selected as HTMLElement).scrollIntoView === 'function') {
      (selected as HTMLElement).scrollIntoView({ block: 'nearest' });
    }
  }

  private render(): void {
    if (!this.isOpen) {
      this.element.innerHTML = '';
      this.element.classList.add('hidden');
      return;
    }

    this.element.classList.remove('hidden');

    this.element.innerHTML = `
      <div class="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]" data-testid="search-overlay">
        <!-- Backdrop -->
        <div class="fixed inset-0 bg-black/50 backdrop-blur-sm" data-testid="search-backdrop"></div>
        
        <!-- Modal Content -->
        <div class="relative w-full max-w-2xl mx-4 bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden" data-testid="search-container">
          <!-- Search Input -->
          <div class="flex items-center px-4 border-b border-gray-200 dark:border-gray-700">
            <svg class="w-5 h-5 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
            </svg>
            <input
              type="search"
              data-testid="search-input"
              class="flex-1 px-3 py-4 text-base bg-transparent border-0 outline-none text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500"
              placeholder="Search videos, projects, comments..."
              value="${this.escapeHtml(this.query)}"
              autocomplete="off"
              spellcheck="false"
              aria-label="Search"
              aria-expanded="${this.results.length > 0 || this.suggestions.length > 0}"
              aria-controls="search-results"
              aria-activedescendant="${this.selectedIndex >= 0 ? `search-item-${this.selectedIndex}` : ''}"
              role="combobox"
            />
            ${this.isLoading ? `
              <div class="shrink-0" data-testid="search-loading" aria-label="Searching">
                <svg class="w-5 h-5 text-blue-500 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              </div>
            ` : ''}
            <kbd class="hidden sm:inline-flex items-center px-2 py-1 text-xs font-mono text-gray-400 bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded ml-2 shrink-0" aria-hidden="true">
              Esc
            </kbd>
          </div>

          <!-- Results / Suggestions Area -->
          <div id="search-results" role="listbox" class="max-h-96 overflow-y-auto" data-testid="search-results">
            ${this.renderContent()}
          </div>

          <!-- Footer -->
          ${this.renderFooter()}
        </div>
      </div>
    `;

    this.attachEventListeners();
  }

  private renderContent(): string {
    // Show results if we have them
    if (this.results.length > 0) {
      return this.renderResults();
    }

    // Show "no results" if query typed and search completed with no results
    if (this.query.trim() && !this.isLoading && this.results.length === 0) {
      return this.renderNoResults();
    }

    // Show suggestions when no query (recent searches)
    if (this.suggestions.length > 0 && !this.query.trim()) {
      return this.renderSuggestions();
    }

    // Show suggestions while still loading
    if (this.suggestions.length > 0 && this.query.trim() && this.isLoading) {
      return this.renderSuggestions();
    }

    // Default empty state
    if (!this.query.trim() && this.suggestions.length === 0) {
      return this.renderEmptyState();
    }

    return '';
  }

  private renderResults(): string {
    return `
      <div class="py-2" data-testid="search-results-list">
        <div class="px-4 py-1">
          <span class="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            Results (${this.totalCount})
          </span>
        </div>
        ${this.results.map((result, index) => this.renderResultItem(result, index)).join('')}
      </div>
    `;
  }

  private renderResultItem(result: SearchResult, index: number): string {
    const isSelected = index === this.selectedIndex;
    const highlightedTitle = this.searchService.highlightMatch(result.title, this.query);
    const highlightedDescription = result.description
      ? this.searchService.highlightMatch(result.description, this.query)
      : '';

    const typeIcons: Record<string, string> = {
      video: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"></path>',
      project: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"></path>',
      comment: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"></path>',
      member: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path>',
    };

    return `
      <div
        id="search-item-${index}"
        role="option"
        aria-selected="${isSelected}"
        data-selected="${isSelected}"
        data-result-index="${index}"
        class="px-4 py-3 cursor-pointer flex items-start gap-3 transition-colors ${
          isSelected
            ? 'bg-blue-50 dark:bg-blue-900/30'
            : 'hover:bg-gray-50 dark:hover:bg-gray-700/50'
        }"
        data-testid="search-result-item"
      >
        <!-- Type Icon -->
        <div class="shrink-0 mt-0.5">
          <div class="w-8 h-8 rounded-lg flex items-center justify-center ${
            isSelected ? 'bg-blue-100 dark:bg-blue-800' : 'bg-gray-100 dark:bg-gray-700'
          }">
            <svg class="w-4 h-4 ${isSelected ? 'text-blue-600 dark:text-blue-300' : 'text-gray-500 dark:text-gray-400'}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              ${typeIcons[result.type] || typeIcons.video}
            </svg>
          </div>
        </div>

        <!-- Content -->
        <div class="flex-1 min-w-0">
          <div class="text-sm font-medium text-gray-900 dark:text-white truncate">
            ${highlightedTitle}
          </div>
          ${highlightedDescription ? `
            <div class="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
              ${highlightedDescription}
            </div>
          ` : ''}
          <div class="flex items-center gap-2 mt-1">
            <span class="inline-flex items-center px-1.5 py-0.5 text-xs font-medium rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 capitalize">
              ${result.type}
            </span>
            ${result.timestamp ? `
              <span class="text-xs text-gray-400 dark:text-gray-500">${result.timestamp}</span>
            ` : ''}
            ${Object.entries(result.metadata).slice(0, 2).map(([key, value]) => `
              <span class="text-xs text-gray-400 dark:text-gray-500">${key}: ${value}</span>
            `).join('')}
          </div>
        </div>

        <!-- Thumbnail -->
        ${result.thumbnailUrl ? `
          <div class="shrink-0">
            <div class="w-12 h-8 bg-gray-200 dark:bg-gray-700 rounded overflow-hidden">
              <img src="${this.escapeHtml(result.thumbnailUrl)}" alt="" class="w-full h-full object-cover" loading="lazy" />
            </div>
          </div>
        ` : ''}
      </div>
    `;
  }

  private renderSuggestions(): string {
    const hasRecentSearches = this.suggestions.some(s => s.type === 'recent');

    return `
      <div class="py-2" data-testid="search-suggestions">
        <div class="px-4 py-1 flex items-center justify-between">
          <span class="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            ${hasRecentSearches && !this.query.trim() ? 'Recent searches' : 'Suggestions'}
          </span>
          ${hasRecentSearches && !this.query.trim() ? `
            <button 
              type="button"
              data-testid="clear-recent-searches"
              class="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
            >
              Clear all
            </button>
          ` : ''}
        </div>
        ${this.suggestions.map((suggestion, index) => this.renderSuggestionItem(suggestion, index)).join('')}
      </div>
    `;
  }

  private renderSuggestionItem(suggestion: SearchSuggestion, index: number): string {
    const isSelected = index === this.selectedIndex;

    const iconPaths: Record<string, string> = {
      clock: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>',
      filter: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"></path>',
      search: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>',
    };

    return `
      <div
        id="search-item-${index}"
        role="option"
        aria-selected="${isSelected}"
        data-selected="${isSelected}"
        data-suggestion-index="${index}"
        class="px-4 py-2.5 cursor-pointer flex items-center gap-3 transition-colors ${
          isSelected
            ? 'bg-blue-50 dark:bg-blue-900/30'
            : 'hover:bg-gray-50 dark:hover:bg-gray-700/50'
        }"
        data-testid="search-suggestion-item"
      >
        <svg class="w-4 h-4 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          ${iconPaths[suggestion.icon || 'search'] || iconPaths.search}
        </svg>
        <span class="text-sm text-gray-700 dark:text-gray-300 flex-1 truncate">
          ${this.escapeHtml(suggestion.text)}
        </span>
        ${suggestion.type === 'recent' ? `
          <button 
            type="button"
            data-remove-recent="${this.escapeHtml(suggestion.text)}"
            class="text-gray-300 hover:text-gray-500 dark:text-gray-600 dark:hover:text-gray-400 p-1 rounded transition-colors"
            aria-label="Remove from recent searches"
          >
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
            </svg>
          </button>
        ` : ''}
      </div>
    `;
  }

  private renderNoResults(): string {
    return `
      <div class="px-4 py-8 text-center" data-testid="search-no-results">
        <svg class="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
        </svg>
        <p class="text-sm font-medium text-gray-900 dark:text-white mb-1">No results found</p>
        <p class="text-xs text-gray-500 dark:text-gray-400">
          Try different keywords or check for typos
        </p>
      </div>
    `;
  }

  private renderEmptyState(): string {
    return `
      <div class="px-4 py-6 text-center" data-testid="search-empty-state">
        <p class="text-sm text-gray-500 dark:text-gray-400">
          Start typing to search across videos, projects, and comments
        </p>
        <div class="flex items-center justify-center gap-4 mt-3 text-xs text-gray-400 dark:text-gray-500">
          <span class="flex items-center gap-1">
            <kbd class="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded font-mono">↑↓</kbd>
            Navigate
          </span>
          <span class="flex items-center gap-1">
            <kbd class="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded font-mono">↵</kbd>
            Select
          </span>
          <span class="flex items-center gap-1">
            <kbd class="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded font-mono">Esc</kbd>
            Close
          </span>
        </div>
      </div>
    `;
  }

  private renderFooter(): string {
    if (!this.query.trim() || this.results.length === 0) return '';

    return `
      <div class="px-4 py-2.5 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 flex items-center justify-between">
        <span class="text-xs text-gray-400 dark:text-gray-500">
          ${this.totalCount} result${this.totalCount !== 1 ? 's' : ''} in ${this.executionTimeMs.toFixed(0)}ms
        </span>
        <span class="text-xs text-gray-400 dark:text-gray-500 flex items-center gap-2">
          <kbd class="px-1.5 py-0.5 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded font-mono text-[10px]">↵</kbd>
          to open
        </span>
      </div>
    `;
  }

  private attachEventListeners(): void {
    // Input handler
    const input = this.element.querySelector('[data-testid="search-input"]') as HTMLInputElement;
    if (input) {
      input.addEventListener('input', (e) => {
        this.handleInput((e.target as HTMLInputElement).value);
      });

      input.addEventListener('keydown', (e) => {
        this.handleKeydown(e);
      });
    }

    // Backdrop click
    const backdrop = this.element.querySelector('[data-testid="search-backdrop"]');
    if (backdrop) {
      backdrop.addEventListener('click', () => this.close());
    }

    // Result clicks
    const resultItems = this.element.querySelectorAll('[data-result-index]');
    resultItems.forEach((item) => {
      item.addEventListener('click', () => {
        const index = parseInt(item.getAttribute('data-result-index') || '0', 10);
        if (this.results[index]) {
          this.handleResultClick(this.results[index]);
        }
      });
    });

    // Suggestion clicks
    const suggestionItems = this.element.querySelectorAll('[data-suggestion-index]');
    suggestionItems.forEach((item) => {
      item.addEventListener('click', () => {
        const index = parseInt(item.getAttribute('data-suggestion-index') || '0', 10);
        if (this.suggestions[index]) {
          this.handleSuggestionClick(this.suggestions[index]);
        }
      });
    });

    // Remove recent search buttons
    const removeButtons = this.element.querySelectorAll('[data-remove-recent]');
    removeButtons.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const query = btn.getAttribute('data-remove-recent') || '';
        this.handleRemoveRecent(query, e);
      });
    });

    // Clear recent searches
    const clearBtn = this.element.querySelector('[data-testid="clear-recent-searches"]');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => this.handleClearRecentSearches());
    }
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}
