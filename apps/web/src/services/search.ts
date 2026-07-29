/**
 * Search Service
 * 
 * Provides search functionality with debounced queries, recent searches,
 * autocomplete suggestions, and result formatting.
 * 
 * Requirements: 14.1, 14.3, 14.5
 */

export interface SearchResult {
  id: string;
  type: 'video' | 'project' | 'comment' | 'member';
  title: string;
  description?: string;
  thumbnailUrl?: string;
  url: string;
  metadata: Record<string, string>;
  highlightedTitle?: string;
  highlightedDescription?: string;
  timestamp?: string;
}

export interface SearchSuggestion {
  text: string;
  type: 'recent' | 'suggestion' | 'popular';
  icon?: string;
}

export interface SearchResponse {
  results: SearchResult[];
  totalCount: number;
  query: string;
  executionTimeMs: number;
}

export interface SearchServiceOptions {
  debounceMs?: number;
  maxRecentSearches?: number;
  maxSuggestions?: number;
  apiBaseUrl?: string;
}

const RECENT_SEARCHES_KEY = 'streetstudio_recent_searches';
const MAX_RECENT_SEARCHES_DEFAULT = 10;
const DEBOUNCE_MS_DEFAULT = 300;
const MAX_SUGGESTIONS_DEFAULT = 8;

export class SearchService {
  private debounceMs: number;
  private maxRecentSearches: number;
  private maxSuggestions: number;
  private apiBaseUrl: string;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private abortController: AbortController | null = null;
  private recentSearches: string[] = [];

  constructor(options: SearchServiceOptions = {}) {
    this.debounceMs = options.debounceMs ?? DEBOUNCE_MS_DEFAULT;
    this.maxRecentSearches = options.maxRecentSearches ?? MAX_RECENT_SEARCHES_DEFAULT;
    this.maxSuggestions = options.maxSuggestions ?? MAX_SUGGESTIONS_DEFAULT;
    this.apiBaseUrl = options.apiBaseUrl ?? '/api';
    this.loadRecentSearches();
  }

  /**
   * Perform a debounced search query
   */
  public search(query: string, callback: (response: SearchResponse | null, error?: Error) => void): void {
    // Cancel any pending debounced search
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    // Cancel any in-flight request
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }

    const trimmedQuery = query.trim();

    if (!trimmedQuery) {
      callback(null);
      return;
    }

    this.debounceTimer = setTimeout(() => {
      this.executeSearch(trimmedQuery, callback);
    }, this.debounceMs);
  }

  /**
   * Perform an immediate search without debounce
   */
  public async searchImmediate(query: string): Promise<SearchResponse> {
    const trimmedQuery = query.trim();

    if (!trimmedQuery) {
      return { results: [], totalCount: 0, query: '', executionTimeMs: 0 };
    }

    // Cancel any in-flight request
    if (this.abortController) {
      this.abortController.abort();
    }

    this.abortController = new AbortController();
    const startTime = performance.now();

    try {
      const response = await fetch(
        `${this.apiBaseUrl}/search?q=${encodeURIComponent(trimmedQuery)}`,
        { signal: this.abortController.signal }
      );

      if (!response.ok) {
        throw new Error(`Search request failed: ${response.status}`);
      }

      const data = await response.json();
      const executionTimeMs = performance.now() - startTime;

      return {
        results: data.results || [],
        totalCount: data.totalCount || 0,
        query: trimmedQuery,
        executionTimeMs,
      };
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        return { results: [], totalCount: 0, query: trimmedQuery, executionTimeMs: 0 };
      }
      throw error;
    }
  }

  /**
   * Get autocomplete suggestions for a query
   */
  public getSuggestions(query: string): SearchSuggestion[] {
    const trimmedQuery = query.trim().toLowerCase();
    const suggestions: SearchSuggestion[] = [];

    if (!trimmedQuery) {
      // Return recent searches when query is empty
      return this.recentSearches.slice(0, this.maxSuggestions).map(text => ({
        text,
        type: 'recent' as const,
        icon: 'clock',
      }));
    }

    // Match recent searches first
    const matchingRecent = this.recentSearches
      .filter(s => s.toLowerCase().includes(trimmedQuery))
      .slice(0, 3)
      .map(text => ({
        text,
        type: 'recent' as const,
        icon: 'clock',
      }));

    suggestions.push(...matchingRecent);

    // Add common suggestion patterns
    const commonSuggestions = this.generateSuggestions(trimmedQuery);
    suggestions.push(...commonSuggestions);

    return suggestions.slice(0, this.maxSuggestions);
  }

  /**
   * Add a query to recent searches
   */
  public addToRecentSearches(query: string): void {
    const trimmedQuery = query.trim();
    if (!trimmedQuery) return;

    // Remove duplicates
    this.recentSearches = this.recentSearches.filter(
      s => s.toLowerCase() !== trimmedQuery.toLowerCase()
    );

    // Add to the beginning
    this.recentSearches.unshift(trimmedQuery);

    // Trim to max
    if (this.recentSearches.length > this.maxRecentSearches) {
      this.recentSearches = this.recentSearches.slice(0, this.maxRecentSearches);
    }

    this.saveRecentSearches();
  }

  /**
   * Remove a query from recent searches
   */
  public removeFromRecentSearches(query: string): void {
    this.recentSearches = this.recentSearches.filter(
      s => s.toLowerCase() !== query.toLowerCase()
    );
    this.saveRecentSearches();
  }

  /**
   * Clear all recent searches
   */
  public clearRecentSearches(): void {
    this.recentSearches = [];
    this.saveRecentSearches();
  }

  /**
   * Get current recent searches
   */
  public getRecentSearches(): string[] {
    return [...this.recentSearches];
  }

  /**
   * Cancel any pending search
   */
  public cancel(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  /**
   * Highlight matching text in a string
   */
  public highlightMatch(text: string, query: string): string {
    if (!query.trim()) return text;

    const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${escapedQuery})`, 'gi');
    return text.replace(regex, '<mark class="bg-yellow-200 dark:bg-yellow-800 rounded px-0.5">$1</mark>');
  }

  /**
   * Destroy the service and cancel pending operations
   */
  public destroy(): void {
    this.cancel();
  }

  private async executeSearch(query: string, callback: (response: SearchResponse | null, error?: Error) => void): Promise<void> {
    try {
      const response = await this.searchImmediate(query);
      callback(response);
    } catch (error) {
      callback(null, error as Error);
    }
  }

  private generateSuggestions(query: string): SearchSuggestion[] {
    // Generate type-based suggestions
    const typeSuggestions: SearchSuggestion[] = [];
    const types = ['video', 'project', 'comment', 'member'];

    for (const type of types) {
      if (type.startsWith(query) || query.length >= 2) {
        typeSuggestions.push({
          text: `${query} in:${type}s`,
          type: 'suggestion',
          icon: 'filter',
        });
      }
    }

    return typeSuggestions.slice(0, 4);
  }

  private loadRecentSearches(): void {
    try {
      const stored = window.localStorage.getItem(RECENT_SEARCHES_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          this.recentSearches = parsed.slice(0, this.maxRecentSearches);
        }
      }
    } catch {
      this.recentSearches = [];
    }
  }

  private saveRecentSearches(): void {
    try {
      window.localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(this.recentSearches));
    } catch {
      // Storage unavailable, fail silently
    }
  }
}
