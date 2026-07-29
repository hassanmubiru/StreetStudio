/**
 * Advanced Search Service
 * 
 * Extends the base search service with advanced filtering capabilities
 * including date ranges, content type filters, creator filters,
 * faceted search with dynamic options, and saved searches with bookmarks.
 * 
 * Requirements: 14.2, 14.7, 14.8
 */

import { SearchService, SearchResult, SearchResponse, SearchServiceOptions } from './search.js';

export interface DateRangeFilter {
  from?: string; // ISO date string
  to?: string;   // ISO date string
  preset?: 'today' | 'last-7-days' | 'last-30-days' | 'last-90-days' | 'last-year' | 'custom';
}

export interface ContentTypeFilter {
  types: Array<'video' | 'project' | 'comment' | 'member' | 'folder'>;
}

export interface CreatorFilter {
  creatorIds: string[];
}

export interface SearchFilters {
  dateRange?: DateRangeFilter;
  contentType?: ContentTypeFilter;
  creator?: CreatorFilter;
  projectId?: string;
  scope?: 'all' | 'organization' | 'personal' | 'project';
  sortBy?: 'relevance' | 'date-desc' | 'date-asc' | 'title-asc' | 'title-desc';
}

export interface FacetOption {
  value: string;
  label: string;
  count: number;
}

export interface SearchFacets {
  contentTypes: FacetOption[];
  creators: FacetOption[];
  projects: FacetOption[];
  dateRanges: FacetOption[];
}

export interface AdvancedSearchResponse extends SearchResponse {
  facets: SearchFacets;
  appliedFilters: SearchFilters;
}

export interface SavedSearch {
  id: string;
  name: string;
  query: string;
  filters: SearchFilters;
  createdAt: string;
  updatedAt: string;
}

export interface AdvancedSearchServiceOptions extends SearchServiceOptions {
  maxSavedSearches?: number;
}

const SAVED_SEARCHES_KEY = 'streetstudio_saved_searches';
const MAX_SAVED_SEARCHES_DEFAULT = 20;

export class AdvancedSearchService {
  private searchService: SearchService;
  private apiBaseUrl: string;
  private maxSavedSearches: number;
  private savedSearches: SavedSearch[] = [];
  private abortController: AbortController | null = null;

  constructor(options: AdvancedSearchServiceOptions = {}) {
    this.searchService = new SearchService(options);
    this.apiBaseUrl = options.apiBaseUrl ?? '/api';
    this.maxSavedSearches = options.maxSavedSearches ?? MAX_SAVED_SEARCHES_DEFAULT;
    this.loadSavedSearches();
  }

  /**
   * Perform an advanced search with filters
   */
  public async searchWithFilters(
    query: string,
    filters: SearchFilters = {}
  ): Promise<AdvancedSearchResponse> {
    // Cancel any in-flight request
    if (this.abortController) {
      this.abortController.abort();
    }

    this.abortController = new AbortController();
    const startTime = performance.now();

    const params = this.buildSearchParams(query, filters);

    try {
      const response = await fetch(
        `${this.apiBaseUrl}/search/advanced?${params.toString()}`,
        { signal: this.abortController.signal }
      );

      if (!response.ok) {
        throw new Error(`Advanced search request failed: ${response.status}`);
      }

      const data = await response.json();
      const executionTimeMs = performance.now() - startTime;

      return {
        results: data.results || [],
        totalCount: data.totalCount || 0,
        query: query.trim(),
        executionTimeMs,
        facets: data.facets || this.getEmptyFacets(),
        appliedFilters: filters,
      };
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        return {
          results: [],
          totalCount: 0,
          query: query.trim(),
          executionTimeMs: 0,
          facets: this.getEmptyFacets(),
          appliedFilters: filters,
        };
      }
      throw error;
    }
  }

  /**
   * Get facets/filter options based on current query context
   */
  public async getFacets(query: string, currentFilters: SearchFilters = {}): Promise<SearchFacets> {
    try {
      const params = this.buildSearchParams(query, currentFilters);
      params.set('facetsOnly', 'true');

      const response = await fetch(
        `${this.apiBaseUrl}/search/facets?${params.toString()}`
      );

      if (!response.ok) {
        return this.getEmptyFacets();
      }

      const data = await response.json();
      return data.facets || this.getEmptyFacets();
    } catch {
      return this.getEmptyFacets();
    }
  }

  /**
   * Save a search query with filters as a bookmark
   */
  public saveSearch(name: string, query: string, filters: SearchFilters): SavedSearch {
    const trimmedName = name.trim();
    if (!trimmedName) {
      throw new Error('Saved search name is required');
    }

    const savedSearch: SavedSearch = {
      id: this.generateId(),
      name: trimmedName,
      query: query.trim(),
      filters: { ...filters },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Check for duplicate names and replace
    this.savedSearches = this.savedSearches.filter(
      s => s.name.toLowerCase() !== trimmedName.toLowerCase()
    );

    this.savedSearches.unshift(savedSearch);

    // Enforce max saved searches limit
    if (this.savedSearches.length > this.maxSavedSearches) {
      this.savedSearches = this.savedSearches.slice(0, this.maxSavedSearches);
    }

    this.persistSavedSearches();
    return savedSearch;
  }

  /**
   * Remove a saved search by ID
   */
  public removeSavedSearch(id: string): boolean {
    const initialLength = this.savedSearches.length;
    this.savedSearches = this.savedSearches.filter(s => s.id !== id);

    if (this.savedSearches.length !== initialLength) {
      this.persistSavedSearches();
      return true;
    }
    return false;
  }

  /**
   * Update a saved search name
   */
  public updateSavedSearch(id: string, updates: { name?: string; query?: string; filters?: SearchFilters }): SavedSearch | null {
    const index = this.savedSearches.findIndex(s => s.id === id);
    if (index === -1) return null;

    const existing = this.savedSearches[index]!;
    const updated: SavedSearch = {
      id: existing.id,
      createdAt: existing.createdAt,
      name: updates.name?.trim() || existing.name,
      query: updates.query !== undefined ? updates.query.trim() : existing.query,
      filters: updates.filters ?? existing.filters,
      updatedAt: new Date().toISOString(),
    };

    this.savedSearches[index] = updated;
    this.persistSavedSearches();
    return updated;
  }

  /**
   * Get all saved searches
   */
  public getSavedSearches(): SavedSearch[] {
    return [...this.savedSearches];
  }

  /**
   * Get a saved search by ID
   */
  public getSavedSearchById(id: string): SavedSearch | undefined {
    return this.savedSearches.find(s => s.id === id);
  }

  /**
   * Apply a date range preset and return the actual date range
   */
  public resolveDateRangePreset(preset: DateRangeFilter['preset']): { from: string; to: string } {
    const now = new Date();
    const to = now.toISOString().split('T')[0] as string;

    switch (preset) {
      case 'today': {
        return { from: to, to };
      }
      case 'last-7-days': {
        const from = new Date(now);
        from.setDate(from.getDate() - 7);
        return { from: from.toISOString().split('T')[0] as string, to };
      }
      case 'last-30-days': {
        const from = new Date(now);
        from.setDate(from.getDate() - 30);
        return { from: from.toISOString().split('T')[0] as string, to };
      }
      case 'last-90-days': {
        const from = new Date(now);
        from.setDate(from.getDate() - 90);
        return { from: from.toISOString().split('T')[0] as string, to };
      }
      case 'last-year': {
        const from = new Date(now);
        from.setFullYear(from.getFullYear() - 1);
        return { from: from.toISOString().split('T')[0] as string, to };
      }
      default:
        return { from: '', to: '' };
    }
  }

  /**
   * Build URL search params from query and filters
   */
  public buildSearchParams(query: string, filters: SearchFilters): URLSearchParams {
    const params = new URLSearchParams();

    if (query.trim()) {
      params.set('q', query.trim());
    }

    if (filters.dateRange) {
      if (filters.dateRange.preset && filters.dateRange.preset !== 'custom') {
        const resolved = this.resolveDateRangePreset(filters.dateRange.preset);
        params.set('dateFrom', resolved.from);
        params.set('dateTo', resolved.to);
      } else {
        if (filters.dateRange.from) params.set('dateFrom', filters.dateRange.from);
        if (filters.dateRange.to) params.set('dateTo', filters.dateRange.to);
      }
    }

    if (filters.contentType && filters.contentType.types.length > 0) {
      params.set('types', filters.contentType.types.join(','));
    }

    if (filters.creator && filters.creator.creatorIds.length > 0) {
      params.set('creators', filters.creator.creatorIds.join(','));
    }

    if (filters.projectId) {
      params.set('projectId', filters.projectId);
    }

    if (filters.scope && filters.scope !== 'all') {
      params.set('scope', filters.scope);
    }

    if (filters.sortBy && filters.sortBy !== 'relevance') {
      params.set('sortBy', filters.sortBy);
    }

    return params;
  }

  /**
   * Get the count of active filters
   */
  public getActiveFilterCount(filters: SearchFilters): number {
    let count = 0;

    if (filters.dateRange && (filters.dateRange.from || filters.dateRange.to || filters.dateRange.preset)) {
      count++;
    }
    if (filters.contentType && filters.contentType.types.length > 0) {
      count++;
    }
    if (filters.creator && filters.creator.creatorIds.length > 0) {
      count++;
    }
    if (filters.projectId) {
      count++;
    }
    if (filters.scope && filters.scope !== 'all') {
      count++;
    }
    if (filters.sortBy && filters.sortBy !== 'relevance') {
      count++;
    }

    return count;
  }

  /**
   * Check if any filters are active
   */
  public hasActiveFilters(filters: SearchFilters): boolean {
    return this.getActiveFilterCount(filters) > 0;
  }

  /**
   * Clear all filters and return empty filters object
   */
  public clearFilters(): SearchFilters {
    return {};
  }

  /**
   * Get the underlying search service for basic search operations
   */
  public getBaseSearchService(): SearchService {
    return this.searchService;
  }

  /**
   * Cancel any pending advanced search
   */
  public cancel(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    this.searchService.cancel();
  }

  /**
   * Destroy the service and clean up
   */
  public destroy(): void {
    this.cancel();
    this.searchService.destroy();
  }

  private getEmptyFacets(): SearchFacets {
    return {
      contentTypes: [],
      creators: [],
      projects: [],
      dateRanges: [],
    };
  }

  private generateId(): string {
    return `ss_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  private loadSavedSearches(): void {
    try {
      const stored = window.localStorage.getItem(SAVED_SEARCHES_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          this.savedSearches = parsed.slice(0, this.maxSavedSearches);
        }
      }
    } catch {
      this.savedSearches = [];
    }
  }

  private persistSavedSearches(): void {
    try {
      window.localStorage.setItem(
        SAVED_SEARCHES_KEY,
        JSON.stringify(this.savedSearches)
      );
    } catch {
      // Storage unavailable, fail silently
    }
  }
}
