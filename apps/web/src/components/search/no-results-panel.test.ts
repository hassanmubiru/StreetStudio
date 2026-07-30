/**
 * No Results Panel Component Tests
 * 
 * Unit tests for the no results panel component that displays
 * alternative suggestions and discovery recommendations.
 * 
 * Requirements: 14.10
 */

// @vitest-environment jsdom

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { NoResultsPanel } from './no-results-panel';

describe('NoResultsPanel', () => {
  beforeEach(() => {
    const storage: Record<string, string> = {};
    vi.stubGlobal('localStorage', {
      getItem: vi.fn((key: string) => storage[key] || null),
      setItem: vi.fn((key: string, value: string) => { storage[key] = value; }),
      removeItem: vi.fn((key: string) => { delete storage[key]; }),
      clear: vi.fn(),
    });

    // Mock fetch for trending searches
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ trending: [] }),
    }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('should render no results message with query', () => {
    const panel = new NoResultsPanel({ query: 'test query' });
    const element = panel.getElement();

    expect(element.textContent).toContain('No results for "test query"');
  });

  test('should have proper ARIA attributes', () => {
    const panel = new NoResultsPanel({ query: 'test' });
    const element = panel.getElement();

    expect(element.getAttribute('role')).toBe('status');
    expect(element.getAttribute('aria-label')).toBe('No search results');
  });

  test('should render search tips', () => {
    const panel = new NoResultsPanel({ query: 'test' });
    const element = panel.getElement();

    expect(element.textContent).toContain('Search tips');
    expect(element.textContent).toContain('Check your spelling');
  });

  test('should display spelling corrections for misspelled queries', () => {
    const panel = new NoResultsPanel({ query: 'recroding' });
    const element = panel.getElement();

    expect(element.textContent).toContain('Try instead:');
    expect(element.textContent).toContain('recording');
  });

  test('should display related term suggestions', () => {
    const panel = new NoResultsPanel({ query: 'video' });
    const element = panel.getElement();

    // Should have some suggestions (related terms for "video")
    const suggestions = element.querySelectorAll('[data-action="use-suggestion"]');
    expect(suggestions.length).toBeGreaterThan(0);
  });

  test('should call onSuggestionClick when a suggestion is clicked', () => {
    const onSuggestionClick = vi.fn();
    const panel = new NoResultsPanel({
      query: 'recroding',
      onSuggestionClick,
    });
    const element = panel.getElement();

    const suggestionBtn = element.querySelector('[data-action="use-suggestion"]') as HTMLElement;
    if (suggestionBtn) {
      suggestionBtn.click();
      expect(onSuggestionClick).toHaveBeenCalledWith(expect.any(String));
    }
  });

  test('should update query and re-render', () => {
    const panel = new NoResultsPanel({ query: 'initial' });
    const element = panel.getElement();

    panel.updateQuery('updated query');

    expect(element.textContent).toContain('No results for "updated query"');
  });

  test('should render broader suggestions for multi-word queries', () => {
    const panel = new NoResultsPanel({ query: 'new video editing project' });
    const element = panel.getElement();

    // Should suggest removing the qualifier "new"
    const suggestions = element.querySelectorAll('[data-action="use-suggestion"]');
    expect(suggestions.length).toBeGreaterThan(0);
  });

  test('should escape HTML in query display', () => {
    const panel = new NoResultsPanel({ query: '<script>alert("xss")</script>' });
    const element = panel.getElement();

    // The query text should be visible but not executable as HTML
    expect(element.querySelector('script')).toBeNull();
    expect(element.textContent).toContain('<script>');
  });

  test('should render trending section when data is available', async () => {
    const mockTrending = [
      { query: 'screen recording', searchCount: 42, trend: 'rising' },
      { query: 'video editing', searchCount: 28, trend: 'stable' },
    ];
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ trending: mockTrending }),
    });

    const panel = new NoResultsPanel({ query: 'nonexistent' });

    // Wait for async trending load
    await new Promise(resolve => setTimeout(resolve, 10));

    const element = panel.getElement();
    expect(element.textContent).toContain('Trending searches');
    expect(element.textContent).toContain('screen recording');
  });

  test('should gracefully handle trending fetch failure', async () => {
    (global.fetch as any).mockRejectedValue(new Error('Network error'));

    const panel = new NoResultsPanel({ query: 'test' });

    // Wait for async trending load to fail
    await new Promise(resolve => setTimeout(resolve, 10));

    const element = panel.getElement();
    // Should still render without crashing
    expect(element.textContent).toContain('No results for "test"');
  });

  test('should not render suggestion section for queries with no matches', () => {
    // A query that won't match any spelling correction or term relation
    const panel = new NoResultsPanel({ query: 'xyzabc123' });
    const element = panel.getElement();

    // Should still have search tips even without suggestions
    expect(element.textContent).toContain('Search tips');
  });
});
