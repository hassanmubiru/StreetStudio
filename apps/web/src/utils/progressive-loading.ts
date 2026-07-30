/**
 * Progressive Loading
 * 
 * Provides progressive image and media loading with IntersectionObserver-based
 * lazy loading, blur-up placeholder technique, and responsive image support.
 * 
 * Requirements: 12.2, 12.5
 */

export interface ProgressiveImageConfig {
  /** The full-resolution image source */
  src: string;
  /** Low-quality placeholder image (data URI or small URL) */
  placeholder?: string;
  /** Alt text for accessibility */
  alt: string;
  /** srcset for responsive images */
  srcSet?: string;
  /** sizes attribute for responsive images */
  sizes?: string;
  /** Whether to use WebP format when supported */
  preferWebP?: boolean;
  /** Callback when image is fully loaded */
  onLoad?: () => void;
  /** Callback on load error */
  onError?: (error: Error) => void;
  /** Root margin for IntersectionObserver */
  rootMargin?: string;
  /** Custom class name */
  className?: string;
}

export interface ProgressiveMediaConfig {
  /** Media source URL */
  src: string;
  /** Media type (video/audio) */
  type: 'video' | 'audio';
  /** Poster image for video */
  poster?: string;
  /** Whether to preload metadata */
  preloadMetadata?: boolean;
  /** Alt text / aria-label */
  ariaLabel: string;
  /** Callback when media can play */
  onCanPlay?: () => void;
  /** Callback on error */
  onError?: (error: Error) => void;
  /** Root margin for IntersectionObserver */
  rootMargin?: string;
}

/**
 * Manages progressive image loading with IntersectionObserver.
 */
export class ProgressiveImageLoader {
  private observer: IntersectionObserver | null = null;
  private observedElements: Map<Element, ProgressiveImageConfig> = new Map();
  private isWebPSupported: boolean | null = null;

  constructor(private rootMargin: string = '200px 0px') {
    this.initObserver();
    this.detectWebPSupport();
  }

  /**
   * Create and observe a progressive image element.
   */
  public createImage(config: ProgressiveImageConfig): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.className = `progressive-image ${config.className || ''}`.trim();
    wrapper.style.position = 'relative';
    wrapper.style.overflow = 'hidden';

    // Placeholder
    if (config.placeholder) {
      const placeholderImg = document.createElement('img');
      placeholderImg.src = config.placeholder;
      placeholderImg.alt = '';
      placeholderImg.setAttribute('aria-hidden', 'true');
      placeholderImg.className = 'progressive-image__placeholder';
      placeholderImg.style.width = '100%';
      placeholderImg.style.height = '100%';
      placeholderImg.style.objectFit = 'cover';
      placeholderImg.style.filter = 'blur(10px)';
      placeholderImg.style.transform = 'scale(1.1)';
      placeholderImg.style.transition = 'opacity 0.3s ease';
      wrapper.appendChild(placeholderImg);
    }

    // Full-res image (initially invisible, no src)
    const fullImg = document.createElement('img');
    fullImg.alt = config.alt;
    fullImg.className = 'progressive-image__full';
    fullImg.style.width = '100%';
    fullImg.style.height = '100%';
    fullImg.style.objectFit = 'cover';
    fullImg.style.opacity = '0';
    fullImg.style.transition = 'opacity 0.3s ease';
    fullImg.style.position = 'absolute';
    fullImg.style.top = '0';
    fullImg.style.left = '0';
    fullImg.setAttribute('loading', 'lazy');
    wrapper.appendChild(fullImg);

    // Observe for visibility
    this.observedElements.set(wrapper, config);
    if (this.observer) {
      this.observer.observe(wrapper);
    }

    return wrapper;
  }

  /**
   * Manually trigger loading of an image element.
   */
  public loadImage(element: HTMLElement): void {
    const config = this.observedElements.get(element);
    if (!config) return;

    this.loadImageElement(element, config);
  }

  /**
   * Stop observing all elements and clean up.
   */
  public destroy(): void {
    this.observer?.disconnect();
    this.observer = null;
    this.observedElements.clear();
  }

  /**
   * Get the number of observed elements.
   */
  public getObservedCount(): number {
    return this.observedElements.size;
  }

  private initObserver(): void {
    if (typeof IntersectionObserver === 'undefined') {
      // Fallback: load all images immediately
      return;
    }

    this.observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const config = this.observedElements.get(entry.target);
            if (config) {
              this.loadImageElement(entry.target as HTMLElement, config);
              this.observer?.unobserve(entry.target);
            }
          }
        });
      },
      { rootMargin: this.rootMargin }
    );
  }

  private loadImageElement(element: HTMLElement, config: ProgressiveImageConfig): void {
    const fullImg = element.querySelector('.progressive-image__full') as HTMLImageElement;
    if (!fullImg) return;

    // Determine the best source
    const src = this.getBestSource(config);

    // Set srcset and sizes if available
    if (config.srcSet) {
      fullImg.srcset = config.srcSet;
    }
    if (config.sizes) {
      fullImg.sizes = config.sizes;
    }

    // Handle load
    fullImg.onload = () => {
      fullImg.style.opacity = '1';

      // Fade out placeholder
      const placeholder = element.querySelector('.progressive-image__placeholder') as HTMLElement;
      if (placeholder) {
        placeholder.style.opacity = '0';
        setTimeout(() => placeholder.remove(), 300);
      }

      element.classList.add('progressive-image--loaded');
      config.onLoad?.();
    };

    // Handle error
    fullImg.onerror = () => {
      element.classList.add('progressive-image--error');
      config.onError?.(new Error(`Failed to load image: ${src}`));
    };

    // Trigger load
    fullImg.src = src;
  }

  private getBestSource(config: ProgressiveImageConfig): string {
    if (config.preferWebP && this.isWebPSupported) {
      // Attempt to convert URL to WebP variant
      return this.toWebPUrl(config.src);
    }
    return config.src;
  }

  private toWebPUrl(url: string): string {
    // Replace common image extensions with .webp
    return url.replace(/\.(jpg|jpeg|png|gif)(\?.*)?$/i, '.webp$2');
  }

  private detectWebPSupport(): void {
    if (typeof document === 'undefined') {
      this.isWebPSupported = false;
      return;
    }

    const canvas = document.createElement('canvas');
    if (canvas.getContext && canvas.getContext('2d')) {
      this.isWebPSupported = canvas.toDataURL('image/webp').indexOf('data:image/webp') === 0;
    } else {
      this.isWebPSupported = false;
    }
  }
}

/**
 * Manages progressive media loading (video/audio) with lazy initialization.
 */
export class ProgressiveMediaLoader {
  private observer: IntersectionObserver | null = null;
  private observedElements: Map<Element, ProgressiveMediaConfig> = new Map();

  constructor(private rootMargin: string = '300px 0px') {
    this.initObserver();
  }

  /**
   * Create a lazy-loaded media element.
   */
  public createMedia(config: ProgressiveMediaConfig): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.className = 'progressive-media';
    wrapper.setAttribute('aria-label', config.ariaLabel);

    if (config.type === 'video') {
      // Show poster as placeholder
      if (config.poster) {
        const posterImg = document.createElement('img');
        posterImg.src = config.poster;
        posterImg.alt = '';
        posterImg.setAttribute('aria-hidden', 'true');
        posterImg.className = 'progressive-media__poster';
        posterImg.style.width = '100%';
        posterImg.style.height = '100%';
        posterImg.style.objectFit = 'cover';
        wrapper.appendChild(posterImg);
      }

      // Play button overlay
      const playBtn = document.createElement('button');
      playBtn.className = 'progressive-media__play-btn';
      playBtn.setAttribute('aria-label', 'Play video');
      playBtn.innerHTML = `<svg viewBox="0 0 24 24" width="48" height="48" aria-hidden="true"><path d="M8 5v14l11-7z" fill="currentColor"/></svg>`;
      playBtn.addEventListener('click', () => this.loadMediaElement(wrapper, config));
      wrapper.appendChild(playBtn);
    }

    // Observe for auto-loading metadata
    if (config.preloadMetadata) {
      this.observedElements.set(wrapper, config);
      if (this.observer) {
        this.observer.observe(wrapper);
      }
    }

    return wrapper;
  }

  /**
   * Manually trigger media loading.
   */
  public loadMedia(element: HTMLElement): void {
    const config = this.observedElements.get(element);
    if (config) {
      this.loadMediaElement(element, config);
    }
  }

  /**
   * Clean up resources.
   */
  public destroy(): void {
    this.observer?.disconnect();
    this.observer = null;
    this.observedElements.clear();
  }

  /**
   * Get the number of observed elements.
   */
  public getObservedCount(): number {
    return this.observedElements.size;
  }

  private initObserver(): void {
    if (typeof IntersectionObserver === 'undefined') {
      return;
    }

    this.observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const config = this.observedElements.get(entry.target);
            if (config && config.preloadMetadata) {
              this.preloadMetadata(entry.target as HTMLElement, config);
            }
            this.observer?.unobserve(entry.target);
          }
        });
      },
      { rootMargin: this.rootMargin }
    );
  }

  private preloadMetadata(element: HTMLElement, config: ProgressiveMediaConfig): void {
    const mediaEl = document.createElement(config.type) as HTMLVideoElement | HTMLAudioElement;
    mediaEl.preload = 'metadata';
    mediaEl.src = config.src;
    // Don't append - just preload metadata in memory
    mediaEl.load();
  }

  private loadMediaElement(element: HTMLElement, config: ProgressiveMediaConfig): void {
    const mediaEl = document.createElement(config.type) as HTMLVideoElement | HTMLAudioElement;
    mediaEl.className = 'progressive-media__element';
    mediaEl.setAttribute('aria-label', config.ariaLabel);
    mediaEl.controls = true;
    mediaEl.preload = 'auto';
    mediaEl.src = config.src;

    if (config.type === 'video' && config.poster) {
      (mediaEl as HTMLVideoElement).poster = config.poster;
    }

    mediaEl.oncanplay = () => {
      element.classList.add('progressive-media--ready');
      config.onCanPlay?.();
    };

    mediaEl.onerror = () => {
      element.classList.add('progressive-media--error');
      config.onError?.(new Error(`Failed to load media: ${config.src}`));
    };

    // Replace placeholder content
    element.innerHTML = '';
    element.appendChild(mediaEl);

    // Auto-play if the user clicked play
    const playPromise = mediaEl.play();
    if (playPromise && typeof playPromise.catch === 'function') {
      playPromise.catch(() => {
        // Auto-play might be blocked - that's fine
      });
    }
  }
}

/**
 * Inject progressive loading CSS styles.
 */
export function injectProgressiveLoadingStyles(): void {
  if (document.getElementById('progressive-loading-styles')) return;

  const style = document.createElement('style');
  style.id = 'progressive-loading-styles';
  style.textContent = `
    .progressive-image {
      background-color: var(--progressive-bg, #f1f5f9);
    }

    .progressive-image--loaded .progressive-image__placeholder {
      opacity: 0;
    }

    .progressive-media {
      position: relative;
      background-color: var(--progressive-bg, #0f172a);
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .progressive-media__play-btn {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: rgba(0, 0, 0, 0.6);
      border: none;
      border-radius: 50%;
      width: 64px;
      height: 64px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      cursor: pointer;
      transition: background 0.2s ease, transform 0.2s ease;
    }

    .progressive-media__play-btn:hover {
      background: rgba(0, 0, 0, 0.8);
      transform: translate(-50%, -50%) scale(1.1);
    }

    .progressive-media__play-btn:focus-visible {
      outline: 2px solid var(--focus-ring, #3b82f6);
      outline-offset: 2px;
    }

    .progressive-media__element {
      width: 100%;
      height: 100%;
    }

    @media (prefers-reduced-motion: reduce) {
      .progressive-image__placeholder,
      .progressive-image__full {
        transition: none !important;
      }

      .progressive-media__play-btn {
        transition: none !important;
      }
    }
  `;
  document.head.appendChild(style);
}
