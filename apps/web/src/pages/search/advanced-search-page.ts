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
