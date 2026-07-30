/**
 * Search Service Tests
 * 
 * Unit tests for the search service including debounced search,
 * recent searches management, autocomplete suggestions, and text highlighting.
 * 
 * Requirements: 14.1, 14.3, 14.5
 */

// @vitest-environment jsdom

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { SearchService } from './search';

describe('SearchService', () => {
  let searchService: SearchService;

  beforeEach(() => {
    vi.useFakeTimers();
    // Mock localStorage
    const storage: Record<string, string> = {};
    vi.stubGlobal('localStorage', {
      getItem: vi.fn((key: string) => storage[key] || null),
      setItem: vi.fn((key: string, value: string) => { storage[key] = value; }),
      removeItem: vi.fn((key: string) => { delete storage[key]; }),
      clear: vi.fn(() => { Object.keys(storage).forEach(k => delete storage[k]); }),
    });

    // Mock fetch
    vi.stubGlobal('fetch', vi.fn());
    // Mock performance.now
    vi.stubGlobal('performance', { now: vi.fn(() => 0) });

    searchService = new SearchService({ debounceMs: 300 });
  });

  afterEach(() => {
    searchService.destroy();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('debounced search', () => {
    test('should debounce search calls', () => {
      const callback = vi.fn();

      searchService.search('test', callback);

      // Callback should not be called yet
      expect(callback).not.toHaveBeenCalled();
    });

    test('should execute search after debounce period', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({ results: [], totalCount: 0 }),
      };
      (global.fetch as any).mockResolvedValue(mockResponse);

      const callback = vi.fn();
      searchService.search('test query', callback);

      vi.advanceTimersByTime(300);

      // Allow the async search to complete
      await vi.runAllTimersAsync();

      expect(global.fetch).toHaveBeenCalledWith(
        '/api/search?q=test%20query',
        expect.objectContaining({ signal: expect.any(AbortSignal) })
      );
    });

    test('should cancel previous debounced search when new input arrives', () => {
      const callback = vi.fn();

      searchService.search('te', callback);
      searchService.search('tes', callback);
      searchService.search('test', callback);

      // Only the last search should proceed after debounce
      vi.advanceTimersByTime(299);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    test('should return null for empty queries', () => {
      const callback = vi.fn();

      searchService.search('', callback);

      expect(callback).toHaveBeenCalledWith(null);
    });

    test('should return null for whitespace-only queries', () => {
      const callback = vi.fn();

      searchService.search('   ', callback);

      expect(callback).toHaveBeenCalledWith(null);
    });
  });

  describe('searchImmediate', () => {
    test('should perform immediate search without debounce', async () => {
      const mockResults = [
        { id: '1', type: 'video', title: 'Test Video', url: '/videos/1', metadata: {} },
      ];
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({ results: mockResults, totalCount: 1 }),
      };
      (global.fetch as any).mockResolvedValue(mockResponse);

      const response = await searchService.searchImmediate('test');

      expect(response.results).toEqual(mockResults);
      expect(response.totalCount).toBe(1);
      expect(response.query).toBe('test');
    });

    test('should return empty results for empty query', async () => {
      const response = await searchService.searchImmediate('');

      expect(response.results).toEqual([]);
      expect(response.totalCount).toBe(0);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    test('should handle fetch errors', async () => {
      (global.fetch as any).mockRejectedValue(new Error('Network error'));

      await expect(searchService.searchImmediate('test')).rejects.toThrow('Network error');
    });

    test('should handle non-ok responses', async () => {
      const mockResponse = { ok: false, status: 500 };
      (global.fetch as any).mockResolvedValue(mockResponse);

      await expect(searchService.searchImmediate('test')).rejects.toThrow('Search request failed: 500');
    });

    test('should abort previous request when new one is made', async () => {
      const abortSpy = vi.fn();
      const mockAbortController = { abort: abortSpy, signal: { aborted: false } };
      vi.stubGlobal('AbortController', vi.fn(() => mockAbortController));

      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({ results: [], totalCount: 0 }),
      };
      (global.fetch as any).mockResolvedValue(mockResponse);

      // First search
      const promise1 = searchService.searchImmediate('first');
      await promise1;

      // Second search should abort the first
      await searchService.searchImmediate('second');

      // AbortController is recreated for each request, abort is called for the previous one
      expect(abortSpy).toHaveBeenCalled();
    });
  });

  describe('recent searches', () => {
    test('should add query to recent searches', () => {
      searchService.addToRecentSearches('my search');

      const recent = searchService.getRecentSearches();
      expect(recent).toContain('my search');
    });

    test('should not add empty queries', () => {
      searchService.addToRecentSearches('');
      searchService.addToRecentSearches('   ');

      const recent = searchService.getRecentSearches();
      expect(recent).toHaveLength(0);
    });

    test('should prevent duplicates (case-insensitive)', () => {
      searchService.addToRecentSearches('Test Query');
      searchService.addToRecentSearches('test query');

      const recent = searchService.getRecentSearches();
      expect(recent).toHaveLength(1);
      expect(recent[0]).toBe('test query'); // Most recent version
    });

    test('should maintain order with most recent first', () => {
      searchService.addToRecentSearches('first');
      searchService.addToRecentSearches('second');
      searchService.addToRecentSearches('third');

      const recent = searchService.getRecentSearches();
      expect(recent[0]).toBe('third');
      expect(recent[1]).toBe('second');
      expect(recent[2]).toBe('first');
    });

    test('should limit to max recent searches', () => {
      const service = new SearchService({ maxRecentSearches: 3 });

      service.addToRecentSearches('one');
      service.addToRecentSearches('two');
      service.addToRecentSearches('three');
      service.addToRecentSearches('four');

      const recent = service.getRecentSearches();
      expect(recent).toHaveLength(3);
      expect(recent).not.toContain('one');
      service.destroy();
    });

    test('should remove specific recent search', () => {
      searchService.addToRecentSearches('keep me');
      searchService.addToRecentSearches('remove me');

      searchService.removeFromRecentSearches('remove me');

      const recent = searchService.getRecentSearches();
      expect(recent).toContain('keep me');
      expect(recent).not.toContain('remove me');
    });

    test('should clear all recent searches', () => {
      searchService.addToRecentSearches('one');
      searchService.addToRecentSearches('two');

      searchService.clearRecentSearches();

      const recent = searchService.getRecentSearches();
      expect(recent).toHaveLength(0);
    });

    test('should persist recent searches to localStorage', () => {
      searchService.addToRecentSearches('persistent query');

      expect(window.localStorage.setItem).toHaveBeenCalledWith(
        'streetstudio_recent_searches',
        expect.stringContaining('persistent query')
      );
    });
  });

  describe('suggestions', () => {
    test('should return recent searches when query is empty', () => {
      searchService.addToRecentSearches('recent one');
      searchService.addToRecentSearches('recent two');

      const suggestions = searchService.getSuggestions('');

      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions[0]!.type).toBe('recent');
      expect(suggestions[0]!.text).toBe('recent two');
    });

    test('should filter recent searches by query', () => {
      searchService.addToRecentSearches('video editing');
      searchService.addToRecentSearches('project setup');
      searchService.addToRecentSearches('video upload');

      const suggestions = searchService.getSuggestions('video');

      const recentSuggestions = suggestions.filter(s => s.type === 'recent');
      expect(recentSuggestions.length).toBe(2);
      expect(recentSuggestions.every(s => s.text.includes('video'))).toBe(true);
    });

    test('should include type-based suggestions for queries', () => {
      const suggestions = searchService.getSuggestions('test');

      const typeSuggestions = suggestions.filter(s => s.type === 'suggestion');
      expect(typeSuggestions.length).toBeGreaterThan(0);
      expect(typeSuggestions.some(s => s.text.includes('in:'))).toBe(true);
    });

    test('should limit suggestions to max count', () => {
      const service = new SearchService({ maxSuggestions: 3 });

      // Add many recent searches
      for (let i = 0; i < 10; i++) {
        service.addToRecentSearches(`search ${i}`);
      }

      const suggestions = service.getSuggestions('');
      expect(suggestions.length).toBeLessThanOrEqual(3);
      service.destroy();
    });
  });

  describe('highlightMatch', () => {
    test('should highlight matching text', () => {
      const result = searchService.highlightMatch('Hello World', 'World');

      expect(result).toContain('<mark');
      expect(result).toContain('World');
    });

    test('should be case-insensitive', () => {
      const result = searchService.highlightMatch('Hello World', 'world');

      expect(result).toContain('<mark');
      expect(result).toContain('World');
    });

    test('should handle empty query', () => {
      const result = searchService.highlightMatch('Hello World', '');

      expect(result).toBe('Hello World');
    });

    test('should handle special regex characters in query', () => {
      const result = searchService.highlightMatch('test (value)', '(value)');

      expect(result).toContain('<mark');
      expect(result).toContain('(value)');
    });

    test('should highlight all occurrences', () => {
      const result = searchService.highlightMatch('test one test two test three', 'test');

      const markCount = (result.match(/<mark/g) || []).length;
      expect(markCount).toBe(3);
    });
  });

  describe('cancel', () => {
    test('should cancel pending debounced search', () => {
      const callback = vi.fn();

      searchService.search('test', callback);
      searchService.cancel();

      vi.advanceTimersByTime(500);

      // fetch should not have been called
      expect(global.fetch).not.toHaveBeenCalled();
    });
  });
});
