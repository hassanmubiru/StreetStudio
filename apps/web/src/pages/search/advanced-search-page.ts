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
