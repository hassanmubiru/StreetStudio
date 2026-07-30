/**
 * Progressive Image Loading Service
 *
 * Implements lazy loading, placeholder generation, and WebP format detection/fallback
 * for optimal image delivery and user experience.
 *
 * Validates: Requirements 12.5
 */

export interface ImageSource {
  /** Original image URL */
  src: string;
  /** WebP version URL (if available) */
  webpSrc?: string;
  /** Low-quality placeholder URL or data URI */
  placeholder?: string;
  /** Image alt text */
  alt: string;
  /** Natural width */
  width?: number;
  /** Natural height */
  height?: number;
}

export interface ResponsiveImageConfig {
  /** Breakpoints for responsive srcset generation */
  breakpoints: number[];
  /** URL pattern with {width} placeholder. e.g., '/images/{id}?w={width}' */
  urlPattern: string;
  /** Whether to generate WebP variants */
  preferWebP: boolean;
}

export interface ProgressiveLoadConfig {
  /** Root margin for IntersectionObserver (default: '200px') */
  rootMargin: string;
  /** Intersection threshold (0-1). Default: 0.01 */
  threshold: number;
  /** Fade-in transition duration in ms. Default: 300 */
  fadeInDuration: number;
  /** Whether to use native lazy loading as fallback. Default: true */
  useNativeLazy: boolean;
  /** Whether to check for WebP support. Default: true */
  detectWebP: boolean;
}

export interface ImageLoadEvent {
  src: string;
  loadTime: number;
  fromCache: boolean;
  format: 'webp' | 'jpeg' | 'png' | 'gif' | 'avif' | 'unknown';
}

export type ImageLoadCallback = (event: ImageLoadEvent) => void;

const DEFAULT_CONFIG: ProgressiveLoadConfig = {
  rootMargin: '200px',
  threshold: 0.01,
  fadeInDuration: 300,
  useNativeLazy: true,
  detectWebP: true,
};

/**
 * Progressive Image Loading Manager.
 * Handles lazy loading, WebP detection, placeholder rendering, and format fallback.
 */
export class ProgressiveImageLoader {
  private config: ProgressiveLoadConfig;
  private observer: IntersectionObserver | null = null;
  private webpSupported: boolean | null = null;
  private loadedImages: Set<string> = new Set();
  private listeners: ImageLoadCallback[] = [];
  private pendingElements: Map<Element, ImageSource> = new Map();

  constructor(config: Partial<ProgressiveLoadConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Detect WebP support in the current browser.
   * Returns a cached result on subsequent calls.
   */
  public async detectWebPSupport(): Promise<boolean> {
    if (this.webpSupported !== null) return this.webpSupported;

    // Check if we're in a non-browser environment
    if (typeof document === 'undefined' || typeof Image === 'undefined') {
      this.webpSupported = false;
      return false;
    }

    try {
      const result = await new Promise<boolean>((resolve) => {
        const img = new Image();
        img.onload = () => resolve(img.width > 0 && img.height > 0);
        img.onerror = () => resolve(false);
        // 1x1 WebP image
        img.src =
          'data:image/webp;base64,UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA';
      });
      this.webpSupported = result;
      return result;
    } catch {
      this.webpSupported = false;
      return false;
    }
  }

  /**
   * Get the current WebP support status (synchronous, returns cached value).
   * Returns null if detection hasn't run yet.
   */
  public getWebPSupport(): boolean | null {
    return this.webpSupported;
  }

  /**
   * Set WebP support value directly (useful for testing or when already known).
   */
  public setWebPSupport(supported: boolean): void {
    this.webpSupported = supported;
  }

  /**
   * Get the best available source URL for an image based on browser support.
   */
  public getBestSource(source: ImageSource): string {
    if (this.webpSupported && source.webpSrc) {
      return source.webpSrc;
    }
    return source.src;
  }

  /**
   * Generate a low-quality inline placeholder (tiny blurred version).
   * Returns a CSS-compatible blur data URI for use as background.
   */
  public generatePlaceholderStyle(
    width: number,
    height: number,
    color: string = '#e2e8f0'
  ): string {
    return `background-color: ${color}; aspect-ratio: ${width} / ${height};`;
  }

  /**
   * Generate responsive srcset string for an image.
   */
  public generateSrcSet(config: ResponsiveImageConfig): string {
    const extension = this.webpSupported && config.preferWebP ? '.webp' : '';
    return config.breakpoints
      .map((width) => {
        const url = config.urlPattern.replace('{width}', String(width)) + extension;
        return `${url} ${width}w`;
      })
      .join(', ');
  }

  /**
   * Generate responsive sizes attribute.
   */
  public generateSizes(breakpoints: Array<{ maxWidth: number; size: string }>, defaultSize: string): string {
    const parts = breakpoints.map(
      ({ maxWidth, size }) => `(max-width: ${maxWidth}px) ${size}`
    );
    parts.push(defaultSize);
    return parts.join(', ');
  }

  /**
   * Initialize the IntersectionObserver for lazy loading.
   */
  public initialize(): void {
    if (typeof IntersectionObserver === 'undefined') return;
    if (this.observer) return;

    this.observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            this.loadImage(entry.target);
            this.observer?.unobserve(entry.target);
          }
        }
      },
      {
        rootMargin: this.config.rootMargin,
        threshold: this.config.threshold,
      }
    );
  }

  /**
   * Register an image element for lazy loading observation.
   */
  public observe(element: Element, source: ImageSource): void {
    this.pendingElements.set(element, source);

    if (this.observer) {
      this.observer.observe(element);
    } else if (this.config.useNativeLazy) {
      // Fallback to native lazy loading
      this.applyNativeLazy(element, source);
    }
  }

  /**
   * Stop observing an element.
   */
  public unobserve(element: Element): void {
    this.pendingElements.delete(element);
    this.observer?.unobserve(element);
  }

  /**
   * Load an image element that has entered the viewport.
   */
  public loadImage(element: Element): void {
    const source = this.pendingElements.get(element);
    if (!source) return;

    const startTime = Date.now();
    const bestSrc = this.getBestSource(source);

    if (element instanceof HTMLImageElement) {
      element.src = bestSrc;
      element.addEventListener(
        'load',
        () => {
          this.onImageLoaded(bestSrc, startTime);
          element.classList.add('loaded');
        },
        { once: true }
      );
    } else {
      // For background image containers
      (element as HTMLElement).style.backgroundImage = `url(${bestSrc})`;
      this.onImageLoaded(bestSrc, startTime);
      element.classList.add('loaded');
    }

    this.pendingElements.delete(element);
  }

  /**
   * Preload an image without displaying it (for upcoming content).
   */
  public preload(source: ImageSource): Promise<void> {
    const bestSrc = this.getBestSource(source);
    if (this.loadedImages.has(bestSrc)) return Promise.resolve();

    return new Promise((resolve, reject) => {
      if (typeof Image === 'undefined') {
        resolve();
        return;
      }
      const img = new Image();
      img.onload = () => {
        this.loadedImages.add(bestSrc);
        resolve();
      };
      img.onerror = () => reject(new Error(`Failed to preload: ${bestSrc}`));
      img.src = bestSrc;
    });
  }

  /**
   * Check if an image has been loaded.
   */
  public isLoaded(src: string): boolean {
    return this.loadedImages.has(src);
  }

  /**
   * Get count of pending (not yet loaded) images.
   */
  public getPendingCount(): number {
    return this.pendingElements.size;
  }

  /**
   * Subscribe to image load events.
   */
  public onLoad(callback: ImageLoadCallback): () => void {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== callback);
    };
  }

  /**
   * Detect the format of an image from its URL.
   */
  public detectFormat(url: string): ImageLoadEvent['format'] {
    const lower = url.toLowerCase();
    if (lower.includes('.webp') || lower.includes('format=webp')) return 'webp';
    if (lower.includes('.jpg') || lower.includes('.jpeg')) return 'jpeg';
    if (lower.includes('.png')) return 'png';
    if (lower.includes('.gif')) return 'gif';
    if (lower.includes('.avif')) return 'avif';
    return 'unknown';
  }

  /**
   * Clean up the observer and internal state.
   */
  public destroy(): void {
    this.observer?.disconnect();
    this.observer = null;
    this.pendingElements.clear();
    this.loadedImages.clear();
    this.listeners = [];
  }

  // --- Private methods ---

  private applyNativeLazy(element: Element, source: ImageSource): void {
    if (element instanceof HTMLImageElement) {
      element.loading = 'lazy';
      element.src = this.getBestSource(source);
    }
  }

  private onImageLoaded(src: string, startTime: number): void {
    const loadTime = Date.now() - startTime;
    const fromCache = loadTime < 50; // Heuristic: very fast loads are from cache
    this.loadedImages.add(src);

    const event: ImageLoadEvent = {
      src,
      loadTime,
      fromCache,
      format: this.detectFormat(src),
    };

    for (const listener of this.listeners) {
      listener(event);
    }
  }
}

/** Singleton progressive image loader instance. */
export const progressiveImages = new ProgressiveImageLoader();
