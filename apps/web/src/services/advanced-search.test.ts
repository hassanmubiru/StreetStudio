/**
 * Advanced Search Service Tests
 * 
 * Unit tests for the advanced search service including filtering,
 * faceted search, saved searches, and date range resolution.
 * 
 * Requirements: 14.2, 14.7, 14.8
 */

// @vitest-environment jsdom

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { AdvancedSearchService, SearchFilters, SavedSearch } from './advanced-search';

describe('AdvancedSearchService', () => {
  let service: AdvancedSearchService;
  let storage: Record<string, string>;

  beforeEach(() => {
    vi.useFakeTimers();
    storage = {};
    vi.stubGlobal('localStorage', {
      getItem: vi.fn((key: string) => storage[key] || null),
      setItem: vi.fn((key: string, value: string) => { storage[key] = value; }),
      removeItem: vi.fn((key: string) => { delete storage[key]; }),
      clear: vi.fn(() => { Object.keys(storage).forEach(k => delete storage[k]); }),
    });
    vi.stubGlobal('fetch', vi.fn());
    vi.stubGlobal('performance', { now: vi.fn(() => 0) });

    service = new AdvancedSearchService({ debounceMs: 300 });
  });

  afterEach(() => {
    service.destroy();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('searchWithFilters', () => {
    test('should perform search with date range filter', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          results: [{ id: '1', title: 'Test', type: 'video', url: '/v/1', metadata: {} }],
          totalCount: 1,
          facets: { contentTypes: [], creators: [], projects: [], dateRanges: [] },
        }),
      };
      (global.fetch as any).mockResolvedValue(mockResponse);

      const filters: SearchFilters = {
        dateRange: { preset: 'last-7-days' },
      };

      const response = await service.searchWithFilters('test query', filters);

      expect(response.results).toHaveLength(1);
      expect(response.totalCount).toBe(1);
      expect(response.appliedFilters).toEqual(filters);
    });

    test('should perform search with content type filter', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          results: [],
          totalCount: 0,
          facets: { contentTypes: [], creators: [], projects: [], dateRanges: [] },
        }),
      };
      (global.fetch as any).mockResolvedValue(mockResponse);

      const filters: SearchFilters = {
        contentType: { types: ['video', 'project'] },
      };

      await service.searchWithFilters('test', filters);

      const callUrl = (global.fetch as any).mock.calls[0][0];
      expect(callUrl).toContain('types=video%2Cproject');
    });

    test('should perform search with creator filter', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          results: [],
          totalCount: 0,
          facets: { contentTypes: [], creators: [], projects: [], dateRanges: [] },
        }),
      };
      (global.fetch as any).mockResolvedValue(mockResponse);

      const filters: SearchFilters = {
        creator: { creatorIds: ['user-1', 'user-2'] },
      };

      await service.searchWithFilters('test', filters);

      const callUrl = (global.fetch as any).mock.calls[0][0];
      expect(callUrl).toContain('creators=user-1%2Cuser-2');
    });

    test('should handle combined filters', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          results: [{ id: '1', title: 'Found', type: 'video', url: '/v/1', metadata: {} }],
          totalCount: 1,
          facets: { contentTypes: [], creators: [], projects: [], dateRanges: [] },
        }),
      };
      (global.fetch as any).mockResolvedValue(mockResponse);

      const filters: SearchFilters = {
        dateRange: { preset: 'last-30-days' },
        contentType: { types: ['video'] },
        creator: { creatorIds: ['user-1'] },
        scope: 'organization',
        sortBy: 'date-desc',
      };

      const response = await service.searchWithFilters('demo', filters);

      const callUrl = (global.fetch as any).mock.calls[0][0];
      expect(callUrl).toContain('q=demo');
      expect(callUrl).toContain('types=video');
      expect(callUrl).toContain('creators=user-1');
      expect(callUrl).toContain('scope=organization');
      expect(callUrl).toContain('sortBy=date-desc');
      expect(response.appliedFilters).toEqual(filters);
    });

    test('should return empty facets on error', async () => {
      (global.fetch as any).mockRejectedValue(new Error('Network error'));

      await expect(service.searchWithFilters('test', {})).rejects.toThrow('Network error');
    });

    test('should handle abort errors gracefully', async () => {
      const abortError = new Error('Aborted');
      abortError.name = 'AbortError';
      (global.fetch as any).mockRejectedValue(abortError);

      const response = await service.searchWithFilters('test', {});

      expect(response.results).toEqual([]);
      expect(response.totalCount).toBe(0);
    });

    test('should handle non-ok responses', async () => {
      (global.fetch as any).mockResolvedValue({ ok: false, status: 500 });

      await expect(service.searchWithFilters('test', {})).rejects.toThrow(
        'Advanced search request failed: 500'
      );
    });

    test('should abort previous request on new search', async () => {
      const abortError = new Error('Aborted');
      abortError.name = 'AbortError';

      (global.fetch as any)
        .mockImplementationOnce((_url: string, opts: { signal: AbortSignal }) => {
          // Simulate the first request being aborted
          return new Promise((_, reject) => {
            // Check if already aborted
            if (opts.signal?.aborted) {
              reject(abortError);
              return;
            }
            // Listen for abort
            opts.signal?.addEventListener('abort', () => reject(abortError));
          });
        })
        .mockResolvedValueOnce({
          ok: true,
          json: vi.fn().mockResolvedValue({ results: [], totalCount: 0, facets: { contentTypes: [], creators: [], projects: [], dateRanges: [] } }),
        });

      // Start first search (don't await - it will be aborted)
      const p1 = service.searchWithFilters('first', {});

      // Start second search - should abort first
      const p2 = service.searchWithFilters('second', {});

      // First should resolve with empty (abort handled gracefully)
      const result1 = await p1;
      expect(result1.results).toEqual([]);

      const result2 = await p2;
      expect(result2.results).toEqual([]);
    });
  });

  describe('buildSearchParams', () => {
    test('should include query parameter', () => {
      const params = service.buildSearchParams('hello world', {});
      expect(params.get('q')).toBe('hello world');
    });

    test('should not include empty query', () => {
      const params = service.buildSearchParams('', {});
      expect(params.has('q')).toBe(false);
    });

    test('should include date range with preset resolution', () => {
      // Set a fixed date for testing
      vi.setSystemTime(new Date('2024-06-15'));

      const params = service.buildSearchParams('test', {
        dateRange: { preset: 'last-7-days' },
      });

      expect(params.get('dateFrom')).toBe('2024-06-08');
      expect(params.get('dateTo')).toBe('2024-06-15');
    });

    test('should include custom date range', () => {
      const params = service.buildSearchParams('test', {
        dateRange: { from: '2024-01-01', to: '2024-03-31', preset: 'custom' },
      });

      expect(params.get('dateFrom')).toBe('2024-01-01');
      expect(params.get('dateTo')).toBe('2024-03-31');
    });

    test('should include content type filter', () => {
      const params = service.buildSearchParams('test', {
        contentType: { types: ['video', 'comment'] },
      });

      expect(params.get('types')).toBe('video,comment');
    });

    test('should not include empty content types', () => {
      const params = service.buildSearchParams('test', {
        contentType: { types: [] },
      });

      expect(params.has('types')).toBe(false);
    });

    test('should include creator filter', () => {
      const params = service.buildSearchParams('test', {
        creator: { creatorIds: ['user-a', 'user-b'] },
      });

      expect(params.get('creators')).toBe('user-a,user-b');
    });

    test('should include scope', () => {
      const params = service.buildSearchParams('test', { scope: 'personal' });
      expect(params.get('scope')).toBe('personal');
    });

    test('should not include default scope (all)', () => {
      const params = service.buildSearchParams('test', { scope: 'all' });
      expect(params.has('scope')).toBe(false);
    });

    test('should include sortBy', () => {
      const params = service.buildSearchParams('test', { sortBy: 'date-desc' });
      expect(params.get('sortBy')).toBe('date-desc');
    });

    test('should not include default sortBy (relevance)', () => {
      const params = service.buildSearchParams('test', { sortBy: 'relevance' });
      expect(params.has('sortBy')).toBe(false);
    });

    test('should include projectId', () => {
      const params = service.buildSearchParams('test', { projectId: 'proj-123' });
      expect(params.get('projectId')).toBe('proj-123');
    });
  });

  describe('resolveDateRangePreset', () => {
    beforeEach(() => {
      vi.setSystemTime(new Date('2024-06-15'));
    });

    test('should resolve "today" preset', () => {
      const result = service.resolveDateRangePreset('today');
      expect(result.from).toBe('2024-06-15');
      expect(result.to).toBe('2024-06-15');
    });

    test('should resolve "last-7-days" preset', () => {
      const result = service.resolveDateRangePreset('last-7-days');
      expect(result.from).toBe('2024-06-08');
      expect(result.to).toBe('2024-06-15');
    });

    test('should resolve "last-30-days" preset', () => {
      const result = service.resolveDateRangePreset('last-30-days');
      expect(result.from).toBe('2024-05-16');
      expect(result.to).toBe('2024-06-15');
    });

    test('should resolve "last-90-days" preset', () => {
      const result = service.resolveDateRangePreset('last-90-days');
      expect(result.from).toBe('2024-03-17');
      expect(result.to).toBe('2024-06-15');
    });

    test('should resolve "last-year" preset', () => {
      const result = service.resolveDateRangePreset('last-year');
      expect(result.from).toBe('2023-06-15');
      expect(result.to).toBe('2024-06-15');
    });

    test('should return empty strings for undefined preset', () => {
      const result = service.resolveDateRangePreset(undefined);
      expect(result.from).toBe('');
      expect(result.to).toBe('');
    });
  });

  describe('getActiveFilterCount', () => {
    test('should return 0 for empty filters', () => {
      expect(service.getActiveFilterCount({})).toBe(0);
    });

    test('should count date range as one filter', () => {
      expect(service.getActiveFilterCount({
        dateRange: { preset: 'last-7-days' },
      })).toBe(1);
    });

    test('should count content type as one filter', () => {
      expect(service.getActiveFilterCount({
        contentType: { types: ['video', 'project'] },
      })).toBe(1);
    });

    test('should not count empty content types', () => {
      expect(service.getActiveFilterCount({
        contentType: { types: [] },
      })).toBe(0);
    });

    test('should count all active filters', () => {
      expect(service.getActiveFilterCount({
        dateRange: { preset: 'today' },
        contentType: { types: ['video'] },
        creator: { creatorIds: ['user-1'] },
        scope: 'organization',
        sortBy: 'date-desc',
        projectId: 'proj-1',
      })).toBe(6);
    });

    test('should not count default scope', () => {
      expect(service.getActiveFilterCount({ scope: 'all' })).toBe(0);
    });

    test('should not count default sortBy', () => {
      expect(service.getActiveFilterCount({ sortBy: 'relevance' })).toBe(0);
    });
  });

  describe('hasActiveFilters', () => {
    test('should return false for empty filters', () => {
      expect(service.hasActiveFilters({})).toBe(false);
    });

    test('should return true when filters are active', () => {
      expect(service.hasActiveFilters({
        contentType: { types: ['video'] },
      })).toBe(true);
    });
  });

  describe('saved searches', () => {
    test('should save a search', () => {
      const saved = service.saveSearch('My Search', 'test query', {
        contentType: { types: ['video'] },
      });

      expect(saved.name).toBe('My Search');
      expect(saved.query).toBe('test query');
      expect(saved.filters.contentType?.types).toEqual(['video']);
      expect(saved.id).toBeTruthy();
      expect(saved.createdAt).toBeTruthy();
    });

    test('should get saved searches', () => {
      service.saveSearch('First', 'first query', {});
      service.saveSearch('Second', 'second query', {});

      const searches = service.getSavedSearches();
      expect(searches).toHaveLength(2);
      expect(searches[0]!.name).toBe('Second'); // Most recent first
      expect(searches[1]!.name).toBe('First');
    });

    test('should get saved search by ID', () => {
      const saved = service.saveSearch('My Search', 'query', {});

      const found = service.getSavedSearchById(saved.id);
      expect(found).toBeDefined();
      expect(found?.name).toBe('My Search');
    });

    test('should return undefined for non-existent ID', () => {
      const found = service.getSavedSearchById('non-existent');
      expect(found).toBeUndefined();
    });

    test('should replace duplicate names (case-insensitive)', () => {
      service.saveSearch('My Search', 'first', {});
      service.saveSearch('my search', 'second', {});

      const searches = service.getSavedSearches();
      expect(searches).toHaveLength(1);
      expect(searches[0].query).toBe('second');
    });

    test('should throw for empty name', () => {
      expect(() => service.saveSearch('', 'query', {})).toThrow('Saved search name is required');
      expect(() => service.saveSearch('   ', 'query', {})).toThrow('Saved search name is required');
    });

    test('should remove a saved search', () => {
      const saved = service.saveSearch('To Remove', 'query', {});

      const result = service.removeSavedSearch(saved.id);
      expect(result).toBe(true);
      expect(service.getSavedSearches()).toHaveLength(0);
    });

    test('should return false when removing non-existent search', () => {
      const result = service.removeSavedSearch('non-existent');
      expect(result).toBe(false);
    });

    test('should update a saved search', () => {
      const saved = service.saveSearch('Original', 'query', {});

      const updated = service.updateSavedSearch(saved.id, {
        name: 'Updated',
        query: 'new query',
        filters: { sortBy: 'date-desc' },
      });

      expect(updated).not.toBeNull();
      expect(updated!.name).toBe('Updated');
      expect(updated!.query).toBe('new query');
      expect(updated!.filters.sortBy).toBe('date-desc');
      expect(updated!.updatedAt).toBeTruthy();
    });

    test('should return null when updating non-existent search', () => {
      const result = service.updateSavedSearch('non-existent', { name: 'Nope' });
      expect(result).toBeNull();
    });

    test('should enforce max saved searches limit', () => {
      const svc = new AdvancedSearchService({ maxSavedSearches: 3 });

      svc.saveSearch('One', 'q1', {});
      svc.saveSearch('Two', 'q2', {});
      svc.saveSearch('Three', 'q3', {});
      svc.saveSearch('Four', 'q4', {});

      const searches = svc.getSavedSearches();
      expect(searches).toHaveLength(3);
      expect(searches.map(s => s.name)).not.toContain('One');
      svc.destroy();
    });

    test('should persist saved searches to localStorage', () => {
      service.saveSearch('Persisted', 'query', {});

      expect(window.localStorage.setItem).toHaveBeenCalledWith(
        'streetstudio_saved_searches',
        expect.stringContaining('Persisted')
      );
    });

    test('should load saved searches from localStorage on init', () => {
      const stored = JSON.stringify([{
        id: 'test-1',
        name: 'Loaded',
        query: 'loaded query',
        filters: {},
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      }]);
      storage['streetstudio_saved_searches'] = stored;

      const newService = new AdvancedSearchService();
      const searches = newService.getSavedSearches();
      expect(searches).toHaveLength(1);
      expect(searches[0].name).toBe('Loaded');
      newService.destroy();
    });
  });

  describe('getFacets', () => {
    test('should fetch facets for a query', async () => {
      const mockFacets = {
        contentTypes: [{ value: 'video', label: 'Videos', count: 42 }],
        creators: [{ value: 'user-1', label: 'Jane', count: 10 }],
        projects: [],
        dateRanges: [],
      };
      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ facets: mockFacets }),
      });

      const facets = await service.getFacets('test');

      expect(facets.contentTypes).toHaveLength(1);
      expect(facets.contentTypes[0].value).toBe('video');
      expect(facets.creators).toHaveLength(1);
    });

    test('should return empty facets on fetch error', async () => {
      (global.fetch as any).mockRejectedValue(new Error('Network error'));

      const facets = await service.getFacets('test');

      expect(facets.contentTypes).toEqual([]);
      expect(facets.creators).toEqual([]);
      expect(facets.projects).toEqual([]);
      expect(facets.dateRanges).toEqual([]);
    });

    test('should return empty facets for non-ok response', async () => {
      (global.fetch as any).mockResolvedValue({ ok: false, status: 500 });

      const facets = await service.getFacets('test');

      expect(facets.contentTypes).toEqual([]);
    });

    test('should include facetsOnly parameter', async () => {
      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ facets: { contentTypes: [], creators: [], projects: [], dateRanges: [] } }),
      });

      await service.getFacets('hello', { contentType: { types: ['video'] } });

      const callUrl = (global.fetch as any).mock.calls[0][0];
      expect(callUrl).toContain('facetsOnly=true');
      expect(callUrl).toContain('q=hello');
      expect(callUrl).toContain('types=video');
    });
  });

  describe('clearFilters', () => {
    test('should return empty filters object', () => {
      const cleared = service.clearFilters();
      expect(cleared).toEqual({});
    });
  });

  describe('cancel', () => {
    test('should cancel pending search request', async () => {
      let rejectFetch: any;
      (global.fetch as any).mockImplementation(() => new Promise((_, reject) => {
        rejectFetch = reject;
      }));

      const searchPromise = service.searchWithFilters('test', {});
      service.cancel();

      // The abort should cause the fetch to reject with AbortError
      const abortErr = new Error('Aborted');
      abortErr.name = 'AbortError';
      rejectFetch(abortErr);

      const result = await searchPromise;
      expect(result.results).toEqual([]);
    });
  });
});
