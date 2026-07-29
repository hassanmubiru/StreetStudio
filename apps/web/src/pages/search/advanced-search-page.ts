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

  private renderScopeFilter(): string {
    const currentScope = this.filters.scope || 'all';
    return `
      <div class="relative" data-filter="scope">
        <select
          class="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300"
          aria-label="Search scope"
          data-filter-select="scope"
        >
          <option value="all" ${currentScope === 'all' ? 'selected' : ''}>All content</option>
          <option value="organization" ${currentScope === 'organization' ? 'selected' : ''}>Organization</option>
          <option value="personal" ${currentScope === 'personal' ? 'selected' : ''}>Personal</option>
          <option value="project" ${currentScope === 'project' ? 'selected' : ''}>Current project</option>
        </select>
      </div>
    `;
  }

  private renderSortFilter(): string {
    const currentSort = this.filters.sortBy || 'relevance';
    return `
      <div class="relative" data-filter="sortBy">
        <select
          class="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300"
          aria-label="Sort by"
          data-filter-select="sortBy"
        >
          <option value="relevance" ${currentSort === 'relevance' ? 'selected' : ''}>Most relevant</option>
          <option value="date-desc" ${currentSort === 'date-desc' ? 'selected' : ''}>Newest first</option>
          <option value="date-asc" ${currentSort === 'date-asc' ? 'selected' : ''}>Oldest first</option>
          <option value="title-asc" ${currentSort === 'title-asc' ? 'selected' : ''}>Title A-Z</option>
          <option value="title-desc" ${currentSort === 'title-desc' ? 'selected' : ''}>Title Z-A</option>
        </select>
      </div>
    `;
  }

  private renderFacets(): string {
    return `
      <div class="space-y-4">
        ${this.facets.contentTypes.length > 0 ? `
          <div>
            <h3 class="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Content Type</h3>
            <ul class="space-y-1" role="list">
              ${this.facets.contentTypes.map(facet => `
                <li>
                  <button class="flex items-center justify-between w-full px-2 py-1 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded" data-facet-type="${facet.value}">
                    <span>${facet.label}</span>
                    <span class="text-xs bg-gray-200 dark:bg-gray-600 rounded-full px-1.5">${facet.count}</span>
                  </button>
                </li>
              `).join('')}
            </ul>
          </div>
        ` : ''}
        ${this.facets.creators.length > 0 ? `
          <div>
            <h3 class="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Creator</h3>
            <ul class="space-y-1" role="list">
              ${this.facets.creators.map(facet => `
                <li>
                  <button class="flex items-center justify-between w-full px-2 py-1 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded" data-facet-creator="${facet.value}">
                    <span>${facet.label}</span>
                    <span class="text-xs bg-gray-200 dark:bg-gray-600 rounded-full px-1.5">${facet.count}</span>
                  </button>
                </li>
              `).join('')}
            </ul>
          </div>
        ` : ''}
      </div>
    `;
  }

  private renderSaveDialog(): string {
    return `
      <div class="mb-4 p-4 border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 rounded-lg" role="dialog" aria-label="Save search">
        <h3 class="text-sm font-medium text-gray-900 dark:text-white mb-2">Save this search</h3>
        <div class="flex gap-2">
          <input
            type="text"
            placeholder="Name your search..."
            class="flex-1 px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800"
            data-save-search-name
            aria-label="Search name"
          />
          <button
            class="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700"
            data-action="confirm-save"
          >
            Save
          </button>
          <button
            class="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700"
            data-action="cancel-save"
          >
            Cancel
          </button>
        </div>
      </div>
    `;
  }

  private renderSavedSearches(): string {
    if (this.savedSearches.length === 0) return '';

    return `
      <div class="mb-6">
        <h2 class="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Saved Searches</h2>
        <div class="flex flex-wrap gap-2" role="list" aria-label="Saved searches">
          ${this.savedSearches.map(saved => `
            <div class="inline-flex items-center gap-1 px-3 py-1.5 bg-gray-100 dark:bg-gray-700 rounded-full text-sm" role="listitem">
              <button
                class="text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400"
                data-action="load-saved"
                data-saved-id="${saved.id}"
                aria-label="Load saved search: ${this.escapeHtml(saved.name)}"
              >
                ${this.escapeHtml(saved.name)}
              </button>
              <button
                class="ml-1 text-gray-400 hover:text-red-500"
                data-action="remove-saved"
                data-saved-id="${saved.id}"
                aria-label="Remove saved search: ${this.escapeHtml(saved.name)}"
              >
                ×
              </button>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  private renderResults(): string {
    const baseService = this.advancedSearchService.getBaseSearchService();
    return `
      <div class="space-y-4" role="list" aria-label="Search results">
        ${this.results.map(result => `
          <a href="${this.escapeHtml(result.url)}" class="block p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-700 transition-colors" role="listitem">
            <div class="flex items-start gap-4">
              ${result.thumbnailUrl ? `
                <div class="shrink-0 w-16 h-12 bg-gray-200 dark:bg-gray-700 rounded overflow-hidden">
                  <img src="${this.escapeHtml(result.thumbnailUrl)}" alt="" class="w-full h-full object-cover" />
                </div>
              ` : ''}
              <div class="flex-1 min-w-0">
                <h3 class="text-sm font-medium text-gray-900 dark:text-white truncate">
                  ${baseService.highlightMatch(result.title, this.query)}
                </h3>
                ${result.description ? `
                  <p class="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">
                    ${baseService.highlightMatch(result.description, this.query)}
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
      <div class="space-y-4" aria-busy="true" aria-label="Loading search results">
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
        <p class="text-sm text-gray-500 dark:text-gray-400 mb-4">
          Try adjusting your filters or using different keywords
        </p>
        <button
          class="text-sm text-blue-600 dark:text-blue-400 hover:underline"
          data-action="clear-filters"
        >
          Clear all filters
        </button>
      </div>
    `;
  }

  private renderDefaultState(): string {
    return `
      <div class="text-center py-12">
        <svg class="w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"></path>
        </svg>
        <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-1">Advanced Search</h3>
        <p class="text-sm text-gray-500 dark:text-gray-400">
          Use filters to narrow down your search across videos, projects, and more
        </p>
      </div>
    `;
  }
