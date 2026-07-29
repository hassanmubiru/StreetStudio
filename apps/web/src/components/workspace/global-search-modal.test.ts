/**
 * Global Search Modal Tests
 * 
 * Unit tests for the global search modal component including shortcut activation,
 * result display, keyboard navigation, and recent searches.
 * 
 * Requirements: 14.1, 14.3, 14.5
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { GlobalSearchModal } from './global-search-modal';

describe('GlobalSearchModal', () => {
  let modal: GlobalSearchModal;
  let onNavigate: ReturnType<typeof vi.fn>;
  let onClose: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    // Mock localStorage
    const storage: Record<string, string> = {};
    vi.stubGlobal('localStorage', {
      getItem: vi.fn((key: string) => storage[key] || null),
      setItem: vi.fn((key: string, value: string) => { storage[key] = value; }),
      removeItem: vi.fn((key: string) => { delete storage[key]; }),
      clear: vi.fn(),
    });

    // Mock fetch
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ results: [], totalCount: 0 }),
    }));

    // Mock performance.now
    vi.stubGlobal('performance', { now: vi.fn(() => 0) });

    onNavigate = vi.fn();
    onClose = vi.fn();

    modal = new GlobalSearchModal({
      onNavigate,
      onClose,
      debounceMs: 0, // Disable debounce for tests
    });

    document.body.appendChild(modal.getElement());
  });

  afterEach(() => {
    modal.destroy();
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  describe('Cmd/Ctrl+K shortcut', () => {
    test('should open modal on Ctrl+K', () => {
      const event = new KeyboardEvent('keydown', {
        key: 'k',
        ctrlKey: true,
        bubbles: true,
      });

      document.dispatchEvent(event);

      expect(modal.isModalOpen()).toBe(true);
    });

    test('should open modal on Meta+K (Cmd on Mac)', () => {
      const event = new KeyboardEvent('keydown', {
        key: 'k',
        metaKey: true,
        bubbles: true,
      });

      document.dispatchEvent(event);

      expect(modal.isModalOpen()).toBe(true);
    });

    test('should close modal on Ctrl+K when already open', () => {
      modal.open();

      const event = new KeyboardEvent('keydown', {
        key: 'k',
        ctrlKey: true,
        bubbles: true,
      });

      document.dispatchEvent(event);

      expect(modal.isModalOpen()).toBe(false);
    });

    test('should not respond to K without modifier key', () => {
      const event = new KeyboardEvent('keydown', {
        key: 'k',
        bubbles: true,
      });

      document.dispatchEvent(event);

      expect(modal.isModalOpen()).toBe(false);
    });
  });

  describe('open/close behavior', () => {
    test('should open the modal', () => {
      modal.open();

      expect(modal.isModalOpen()).toBe(true);
      const element = modal.getElement();
      expect(element.classList.contains('hidden')).toBe(false);
    });

    test('should close the modal', () => {
      modal.open();
      modal.close();

      expect(modal.isModalOpen()).toBe(false);
      expect(onClose).toHaveBeenCalled();
    });

    test('should reset query when opening', () => {
      modal.open();

      // Simulate typing
      const input = modal.getElement().querySelector('[data-testid="search-input"]') as HTMLInputElement;
      if (input) {
        input.value = 'some query';
        input.dispatchEvent(new Event('input'));
      }

      modal.close();
      modal.open();

      expect(modal.getQuery()).toBe('');
    });

    test('should prevent body scroll when open', () => {
      modal.open();
      expect(document.body.style.overflow).toBe('hidden');

      modal.close();
      expect(document.body.style.overflow).toBe('');
    });

    test('should close on Escape key', () => {
      modal.open();

      const input = modal.getElement().querySelector('[data-testid="search-input"]') as HTMLInputElement;
      if (input) {
        const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true });
        input.dispatchEvent(event);
      }

      expect(modal.isModalOpen()).toBe(false);
    });

    test('should close on backdrop click', () => {
      modal.open();

      const backdrop = modal.getElement().querySelector('[data-testid="search-backdrop"]') as HTMLElement;
      if (backdrop) {
        backdrop.click();
      }

      expect(modal.isModalOpen()).toBe(false);
    });
  });

  describe('search input', () => {
    test('should display search input when open', () => {
      modal.open();

      const input = modal.getElement().querySelector('[data-testid="search-input"]');
      expect(input).not.toBeNull();
      expect(input?.getAttribute('role')).toBe('combobox');
    });

    test('should have proper ARIA attributes', () => {
      modal.open();

      const input = modal.getElement().querySelector('[data-testid="search-input"]');
      expect(input?.getAttribute('aria-label')).toBe('Search');
      expect(input?.getAttribute('aria-controls')).toBe('search-results');
      expect(input?.getAttribute('aria-expanded')).toBeDefined();
    });

    test('should show loading state while searching', async () => {
      // Make fetch hang
      (global.fetch as any).mockImplementation(() => new Promise(() => {}));

      modal.open();

      const input = modal.getElement().querySelector('[data-testid="search-input"]') as HTMLInputElement;
      if (input) {
        input.value = 'test query';
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }

      // With debounceMs: 0, search fires immediately
      await new Promise(resolve => setTimeout(resolve, 10));

      // Re-check after render
      const loading = modal.getElement().querySelector('[data-testid="search-loading"]');
      expect(loading).not.toBeNull();
    });
  });

  describe('search results display', () => {
    test('should display results after search completes', async () => {
      const mockResults = [
        {
          id: '1',
          type: 'video',
          title: 'Test Video',
          description: 'A test video',
          url: '/videos/1',
          metadata: { duration: '2:34' },
        },
      ];

      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ results: mockResults, totalCount: 1 }),
      });

      modal.open();

      const input = modal.getElement().querySelector('[data-testid="search-input"]') as HTMLInputElement;
      if (input) {
        input.value = 'test';
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }

      // Wait for async search
      await new Promise(resolve => setTimeout(resolve, 50));

      const resultItems = modal.getElement().querySelectorAll('[data-testid="search-result-item"]');
      expect(resultItems.length).toBe(1);
    });

    test('should show no results message when search returns empty', async () => {
      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ results: [], totalCount: 0 }),
      });

      modal.open();

      const input = modal.getElement().querySelector('[data-testid="search-input"]') as HTMLInputElement;
      if (input) {
        input.value = 'nonexistent';
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }

      await new Promise(resolve => setTimeout(resolve, 50));

      const noResults = modal.getElement().querySelector('[data-testid="search-no-results"]');
      expect(noResults).not.toBeNull();
    });

    test('should navigate when clicking a result', async () => {
      const mockResults = [
        {
          id: '1',
          type: 'video',
          title: 'Test Video',
          url: '/videos/1',
          metadata: {},
        },
      ];

      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ results: mockResults, totalCount: 1 }),
      });

      modal.open();

      const input = modal.getElement().querySelector('[data-testid="search-input"]') as HTMLInputElement;
      if (input) {
        input.value = 'test';
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }

      await new Promise(resolve => setTimeout(resolve, 50));

      const resultItem = modal.getElement().querySelector('[data-result-index="0"]') as HTMLElement;
      if (resultItem) {
        resultItem.click();
      }

      expect(onNavigate).toHaveBeenCalledWith('/videos/1');
      expect(modal.isModalOpen()).toBe(false);
    });
  });

  describe('suggestions and recent searches', () => {
    test('should show recent searches when modal opens with no query', () => {
      // Pre-populate recent searches
      const storage: Record<string, string> = {
        streetstudio_recent_searches: JSON.stringify(['previous search', 'old query']),
      };
      (window.localStorage.getItem as any).mockImplementation((key: string) => storage[key] || null);

      // Recreate modal to pick up stored searches
      modal.destroy();
      modal = new GlobalSearchModal({ onNavigate, onClose, debounceMs: 0 });
      document.body.appendChild(modal.getElement());

      modal.open();

      const suggestions = modal.getElement().querySelector('[data-testid="search-suggestions"]');
      expect(suggestions).not.toBeNull();
    });

    test('should clear recent searches on button click', () => {
      // Pre-populate
      const storage: Record<string, string> = {
        streetstudio_recent_searches: JSON.stringify(['search one', 'search two']),
      };
      (window.localStorage.getItem as any).mockImplementation((key: string) => storage[key] || null);

      modal.destroy();
      modal = new GlobalSearchModal({ onNavigate, onClose, debounceMs: 0 });
      document.body.appendChild(modal.getElement());

      modal.open();

      const clearBtn = modal.getElement().querySelector('[data-testid="clear-recent-searches"]') as HTMLElement;
      if (clearBtn) {
        clearBtn.click();
      }

      // After clearing, suggestions should be empty
      const suggestions = modal.getElement().querySelector('[data-testid="search-suggestions"]');
      expect(suggestions).toBeNull();
    });
  });

  describe('keyboard navigation', () => {
    test('should move selection down with ArrowDown', async () => {
      const mockResults = [
        { id: '1', type: 'video', title: 'Result 1', url: '/1', metadata: {} },
        { id: '2', type: 'video', title: 'Result 2', url: '/2', metadata: {} },
      ];

      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ results: mockResults, totalCount: 2 }),
      });

      modal.open();

      const input = modal.getElement().querySelector('[data-testid="search-input"]') as HTMLInputElement;
      if (input) {
        input.value = 'test';
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }

      await new Promise(resolve => setTimeout(resolve, 50));

      // Press ArrowDown
      if (input) {
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
      }

      expect(modal.getSelectedIndex()).toBe(0);
    });

    test('should move selection up with ArrowUp', async () => {
      const mockResults = [
        { id: '1', type: 'video', title: 'Result 1', url: '/1', metadata: {} },
        { id: '2', type: 'video', title: 'Result 2', url: '/2', metadata: {} },
      ];

      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ results: mockResults, totalCount: 2 }),
      });

      modal.open();

      const input = modal.getElement().querySelector('[data-testid="search-input"]') as HTMLInputElement;
      if (input) {
        input.value = 'test';
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }

      await new Promise(resolve => setTimeout(resolve, 50));

      // Press ArrowDown twice, then ArrowUp
      if (input) {
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
      }

      expect(modal.getSelectedIndex()).toBe(0);
    });

    test('should navigate to selected result on Enter', async () => {
      const mockResults = [
        { id: '1', type: 'video', title: 'Result 1', url: '/videos/1', metadata: {} },
      ];

      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ results: mockResults, totalCount: 1 }),
      });

      modal.open();

      const input = modal.getElement().querySelector('[data-testid="search-input"]') as HTMLInputElement;
      if (input) {
        input.value = 'test';
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }

      await new Promise(resolve => setTimeout(resolve, 50));

      // Select first result and press Enter
      if (input) {
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      }

      expect(onNavigate).toHaveBeenCalledWith('/videos/1');
    });

    test('should submit search on Enter with no selection', () => {
      modal.open();

      const input = modal.getElement().querySelector('[data-testid="search-input"]') as HTMLInputElement;
      if (input) {
        input.value = 'my search';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      }

      expect(onNavigate).toHaveBeenCalledWith('/search?q=my%20search');
    });

    test('should not go below last result', async () => {
      const mockResults = [
        { id: '1', type: 'video', title: 'Result 1', url: '/1', metadata: {} },
      ];

      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ results: mockResults, totalCount: 1 }),
      });

      modal.open();

      const input = modal.getElement().querySelector('[data-testid="search-input"]') as HTMLInputElement;
      if (input) {
        input.value = 'test';
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }

      await new Promise(resolve => setTimeout(resolve, 50));

      // Press ArrowDown many times
      if (input) {
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
      }

      // Should be clamped to last index (0, since only 1 result)
      expect(modal.getSelectedIndex()).toBe(0);
    });
  });

  describe('accessibility', () => {
    test('should have dialog role', () => {
      const element = modal.getElement();
      expect(element.getAttribute('role')).toBe('dialog');
      expect(element.getAttribute('aria-modal')).toBe('true');
    });

    test('should have aria-label', () => {
      const element = modal.getElement();
      expect(element.getAttribute('aria-label')).toBe('Global search');
    });

    test('should have listbox role for results container', () => {
      modal.open();

      const results = modal.getElement().querySelector('#search-results');
      expect(results?.getAttribute('role')).toBe('listbox');
    });
  });

  describe('destroy', () => {
    test('should clean up on destroy', () => {
      modal.open();
      modal.destroy();

      expect(modal.isModalOpen()).toBe(false);
    });

    test('should remove keyboard listener on destroy', () => {
      modal.destroy();

      // Try to open with shortcut after destroy
      const event = new KeyboardEvent('keydown', {
        key: 'k',
        ctrlKey: true,
        bubbles: true,
      });
      document.dispatchEvent(event);

      expect(modal.isModalOpen()).toBe(false);
    });
  });
});
