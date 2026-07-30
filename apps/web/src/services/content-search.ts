/**
 * Content-Specific Search Service
 * 
 * Provides transcript search within videos with timestamp navigation,
 * project-scoped and organization-wide search options,
 * natural language and semantic search capabilities,
 * and search result highlighting with context display.
 * 
 * Requirements: 14.4, 14.6, 14.9
 */

import { SearchResult, SearchResponse } from './search.js';

// --- Transcript Search Types ---

export interface TranscriptSegment {
  id: string;
  videoId: string;
  text: string;
  startTime: number; // seconds
  endTime: number;   // seconds
  speaker?: string;
  confidence?: number;
}

export interface TranscriptSearchMatch {
  segment: TranscriptSegment;
  matchedText: string;
  highlightedText: string;
  contextBefore: string;
  contextAfter: string;
}

export interface TranscriptSearchResponse {
  videoId: string;
  videoTitle: string;
  matches: TranscriptSearchMatch[];
  totalMatches: number;
  query: string;
  executionTimeMs: number;
}

// --- Scoped Search Types ---

export type SearchScope = 'project' | 'organization' | 'personal' | 'team';

export interface ScopeConfig {
  scope: SearchScope;
  scopeId?: string; // project ID, org ID, or team ID
  scopeLabel: string;
}

export interface ScopedSearchResponse extends SearchResponse {
  scope: ScopeConfig;
}

// --- Semantic Search Types ---

export interface SemanticSearchOptions {
  enableNLP: boolean;
  conceptExpansion: boolean;
  synonymMatching: boolean;
  fuzzyThreshold?: number; // 0 to 1, default 0.7
}

export interface SemanticMatch {
  result: SearchResult;
  relevanceScore: number;
  matchType: 'exact' | 'synonym' | 'concept' | 'fuzzy';
  matchReason: string;
}

export interface SemanticSearchResponse {
  matches: SemanticMatch[];
  totalCount: number;
  query: string;
  expandedTerms: string[];
  executionTimeMs: number;
}

// --- Highlighted Result Types ---

export interface HighlightedContext {
  text: string;
  highlights: HighlightRange[];
}

export interface HighlightRange {
  start: number;
  end: number;
  term: string;
}

export interface SearchResultWithContext extends SearchResult {
  contextSnippets: HighlightedContext[];
  matchCount: number;
  relevanceScore: number;
}

// --- Content Search Service Options ---

export interface ContentSearchServiceOptions {
  apiBaseUrl?: string;
  maxContextSnippets?: number;
  contextWindowSize?: number; // characters around match
  semanticDefaults?: Partial<SemanticSearchOptions>;
}

const MAX_CONTEXT_SNIPPETS_DEFAULT = 3;
const CONTEXT_WINDOW_SIZE_DEFAULT = 80;

export class ContentSearchService {
  private apiBaseUrl: string;
  private maxContextSnippets: number;
  private contextWindowSize: number;
  private semanticDefaults: SemanticSearchOptions;
  private abortController: AbortController | null = null;

  constructor(options: ContentSearchServiceOptions = {}) {
    this.apiBaseUrl = options.apiBaseUrl ?? '/api';
    this.maxContextSnippets = options.maxContextSnippets ?? MAX_CONTEXT_SNIPPETS_DEFAULT;
    this.contextWindowSize = options.contextWindowSize ?? CONTEXT_WINDOW_SIZE_DEFAULT;
    this.semanticDefaults = {
      enableNLP: true,
      conceptExpansion: true,
      synonymMatching: true,
      fuzzyThreshold: 0.7,
      ...options.semanticDefaults,
    };
  }

  // ==========================================
  // Transcript Search
  // ==========================================

  /**
   * Search within a video's transcript and return matches with timestamps
   */
  public async searchTranscript(
    videoId: string,
    query: string
  ): Promise<TranscriptSearchResponse> {
    const trimmedQuery = query.trim();

    if (!trimmedQuery || !videoId) {
      return {
        videoId,
        videoTitle: '',
        matches: [],
        totalMatches: 0,
        query: trimmedQuery,
        executionTimeMs: 0,
      };
    }

    this.cancelPending();
    this.abortController = new AbortController();
    const startTime = performance.now();

    try {
      const params = new URLSearchParams({
        q: trimmedQuery,
      });

      const response = await fetch(
        `${this.apiBaseUrl}/videos/${encodeURIComponent(videoId)}/transcript/search?${params.toString()}`,
        { signal: this.abortController.signal }
      );

      if (!response.ok) {
        throw new Error(`Transcript search failed: ${response.status}`);
      }

      const data = await response.json();
      const executionTimeMs = performance.now() - startTime;

      return {
        videoId,
        videoTitle: data.videoTitle || '',
        matches: (data.matches || []).map((m: any) => this.enrichTranscriptMatch(m, trimmedQuery)),
        totalMatches: data.totalMatches || 0,
        query: trimmedQuery,
        executionTimeMs,
      };
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        return {
          videoId,
          videoTitle: '',
          matches: [],
          totalMatches: 0,
          query: trimmedQuery,
          executionTimeMs: 0,
        };
      }
      throw error;
    }
  }

  /**
   * Search across multiple video transcripts within a scope
   */
  public async searchTranscriptsInScope(
    query: string,
    scope: ScopeConfig
  ): Promise<TranscriptSearchResponse[]> {
    const trimmedQuery = query.trim();

    if (!trimmedQuery) {
      return [];
    }

    this.cancelPending();
    this.abortController = new AbortController();

    try {
      const params = new URLSearchParams({
        q: trimmedQuery,
        scope: scope.scope,
      });

      if (scope.scopeId) {
        params.set('scopeId', scope.scopeId);
      }

      const response = await fetch(
        `${this.apiBaseUrl}/search/transcripts?${params.toString()}`,
        { signal: this.abortController.signal }
      );

      if (!response.ok) {
        throw new Error(`Transcript scope search failed: ${response.status}`);
      }

      const data = await response.json();
      return (data.results || []).map((r: any) => ({
        videoId: r.videoId,
        videoTitle: r.videoTitle || '',
        matches: (r.matches || []).map((m: any) => this.enrichTranscriptMatch(m, trimmedQuery)),
        totalMatches: r.totalMatches || 0,
        query: trimmedQuery,
        executionTimeMs: 0,
      }));
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        return [];
      }
      throw error;
    }
  }

  /**
   * Format a timestamp in seconds to a display string (MM:SS or HH:MM:SS)
   */
  public formatTimestamp(seconds: number): string {
    if (seconds < 0 || !isFinite(seconds)) return '0:00';

    const totalSeconds = Math.floor(seconds);
    const hrs = Math.floor(totalSeconds / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;

    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  /**
   * Generate a navigation URL or action for jumping to a timestamp in a video
   */
  public getTimestampNavigation(videoId: string, timestampSeconds: number): { url: string; timestamp: number } {
    return {
      url: `/videos/${encodeURIComponent(videoId)}?t=${Math.floor(timestampSeconds)}`,
      timestamp: Math.floor(timestampSeconds),
    };
  }

  // ==========================================
  // Scoped Search
  // ==========================================

  /**
   * Perform search within a specific scope
   */
  public async searchInScope(
    query: string,
    scope: ScopeConfig
  ): Promise<ScopedSearchResponse> {
    const trimmedQuery = query.trim();

    if (!trimmedQuery) {
      return {
        results: [],
        totalCount: 0,
        query: '',
        executionTimeMs: 0,
        scope,
      };
    }

    this.cancelPending();
    this.abortController = new AbortController();
    const startTime = performance.now();

    try {
      const params = new URLSearchParams({
        q: trimmedQuery,
        scope: scope.scope,
      });

      if (scope.scopeId) {
        params.set('scopeId', scope.scopeId);
      }

      const response = await fetch(
        `${this.apiBaseUrl}/search/scoped?${params.toString()}`,
        { signal: this.abortController.signal }
      );

      if (!response.ok) {
        throw new Error(`Scoped search failed: ${response.status}`);
      }

      const data = await response.json();
      const executionTimeMs = performance.now() - startTime;

      return {
        results: data.results || [],
        totalCount: data.totalCount || 0,
        query: trimmedQuery,
        executionTimeMs,
        scope,
      };
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        return {
          results: [],
          totalCount: 0,
          query: trimmedQuery,
          executionTimeMs: 0,
          scope,
        };
      }
      throw error;
    }
  }

  /**
   * Get available search scopes for the current user
   */
  public async getAvailableScopes(): Promise<ScopeConfig[]> {
    try {
      const response = await fetch(`${this.apiBaseUrl}/search/scopes`);

      if (!response.ok) {
        return this.getDefaultScopes();
      }

      const data = await response.json();
      return data.scopes || this.getDefaultScopes();
    } catch {
      return this.getDefaultScopes();
    }
  }

  /**
   * Get default scopes when API is unavailable
   */
  public getDefaultScopes(): ScopeConfig[] {
    return [
      { scope: 'personal', scopeLabel: 'My Content' },
      { scope: 'organization', scopeLabel: 'Organization' },
    ];
  }

  // ==========================================
  // Semantic / NLP Search
  // ==========================================

  /**
   * Perform a natural language / semantic search
   */
  public async semanticSearch(
    query: string,
    options?: Partial<SemanticSearchOptions>
  ): Promise<SemanticSearchResponse> {
    const trimmedQuery = query.trim();
    const mergedOptions = { ...this.semanticDefaults, ...options };

    if (!trimmedQuery) {
      return {
        matches: [],
        totalCount: 0,
        query: '',
        expandedTerms: [],
        executionTimeMs: 0,
      };
    }

    this.cancelPending();
    this.abortController = new AbortController();
    const startTime = performance.now();

    try {
      const params = new URLSearchParams({
        q: trimmedQuery,
        nlp: String(mergedOptions.enableNLP),
        expand: String(mergedOptions.conceptExpansion),
        synonyms: String(mergedOptions.synonymMatching),
      });

      if (mergedOptions.fuzzyThreshold !== undefined) {
        params.set('fuzzyThreshold', String(mergedOptions.fuzzyThreshold));
      }

      const response = await fetch(
        `${this.apiBaseUrl}/search/semantic?${params.toString()}`,
        { signal: this.abortController.signal }
      );

      if (!response.ok) {
        throw new Error(`Semantic search failed: ${response.status}`);
      }

      const data = await response.json();
      const executionTimeMs = performance.now() - startTime;

      return {
        matches: (data.matches || []).map((m: any) => ({
          result: m.result,
          relevanceScore: m.relevanceScore ?? 0,
          matchType: m.matchType || 'exact',
          matchReason: m.matchReason || '',
        })),
        totalCount: data.totalCount || 0,
        query: trimmedQuery,
        expandedTerms: data.expandedTerms || [],
        executionTimeMs,
      };
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        return {
          matches: [],
          totalCount: 0,
          query: trimmedQuery,
          expandedTerms: [],
          executionTimeMs: 0,
        };
      }
      throw error;
    }
  }

  /**
   * Expand a query into related terms using NLP
   */
  public async expandQueryTerms(query: string): Promise<string[]> {
    const trimmedQuery = query.trim();
    if (!trimmedQuery) return [];

    try {
      const response = await fetch(
        `${this.apiBaseUrl}/search/expand?q=${encodeURIComponent(trimmedQuery)}`
      );

      if (!response.ok) {
        return this.localExpandTerms(trimmedQuery);
      }

      const data = await response.json();
      return data.terms || [];
    } catch {
      return this.localExpandTerms(trimmedQuery);
    }
  }

  /**
   * Local fallback for query term expansion (basic synonym matching)
   */
  public localExpandTerms(query: string): string[] {
    const synonymMap: Record<string, string[]> = {
      'video': ['recording', 'clip', 'footage'],
      'recording': ['video', 'capture', 'clip'],
      'edit': ['modify', 'change', 'trim', 'cut'],
      'trim': ['cut', 'shorten', 'edit'],
      'project': ['workspace', 'collection'],
      'team': ['group', 'members', 'organization'],
      'comment': ['feedback', 'note', 'annotation'],
      'share': ['send', 'distribute', 'publish'],
      'upload': ['import', 'add', 'submit'],
      'search': ['find', 'look for', 'locate'],
      'delete': ['remove', 'trash', 'discard'],
      'create': ['new', 'make', 'add'],
    };

    const words = query.toLowerCase().split(/\s+/);
    const expanded: Set<string> = new Set();

    for (const word of words) {
      const synonyms = synonymMap[word];
      if (synonyms) {
        for (const syn of synonyms) {
          expanded.add(syn);
        }
      }
    }

    return Array.from(expanded).slice(0, 10);
  }

  // ==========================================
  // Result Highlighting & Context Display
  // ==========================================

  /**
   * Highlight search terms in a text and return context snippets
   */
  public highlightInContext(text: string, query: string): HighlightedContext[] {
    const trimmedQuery = query.trim();
    if (!trimmedQuery || !text) return [];

    const terms = this.extractSearchTerms(trimmedQuery);
    const contexts: HighlightedContext[] = [];

    for (const term of terms) {
      const regex = new RegExp(this.escapeRegex(term), 'gi');
      let match: RegExpExecArray | null;

      while ((match = regex.exec(text)) !== null) {
        if (contexts.length >= this.maxContextSnippets) break;

        const matchStart = match.index;
        const matchEnd = matchStart + match[0].length;

        // Calculate context window
        const contextStart = Math.max(0, matchStart - this.contextWindowSize);
        const contextEnd = Math.min(text.length, matchEnd + this.contextWindowSize);

        // Extract the snippet text
        let snippetText = text.substring(contextStart, contextEnd);

        // Add ellipsis for truncated context
        if (contextStart > 0) snippetText = '...' + snippetText;
        if (contextEnd < text.length) snippetText = snippetText + '...';

        // Calculate highlight positions within the snippet
        const adjustedStart = matchStart - contextStart + (contextStart > 0 ? 3 : 0);
        const adjustedEnd = adjustedStart + match[0].length;

        contexts.push({
          text: snippetText,
          highlights: [{
            start: adjustedStart,
            end: adjustedEnd,
            term: match[0],
          }],
        });
      }

      if (contexts.length >= this.maxContextSnippets) break;
    }

    return contexts;
  }

  /**
   * Generate HTML-highlighted text with <mark> tags
   */
  public highlightText(text: string, query: string): string {
    const trimmedQuery = query.trim();
    if (!trimmedQuery || !text) return text || '';

    const terms = this.extractSearchTerms(trimmedQuery);

    let result = text;
    for (const term of terms) {
      const regex = new RegExp(`(${this.escapeRegex(term)})`, 'gi');
      result = result.replace(
        regex,
        '<mark class="search-highlight bg-yellow-200 dark:bg-yellow-800 rounded px-0.5">$1</mark>'
      );
    }

    return result;
  }

  /**
   * Enrich search results with context snippets and highlighting
   */
  public enrichResultsWithContext(
    results: SearchResult[],
    query: string
  ): SearchResultWithContext[] {
    return results.map(result => {
      const searchableText = [result.title, result.description || ''].join(' ');
      const contextSnippets = this.highlightInContext(searchableText, query);
      const matchCount = this.countMatches(searchableText, query);

      return {
        ...result,
        highlightedTitle: this.highlightText(result.title, query),
        highlightedDescription: result.description
          ? this.highlightText(result.description, query)
          : undefined,
        contextSnippets,
        matchCount,
        relevanceScore: this.calculateRelevanceScore(result, query, matchCount),
      };
    });
  }

  // ==========================================
  // Utility Methods
  // ==========================================

  /**
   * Count the number of query term matches in text
   */
  public countMatches(text: string, query: string): number {
    if (!text || !query.trim()) return 0;

    const terms = this.extractSearchTerms(query);
    let count = 0;

    for (const term of terms) {
      const regex = new RegExp(this.escapeRegex(term), 'gi');
      const matches = text.match(regex);
      if (matches) {
        count += matches.length;
      }
    }

    return count;
  }

  /**
   * Extract individual search terms from a query string
   * Handles quoted phrases and individual words
   */
  public extractSearchTerms(query: string): string[] {
    const terms: string[] = [];
    const trimmed = query.trim();
    if (!trimmed) return terms;

    // Extract quoted phrases first
    const quoteRegex = /"([^"]+)"/g;
    let quoteMatch: RegExpExecArray | null;
    let remaining = trimmed;

    while ((quoteMatch = quoteRegex.exec(trimmed)) !== null) {
      if (quoteMatch[1]) {
        terms.push(quoteMatch[1]);
      }
      remaining = remaining.replace(quoteMatch[0], '');
    }

    // Split remaining by whitespace and filter empty
    const words = remaining.trim().split(/\s+/).filter(w => w.length > 0);
    terms.push(...words);

    return terms;
  }

  /**
   * Cancel any pending request
   */
  public cancel(): void {
    this.cancelPending();
  }

  /**
   * Destroy the service and clean up
   */
  public destroy(): void {
    this.cancelPending();
  }

  // ==========================================
  // Private Helpers
  // ==========================================

  private cancelPending(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  private enrichTranscriptMatch(raw: any, query: string): TranscriptSearchMatch {
    const segment: TranscriptSegment = {
      id: raw.segment?.id || raw.id || '',
      videoId: raw.segment?.videoId || raw.videoId || '',
      text: raw.segment?.text || raw.text || '',
      startTime: raw.segment?.startTime ?? raw.startTime ?? 0,
      endTime: raw.segment?.endTime ?? raw.endTime ?? 0,
      speaker: raw.segment?.speaker || raw.speaker,
      confidence: raw.segment?.confidence ?? raw.confidence,
    };

    const highlightedText = this.highlightText(segment.text, query);

    // Generate context from surrounding text
    const contextBefore = raw.contextBefore || '';
    const contextAfter = raw.contextAfter || '';

    return {
      segment,
      matchedText: raw.matchedText || query,
      highlightedText,
      contextBefore,
      contextAfter,
    };
  }

  private calculateRelevanceScore(result: SearchResult, query: string, matchCount: number): number {
    let score = 0;
    const terms = this.extractSearchTerms(query);

    // Title matches are worth more
    for (const term of terms) {
      const titleRegex = new RegExp(this.escapeRegex(term), 'gi');
      if (titleRegex.test(result.title)) {
        score += 10;
      }
    }

    // Additional points for total match count
    score += Math.min(matchCount * 2, 20);

    // Boost for exact phrase match in title
    if (result.title.toLowerCase().includes(query.toLowerCase())) {
      score += 15;
    }

    return Math.min(score, 100);
  }

  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
