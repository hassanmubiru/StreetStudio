/**
 * Advanced Search Page Component
 * 
 * Full-page advanced search interface with multiple filter options,
 * faceted search, and saved searches/bookmarks functionality.
 * 
 * Requirements: 14.2, 14.7, 14.8
 */

import {
  AdvancedSearchService,
  SearchFilters,
  DateRangeFilter,
  SavedSearch,
  AdvancedSearchResponse,
  SearchFacets,
} from '../../services/advanced-search.js';
import { SearchResult } from '../../services/search.js';

export class AdvancedSearchPage {
  private element: HTMLElement;
  private advancedSearchService: AdvancedSearchService;
  private query = '';
  private filters: SearchFilters = {};
  private results: SearchResult[] = [];
  private facets: SearchFacets = {
    contentTypes: [],
    creators: [],
    projects: [],
    dateRanges: [],
  };
  private isLoading = false;
  private totalCount = 0;
  private showSaveDialog = false;
  private savedSearches: SavedSearch[] = [];

  constructor() {
    this.advancedSearchService = new AdvancedSearchService({ debounceMs: 300 });
    this.element = document.createElement('div');
    this.element.className = 'p-8 max-w-6xl mx-auto';
    this.element.setAttribute('data-main-content', '');
    this.element.setAttribute('role', 'search');
    this.element.setAttribute('aria-label', 'Advanced search');

    // Parse query and filters from URL
    const urlParams = new URLSearchParams(window.location.search);
    this.query = urlParams.get('q') || '';
    this.filters = this.parseFiltersFromUrl(urlParams);
    this.savedSearches = this.advancedSearchService.getSavedSearches();

    this.render();

    if (this.query || this.advancedSearchService.hasActiveFilters(this.filters)) {
      this.performSearch();
    }
  }

  public getElement(): HTMLElement {
    return this.element;
  }

  public destroy(): void {
    this.advancedSearchService.destroy();
  }

  private async performSearch(): Promise<void> {
    this.isLoading = true;
    this.render();

    try {
      const response = await this.advancedSearchService.searchWithFilters(
        this.query,
        this.filters
      );
      this.results = response.results;
      this.totalCount = response.totalCount;
      this.facets = response.facets;
    } catch (error) {
      console.error('Advanced search failed:', error);
      this.results = [];
      this.totalCount = 0;
    } finally {
      this.isLoading = false;
      this.render();
    }
  }

  private parseFiltersFromUrl(params: URLSearchParams): SearchFilters {
    const filters: SearchFilters = {};

    const dateFrom = params.get('dateFrom');
    const dateTo = params.get('dateTo');
    const datePreset = params.get('datePreset') as DateRangeFilter['preset'];
    if (dateFrom || dateTo || datePreset) {
      filters.dateRange = {
        from: dateFrom || undefined,
        to: dateTo || undefined,
        preset: datePreset || 'custom',
      };
    }

    const types = params.get('types');
    if (types) {
      filters.contentType = {
        types: types.split(',') as any[],
      };
    }

    const creators = params.get('creators');
    if (creators) {
      filters.creator = { creatorIds: creators.split(',') };
    }

    const projectId = params.get('projectId');
    if (projectId) {
      filters.projectId = projectId;
    }

    const scope = params.get('scope') as SearchFilters['scope'];
    if (scope) {
      filters.scope = scope;
    }

    const sortBy = params.get('sortBy') as SearchFilters['sortBy'];
    if (sortBy) {
      filters.sortBy = sortBy;
    }

    return filters;
  }

  private handleSearchSubmit(event: Event): void {
    event.preventDefault();
    const form = event.target as HTMLFormElement;
    const input = form.querySelector('input[name="query"]') as HTMLInputElement;
    this.query = input?.value || '';
    this.performSearch();
  }

  private handleFilterChange(filterType: string, value: any): void {
    switch (filterType) {
      case 'dateRange':
        this.filters.dateRange = value || undefined;
        break;
      case 'contentType':
        this.filters.contentType = value || undefined;
        break;
      case 'creator':
        this.filters.creator = value || undefined;
        break;
      case 'scope':
        this.filters.scope = value || undefined;
        break;
      case 'sortBy':
        this.filters.sortBy = value || undefined;
        break;
    }
    this.performSearch();
  }

  private handleClearFilters(): void {
    this.filters = this.advancedSearchService.clearFilters();
    this.performSearch();
  }

  private handleSaveSearch(name: string): void {
    if (!name.trim()) return;
    this.advancedSearchService.saveSearch(name, this.query, this.filters);
    this.savedSearches = this.advancedSearchService.getSavedSearches();
    this.showSaveDialog = false;
    this.render();
  }

  private handleLoadSavedSearch(savedSearch: SavedSearch): void {
    this.query = savedSearch.query;
    this.filters = { ...savedSearch.filters };
    this.performSearch();
  }

  private handleRemoveSavedSearch(id: string): void {
    this.advancedSearchService.removeSavedSearch(id);
    this.savedSearches = this.advancedSearchService.getSavedSearches();
    this.render();
  }

  private render(): void {
    const activeFilterCount = this.advancedSearchService.getActiveFilterCount(this.filters);

    this.element.innerHTML = `
      <div>
        <h1 class="text-2xl font-bold text-gray-900 dark:text-white mb-6">Advanced Search</h1>

        <!-- Search Form -->
        <form class="mb-6" data-search-form>
          <div class="flex gap-2">
            <input
              type="text"
              name="query"
              value="${this.escapeHtml(this.query)}"
              placeholder="Search videos, projects, comments..."
              class="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              aria-label="Search query"
            />
            <button
              type="submit"
              class="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              aria-label="Search"
            >
              Search
            </button>
          </div>
        </form>

        <!-- Filter Bar -->
        <div class="flex flex-wrap items-center gap-3 mb-6 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg" role="toolbar" aria-label="Search filters">
          ${this.renderDateRangeFilter()}
          ${this.renderContentTypeFilter()}
          ${this.renderCreatorFilter()}
          ${this.renderScopeFilter()}
          ${this.renderSortFilter()}
          ${activeFilterCount > 0 ? `
            <button
              class="ml-auto text-sm text-red-600 dark:text-red-400 hover:underline"
              data-action="clear-filters"
              aria-label="Clear all filters"
            >
              Clear filters (${activeFilterCount})
            </button>
          ` : ''}
        </div>

        <!-- Actions Bar -->
        <div class="flex items-center justify-between mb-4">
          <div class="flex items-center gap-3">
            ${this.query || activeFilterCount > 0 ? `
              <button
                class="text-sm px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700"
                data-action="save-search"
                aria-label="Save current search"
              >
                ⭐ Save search
              </button>
            ` : ''}
            ${this.savedSearches.length > 0 ? `
              <span class="text-sm text-gray-500">
                ${this.savedSearches.length} saved search${this.savedSearches.length !== 1 ? 'es' : ''}
              </span>
            ` : ''}
          </div>
          ${!this.isLoading && this.totalCount > 0 ? `
            <span class="text-sm text-gray-600 dark:text-gray-400">
              ${this.totalCount} result${this.totalCount !== 1 ? 's' : ''}
            </span>
          ` : ''}
        </div>

        ${this.showSaveDialog ? this.renderSaveDialog() : ''}
        ${this.renderSavedSearches()}

        <!-- Faceted Search Sidebar + Results -->
        <div class="flex gap-6">
          ${this.facets.contentTypes.length > 0 || this.facets.creators.length > 0 ? `
            <aside class="w-64 shrink-0" aria-label="Faceted filters">
              ${this.renderFacets()}
            </aside>
          ` : ''}
          <div class="flex-1">
            ${this.isLoading ? this.renderLoadingState() : ''}
            ${!this.isLoading && this.results.length > 0 ? this.renderResults() : ''}
            ${!this.isLoading && (this.query || activeFilterCount > 0) && this.results.length === 0 ? this.renderNoResults() : ''}
            ${!this.query && activeFilterCount === 0 ? this.renderDefaultState() : ''}
          </div>
        </div>
      </div>
    `;

    this.attachEventListeners();
  }

  private renderDateRangeFilter(): string {
    const currentPreset = this.filters.dateRange?.preset || '';
    return `
      <div class="relative" data-filter="dateRange">
        <select
          class="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300"
          aria-label="Date range filter"
          data-filter-select="dateRange"
        >
          <option value="" ${!currentPreset ? 'selected' : ''}>Any date</option>
          <option value="today" ${currentPreset === 'today' ? 'selected' : ''}>Today</option>
          <option value="last-7-days" ${currentPreset === 'last-7-days' ? 'selected' : ''}>Last 7 days</option>
          <option value="last-30-days" ${currentPreset === 'last-30-days' ? 'selected' : ''}>Last 30 days</option>
          <option value="last-90-days" ${currentPreset === 'last-90-days' ? 'selected' : ''}>Last 90 days</option>
          <option value="last-year" ${currentPreset === 'last-year' ? 'selected' : ''}>Last year</option>
        </select>
      </div>
    `;
  }

  private renderContentTypeFilter(): string {
    const selectedTypes = this.filters.contentType?.types || [];
    const types = ['video', 'project', 'comment', 'member', 'folder'];
    return `
      <div class="relative" data-filter="contentType">
        <select
          class="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300"
          aria-label="Content type filter"
          data-filter-select="contentType"
          multiple
        >
          ${types.map(type => `
            <option value="${type}" ${selectedTypes.includes(type as any) ? 'selected' : ''}>${type.charAt(0).toUpperCase() + type.slice(1)}s</option>
          `).join('')}
        </select>
      </div>
    `;
  }

  private renderCreatorFilter(): string {
    return `
      <div class="relative" data-filter="creator">
        <input
          type="text"
          placeholder="Filter by creator..."
          class="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 w-40"
          aria-label="Creator filter"
          data-filter-input="creator"
          value="${this.filters.creator?.creatorIds.join(', ') || ''}"
        />
      </div>
    `;
  }
