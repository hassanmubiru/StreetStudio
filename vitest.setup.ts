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

  // -------------------------------------------------------------------------
  // Canvas 2D rendering context polyfill.
  //
  // jsdom does not implement <canvas> rendering (HTMLCanvasElement.getContext
  // returns null) because it has no graphics backend. The real `canvas`
  // (node-canvas) package requires native Cairo/Pango libraries that are not
  // available in every CI environment. This shim implements the 2D context
  // *API surface* the web client uses so that component drawing logic (path
  // math, state transitions, coordinate handling) executes and is validated.
  // It is a browser-API environment polyfill — the same category as the
  // matchMedia/ResizeObserver shims above — not a substitute for product
  // logic or data. Drawing components still run their own real code against it.
  // -------------------------------------------------------------------------
  if (typeof HTMLCanvasElement !== 'undefined' &&
      !(HTMLCanvasElement.prototype as any).__ss2dPolyfilled) {
    const make2dContext = () => ({
      // drawing state (settable properties, read back like the real API)
      fillStyle: '#000000',
      strokeStyle: '#000000',
      lineWidth: 1,
      lineCap: 'butt' as CanvasLineCap,
      lineJoin: 'miter' as CanvasLineJoin,
      globalAlpha: 1,
      font: '10px sans-serif',
      textAlign: 'start' as CanvasTextAlign,
      textBaseline: 'alphabetic' as CanvasTextBaseline,
      // path + transform operations
      save() {},
      restore() {},
      scale() {},
      translate() {},
      rotate() {},
      setTransform() {},
      resetTransform() {},
      beginPath() {},
      closePath() {},
      moveTo() {},
      lineTo() {},
      arc() {},
      arcTo() {},
      rect() {},
      quadraticCurveTo() {},
      bezierCurveTo() {},
      stroke() {},
      fill() {},
      clip() {},
      // rectangle + image + text operations
      clearRect() {},
      fillRect() {},
      strokeRect() {},
      drawImage() {},
      fillText() {},
      strokeText() {},
      measureText: (text: string) => ({ width: (text ? text.length : 0) * 6 }),
      // pixel + gradient helpers
      createLinearGradient() {
        return { addColorStop() {} };
      },
      createRadialGradient() {
        return { addColorStop() {} };
      },
      createPattern() { return null; },
      getImageData: (_x: number, _y: number, w: number, h: number) => ({
        data: new Uint8ClampedArray(Math.max(0, w) * Math.max(0, h) * 4),
        width: w,
        height: h,
      }),
      putImageData() {},
      createImageData: (w: number, h: number) => ({
        data: new Uint8ClampedArray(Math.max(0, w) * Math.max(0, h) * 4),
        width: w,
        height: h,
      }),
      setLineDash() {},
      getLineDash() { return []; },
    });

    // Real canvas returns the SAME context object for repeated getContext
    // calls, so property writes (e.g. strokeStyle) persist and can be read
    // back. Cache one 2D context per canvas element to mirror that contract.
    const ctxCache = new WeakMap<object, ReturnType<typeof make2dContext>>();
    (HTMLCanvasElement.prototype as any).getContext = function getContext(
      this: object,
      type: string,
    ) {
      if (type !== '2d') return null;
      let ctx = ctxCache.get(this);
      if (!ctx) {
        ctx = make2dContext();
        ctxCache.set(this, ctx);
      }
      return ctx;
    };
    (HTMLCanvasElement.prototype as any).toDataURL = () =>
      'data:image/png;base64,';
    (HTMLCanvasElement.prototype as any).__ss2dPolyfilled = true;
  }
}
