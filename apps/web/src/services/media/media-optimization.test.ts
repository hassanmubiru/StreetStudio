/**
 * Media Optimization Tests
 *
 * Unit tests for adaptive bitrate streaming, progressive image loading,
 * memory management, and upload optimization services.
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AdaptiveBitrateManager } from './adaptive-streaming.js';
import { ProgressiveImageLoader } from './progressive-image.js';
import { VideoSessionMemoryManager } from './memory-management.js';
import { UploadOptimizer } from './upload-optimization.js';
import type { NetworkConditions, BufferState } from './adaptive-streaming.js';

// --- Adaptive Bitrate Streaming Tests ---

describe('AdaptiveBitrateManager', () => {
  let abr: AdaptiveBitrateManager;

  beforeEach(() => {
    abr = new AdaptiveBitrateManager();
  });

  it('starts with the lowest available quality level', () => {
    expect(abr.getCurrentLevel()).toBe('240p');
  });

  it('returns available quality levels within bounds', () => {
    const levels = abr.getAvailableLevels();
    expect(levels.length).toBe(6);
    expect(levels[0].level).toBe('2160p');
    expect(levels[5].level).toBe('240p');
  });

  it('respects configured max/min quality bounds', () => {
    const bounded = new AdaptiveBitrateManager({ maxQuality: '1080p', minQuality: '360p' });
    const levels = bounded.getAvailableLevels();
    expect(levels[0].level).toBe('1080p');
    expect(levels[levels.length - 1].level).toBe('360p');
    expect(levels.find((l) => l.level === '2160p')).toBeUndefined();
    expect(levels.find((l) => l.level === '240p')).toBeUndefined();
  });

  it('allows manual quality selection', () => {
    const callback = vi.fn();
    abr.onQualityChange(callback);
    abr.setQualityLevel('720p');
    expect(abr.getCurrentLevel()).toBe('720p');
    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({ newLevel: '720p', reason: 'user' })
    );
  });

  it('ignores manual selection of unavailable levels', () => {
    const bounded = new AdaptiveBitrateManager({ maxQuality: '720p', minQuality: '480p' });
    bounded.setQualityLevel('2160p');
    expect(bounded.getCurrentLevel()).not.toBe('2160p');
  });

  it('selects appropriate quality based on bandwidth', () => {
    const network: NetworkConditions = {
      bandwidth: 6_000_000,
      rtt: 50,
      effectiveType: '4g',
      saveData: false,
    };
    const buffer: BufferState = {
      bufferedAhead: 15,
      isRebuffering: false,
      duration: 120,
      currentTime: 10,
    };

    // Record bandwidth samples to build history
    for (let i = 0; i < 5; i++) {
      abr.recordBandwidthSample(6_000_000);
    }

    const level = abr.selectQuality(network, buffer);
    // 6Mbps * 0.7 safety = 4.2Mbps → should select 720p (2.5Mbps) since buffer is good enough for upgrade
    expect(['1080p', '720p']).toContain(level);
  });

  it('downgrades quality when buffer is critical', () => {
    abr.setQualityLevel('1080p');
    const network: NetworkConditions = {
      bandwidth: 10_000_000,
      rtt: 50,
      effectiveType: '4g',
      saveData: false,
    };
    const buffer: BufferState = {
      bufferedAhead: 1,
      isRebuffering: false,
      duration: 120,
      currentTime: 10,
    };

    // Need to wait past min switch interval
    abr['lastSwitchTime'] = 0;

    const level = abr.selectQuality(network, buffer);
    expect(level).not.toBe('2160p');
  });

  it('immediately downgrades when rebuffering', () => {
    abr.setQualityLevel('1080p');
    abr['lastSwitchTime'] = 0;

    const network: NetworkConditions = {
      bandwidth: 10_000_000,
      rtt: 50,
      effectiveType: '4g',
      saveData: false,
    };
    const buffer: BufferState = {
      bufferedAhead: 5,
      isRebuffering: true,
      duration: 120,
      currentTime: 10,
    };

    const level = abr.selectQuality(network, buffer);
    expect(level).toBe('720p');
  });

  it('returns lowest quality when save-data is enabled', () => {
    const network: NetworkConditions = {
      bandwidth: 50_000_000,
      rtt: 10,
      effectiveType: '4g',
      saveData: true,
    };
    const buffer: BufferState = {
      bufferedAhead: 30,
      isRebuffering: false,
      duration: 120,
      currentTime: 10,
    };

    const level = abr.selectQuality(network, buffer);
    expect(level).toBe('240p');
  });

  it('respects minimum switch interval', () => {
    abr.setQualityLevel('720p');
    // lastSwitchTime was just set

    const network: NetworkConditions = {
      bandwidth: 50_000_000,
      rtt: 10,
      effectiveType: '4g',
      saveData: false,
    };
    const buffer: BufferState = {
      bufferedAhead: 30,
      isRebuffering: false,
      duration: 120,
      currentTime: 10,
    };

    const level = abr.selectQuality(network, buffer);
    // Should not change because switch interval hasn't passed
    expect(level).toBe('720p');
  });

  it('calculates smoothed bandwidth with EWMA', () => {
    abr.recordBandwidthSample(5_000_000);
    abr.recordBandwidthSample(10_000_000);
    abr.recordBandwidthSample(8_000_000);

    const smoothed = abr.getSmoothedBandwidth();
    expect(smoothed).toBeGreaterThan(0);
    expect(smoothed).toBeLessThan(10_000_000);
  });

  it('returns 0 smoothed bandwidth with no samples', () => {
    expect(abr.getSmoothedBandwidth()).toBe(0);
  });

  it('returns the single sample when only one exists', () => {
    abr.recordBandwidthSample(5_000_000);
    expect(abr.getSmoothedBandwidth()).toBe(5_000_000);
  });

  it('provides quality info for a level', () => {
    const info = abr.getQualityInfo('1080p');
    expect(info).toBeDefined();
    expect(info!.width).toBe(1920);
    expect(info!.height).toBe(1080);
    expect(info!.bitrate).toBe(5_000_000);
  });

  it('resets state correctly', () => {
    abr.setQualityLevel('1080p');
    abr.recordBandwidthSample(10_000_000);
    abr.reset();
    expect(abr.getCurrentLevel()).toBe('240p');
    expect(abr.getSmoothedBandwidth()).toBe(0);
  });

  it('unsubscribes quality change listener', () => {
    const callback = vi.fn();
    const unsub = abr.onQualityChange(callback);
    abr.setQualityLevel('720p');
    expect(callback).toHaveBeenCalledTimes(1);
    unsub();
    abr.setQualityLevel('480p');
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('updates config at runtime', () => {
    abr.updateConfig({ maxQuality: '720p' });
    const levels = abr.getAvailableLevels();
    expect(levels[0].level).toBe('720p');
  });
});

// --- Progressive Image Loading Tests ---

describe('ProgressiveImageLoader', () => {
  let loader: ProgressiveImageLoader;

  beforeEach(() => {
    loader = new ProgressiveImageLoader();
  });

  afterEach(() => {
    loader.destroy();
  });

  it('returns src when WebP is not supported', () => {
    loader.setWebPSupport(false);
    const result = loader.getBestSource({
      src: '/image.jpg',
      webpSrc: '/image.webp',
      alt: 'test',
    });
    expect(result).toBe('/image.jpg');
  });

  it('returns webpSrc when WebP is supported', () => {
    loader.setWebPSupport(true);
    const result = loader.getBestSource({
      src: '/image.jpg',
      webpSrc: '/image.webp',
      alt: 'test',
    });
    expect(result).toBe('/image.webp');
  });

  it('falls back to src when webpSrc is not provided', () => {
    loader.setWebPSupport(true);
    const result = loader.getBestSource({ src: '/image.jpg', alt: 'test' });
    expect(result).toBe('/image.jpg');
  });

  it('detects image formats from URL', () => {
    expect(loader.detectFormat('/path/image.webp')).toBe('webp');
    expect(loader.detectFormat('/path/photo.jpg')).toBe('jpeg');
    expect(loader.detectFormat('/path/photo.jpeg')).toBe('jpeg');
    expect(loader.detectFormat('/path/icon.png')).toBe('png');
    expect(loader.detectFormat('/path/anim.gif')).toBe('gif');
    expect(loader.detectFormat('/path/modern.avif')).toBe('avif');
    expect(loader.detectFormat('/path/file.bin')).toBe('unknown');
  });

  it('detects format from query params', () => {
    expect(loader.detectFormat('/api/image?format=webp&w=800')).toBe('webp');
  });

  it('generates placeholder style', () => {
    const style = loader.generatePlaceholderStyle(1920, 1080);
    expect(style).toContain('background-color');
    expect(style).toContain('aspect-ratio: 1920 / 1080');
  });

  it('generates placeholder style with custom color', () => {
    const style = loader.generatePlaceholderStyle(800, 600, '#ff0000');
    expect(style).toContain('#ff0000');
  });

  it('generates responsive srcset', () => {
    loader.setWebPSupport(false);
    const srcset = loader.generateSrcSet({
      breakpoints: [320, 640, 1024],
      urlPattern: '/img/photo?w={width}',
      preferWebP: true,
    });
    expect(srcset).toContain('/img/photo?w=320 320w');
    expect(srcset).toContain('/img/photo?w=640 640w');
    expect(srcset).toContain('/img/photo?w=1024 1024w');
  });

  it('generates srcset with WebP extension when supported', () => {
    loader.setWebPSupport(true);
    const srcset = loader.generateSrcSet({
      breakpoints: [320],
      urlPattern: '/img/photo?w={width}',
      preferWebP: true,
    });
    expect(srcset).toContain('.webp');
  });

  it('generates sizes attribute', () => {
    const sizes = loader.generateSizes(
      [
        { maxWidth: 768, size: '100vw' },
        { maxWidth: 1024, size: '50vw' },
      ],
      '33vw'
    );
    expect(sizes).toBe('(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 33vw');
  });

  it('tracks loaded images', () => {
    expect(loader.isLoaded('/test.jpg')).toBe(false);
    loader['loadedImages'].add('/test.jpg');
    expect(loader.isLoaded('/test.jpg')).toBe(true);
  });

  it('reports pending count', () => {
    expect(loader.getPendingCount()).toBe(0);
  });

  it('subscribes and unsubscribes load callbacks', () => {
    const callback = vi.fn();
    const unsub = loader.onLoad(callback);
    loader['onImageLoaded']('/test.jpg', Date.now() - 100);
    expect(callback).toHaveBeenCalledTimes(1);
    unsub();
    loader['onImageLoaded']('/test2.jpg', Date.now() - 50);
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('returns null for WebP support before detection', () => {
    expect(loader.getWebPSupport()).toBeNull();
  });

  it('destroy clears all state', () => {
    loader['loadedImages'].add('/test.jpg');
    loader.destroy();
    expect(loader.isLoaded('/test.jpg')).toBe(false);
    expect(loader.getPendingCount()).toBe(0);
  });
});

// --- Memory Management Tests ---

describe('VideoSessionMemoryManager', () => {
  let mgr: VideoSessionMemoryManager;

  beforeEach(() => {
    mgr = new VideoSessionMemoryManager({ checkInterval: 60000, maxIdleTime: 1000 });
  });

  afterEach(() => {
    mgr.destroy();
  });

  it('registers and releases resources', () => {
    const cleanup = vi.fn();
    mgr.registerResource('buf-1', 'video-buffer', 1024 * 1024, cleanup);
    expect(mgr.getResourceCount()).toBe(1);

    mgr.releaseResource('buf-1');
    expect(cleanup).toHaveBeenCalled();
    expect(mgr.getResourceCount()).toBe(0);
  });

  it('returns false when releasing non-existent resource', () => {
    expect(mgr.releaseResource('nonexistent')).toBe(false);
  });

  it('tracks resource counts by type', () => {
    mgr.registerResource('buf-1', 'video-buffer', 1000, vi.fn());
    mgr.registerResource('buf-2', 'video-buffer', 2000, vi.fn());
    mgr.registerResource('img-1', 'image-bitmap', 500, vi.fn());

    const counts = mgr.getResourceCounts();
    expect(counts['video-buffer']).toBe(2);
    expect(counts['image-bitmap']).toBe(1);
    expect(counts['canvas']).toBe(0);
  });

  it('calculates total tracked memory', () => {
    mgr.registerResource('buf-1', 'video-buffer', 1000, vi.fn());
    mgr.registerResource('buf-2', 'video-buffer', 2000, vi.fn());
    expect(mgr.getTrackedMemory()).toBe(3000);
  });

  it('releases all resources', () => {
    const c1 = vi.fn();
    const c2 = vi.fn();
    mgr.registerResource('buf-1', 'video-buffer', 1000, c1);
    mgr.registerResource('img-1', 'image-bitmap', 500, c2);

    const freed = mgr.releaseAll();
    expect(freed).toBe(1500);
    expect(c1).toHaveBeenCalled();
    expect(c2).toHaveBeenCalled();
    expect(mgr.getResourceCount()).toBe(0);
  });

  it('releases resources by type', () => {
    mgr.registerResource('buf-1', 'video-buffer', 1000, vi.fn());
    mgr.registerResource('buf-2', 'video-buffer', 2000, vi.fn());
    mgr.registerResource('img-1', 'image-bitmap', 500, vi.fn());

    const freed = mgr.releaseResourcesByType('video-buffer');
    expect(freed).toBe(3000);
    expect(mgr.getResourceCount()).toBe(1);
  });

  it('releases idle resources based on maxIdleTime', async () => {
    const cleanup = vi.fn();
    mgr.registerResource('old-buf', 'video-buffer', 1000, cleanup);

    // Simulate time passing
    const resource = mgr['resources'].get('old-buf')!;
    resource.lastAccessedAt = Date.now() - 2000; // 2s ago, exceeds 1s idle time

    const freed = mgr.releaseIdleResources();
    expect(freed).toBe(1000);
    expect(cleanup).toHaveBeenCalled();
  });

  it('preserves recently-accessed resources during idle cleanup', () => {
    const cleanup = vi.fn();
    mgr.registerResource('active-buf', 'video-buffer', 1000, cleanup);
    mgr.touchResource('active-buf');

    const freed = mgr.releaseIdleResources();
    expect(freed).toBe(0);
    expect(cleanup).not.toHaveBeenCalled();
  });

  it('enforces maxVideoBuffers limit', () => {
    const manager = new VideoSessionMemoryManager({ maxVideoBuffers: 2, checkInterval: 60000, maxIdleTime: 300000 });
    manager.registerResource('buf-1', 'video-buffer', 1000, vi.fn());
    manager.registerResource('buf-2', 'video-buffer', 1000, vi.fn());
    manager.registerResource('buf-3', 'video-buffer', 1000, vi.fn());

    // Should have evicted the oldest
    expect(manager.getResourceCounts()['video-buffer']).toBe(2);
    manager.destroy();
  });

  it('tracks total freed bytes', () => {
    mgr.registerResource('buf-1', 'video-buffer', 500, vi.fn());
    mgr.registerResource('buf-2', 'video-buffer', 300, vi.fn());
    mgr.releaseResource('buf-1');
    mgr.releaseResource('buf-2');
    expect(mgr.getTotalFreedBytes()).toBe(800);
  });

  it('fires memory pressure callbacks', () => {
    const callback = vi.fn();
    mgr.onMemoryPressure(callback);

    // Mock the memory API to return high usage
    Object.defineProperty(performance, 'memory', {
      value: {
        usedJSHeapSize: 900 * 1024 * 1024,
        totalJSHeapSize: 1000 * 1024 * 1024,
        jsHeapSizeLimit: 1000 * 1024 * 1024,
      },
      configurable: true,
    });

    mgr.registerResource('buf-1', 'video-buffer', 5000, vi.fn());
    mgr.performMemoryCheck();

    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({ level: 'critical' })
    );
  });

  it('unsubscribes memory pressure callback', () => {
    const callback = vi.fn();
    const unsub = mgr.onMemoryPressure(callback);
    unsub();

    Object.defineProperty(performance, 'memory', {
      value: {
        usedJSHeapSize: 900 * 1024 * 1024,
        totalJSHeapSize: 1000 * 1024 * 1024,
        jsHeapSizeLimit: 1000 * 1024 * 1024,
      },
      configurable: true,
    });

    mgr.performMemoryCheck();
    expect(callback).not.toHaveBeenCalled();
  });

  it('returns null snapshot when memory API unavailable', () => {
    Object.defineProperty(performance, 'memory', {
      value: undefined,
      configurable: true,
    });
    expect(mgr.getMemorySnapshot()).toBeNull();
  });

  it('returns memory trend from snapshots', () => {
    // Add some snapshots manually
    mgr['memorySnapshots'] = [
      { usedHeap: 100, totalHeap: 200, heapLimit: 1000, usageRatio: 0.1, timestamp: 1 },
      { usedHeap: 200, totalHeap: 300, heapLimit: 1000, usageRatio: 0.2, timestamp: 2 },
      { usedHeap: 300, totalHeap: 400, heapLimit: 1000, usageRatio: 0.3, timestamp: 3 },
    ];
    const trend = mgr.getMemoryTrend();
    expect(trend).toBeCloseTo(0.1);
  });

  it('returns 0 trend with insufficient snapshots', () => {
    expect(mgr.getMemoryTrend()).toBe(0);
  });

  it('destroy stops monitoring and releases all resources', () => {
    const cleanup = vi.fn();
    mgr.registerResource('buf-1', 'video-buffer', 1000, cleanup);
    mgr.startMonitoring();
    mgr.destroy();

    expect(cleanup).toHaveBeenCalled();
    expect(mgr.getResourceCount()).toBe(0);
  });
});

// --- Upload Optimization Tests ---

describe('UploadOptimizer', () => {
  let optimizer: UploadOptimizer;

  beforeEach(() => {
    optimizer = new UploadOptimizer({ webpEncodingSupported: false });
  });

  function createMockFile(name: string, type: string, size: number): File {
    const content = new ArrayBuffer(size);
    return new File([content], name, { type });
  }

  it('detects image content type', () => {
    const file = createMockFile('photo.jpg', 'image/jpeg', 1000);
    expect(optimizer.detectContentType(file)).toBe('image');
  });

  it('detects video content type', () => {
    const file = createMockFile('video.mp4', 'video/mp4', 1000);
    expect(optimizer.detectContentType(file)).toBe('video');
  });

  it('detects audio content type', () => {
    const file = createMockFile('audio.mp3', 'audio/mpeg', 1000);
    expect(optimizer.detectContentType(file)).toBe('audio');
  });

  it('returns unknown for unrecognized types', () => {
    const file = createMockFile('data.bin', 'application/octet-stream', 1000);
    expect(optimizer.detectContentType(file)).toBe('unknown');
  });

  it('detects format from MIME type', () => {
    expect(optimizer.detectFormat(createMockFile('f.jpg', 'image/jpeg', 1))).toBe('jpeg');
    expect(optimizer.detectFormat(createMockFile('f.png', 'image/png', 1))).toBe('png');
    expect(optimizer.detectFormat(createMockFile('f.webp', 'image/webp', 1))).toBe('webp');
    expect(optimizer.detectFormat(createMockFile('f.mp4', 'video/mp4', 1))).toBe('mp4');
  });

  it('falls back to file extension for format detection', () => {
    const file = createMockFile('video.mkv', '', 1000);
    expect(optimizer.detectFormat(file)).toBe('mkv');
  });

  it('analyzes content and recommends compression for large images', () => {
    const file = createMockFile('big.jpg', 'image/jpeg', 5 * 1024 * 1024);
    const analysis = optimizer.analyzeContent(file);

    expect(analysis.type).toBe('image');
    expect(analysis.format).toBe('jpeg');
    expect(analysis.compressionRecommended).toBe(true);
    expect(analysis.estimatedSavings).toBeGreaterThan(0);
    expect(analysis.estimatedOptimizedSize).toBeLessThan(file.size);
  });

  it('does not recommend compression for small images', () => {
    const file = createMockFile('small.jpg', 'image/jpeg', 100_000);
    const analysis = optimizer.analyzeContent(file);
    expect(analysis.compressionRecommended).toBe(false);
    expect(analysis.estimatedSavings).toBe(0);
  });

  it('recommends compression for large PNGs even below threshold', () => {
    const file = createMockFile('icon.png', 'image/png', 600_000);
    const analysis = optimizer.analyzeContent(file);
    expect(analysis.compressionRecommended).toBe(true);
    expect(analysis.estimatedSavings).toBe(50);
  });

  it('formats file sizes correctly', () => {
    expect(optimizer.formatFileSize(500)).toBe('500 B');
    expect(optimizer.formatFileSize(1536)).toBe('1.5 KB');
    expect(optimizer.formatFileSize(2.5 * 1024 * 1024)).toBe('2.5 MB');
    expect(optimizer.formatFileSize(1.5 * 1024 * 1024 * 1024)).toBe('1.50 GB');
  });

  it('validates files against constraints', () => {
    const file = createMockFile('video.mp4', 'video/mp4', 100 * 1024 * 1024);

    const result = optimizer.validateFile(file, {
      maxSize: 50 * 1024 * 1024,
      allowedTypes: ['video'],
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('exceeds maximum');
  });

  it('validates allowed types', () => {
    const file = createMockFile('doc.pdf', 'application/pdf', 1000);
    const result = optimizer.validateFile(file, { allowedTypes: ['image', 'video'] });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('not allowed');
  });

  it('validates allowed formats', () => {
    const file = createMockFile('old.avi', 'video/x-msvideo', 1000);
    const result = optimizer.validateFile(file, { allowedFormats: ['mp4', 'webm'] });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('not allowed');
  });

  it('passes validation for valid files', () => {
    const file = createMockFile('clip.mp4', 'video/mp4', 10 * 1024 * 1024);
    const result = optimizer.validateFile(file, {
      maxSize: 100 * 1024 * 1024,
      allowedTypes: ['video'],
      allowedFormats: ['mp4', 'webm'],
    });
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('returns no-optimization result for video files', async () => {
    const file = createMockFile('video.mp4', 'video/mp4', 50 * 1024 * 1024);
    const result = await optimizer.optimizeFile(file);
    expect(result.wasOptimized).toBe(false);
    expect(result.blob).toBe(file);
    expect(result.savings).toBe(0);
  });

  it('returns no-optimization result when canvas is not supported', async () => {
    const noCanvasOptimizer = new UploadOptimizer({ webpEncodingSupported: false });
    noCanvasOptimizer['canvasSupported'] = false;

    const file = createMockFile('photo.jpg', 'image/jpeg', 5 * 1024 * 1024);
    const result = await noCanvasOptimizer.compressImage(file);
    expect(result.wasOptimized).toBe(false);
  });

  it('optimizes batch of files', async () => {
    const files = [
      createMockFile('video.mp4', 'video/mp4', 50 * 1024 * 1024),
      createMockFile('audio.mp3', 'audio/mpeg', 5 * 1024 * 1024),
    ];
    const results = await optimizer.optimizeBatch(files);
    expect(results).toHaveLength(2);
    expect(results[0].wasOptimized).toBe(false);
    expect(results[1].wasOptimized).toBe(false);
  });

  it('updates config at runtime', () => {
    optimizer.updateConfig({ defaultImageQuality: 0.5 });
    expect(optimizer['config'].defaultImageQuality).toBe(0.5);
  });
});
