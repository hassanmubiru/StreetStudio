/**
 * Unit Tests: Progressive Loading
 * 
 * Tests for progressive image loading, media lazy loading,
 * IntersectionObserver integration, and WebP detection.
 * 
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  ProgressiveImageLoader,
  ProgressiveMediaLoader,
  injectProgressiveLoadingStyles,
} from './progressive-loading.js';

describe('Progressive Loading', () => {
  let mockIntersectionObserver: any;
  let intersectionCallbacks: Array<(entries: any[]) => void>;

  beforeEach(() => {
    document.body.innerHTML = '';
    document.head.innerHTML = '';
    intersectionCallbacks = [];

    // Mock IntersectionObserver
    mockIntersectionObserver = vi.fn().mockImplementation((callback) => {
      intersectionCallbacks.push(callback);
      return {
        observe: vi.fn(),
        unobserve: vi.fn(),
        disconnect: vi.fn(),
      };
    });
    vi.stubGlobal('IntersectionObserver', mockIntersectionObserver);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('ProgressiveImageLoader', () => {
    it('should create an image wrapper with correct structure', () => {
      const loader = new ProgressiveImageLoader();
      const el = loader.createImage({
        src: '/images/photo.jpg',
        alt: 'A photo',
      });

      expect(el.className).toContain('progressive-image');
      expect(el.querySelector('.progressive-image__full')).not.toBeNull();
    });

    it('should include placeholder when provided', () => {
      const loader = new ProgressiveImageLoader();
      const el = loader.createImage({
        src: '/images/photo.jpg',
        alt: 'A photo',
        placeholder: 'data:image/jpeg;base64,/9j/placeholder',
      });

      const placeholder = el.querySelector('.progressive-image__placeholder') as HTMLImageElement;
      expect(placeholder).not.toBeNull();
      expect(placeholder.src).toContain('data:image/jpeg');
      expect(placeholder.getAttribute('aria-hidden')).toBe('true');
    });

    it('should set alt text on full image', () => {
      const loader = new ProgressiveImageLoader();
      const el = loader.createImage({
        src: '/images/photo.jpg',
        alt: 'Descriptive alt text',
      });

      const fullImg = el.querySelector('.progressive-image__full') as HTMLImageElement;
      expect(fullImg.alt).toBe('Descriptive alt text');
    });

    it('should set loading="lazy" on full image', () => {
      const loader = new ProgressiveImageLoader();
      const el = loader.createImage({
        src: '/images/photo.jpg',
        alt: 'A photo',
      });

      const fullImg = el.querySelector('.progressive-image__full') as HTMLImageElement;
      expect(fullImg.getAttribute('loading')).toBe('lazy');
    });

    it('should observe the created element', () => {
      const loader = new ProgressiveImageLoader();
      loader.createImage({
        src: '/images/photo.jpg',
        alt: 'A photo',
      });

      const observer = mockIntersectionObserver.mock.results[0]?.value;
      expect(observer.observe).toHaveBeenCalled();
    });

    it('should load image when element becomes visible', () => {
      const loader = new ProgressiveImageLoader();
      const onLoad = vi.fn();
      const el = loader.createImage({
        src: '/images/photo.jpg',
        alt: 'A photo',
        onLoad,
      });

      // Simulate intersection
      const callback = intersectionCallbacks[0];
      callback([{ isIntersecting: true, target: el }]);

      // Check that src was set on the full image
      const fullImg = el.querySelector('.progressive-image__full') as HTMLImageElement;
      expect(fullImg.src).toContain('/images/photo.jpg');
    });

    it('should not load image when element is not visible', () => {
      const loader = new ProgressiveImageLoader();
      const el = loader.createImage({
        src: '/images/photo.jpg',
        alt: 'A photo',
      });

      // Simulate non-intersection
      const callback = intersectionCallbacks[0];
      callback([{ isIntersecting: false, target: el }]);

      // Check that src was NOT set
      const fullImg = el.querySelector('.progressive-image__full') as HTMLImageElement;
      expect(fullImg.src).toBe('');
    });

    it('should call onLoad callback when image loads', () => {
      const loader = new ProgressiveImageLoader();
      const onLoad = vi.fn();
      const el = loader.createImage({
        src: '/images/photo.jpg',
        alt: 'A photo',
        onLoad,
      });

      // Simulate intersection
      const callback = intersectionCallbacks[0];
      callback([{ isIntersecting: true, target: el }]);

      // Simulate image load event
      const fullImg = el.querySelector('.progressive-image__full') as HTMLImageElement;
      fullImg.onload?.(new Event('load') as any);

      expect(onLoad).toHaveBeenCalled();
      expect(el.classList.contains('progressive-image--loaded')).toBe(true);
    });

    it('should call onError callback when image fails to load', () => {
      const loader = new ProgressiveImageLoader();
      const onError = vi.fn();
      const el = loader.createImage({
        src: '/images/missing.jpg',
        alt: 'A photo',
        onError,
      });

      // Simulate intersection
      const callback = intersectionCallbacks[0];
      callback([{ isIntersecting: true, target: el }]);

      // Simulate image error event
      const fullImg = el.querySelector('.progressive-image__full') as HTMLImageElement;
      fullImg.onerror?.(new Event('error') as any);

      expect(onError).toHaveBeenCalled();
      expect(el.classList.contains('progressive-image--error')).toBe(true);
    });

    it('should apply custom class name', () => {
      const loader = new ProgressiveImageLoader();
      const el = loader.createImage({
        src: '/images/photo.jpg',
        alt: 'A photo',
        className: 'hero-image',
      });

      expect(el.className).toContain('hero-image');
    });

    it('should track observed element count', () => {
      const loader = new ProgressiveImageLoader();

      expect(loader.getObservedCount()).toBe(0);

      loader.createImage({ src: '/img1.jpg', alt: 'Image 1' });
      expect(loader.getObservedCount()).toBe(1);

      loader.createImage({ src: '/img2.jpg', alt: 'Image 2' });
      expect(loader.getObservedCount()).toBe(2);
    });

    it('should clean up on destroy', () => {
      const loader = new ProgressiveImageLoader();
      loader.createImage({ src: '/img.jpg', alt: 'Image' });

      loader.destroy();

      expect(loader.getObservedCount()).toBe(0);
      const observer = mockIntersectionObserver.mock.results[0]?.value;
      expect(observer.disconnect).toHaveBeenCalled();
    });

    it('should manually load image via loadImage', () => {
      const loader = new ProgressiveImageLoader();
      const el = loader.createImage({
        src: '/images/photo.jpg',
        alt: 'A photo',
      });

      loader.loadImage(el);

      const fullImg = el.querySelector('.progressive-image__full') as HTMLImageElement;
      expect(fullImg.src).toContain('/images/photo.jpg');
    });

    it('should set srcSet and sizes when provided', () => {
      const loader = new ProgressiveImageLoader();
      const el = loader.createImage({
        src: '/images/photo.jpg',
        alt: 'A photo',
        srcSet: '/images/photo-320.jpg 320w, /images/photo-640.jpg 640w',
        sizes: '(max-width: 640px) 320px, 640px',
      });

      // Trigger load
      const callback = intersectionCallbacks[0];
      callback([{ isIntersecting: true, target: el }]);

      const fullImg = el.querySelector('.progressive-image__full') as HTMLImageElement;
      expect(fullImg.srcset).toBe('/images/photo-320.jpg 320w, /images/photo-640.jpg 640w');
      expect(fullImg.sizes).toBe('(max-width: 640px) 320px, 640px');
    });
  });

  describe('ProgressiveMediaLoader', () => {
    it('should create a video wrapper with poster and play button', () => {
      const loader = new ProgressiveMediaLoader();
      const el = loader.createMedia({
        src: '/videos/demo.mp4',
        type: 'video',
        poster: '/images/poster.jpg',
        ariaLabel: 'Demo video',
      });

      expect(el.className).toContain('progressive-media');
      expect(el.querySelector('.progressive-media__poster')).not.toBeNull();
      expect(el.querySelector('.progressive-media__play-btn')).not.toBeNull();
    });

    it('should set aria-label on wrapper', () => {
      const loader = new ProgressiveMediaLoader();
      const el = loader.createMedia({
        src: '/videos/demo.mp4',
        type: 'video',
        ariaLabel: 'Demo video about coding',
      });

      expect(el.getAttribute('aria-label')).toBe('Demo video about coding');
    });

    it('should have accessible play button', () => {
      const loader = new ProgressiveMediaLoader();
      const el = loader.createMedia({
        src: '/videos/demo.mp4',
        type: 'video',
        ariaLabel: 'Demo video',
      });

      const playBtn = el.querySelector('.progressive-media__play-btn') as HTMLButtonElement;
      expect(playBtn.getAttribute('aria-label')).toBe('Play video');
    });

    it('should load video element when play button is clicked', () => {
      const loader = new ProgressiveMediaLoader();
      const el = loader.createMedia({
        src: '/videos/demo.mp4',
        type: 'video',
        poster: '/images/poster.jpg',
        ariaLabel: 'Demo video',
      });

      document.body.appendChild(el);

      const playBtn = el.querySelector('.progressive-media__play-btn') as HTMLButtonElement;
      playBtn.click();

      const video = el.querySelector('video');
      expect(video).not.toBeNull();
      expect(video?.src).toContain('/videos/demo.mp4');
      expect(video?.controls).toBe(true);
    });

    it('should observe media element for metadata preloading', () => {
      const loader = new ProgressiveMediaLoader();
      loader.createMedia({
        src: '/videos/demo.mp4',
        type: 'video',
        ariaLabel: 'Demo video',
        preloadMetadata: true,
      });

      const observer = mockIntersectionObserver.mock.results[0]?.value;
      expect(observer.observe).toHaveBeenCalled();
    });

    it('should not observe if preloadMetadata is false', () => {
      const loader = new ProgressiveMediaLoader();
      loader.createMedia({
        src: '/videos/demo.mp4',
        type: 'video',
        ariaLabel: 'Demo video',
        preloadMetadata: false,
      });

      const observer = mockIntersectionObserver.mock.results[0]?.value;
      expect(observer.observe).not.toHaveBeenCalled();
    });

    it('should track observed element count', () => {
      const loader = new ProgressiveMediaLoader();

      expect(loader.getObservedCount()).toBe(0);

      loader.createMedia({
        src: '/v1.mp4',
        type: 'video',
        ariaLabel: 'Video 1',
        preloadMetadata: true,
      });
      expect(loader.getObservedCount()).toBe(1);
    });

    it('should clean up on destroy', () => {
      const loader = new ProgressiveMediaLoader();
      loader.createMedia({
        src: '/v1.mp4',
        type: 'video',
        ariaLabel: 'Video 1',
        preloadMetadata: true,
      });

      loader.destroy();

      expect(loader.getObservedCount()).toBe(0);
      const observer = mockIntersectionObserver.mock.results[0]?.value;
      expect(observer.disconnect).toHaveBeenCalled();
    });

    it('should not show play button for audio type', () => {
      const loader = new ProgressiveMediaLoader();
      const el = loader.createMedia({
        src: '/audio/track.mp3',
        type: 'audio',
        ariaLabel: 'Audio track',
      });

      expect(el.querySelector('.progressive-media__play-btn')).toBeNull();
    });
  });

  describe('injectProgressiveLoadingStyles', () => {
    it('should inject styles into document head', () => {
      injectProgressiveLoadingStyles();
      expect(document.getElementById('progressive-loading-styles')).not.toBeNull();
    });

    it('should not inject duplicate styles', () => {
      injectProgressiveLoadingStyles();
      injectProgressiveLoadingStyles();

      const styles = document.querySelectorAll('#progressive-loading-styles');
      expect(styles.length).toBe(1);
    });

    it('should include reduced-motion media query', () => {
      injectProgressiveLoadingStyles();
      const style = document.getElementById('progressive-loading-styles') as HTMLStyleElement;

      expect(style.textContent).toContain('prefers-reduced-motion');
    });

    it('should include focus-visible styles', () => {
      injectProgressiveLoadingStyles();
      const style = document.getElementById('progressive-loading-styles') as HTMLStyleElement;

      expect(style.textContent).toContain('focus-visible');
    });
  });
});
