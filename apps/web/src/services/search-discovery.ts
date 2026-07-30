/**
 * Search Discovery Service
 * 
 * Provides search discovery and recommendation features including:
 * - Alternative suggestions when no results are found
 * - Content discovery recommendations based on user activity
 * - Popular content and trending searches
 * - Search analytics and improvement suggestions
 * 
 * Requirements: 14.10
 */

import { SearchResult } from './search.js';

export interface SearchSuggestionItem {
  text: string;
  reason: string;
  type: 'spelling' | 'related' | 'broader' | 'narrower';
}

export interface ContentRecommendation {
  id: string;
  title: string;
  description?: string;
  type: 'video' | 'project' | 'comment' | 'member';
  thumbnailUrl?: string;
  url: string;
  reason: string;
  score: number;
}

export interface TrendingSearch {
  query: string;
  searchCount: number;
  trend: 'rising' | 'stable' | 'declining';
  category?: string;
}

export interface PopularContent {
  id: string;
  title: string;
  type: 'video' | 'project';
  thumbnailUrl?: string;
  url: string;
  viewCount: number;
  recentActivity: number;
}

export interface SearchAnalytics {
  totalSearches: number;
  successfulSearches: number;
  failedSearches: number;
  averageResultCount: number;
  topQueries: Array<{ query: string; count: number }>;
  improvementSuggestions: SearchImprovementSuggestion[];
}

export interface SearchImprovementSuggestion {
  id: string;
  type: 'add-content' | 'use-tags' | 'improve-titles' | 'add-descriptions' | 'organize-projects';
  title: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
  actionUrl?: string;
}

export interface SearchDiscoveryOptions {
  apiBaseUrl?: string;
  maxSuggestions?: number;
  maxRecommendations?: number;
  maxTrending?: number;
  maxPopular?: number;
}

const SEARCH_HISTORY_KEY = 'streetstudio_search_history';
const MAX_HISTORY_ENTRIES = 100;

interface SearchHistoryEntry {
  query: string;
  resultCount: number;
  timestamp: string;
}

export class SearchDiscoveryService {
  private apiBaseUrl: string;
  private maxSuggestions: number;
  private maxRecommendations: number;
  private maxTrending: number;
  private maxPopular: number;
  private searchHistory: SearchHistoryEntry[] = [];
  private abortController: AbortController | null = null;

  constructor(options: SearchDiscoveryOptions = {}) {
    this.apiBaseUrl = options.apiBaseUrl ?? '/api';
    this.maxSuggestions = options.maxSuggestions ?? 5;
    this.maxRecommendations = options.maxRecommendations ?? 6;
    this.maxTrending = options.maxTrending ?? 8;
    this.maxPopular = options.maxPopular ?? 6;
    this.loadSearchHistory();
  }

  /**
   * Generate alternative suggestions when a search returns no results.
   * Analyzes the query to provide spelling corrections, related terms,
   * broader/narrower alternatives.
   */
  public getAlternativeSuggestions(query: string): SearchSuggestionItem[] {
    const trimmedQuery = query.trim().toLowerCase();
    if (!trimmedQuery) return [];

    const suggestions: SearchSuggestionItem[] = [];

    // Check for potential spelling corrections
    const spellingCorrections = this.getSpellingCorrections(trimmedQuery);
    suggestions.push(...spellingCorrections);

    // Suggest related terms
    const relatedTerms = this.getRelatedTerms(trimmedQuery);
    suggestions.push(...relatedTerms);

    // Suggest broader queries (remove specific terms)
    const broaderSuggestions = this.getBroaderSuggestions(trimmedQuery);
    suggestions.push(...broaderSuggestions);

    // Suggest narrower/more specific queries
    const narrowerSuggestions = this.getNarrowerSuggestions(trimmedQuery);
    suggestions.push(...narrowerSuggestions);

    return suggestions.slice(0, this.maxSuggestions);
  }

  /**
   * Get content discovery recommendations based on user activity and context.
   */
  public async getRecommendations(): Promise<ContentRecommendation[]> {
    if (this.abortController) {
      this.abortController.abort();
    }

    this.abortController = new AbortController();

    try {
      const response = await fetch(
        `${this.apiBaseUrl}/search/recommendations?limit=${this.maxRecommendations}`,
        { signal: this.abortController.signal }
      );

      if (!response.ok) {
        return this.getFallbackRecommendations();
      }

      const data = await response.json();
      return (data.recommendations || []).slice(0, this.maxRecommendations);
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        return [];
      }
      return this.getFallbackRecommendations();
    }
  }

  /**
   * Get trending searches across the organization.
   */
  public async getTrendingSearches(): Promise<TrendingSearch[]> {
    try {
      const response = await fetch(
        `${this.apiBaseUrl}/search/trending?limit=${this.maxTrending}`
      );

      if (!response.ok) {
        return this.getFallbackTrendingSearches();
      }

      const data = await response.json();
      return (data.trending || []).slice(0, this.maxTrending);
    } catch {
      return this.getFallbackTrendingSearches();
    }
  }

  /**
   * Get popular content items across the organization.
   */
  public async getPopularContent(): Promise<PopularContent[]> {
    try {
      const response = await fetch(
        `${this.apiBaseUrl}/search/popular?limit=${this.maxPopular}`
      );

      if (!response.ok) {
        return [];
      }

      const data = await response.json();
      return (data.popular || []).slice(0, this.maxPopular);
    } catch {
      return [];
    }
  }

  /**
   * Get search analytics and improvement suggestions based on local search history.
   */
  public getSearchAnalytics(): SearchAnalytics {
    const totalSearches = this.searchHistory.length;
    const successfulSearches = this.searchHistory.filter(e => e.resultCount > 0).length;
    const failedSearches = totalSearches - successfulSearches;

    const totalResults = this.searchHistory.reduce((sum, e) => sum + e.resultCount, 0);
    const averageResultCount = totalSearches > 0 ? Math.round(totalResults / totalSearches) : 0;

    const topQueries = this.getTopQueries();
    const improvementSuggestions = this.generateImprovementSuggestions();

    return {
      totalSearches,
      successfulSearches,
      failedSearches,
      averageResultCount,
      topQueries,
      improvementSuggestions,
    };
  }

  /**
   * Record a search event for analytics purposes.
   */
  public recordSearchEvent(query: string, resultCount: number): void {
    const trimmedQuery = query.trim();
    if (!trimmedQuery) return;

    this.searchHistory.push({
      query: trimmedQuery,
      resultCount,
      timestamp: new Date().toISOString(),
    });

    // Limit history size
    if (this.searchHistory.length > MAX_HISTORY_ENTRIES) {
      this.searchHistory = this.searchHistory.slice(-MAX_HISTORY_ENTRIES);
    }

    this.saveSearchHistory();
  }

  /**
   * Clear search history used for analytics.
   */
  public clearSearchHistory(): void {
    this.searchHistory = [];
    this.saveSearchHistory();
  }

  /**
   * Cancel any pending API requests.
   */
  public cancel(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  /**
   * Destroy and clean up.
   */
  public destroy(): void {
    this.cancel();
  }

  // --- Private helpers ---

  private getSpellingCorrections(query: string): SearchSuggestionItem[] {
    const corrections: SearchSuggestionItem[] = [];

    // Common misspelling patterns in video/recording context
    const commonCorrections: Record<string, string> = {
      'recroding': 'recording',
      'recoding': 'recording',
      'recordign': 'recording',
      'vidoe': 'video',
      'vdieo': 'video',
      'screeen': 'screen',
      'scrren': 'screen',
      'projecct': 'project',
      'projcet': 'project',
      'editting': 'editing',
      'editng': 'editing',
      'uplod': 'upload',
      'uplaod': 'upload',
      'collab': 'collaboration',
      'commnet': 'comment',
      'coment': 'comment',
      'captions': 'captions',
      'captoin': 'caption',
      'timelien': 'timeline',
      'timline': 'timeline',
    };

    // Check each word in the query
    const words = query.split(/\s+/);
    for (const word of words) {
      if (commonCorrections[word]) {
        const corrected = query.replace(word, commonCorrections[word]!);
        corrections.push({
          text: corrected,
          reason: `Did you mean "${commonCorrections[word]!}"?`,
          type: 'spelling',
        });
      }
    }

    // Check for doubled characters
    const doubledCharFix = query.replace(/(.)\1{2,}/g, '$1$1');
    if (doubledCharFix !== query) {
      corrections.push({
        text: doubledCharFix,
        reason: 'Possible typo correction',
        type: 'spelling',
      });
    }

    return corrections.slice(0, 2);
  }

  private getRelatedTerms(query: string): SearchSuggestionItem[] {
    const relatedTerms: SearchSuggestionItem[] = [];

    // Domain-specific term relationships
    const termRelations: Record<string, string[]> = {
      'video': ['recording', 'clip', 'footage', 'screen capture'],
      'recording': ['video', 'capture', 'screen recording', 'session'],
      'project': ['workspace', 'folder', 'collection'],
      'edit': ['trim', 'cut', 'splice', 'timeline'],
      'comment': ['feedback', 'review', 'annotation', 'note'],
      'share': ['collaborate', 'export', 'publish', 'embed'],
      'upload': ['import', 'add video', 'new recording'],
      'team': ['members', 'organization', 'collaborators'],
      'caption': ['subtitle', 'transcript', 'text overlay'],
      'timeline': ['editor', 'trim', 'split'],
      'search': ['find', 'filter', 'browse'],
    };

    const queryWords = query.split(/\s+/);
    for (const word of queryWords) {
      const related = termRelations[word];
      if (related) {
        for (const term of related.slice(0, 2)) {
          const suggestion = queryWords.length > 1
            ? query.replace(word, term)
            : term;
          relatedTerms.push({
            text: suggestion,
            reason: `Related to "${word}"`,
            type: 'related',
          });
        }
      }
    }

    return relatedTerms.slice(0, 3);
  }

  private getBroaderSuggestions(query: string): SearchSuggestionItem[] {
    const suggestions: SearchSuggestionItem[] = [];
    const words = query.split(/\s+/);

    if (words.length > 1) {
      // Remove the least significant word (usually adjectives or qualifiers)
      const qualifiers = ['new', 'old', 'recent', 'latest', 'first', 'last', 'my', 'all', 'the'];
      
      for (const qualifier of qualifiers) {
        const idx = words.indexOf(qualifier);
        if (idx !== -1) {
          const broader = words.filter((_, i) => i !== idx).join(' ');
          if (broader.trim()) {
            suggestions.push({
              text: broader,
              reason: 'Try a broader search',
              type: 'broader',
            });
            break;
          }
        }
      }

      // If no qualifier found, try removing the last word
      if (suggestions.length === 0 && words.length >= 2) {
        const broader = words.slice(0, -1).join(' ');
        suggestions.push({
          text: broader,
          reason: 'Try fewer keywords',
          type: 'broader',
        });
      }
    }

    return suggestions.slice(0, 1);
  }

  private getNarrowerSuggestions(query: string): SearchSuggestionItem[] {
    const suggestions: SearchSuggestionItem[] = [];
    const words = query.split(/\s+/);

    if (words.length <= 2) {
      // Suggest adding type qualifiers
      const typeQualifiers = ['video', 'project', 'in my projects', 'recent'];
      for (const qualifier of typeQualifiers) {
        if (!query.includes(qualifier)) {
          suggestions.push({
            text: `${query} ${qualifier}`,
            reason: 'Try a more specific search',
            type: 'narrower',
          });
          break;
        }
      }
    }

    return suggestions.slice(0, 1);
  }

  private getFallbackRecommendations(): ContentRecommendation[] {
    // Return empty recommendations when API is unavailable
    return [];
  }

  private getFallbackTrendingSearches(): TrendingSearch[] {
    // Return static trending data as fallback
    return [
      { query: 'screen recording', searchCount: 42, trend: 'rising' },
      { query: 'project collaboration', searchCount: 35, trend: 'stable' },
      { query: 'video editing', searchCount: 28, trend: 'rising' },
      { query: 'captions', searchCount: 22, trend: 'stable' },
    ];
  }

  private getTopQueries(): Array<{ query: string; count: number }> {
    const queryCounts = new Map<string, number>();

    for (const entry of this.searchHistory) {
      const normalized = entry.query.toLowerCase();
      queryCounts.set(normalized, (queryCounts.get(normalized) || 0) + 1);
    }

    return Array.from(queryCounts.entries())
      .map(([query, count]) => ({ query, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }

  private generateImprovementSuggestions(): SearchImprovementSuggestion[] {
    const suggestions: SearchImprovementSuggestion[] = [];
    const failureRate = this.searchHistory.length > 0
      ? this.searchHistory.filter(e => e.resultCount === 0).length / this.searchHistory.length
      : 0;

    if (failureRate > 0.5 && this.searchHistory.length >= 5) {
      suggestions.push({
        id: 'high-failure-rate',
        type: 'add-content',
        title: 'Add more content',
        description: 'More than half of recent searches found no results. Adding more videos and projects will improve discovery.',
        priority: 'high',
        actionUrl: '/projects/new',
      });
    }

    if (failureRate > 0.3 && this.searchHistory.length >= 5) {
      suggestions.push({
        id: 'improve-titles',
        type: 'improve-titles',
        title: 'Improve video titles',
        description: 'Use descriptive titles with keywords that your team commonly searches for.',
        priority: 'medium',
      });
    }

    if (this.searchHistory.length >= 10) {
      const avgResults = this.searchHistory.reduce((s, e) => s + e.resultCount, 0) / this.searchHistory.length;
      if (avgResults < 3) {
        suggestions.push({
          id: 'add-descriptions',
          type: 'add-descriptions',
          title: 'Add descriptions to content',
          description: 'Adding detailed descriptions helps search find relevant content more effectively.',
          priority: 'medium',
        });
      }
    }

    suggestions.push({
      id: 'use-tags',
      type: 'use-tags',
      title: 'Use tags for organization',
      description: 'Tag your videos and projects to make them easier to find through search.',
      priority: 'low',
    });

    return suggestions;
  }

  private loadSearchHistory(): void {
    try {
      const stored = window.localStorage.getItem(SEARCH_HISTORY_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          this.searchHistory = parsed.slice(-MAX_HISTORY_ENTRIES);
        }
      }
    } catch {
      this.searchHistory = [];
    }
  }

  private saveSearchHistory(): void {
    try {
      window.localStorage.setItem(
        SEARCH_HISTORY_KEY,
        JSON.stringify(this.searchHistory)
      );
    } catch {
      // Storage unavailable, fail silently
    }
  }
}
