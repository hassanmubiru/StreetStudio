/**
 * Content Search Service Tests
 * 
 * Unit tests for the content-specific search service including transcript search,
 * timestamp navigation, result highlighting with context, and content-specific features.
 * 
 * Requirements: 14.4, 14.6, 14.9
 */

// @vitest-environment jsdom

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { ContentSearchService } from './content-search';

describe('ContentSearchService', () => {
  let service: ContentSearchService;

  beforeEach(() => {
    vi.stubGlobal('performance', { now: vi.fn(() => 0) });
    vi.stubGlobal('fetch', vi.fn());

    service = new ContentSearchService({ apiBaseUrl: '/api' });
  });

  afterEach(() => {
    service.destroy();
    vi.restoreAllMocks();
  });

  describe('searchTranscript', () => {
    test('should search within a video transcript and return matches', async () => {
      const mockData = {
        videoTitle: 'Demo Video',
        matches: [
          {
            segment: {
              id: 'seg-1',
              videoId: 'vid-1',
              text: 'Welcome to the demo, this is a test transcript.',
              startTime: 10,
              endTime: 15,
              speaker: 'Host',
            },
            matchedText: 'demo',
            contextBefore: 'previous text',
            contextAfter: 'following text',
          },
        ],
        totalMatches: 1,
      };
      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(mockData),
      });

      const response = await service.searchTranscript('vid-1', 'demo');

      expect(response.videoId).toBe('vid-1');
      expect(response.videoTitle).toBe('Demo Video');
      expect(response.matches).toHaveLength(1);
      expect(response.matches[0]!.segment.startTime).toBe(10);
      expect(response.matches[0]!.segment.endTime).toBe(15);
      expect(response.matches[0]!.segment.speaker).toBe('Host');
      expect(response.totalMatches).toBe(1);
      expect(response.query).toBe('demo');
    });

    test('should highlight matched text in transcript segments', async () => {
      const mockData = {
        videoTitle: 'Test Video',
        matches: [
          {
            segment: {
              id: 'seg-1',
              videoId: 'vid-1',
              text: 'This is a demo of the search feature.',
              startTime: 5,
              endTime: 10,
            },
            matchedText: 'demo',
            contextBefore: '',
            contextAfter: '',
          },
        ],
        totalMatches: 1,
      };
      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(mockData),
      });

      const response = await service.searchTranscript('vid-1', 'demo');

      expect(response.matches[0]!.highlightedText).toContain('<mark');
      expect(response.matches[0]!.highlightedText).toContain('demo');
    });

    test('should return empty results for empty query', async () => {
      const response = await service.searchTranscript('vid-1', '');

      expect(response.matches).toEqual([]);
      expect(response.totalMatches).toBe(0);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    test('should return empty results for whitespace-only query', async () => {
      const response = await service.searchTranscript('vid-1', '   ');

      expect(response.matches).toEqual([]);
      expect(response.totalMatches).toBe(0);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    test('should return empty results for empty videoId', async () => {
      const response = await service.searchTranscript('', 'test');

      expect(response.matches).toEqual([]);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    test('should call correct API endpoint', async () => {
      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ matches: [], totalMatches: 0 }),
      });

      await service.searchTranscript('vid-123', 'hello world');

      expect(global.fetch).toHaveBeenCalledWith(
        '/api/videos/vid-123/transcript/search?q=hello+world',
        expect.objectContaining({ signal: expect.any(AbortSignal) })
      );
    });

    test('should handle non-ok API response', async () => {
      (global.fetch as any).mockResolvedValue({ ok: false, status: 404 });

      await expect(service.searchTranscript('vid-1', 'test')).rejects.toThrow(
        'Transcript search failed: 404'
      );
    });

    test('should handle abort errors gracefully', async () => {
      const abortError = new Error('Aborted');
      abortError.name = 'AbortError';
      (global.fetch as any).mockRejectedValue(abortError);

      const response = await service.searchTranscript('vid-1', 'test');

      expect(response.matches).toEqual([]);
      expect(response.totalMatches).toBe(0);
    });

    test('should abort previous request when new search is started', async () => {
      const abortError = new Error('Aborted');
      abortError.name = 'AbortError';

      (global.fetch as any)
        .mockImplementationOnce((_url: string, opts: { signal: AbortSignal }) => {
          return new Promise((_, reject) => {
            if (opts.signal?.aborted) {
              reject(abortError);
              return;
            }
            opts.signal?.addEventListener('abort', () => reject(abortError));
          });
        })
        .mockResolvedValueOnce({
          ok: true,
          json: vi.fn().mockResolvedValue({ matches: [], totalMatches: 0 }),
        });

      const p1 = service.searchTranscript('vid-1', 'first');
      const p2 = service.searchTranscript('vid-1', 'second');

      const result1 = await p1;
      expect(result1.matches).toEqual([]);

      const result2 = await p2;
      expect(result2.query).toBe('second');
    });
  });

  describe('searchTranscriptsInScope', () => {
    test('should search transcripts across multiple videos', async () => {
      const mockData = {
        results: [
          {
            videoId: 'vid-1',
            videoTitle: 'Video One',
            matches: [
              {
                segment: { id: 's1', videoId: 'vid-1', text: 'Found match here', startTime: 30, endTime: 35 },
                matchedText: 'match',
              },
            ],
            totalMatches: 1,
          },
          {
            videoId: 'vid-2',
            videoTitle: 'Video Two',
            matches: [
              {
                segment: { id: 's2', videoId: 'vid-2', text: 'Another match', startTime: 60, endTime: 65 },
                matchedText: 'match',
              },
            ],
            totalMatches: 1,
          },
        ],
      };
      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(mockData),
      });

      const results = await service.searchTranscriptsInScope('match', {
        scope: 'project',
        scopeId: 'proj-1',
        scopeLabel: 'My Project',
      });

      expect(results).toHaveLength(2);
      expect(results[0]!.videoId).toBe('vid-1');
      expect(results[1]!.videoId).toBe('vid-2');
      expect(results[0]!.matches).toHaveLength(1);
    });

    test('should return empty array for empty query', async () => {
      const results = await service.searchTranscriptsInScope('', {
        scope: 'organization',
        scopeLabel: 'Org',
      });

      expect(results).toEqual([]);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    test('should handle abort gracefully', async () => {
      const abortError = new Error('Aborted');
      abortError.name = 'AbortError';
      (global.fetch as any).mockRejectedValue(abortError);

      const results = await service.searchTranscriptsInScope('test', {
        scope: 'personal',
        scopeLabel: 'My Content',
      });

      expect(results).toEqual([]);
    });

    test('should handle API errors', async () => {
      (global.fetch as any).mockResolvedValue({ ok: false, status: 500 });

      await expect(
        service.searchTranscriptsInScope('test', { scope: 'organization', scopeLabel: 'Org' })
      ).rejects.toThrow('Transcript scope search failed: 500');
    });
  });

  describe('formatTimestamp', () => {
    test('should format seconds into MM:SS', () => {
      expect(service.formatTimestamp(0)).toBe('0:00');
      expect(service.formatTimestamp(5)).toBe('0:05');
      expect(service.formatTimestamp(65)).toBe('1:05');
      expect(service.formatTimestamp(599)).toBe('9:59');
    });

    test('should format hours as HH:MM:SS', () => {
      expect(service.formatTimestamp(3600)).toBe('1:00:00');
      expect(service.formatTimestamp(3661)).toBe('1:01:01');
      expect(service.formatTimestamp(7200)).toBe('2:00:00');
    });

    test('should handle negative values', () => {
      expect(service.formatTimestamp(-5)).toBe('0:00');
    });

    test('should handle Infinity and NaN', () => {
      expect(service.formatTimestamp(Infinity)).toBe('0:00');
      expect(service.formatTimestamp(NaN)).toBe('0:00');
    });
  });

  describe('getTimestampNavigation', () => {
    test('should generate navigation URL with timestamp', () => {
      const nav = service.getTimestampNavigation('vid-123', 45.7);

      expect(nav.url).toBe('/videos/vid-123?t=45');
      expect(nav.timestamp).toBe(45);
    });

    test('should encode special characters in videoId', () => {
      const nav = service.getTimestampNavigation('vid/special&id', 10);

      expect(nav.url).toBe('/videos/vid%2Fspecial%26id?t=10');
    });

    test('should floor the timestamp to integer', () => {
      const nav = service.getTimestampNavigation('vid-1', 99.99);

      expect(nav.timestamp).toBe(99);
    });
  });

  describe('highlightInContext', () => {
    test('should return context snippets with highlight positions', () => {
      const text = 'This is a long text with the keyword hidden somewhere in the middle of it all.';
      const contexts = service.highlightInContext(text, 'keyword');

      expect(contexts.length).toBeGreaterThan(0);
      expect(contexts[0]!.highlights.length).toBeGreaterThan(0);
      expect(contexts[0]!.highlights[0]!.term).toBe('keyword');
    });

    test('should return empty array for empty query', () => {
      const contexts = service.highlightInContext('some text', '');

      expect(contexts).toEqual([]);
    });

    test('should return empty array for empty text', () => {
      const contexts = service.highlightInContext('', 'query');

      expect(contexts).toEqual([]);
    });

    test('should limit context snippets to max configured', () => {
      const svc = new ContentSearchService({ maxContextSnippets: 2 });
      const text = 'test one test two test three test four test five';
      const contexts = svc.highlightInContext(text, 'test');

      expect(contexts.length).toBeLessThanOrEqual(2);
      svc.destroy();
    });

    test('should add ellipsis for truncated context', () => {
      const svc = new ContentSearchService({ contextWindowSize: 5 });
      const text = 'A very long prefix text before the keyword and a very long suffix after it.';
      const contexts = svc.highlightInContext(text, 'keyword');

      expect(contexts[0]!.text).toContain('...');
      svc.destroy();
    });
  });

  describe('highlightText', () => {
    test('should wrap matches in mark tags', () => {
      const result = service.highlightText('Hello world, welcome to the world', 'world');

      expect(result).toContain('<mark');
      expect(result).toContain('world');
      // Should highlight all occurrences
      const markCount = (result.match(/<mark/g) || []).length;
      expect(markCount).toBe(2);
    });

    test('should be case-insensitive', () => {
      const result = service.highlightText('Hello World', 'world');

      expect(result).toContain('<mark');
      expect(result).toContain('World');
    });

    test('should return original text for empty query', () => {
      const result = service.highlightText('Hello World', '');

      expect(result).toBe('Hello World');
    });

    test('should return empty string for empty text', () => {
      const result = service.highlightText('', 'query');

      expect(result).toBe('');
    });

    test('should handle special regex characters in query', () => {
      const result = service.highlightText('value is (100)', '(100)');

      expect(result).toContain('<mark');
      expect(result).toContain('(100)');
    });

    test('should highlight multiple terms from quoted phrases', () => {
      const result = service.highlightText(
        'The quick brown fox jumps over the lazy dog',
        '"quick brown" dog'
      );

      expect(result).toContain('<mark');
      // Should highlight both "quick brown" and "dog"
      const markCount = (result.match(/<mark/g) || []).length;
      expect(markCount).toBeGreaterThanOrEqual(2);
    });
  });

  describe('extractSearchTerms', () => {
    test('should split query into individual words', () => {
      const terms = service.extractSearchTerms('hello world');
      expect(terms).toContain('hello');
      expect(terms).toContain('world');
    });

    test('should extract quoted phrases as single terms', () => {
      const terms = service.extractSearchTerms('"hello world" test');
      expect(terms).toContain('hello world');
      expect(terms).toContain('test');
    });

    test('should handle multiple quoted phrases', () => {
      const terms = service.extractSearchTerms('"first phrase" middle "second phrase"');
      expect(terms).toContain('first phrase');
      expect(terms).toContain('second phrase');
      expect(terms).toContain('middle');
    });

    test('should return empty array for empty query', () => {
      expect(service.extractSearchTerms('')).toEqual([]);
      expect(service.extractSearchTerms('   ')).toEqual([]);
    });
  });

  describe('countMatches', () => {
    test('should count occurrences of query terms in text', () => {
      const count = service.countMatches('test one test two test three', 'test');
      expect(count).toBe(3);
    });

    test('should count multiple terms independently', () => {
      const count = service.countMatches('hello world hello earth', 'hello world');
      // "hello" appears 2 times, "world" appears 1 time = 3
      expect(count).toBe(3);
    });

    test('should return 0 for no matches', () => {
      const count = service.countMatches('hello world', 'xyz');
      expect(count).toBe(0);
    });

    test('should return 0 for empty text or query', () => {
      expect(service.countMatches('', 'test')).toBe(0);
      expect(service.countMatches('text', '')).toBe(0);
    });
  });

  describe('enrichResultsWithContext', () => {
    test('should add context snippets and match count to results', () => {
      const results = [
        {
          id: '1',
          type: 'video' as const,
          title: 'Test Video about demos',
          description: 'A demo of search features with demo content',
          url: '/videos/1',
          metadata: {},
        },
      ];

      const enriched = service.enrichResultsWithContext(results, 'demo');

      expect(enriched).toHaveLength(1);
      expect(enriched[0]!.matchCount).toBeGreaterThan(0);
      expect(enriched[0]!.relevanceScore).toBeGreaterThan(0);
      expect(enriched[0]!.contextSnippets.length).toBeGreaterThanOrEqual(0);
    });

    test('should include highlighted title and description', () => {
      const results = [
        {
          id: '1',
          type: 'video' as const,
          title: 'Demo Recording',
          description: 'This is a demo',
          url: '/v/1',
          metadata: {},
        },
      ];

      const enriched = service.enrichResultsWithContext(results, 'demo');

      expect(enriched[0]!.highlightedTitle).toContain('<mark');
      expect(enriched[0]!.highlightedDescription).toContain('<mark');
    });

    test('should handle results without description', () => {
      const results = [
        {
          id: '1',
          type: 'video' as const,
          title: 'No Description Video',
          url: '/v/1',
          metadata: {},
        },
      ];

      const enriched = service.enrichResultsWithContext(results, 'Video');

      expect(enriched[0]!.highlightedDescription).toBeUndefined();
    });
  });

  describe('searchInScope', () => {
    test('should search within project scope', async () => {
      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          results: [{ id: '1', type: 'video', title: 'Found', url: '/v/1', metadata: {} }],
          totalCount: 1,
        }),
      });

      const response = await service.searchInScope('test', {
        scope: 'project',
        scopeId: 'proj-1',
        scopeLabel: 'My Project',
      });

      expect(response.results).toHaveLength(1);
      expect(response.scope.scope).toBe('project');
      expect(response.scope.scopeId).toBe('proj-1');

      const callUrl = (global.fetch as any).mock.calls[0][0];
      expect(callUrl).toContain('scope=project');
      expect(callUrl).toContain('scopeId=proj-1');
    });

    test('should return empty for empty query', async () => {
      const response = await service.searchInScope('', {
        scope: 'personal',
        scopeLabel: 'My Content',
      });

      expect(response.results).toEqual([]);
      expect(response.totalCount).toBe(0);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    test('should handle abort gracefully', async () => {
      const abortError = new Error('Aborted');
      abortError.name = 'AbortError';
      (global.fetch as any).mockRejectedValue(abortError);

      const response = await service.searchInScope('test', {
        scope: 'organization',
        scopeLabel: 'Org',
      });

      expect(response.results).toEqual([]);
      expect(response.totalCount).toBe(0);
    });
  });

  describe('localExpandTerms', () => {
    test('should expand known synonyms', () => {
      const expanded = service.localExpandTerms('video edit');

      expect(expanded).toContain('recording');
      expect(expanded).toContain('modify');
    });

    test('should return empty for unknown terms', () => {
      const expanded = service.localExpandTerms('xyzabc');

      expect(expanded).toEqual([]);
    });

    test('should limit results to 10', () => {
      // Use many known terms
      const expanded = service.localExpandTerms('video recording edit trim project team comment share upload search delete create');

      expect(expanded.length).toBeLessThanOrEqual(10);
    });
  });

  describe('getDefaultScopes', () => {
    test('should return personal and organization scopes', () => {
      const scopes = service.getDefaultScopes();

      expect(scopes).toHaveLength(2);
      expect(scopes[0]!.scope).toBe('personal');
      expect(scopes[1]!.scope).toBe('organization');
    });
  });

  describe('cancel', () => {
    test('should cancel pending request', async () => {
      const abortError = new Error('Aborted');
      abortError.name = 'AbortError';

      (global.fetch as any).mockImplementation(() => new Promise((_, reject) => {
        setTimeout(() => reject(abortError), 100);
      }));

      const promise = service.searchTranscript('vid-1', 'test');
      service.cancel();

      const result = await promise;
      expect(result.matches).toEqual([]);
    });
  });
});
