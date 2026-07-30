/**
 * Search Discovery Service Tests
 * 
 * Unit tests for the search discovery service including alternative suggestions,
 * content recommendations, trending searches, popular content, and analytics.
 * 
 * Requirements: 14.10
 */

// @vitest-environment jsdom

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { SearchDiscoveryService } from './search-discovery';

describe('SearchDiscoveryService', () => {
  let service: SearchDiscoveryService;

  beforeEach(() => {
    const storage: Record<string, string> = {};
    vi.stubGlobal('localStorage', {
      getItem: vi.fn((key: string) => storage[key] || null),
      setItem: vi.fn((key: string, value: string) => { storage[key] = value; }),
      removeItem: vi.fn((key: string) => { delete storage[key]; }),
      clear: vi.fn(() => { Object.keys(storage).forEach(k => delete storage[k]); }),
    });

    vi.stubGlobal('fetch', vi.fn());

    service = new SearchDiscoveryService();
  });

  afterEach(() => {
    service.destroy();
    vi.restoreAllMocks();
  });

  describe('getAlternativeSuggestions', () => {
    test('should return empty array for empty query', () => {
      const suggestions = service.getAlternativeSuggestions('');
      expect(suggestions).toEqual([]);
    });

    test('should return empty array for whitespace query', () => {
      const suggestions = service.getAlternativeSuggestions('   ');
      expect(suggestions).toEqual([]);
    });

    test('should provide spelling corrections for common misspellings', () => {
      const suggestions = service.getAlternativeSuggestions('recroding');
      const spellingCorrections = suggestions.filter(s => s.type === 'spelling');
      expect(spellingCorrections.length).toBeGreaterThan(0);
      expect(spellingCorrections[0]!.text).toContain('recording');
    });

    test('should provide related terms for domain keywords', () => {
      const suggestions = service.getAlternativeSuggestions('video');
      const related = suggestions.filter(s => s.type === 'related');
      expect(related.length).toBeGreaterThan(0);
    });

    test('should suggest broader queries for multi-word searches', () => {
      const suggestions = service.getAlternativeSuggestions('new video editing');
      const broader = suggestions.filter(s => s.type === 'broader');
      expect(broader.length).toBeGreaterThan(0);
      // Should remove the qualifier word "new"
      expect(broader[0]!.text).toBe('video editing');
    });

    test('should suggest narrower queries for short searches', () => {
      const suggestions = service.getAlternativeSuggestions('edit');
      const narrower = suggestions.filter(s => s.type === 'narrower');
      expect(narrower.length).toBeGreaterThan(0);
      expect(narrower[0]!.text.length).toBeGreaterThan('edit'.length);
    });

    test('should limit suggestions to maxSuggestions', () => {
      const limitedService = new SearchDiscoveryService({ maxSuggestions: 2 });
      const suggestions = limitedService.getAlternativeSuggestions('video');
      expect(suggestions.length).toBeLessThanOrEqual(2);
      limitedService.destroy();
    });

    test('should handle queries with doubled characters', () => {
      const suggestions = service.getAlternativeSuggestions('screeen');
      const spellingCorrections = suggestions.filter(s => s.type === 'spelling');
      expect(spellingCorrections.length).toBeGreaterThan(0);
    });

    test('should suggest broader queries by removing last word when no qualifier found', () => {
      const suggestions = service.getAlternativeSuggestions('dark timeline theme');
      const broader = suggestions.filter(s => s.type === 'broader');
      expect(broader.length).toBeGreaterThan(0);
      expect(broader[0]!.text).toBe('dark timeline');
    });
  });

  describe('getRecommendations', () => {
    test('should fetch recommendations from API', async () => {
      const mockRecommendations = [
        { id: '1', title: 'Great Video', type: 'video', url: '/videos/1', reason: 'Popular in your team', score: 0.9 },
        { id: '2', title: 'Project X', type: 'project', url: '/projects/2', reason: 'Recently active', score: 0.8 },
      ];
      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ recommendations: mockRecommendations }),
      });

      const recommendations = await service.getRecommendations();

      expect(global.fetch).toHaveBeenCalledWith(
        '/api/search/recommendations?limit=6',
        expect.objectContaining({ signal: expect.any(AbortSignal) })
      );
      expect(recommendations).toEqual(mockRecommendations);
    });

    test('should return empty array on API failure', async () => {
      (global.fetch as any).mockResolvedValue({ ok: false, status: 500 });

      const recommendations = await service.getRecommendations();
      expect(recommendations).toEqual([]);
    });

    test('should return empty array on network error', async () => {
      (global.fetch as any).mockRejectedValue(new Error('Network error'));

      const recommendations = await service.getRecommendations();
      expect(recommendations).toEqual([]);
    });

    test('should abort previous request when new one is made', async () => {
      let resolveFirst: (value: any) => void;
      const firstPromise = new Promise(resolve => { resolveFirst = resolve; });

      (global.fetch as any)
        .mockImplementationOnce(() => firstPromise)
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ recommendations: [{ id: '2', title: 'Second', type: 'video', url: '/v/2', reason: 'test', score: 1 }] }),
        });

      // Start first request (don't await)
      const first = service.getRecommendations();
      // Start second request immediately
      const second = service.getRecommendations();

      // Resolve first with abort error (simulating AbortController behavior)
      resolveFirst!({ ok: true, json: () => Promise.resolve({ recommendations: [] }) });

      const result = await second;
      expect(result).toHaveLength(1);
    });

    test('should respect maxRecommendations limit', async () => {
      const manyRecommendations = Array.from({ length: 20 }, (_, i) => ({
        id: String(i), title: `Item ${i}`, type: 'video', url: `/v/${i}`, reason: 'test', score: 1,
      }));
      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ recommendations: manyRecommendations }),
      });

      const limitedService = new SearchDiscoveryService({ maxRecommendations: 3 });
      const recommendations = await limitedService.getRecommendations();
      expect(recommendations.length).toBeLessThanOrEqual(3);
      limitedService.destroy();
    });
  });

  describe('getTrendingSearches', () => {
    test('should fetch trending searches from API', async () => {
      const mockTrending = [
        { query: 'screen recording', searchCount: 42, trend: 'rising' },
        { query: 'project collaboration', searchCount: 35, trend: 'stable' },
      ];
      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ trending: mockTrending }),
      });

      const trending = await service.getTrendingSearches();

      expect(global.fetch).toHaveBeenCalledWith('/api/search/trending?limit=8');
      expect(trending).toEqual(mockTrending);
    });

    test('should return fallback trending data on API failure', async () => {
      (global.fetch as any).mockResolvedValue({ ok: false, status: 500 });

      const trending = await service.getTrendingSearches();
      expect(trending.length).toBeGreaterThan(0);
      expect(trending[0]!.query).toBeTruthy();
      expect(trending[0]!.searchCount).toBeGreaterThan(0);
    });

    test('should return fallback trending data on network error', async () => {
      (global.fetch as any).mockRejectedValue(new Error('Network error'));

      const trending = await service.getTrendingSearches();
      expect(trending.length).toBeGreaterThan(0);
    });
  });

  describe('getPopularContent', () => {
    test('should fetch popular content from API', async () => {
      const mockPopular = [
        { id: '1', title: 'Hot Video', type: 'video', url: '/videos/1', viewCount: 100, recentActivity: 10 },
      ];
      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ popular: mockPopular }),
      });

      const popular = await service.getPopularContent();

      expect(global.fetch).toHaveBeenCalledWith('/api/search/popular?limit=6');
      expect(popular).toEqual(mockPopular);
    });

    test('should return empty array on API failure', async () => {
      (global.fetch as any).mockResolvedValue({ ok: false, status: 500 });

      const popular = await service.getPopularContent();
      expect(popular).toEqual([]);
    });

    test('should return empty array on network error', async () => {
      (global.fetch as any).mockRejectedValue(new Error('Network error'));

      const popular = await service.getPopularContent();
      expect(popular).toEqual([]);
    });
  });

  describe('recordSearchEvent and getSearchAnalytics', () => {
    test('should record search events', () => {
      service.recordSearchEvent('test query', 5);
      service.recordSearchEvent('another query', 0);

      const analytics = service.getSearchAnalytics();
      expect(analytics.totalSearches).toBe(2);
      expect(analytics.successfulSearches).toBe(1);
      expect(analytics.failedSearches).toBe(1);
    });

    test('should not record empty queries', () => {
      service.recordSearchEvent('', 0);
      service.recordSearchEvent('   ', 0);

      const analytics = service.getSearchAnalytics();
      expect(analytics.totalSearches).toBe(0);
    });

    test('should calculate average result count', () => {
      service.recordSearchEvent('q1', 10);
      service.recordSearchEvent('q2', 20);
      service.recordSearchEvent('q3', 0);

      const analytics = service.getSearchAnalytics();
      expect(analytics.averageResultCount).toBe(10); // (10 + 20 + 0) / 3 = 10
    });

    test('should track top queries', () => {
      service.recordSearchEvent('popular query', 5);
      service.recordSearchEvent('popular query', 3);
      service.recordSearchEvent('popular query', 7);
      service.recordSearchEvent('rare query', 1);

      const analytics = service.getSearchAnalytics();
      expect(analytics.topQueries[0]!.query).toBe('popular query');
      expect(analytics.topQueries[0]!.count).toBe(3);
    });

    test('should limit search history to max entries', () => {
      // Record more than MAX_HISTORY_ENTRIES
      for (let i = 0; i < 110; i++) {
        service.recordSearchEvent(`query ${i}`, i);
      }

      const analytics = service.getSearchAnalytics();
      expect(analytics.totalSearches).toBeLessThanOrEqual(100);
    });

    test('should persist search history to localStorage', () => {
      service.recordSearchEvent('test', 5);

      expect(window.localStorage.setItem).toHaveBeenCalledWith(
        'streetstudio_search_history',
        expect.any(String)
      );
    });

    test('should clear search history', () => {
      service.recordSearchEvent('test', 5);
      service.clearSearchHistory();

      const analytics = service.getSearchAnalytics();
      expect(analytics.totalSearches).toBe(0);
    });
  });

  describe('generateImprovementSuggestions', () => {
    test('should suggest adding content when failure rate is high', () => {
      // Create history with >50% failures
      for (let i = 0; i < 10; i++) {
        service.recordSearchEvent(`query ${i}`, i < 6 ? 0 : 5);
      }

      const analytics = service.getSearchAnalytics();
      const addContentSuggestion = analytics.improvementSuggestions.find(
        s => s.type === 'add-content'
      );
      expect(addContentSuggestion).toBeDefined();
      expect(addContentSuggestion!.priority).toBe('high');
    });

    test('should suggest improving titles when failure rate is moderate', () => {
      // Create history with >30% failures
      for (let i = 0; i < 10; i++) {
        service.recordSearchEvent(`query ${i}`, i < 4 ? 0 : 5);
      }

      const analytics = service.getSearchAnalytics();
      const titleSuggestion = analytics.improvementSuggestions.find(
        s => s.type === 'improve-titles'
      );
      expect(titleSuggestion).toBeDefined();
      expect(titleSuggestion!.priority).toBe('medium');
    });

    test('should always include use-tags suggestion', () => {
      const analytics = service.getSearchAnalytics();
      const tagSuggestion = analytics.improvementSuggestions.find(
        s => s.type === 'use-tags'
      );
      expect(tagSuggestion).toBeDefined();
      expect(tagSuggestion!.priority).toBe('low');
    });

    test('should suggest adding descriptions when average results are low', () => {
      for (let i = 0; i < 12; i++) {
        service.recordSearchEvent(`query ${i}`, 2);
      }

      const analytics = service.getSearchAnalytics();
      const descSuggestion = analytics.improvementSuggestions.find(
        s => s.type === 'add-descriptions'
      );
      expect(descSuggestion).toBeDefined();
    });
  });

  describe('cancel and destroy', () => {
    test('should cancel pending requests', () => {
      const abortSpy = vi.fn();
      const mockController = { abort: abortSpy, signal: { aborted: false } };
      vi.stubGlobal('AbortController', vi.fn(() => mockController));

      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ recommendations: [] }),
      });

      // Start a request
      service.getRecommendations();
      service.cancel();

      expect(abortSpy).toHaveBeenCalled();
    });

    test('should handle destroy gracefully', () => {
      expect(() => service.destroy()).not.toThrow();
    });
  });
});
