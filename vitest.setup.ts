import * as fc from "fast-check";

// Property-based tests run a minimum of 100 iterations across the monorepo.
fc.configureGlobal({ numRuns: 100 });

// ---------------------------------------------------------------------------
// jsdom polyfills for web tests
// jsdom does not implement window.matchMedia or DragEvent. Web tests that rely
// on responsive breakpoints or drag-and-drop interactions need these stubs.
// ---------------------------------------------------------------------------

if (typeof window !== 'undefined') {
  // Polyfill window.matchMedia (returns non-matching by default)
  if (!window.matchMedia) {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: (query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }),
    });
  }

  // Polyfill DragEvent (extends MouseEvent)
  if (typeof globalThis.DragEvent === 'undefined') {
    (globalThis as any).DragEvent = class DragEvent extends MouseEvent {
      public readonly dataTransfer: DataTransfer | null;
      constructor(type: string, eventInitDict?: DragEventInit) {
        super(type, eventInitDict);
        this.dataTransfer = eventInitDict?.dataTransfer ?? null;
      }
    };
  }

  // Polyfill ResizeObserver (not available in jsdom)
  if (typeof globalThis.ResizeObserver === 'undefined') {
    (globalThis as any).ResizeObserver = class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }

  // Polyfill IntersectionObserver (not available in jsdom)
  if (typeof globalThis.IntersectionObserver === 'undefined') {
    (globalThis as any).IntersectionObserver = class IntersectionObserver {
      constructor() {}
      observe() {}
      unobserve() {}
      disconnect() {}
      takeRecords() { return []; }
    };
  }
}
