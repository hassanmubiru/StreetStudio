/**
 * Property-Based Tests for Search Functionality Consistency
 * 
 * Property 11: Search Functionality Consistency
 * Validates: Requirements 14.1
 * 
 * For any search query input, the global search interface SHALL provide instant
 * results and respond consistently to the keyboard shortcut (Cmd/Ctrl+K) activation.
 */

// @vitest-environment jsdom

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fc from 'fast-check';
import { SearchService, type SearchResponse } from './search.js';
import { GlobalSearchModal } from '../components/workspace/global-search-modal.js';

// Mock fetch for API calls
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock performance.now for timing
const originalPerformanceNow = performance.now;

/**
 * Arbitrary generators for search inputs
 */

// Generates arbitrary search query strings with various characters
const searchQueryArb = fc.oneof(
  // Standard text queries
  fc.string({ minLength: 1, maxLength: 100 }),
  // Single character queries
  fc.char(),
  // Queries with special characters
  fc.stringOf(
    fc.oneof(
      fc.char(),
      fc.constantFrom('*', '?', '"', "'", '(', ')', '[', ']', '{', '}', '/', '\\', '|', '&', '<', '>')
    ),
    { minLength: 1, maxLength: 50 }
  ),
  // Queries with unicode characters
  fc.unicode().filter(s => s.trim().length > 0),
  // Multi-word queries
  fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 2, maxLength: 5 })
    .map(words => words.join(' ')),
  // Queries with leading/trailing whitespace
  fc.tuple(
    fc.stringOf(fc.constantFrom(' ', '\t', '\n'), { minLength: 0, maxLength: 3 }),
    fc.string({ minLength: 1, maxLength: 30 }),
    fc.stringOf(fc.constantFrom(' ', '\t', '\n'), { minLength: 0, maxLength: 3 })
  ).map(([pre, text, post]) => `${pre}${text}${post}`)
);

// Generates search result items for mocking API responses
const searchResultArb = fc.record({
  id: fc.uuid(),
  type: fc.constantFrom('video', 'project', 'comment', 'member'),
  title: fc.string({ minLength: 1, maxLength: 100 }),
  description: fc.option(fc.string({ minLength: 1, maxLength: 200 })),
  thumbnailUrl: fc.option(fc.webUrl()),
  url: fc.string({ minLength: 1, maxLength: 50 }).map(s => `/${s}`),
  metadata: fc.dictionary(
    fc.string({ minLength: 1, maxLength: 20 }),
    fc.string({ minLength: 1, maxLength: 50 }),
    { minKeys: 0, maxKeys: 3 }
  ),
  timestamp: fc.option(fc.date().map(d => d.toISOString())),
});

// Generates search API response scenarios
const searchResponseArb = fc.record({
  results: fc.array(searchResultArb, { minLength: 0, maxLength: 10 }),
  totalCount: fc.nat({ max: 1000 }),
});

// Generates keyboard shortcut activation configs
const shortcutActivationArb = fc.record({
  useMetaKey: fc.boolean(), // true = Cmd (Mac), false = Ctrl
  key: fc.constant('k'),
  repeat: fc.boolean(),
});

// Generates sequences of search interactions
const searchInteractionArb = fc.oneof(
  fc.constant('type-query' as const),
  fc.constant('clear-query' as const),
  fc.constant('select-result' as const),
  fc.constant('navigate-down' as const),
  fc.constant('navigate-up' as const),
  fc.constant('press-escape' as const),
  fc.constant('press-enter' as const)
);

describe('Feature: web-application-implementation, Property 11: Search Functionality Consistency', () => {
  let container: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = '';
    container = document.createElement('div');
    document.body.appendChild(container);
    vi.useFakeTimers();
    mockFetch.mockReset();
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  /**
   * **Validates: Requirements 14.1**
   * 
   * For any search query input, the SearchService SHALL consistently handle the query
   * by trimming whitespace, canceling previous pending requests, and returning structured
   * search results or an empty result set.
   */
  it('search service handles any query input consistently without errors', async () => {
    await fc.assert(
      fc.asyncProperty(
        searchQueryArb,
        searchResponseArb,
        async (query, mockResponse) => {
          // Setup mock API response
          mockFetch.mockResolvedValue({
            ok: true,
            json: async () => ({
              results: mockResponse.results,
              totalCount: mockResponse.totalCount,
            }),
          });

          const service = new SearchService({ debounceMs: 0 });

          try {
            const result = await service.searchImmediate(query);

            // Property: Search always returns a structured response
            expect(result).toBeDefined();
            expect(result).toHaveProperty('results');
            expect(result).toHaveProperty('totalCount');
            expect(result).toHaveProperty('query');
            expect(result).toHaveProperty('executionTimeMs');

            // Property: The query in response reflects the trimmed input
            const trimmedQuery = query.trim();
            if (trimmedQuery) {
              expect(result.query).toBe(trimmedQuery);
              expect(result.executionTimeMs).toBeGreaterThanOrEqual(0);
            } else {
              // Empty trimmed queries return empty results immediately
              expect(result.results).toHaveLength(0);
              expect(result.totalCount).toBe(0);
            }

            // Property: Results is always an array
            expect(Array.isArray(result.results)).toBe(true);

            // Property: totalCount is always a non-negative number
            expect(result.totalCount).toBeGreaterThanOrEqual(0);
          } finally {
            service.destroy();
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 14.1**
   * 
   * For any search query, the keyboard shortcut (Cmd/Ctrl+K) SHALL consistently
   * toggle the search modal open and closed regardless of query content.
   */
  it('keyboard shortcut Cmd/Ctrl+K consistently toggles search modal for any state', async () => {
    await fc.assert(
      fc.asyncProperty(
        shortcutActivationArb,
        fc.array(fc.boolean(), { minLength: 1, maxLength: 10 }),
        async (shortcutConfig, toggleSequence) => {
          const navigateSpy = vi.fn();
          const closeSpy = vi.fn();

          const modal = new GlobalSearchModal({
            onNavigate: navigateSpy,
            onClose: closeSpy,
          });

          container.appendChild(modal.getElement());

          try {
            // Property: Modal starts closed
            expect(modal.isModalOpen()).toBe(false);

            for (const shouldOpen of toggleSequence) {
              const previousState = modal.isModalOpen();

              // Dispatch keyboard shortcut
              const event = new KeyboardEvent('keydown', {
                key: shortcutConfig.key,
                metaKey: shortcutConfig.useMetaKey,
                ctrlKey: !shortcutConfig.useMetaKey,
                bubbles: true,
                cancelable: true,
              });
              document.dispatchEvent(event);

              const currentState = modal.isModalOpen();

              // Property: Shortcut always toggles the modal state
              expect(currentState).toBe(!previousState);

              // Property: When modal opens, it's in a clean state
              if (currentState === true) {
                expect(modal.getQuery()).toBe('');
                expect(modal.getResults()).toHaveLength(0);
                expect(modal.getSelectedIndex()).toBe(-1);
              }
            }
          } finally {
            modal.destroy();
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 14.1**
   * 
   * For any search query, the search service SHALL consistently provide suggestions
   * that are relevant (matching recent searches or generating type-based suggestions).
   */
  it('suggestions are consistently provided for any query input', async () => {
    await fc.assert(
      fc.asyncProperty(
        searchQueryArb,
        fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 0, maxLength: 5 }),
        async (query, recentSearches) => {
          const service = new SearchService({
            debounceMs: 0,
            maxRecentSearches: 10,
            maxSuggestions: 8,
          });

          try {
            // Add recent searches
            for (const recent of recentSearches) {
              service.addToRecentSearches(recent);
            }

            const suggestions = service.getSuggestions(query);

            // Property: Suggestions is always an array
            expect(Array.isArray(suggestions)).toBe(true);

            // Property: Suggestions never exceed maxSuggestions
            expect(suggestions.length).toBeLessThanOrEqual(8);

            // Property: Each suggestion has required fields
            for (const suggestion of suggestions) {
              expect(suggestion).toHaveProperty('text');
              expect(suggestion).toHaveProperty('type');
              expect(typeof suggestion.text).toBe('string');
              expect(suggestion.text.length).toBeGreaterThan(0);
              expect(['recent', 'suggestion', 'popular']).toContain(suggestion.type);
            }

            // Property: When query is empty, suggestions come from recent searches
            if (!query.trim()) {
              for (const suggestion of suggestions) {
                expect(suggestion.type).toBe('recent');
              }
            }
          } finally {
            service.destroy();
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 14.1**
   * 
   * For any sequence of queries, the debounced search SHALL cancel previous pending
   * searches and only execute the latest query, ensuring consistent behavior.
   */
  it('debounced search consistently cancels previous queries and executes only the latest', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(searchQueryArb, { minLength: 2, maxLength: 8 }),
        searchResponseArb,
        async (querySequence, mockResponse) => {
          mockFetch.mockResolvedValue({
            ok: true,
            json: async () => ({
              results: mockResponse.results,
              totalCount: mockResponse.totalCount,
            }),
          });

          const service = new SearchService({ debounceMs: 300 });
          const callbacks: Array<SearchResponse | null> = [];
          const callback = (response: SearchResponse | null) => {
            callbacks.push(response);
          };

          try {
            // Fire multiple searches rapidly
            for (const query of querySequence) {
              service.search(query, callback);
            }

            // Advance timers past debounce period
            vi.advanceTimersByTime(350);

            // Wait for any async operations
            await vi.runAllTimersAsync();

            // Property: At most one search should have been executed
            // (the last non-empty query after debounce)
            const lastNonEmptyQuery = [...querySequence].reverse().find(q => q.trim().length > 0);

            if (lastNonEmptyQuery) {
              // The fetch should have been called at most once (for the last query)
              expect(mockFetch.mock.calls.length).toBeLessThanOrEqual(1);
            }

            // Property: Empty queries never trigger API calls
            const emptyQueries = querySequence.filter(q => !q.trim());
            if (querySequence[querySequence.length - 1]?.trim() === '') {
              // If the last query was empty, no fetch should have been made
              // (empty queries return null immediately)
              expect(callbacks.some(c => c === null)).toBe(true);
            }
          } finally {
            service.destroy();
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 14.1**
   * 
   * For any search query, the highlight matching function SHALL consistently
   * highlight the matching portions without corrupting the original text.
   */
  it('highlight match consistently marks matching text for any query', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 100 }),
        fc.string({ minLength: 0, maxLength: 50 }),
        async (text, query) => {
          const service = new SearchService({ debounceMs: 0 });

          try {
            const highlighted = service.highlightMatch(text, query);

            // Property: Highlighted result is always a string
            expect(typeof highlighted).toBe('string');

            // Property: If query is empty (or whitespace), the text is unchanged
            if (!query.trim()) {
              expect(highlighted).toBe(text);
            }

            // Property: The highlighted result preserves all original text characters
            // (they may just be wrapped in <mark> tags)
            const strippedHighlight = highlighted.replace(/<mark[^>]*>|<\/mark>/g, '');
            expect(strippedHighlight).toBe(text);

            // Property: If query appears in text, mark tags are present
            const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            if (query.trim() && new RegExp(escapedQuery, 'i').test(text)) {
              expect(highlighted).toContain('<mark');
              expect(highlighted).toContain('</mark>');
            }
          } finally {
            service.destroy();
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 14.1**
   * 
   * For any recent search additions, the recent searches list SHALL maintain
   * consistency (no duplicates, respects max limit, most recent first).
   */
  it('recent searches maintain consistency for any sequence of additions', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 1, maxLength: 20 }),
        fc.nat({ max: 15 }).map(n => Math.max(1, n)), // maxRecentSearches from 1 to 15
        async (searches, maxRecent) => {
          const service = new SearchService({
            debounceMs: 0,
            maxRecentSearches: maxRecent,
          });

          try {
            for (const search of searches) {
              service.addToRecentSearches(search);
            }

            const recentSearches = service.getRecentSearches();

            // Property: Never exceeds max limit
            expect(recentSearches.length).toBeLessThanOrEqual(maxRecent);

            // Property: No duplicates (case-insensitive)
            const lowercaseSearches = recentSearches.map(s => s.toLowerCase());
            const uniqueSearches = new Set(lowercaseSearches);
            expect(uniqueSearches.size).toBe(recentSearches.length);

            // Property: Most recent search is first (if non-empty inputs exist)
            const lastNonEmpty = [...searches].reverse().find(s => s.trim().length > 0);
            if (lastNonEmpty && recentSearches.length > 0) {
              expect(recentSearches[0].toLowerCase()).toBe(lastNonEmpty.trim().toLowerCase());
            }

            // Property: Empty strings are never stored
            for (const recent of recentSearches) {
              expect(recent.trim().length).toBeGreaterThan(0);
            }
          } finally {
            service.destroy();
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 14.1**
   * 
   * For any search query input in the modal, the modal SHALL consistently
   * update its state (results, loading indicator, selection index) and respond
   * to keyboard navigation without errors.
   */
  it('global search modal consistently handles input and navigation for any query', async () => {
    await fc.assert(
      fc.asyncProperty(
        searchQueryArb,
        fc.array(searchInteractionArb, { minLength: 1, maxLength: 8 }),
        searchResponseArb,
        async (query, interactions, mockResponse) => {
          mockFetch.mockResolvedValue({
            ok: true,
            json: async () => ({
              results: mockResponse.results,
              totalCount: mockResponse.totalCount,
            }),
          });

          const navigateSpy = vi.fn();
          const modal = new GlobalSearchModal({
            onNavigate: navigateSpy,
            debounceMs: 0,
          });
          container.appendChild(modal.getElement());

          try {
            // Open modal
            modal.open();
            expect(modal.isModalOpen()).toBe(true);

            // Type query into search input
            const input = modal.getElement().querySelector('[data-testid="search-input"]') as HTMLInputElement;
            if (input) {
              input.value = query;
              input.dispatchEvent(new Event('input', { bubbles: true }));
              
              // Advance past debounce
              vi.advanceTimersByTime(350);
              await vi.runAllTimersAsync();
            }

            // Apply interaction sequence
            for (const interaction of interactions) {
              switch (interaction) {
                case 'navigate-down':
                  if (input) {
                    input.dispatchEvent(new KeyboardEvent('keydown', {
                      key: 'ArrowDown',
                      bubbles: true,
                      cancelable: true,
                    }));
                  }
                  break;
                case 'navigate-up':
                  if (input) {
                    input.dispatchEvent(new KeyboardEvent('keydown', {
                      key: 'ArrowUp',
                      bubbles: true,
                      cancelable: true,
                    }));
                  }
                  break;
                case 'press-escape':
                  if (input) {
                    input.dispatchEvent(new KeyboardEvent('keydown', {
                      key: 'Escape',
                      bubbles: true,
                      cancelable: true,
                    }));
                  }
                  break;
                case 'press-enter':
                  if (input) {
                    input.dispatchEvent(new KeyboardEvent('keydown', {
                      key: 'Enter',
                      bubbles: true,
                      cancelable: true,
                    }));
                  }
                  break;
                case 'clear-query':
                  if (input) {
                    input.value = '';
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                  }
                  break;
                case 'type-query':
                  // Re-type a different query
                  if (input) {
                    input.value = query.slice(0, Math.max(1, Math.floor(query.length / 2)));
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                    vi.advanceTimersByTime(350);
                  }
                  break;
                case 'select-result':
                  if (input) {
                    input.dispatchEvent(new KeyboardEvent('keydown', {
                      key: 'Enter',
                      bubbles: true,
                      cancelable: true,
                    }));
                  }
                  break;
              }
            }

            // Property: Modal never throws an error during interactions
            // (if we reach here, no exceptions were thrown)

            // Property: Selected index is always within valid bounds
            const selectedIdx = modal.getSelectedIndex();
            expect(selectedIdx).toBeGreaterThanOrEqual(-1);

            // Property: If modal is still open, its element is still in DOM
            if (modal.isModalOpen()) {
              expect(modal.getElement()).toBeTruthy();
              expect(modal.getElement().querySelector('[data-testid="search-input"]')).toBeTruthy();
            }
          } finally {
            modal.destroy();
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * **Validates: Requirements 14.1**
   * 
   * For any failed API request, the search service SHALL handle the error
   * gracefully and not leave the system in an inconsistent state.
   */
  it('search service handles API failures gracefully for any query', async () => {
    await fc.assert(
      fc.asyncProperty(
        searchQueryArb,
        fc.constantFrom(400, 401, 403, 404, 500, 502, 503),
        async (query, statusCode) => {
          mockFetch.mockResolvedValue({
            ok: false,
            status: statusCode,
          });

          const service = new SearchService({ debounceMs: 0 });

          try {
            const trimmedQuery = query.trim();
            if (!trimmedQuery) {
              // Empty queries should return empty result without hitting API
              const result = await service.searchImmediate(query);
              expect(result.results).toHaveLength(0);
              expect(result.totalCount).toBe(0);
            } else {
              // Non-empty queries that fail should throw
              await expect(service.searchImmediate(query)).rejects.toThrow();
            }

            // Property: After error, service is still usable
            // (can get suggestions without error)
            const suggestions = service.getSuggestions(query);
            expect(Array.isArray(suggestions)).toBe(true);

            // Property: Recent searches still work after error
            service.addToRecentSearches('test-after-error');
            const recent = service.getRecentSearches();
            expect(recent).toContain('test-after-error');
          } finally {
            service.destroy();
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
