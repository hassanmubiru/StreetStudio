/**
 * Memory Management for Long-Running Video Sessions
 *
 * Provides garbage collection hints, buffer cleanup, and resource release
 * for video playback sessions to prevent memory leaks and OOM issues.
 *
 * Validates: Requirements 12.8, 12.9
 */

export interface MemoryUsageSnapshot {
  /** Used JS heap size in bytes */
  usedHeap: number;
  /** Total JS heap size in bytes */
  totalHeap: number;
  /** JS heap size limit in bytes */
  heapLimit: number;
  /** Usage ratio (0-1) */
  usageRatio: number;
  /** Timestamp of the snapshot */
  timestamp: number;
}

export interface ResourceHandle {
  /** Unique identifier for the resource */
  id: string;
  /** Type of resource */
  type: 'video-buffer' | 'image-bitmap' | 'canvas' | 'audio-buffer' | 'blob-url' | 'worker';
  /** Estimated memory usage in bytes */
  estimatedSize: number;
  /** Creation timestamp */
  createdAt: number;
  /** Last access timestamp */
  lastAccessedAt: number;
  /** Cleanup function to release the resource */
  cleanup: () => void;
}

export interface MemoryManagerConfig {
  /** Heap usage ratio threshold that triggers warnings (0-1). Default: 0.7 */
  warningThreshold: number;
  /** Heap usage ratio threshold that triggers aggressive cleanup (0-1). Default: 0.85 */
  criticalThreshold: number;
  /** Interval between memory checks in ms. Default: 30000 (30s) */
  checkInterval: number;
  /** Maximum time an unused resource can live (ms). Default: 300000 (5min) */
  maxIdleTime: number;
  /** Maximum number of video buffers to retain. Default: 5 */
  maxVideoBuffers: number;
  /** Whether to log warnings to console. Default: true */
  enableLogging: boolean;
}

export interface MemoryPressureEvent {
  level: 'warning' | 'critical';
  usageRatio: number;
  freedBytes: number;
  timestamp: number;
}

export type MemoryPressureCallback = (event: MemoryPressureEvent) => void;

const DEFAULT_CONFIG: MemoryManagerConfig = {
  warningThreshold: 0.7,
  criticalThreshold: 0.85,
  checkInterval: 30000,
  maxIdleTime: 300000,
  maxVideoBuffers: 5,
  enableLogging: true,
};

/**
 * Memory management service for long-running video sessions.
 * Tracks resource allocations, triggers cleanup on memory pressure,
 * and provides garbage collection hints.
 */
export class VideoSessionMemoryManager {
  private config: MemoryManagerConfig;
  private resources: Map<string, ResourceHandle> = new Map();
  private listeners: MemoryPressureCallback[] = [];
  private checkTimerId: ReturnType<typeof setInterval> | null = null;
  private memorySnapshots: MemoryUsageSnapshot[] = [];
  private totalFreedBytes: number = 0;

  constructor(config: Partial<MemoryManagerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Start periodic memory monitoring.
   */
  public startMonitoring(): void {
    if (this.checkTimerId !== null) return;

    this.checkTimerId = setInterval(() => {
      this.performMemoryCheck();
    }, this.config.checkInterval);

    // Initial check
    this.performMemoryCheck();
  }

  /**
   * Stop periodic memory monitoring.
   */
  public stopMonitoring(): void {
    if (this.checkTimerId !== null) {
      clearInterval(this.checkTimerId);
      this.checkTimerId = null;
    }
  }

  /**
   * Register a resource for memory tracking.
   */
  public registerResource(
    id: string,
    type: ResourceHandle['type'],
    estimatedSize: number,
    cleanup: () => void
  ): void {
    const handle: ResourceHandle = {
      id,
      type,
      estimatedSize,
      createdAt: Date.now(),
      lastAccessedAt: Date.now(),
      cleanup,
    };
    this.resources.set(id, handle);

    // Check if we've exceeded limits for this resource type
    this.enforceResourceLimits(type);
  }

  /**
   * Mark a resource as recently accessed (prevents idle eviction).
   */
  public touchResource(id: string): void {
    const resource = this.resources.get(id);
    if (resource) {
      resource.lastAccessedAt = Date.now();
    }
  }

  /**
   * Release a specific resource.
   */
  public releaseResource(id: string): boolean {
    const resource = this.resources.get(id);
    if (!resource) return false;

    resource.cleanup();
    this.totalFreedBytes += resource.estimatedSize;
    this.resources.delete(id);
    return true;
  }

  /**
   * Release all resources of a specific type.
   */
  public releaseResourcesByType(type: ResourceHandle['type']): number {
    let freedBytes = 0;
    const entries = Array.from(this.resources.entries());
    for (const [id, resource] of entries) {
      if (resource.type === type) {
        resource.cleanup();
        freedBytes += resource.estimatedSize;
        this.resources.delete(id);
      }
    }
    this.totalFreedBytes += freedBytes;
    return freedBytes;
  }

  /**
   * Release idle resources that haven't been accessed within maxIdleTime.
   */
  public releaseIdleResources(): number {
    const now = Date.now();
    let freedBytes = 0;

    const entries = Array.from(this.resources.entries());
    for (const [id, resource] of entries) {
      if (now - resource.lastAccessedAt > this.config.maxIdleTime) {
        resource.cleanup();
        freedBytes += resource.estimatedSize;
        this.resources.delete(id);
      }
    }

    this.totalFreedBytes += freedBytes;
    return freedBytes;
  }

  /**
   * Release all tracked resources (full session cleanup).
   */
  public releaseAll(): number {
    let freedBytes = 0;
    const entries = Array.from(this.resources.values());
    for (const resource of entries) {
      resource.cleanup();
      freedBytes += resource.estimatedSize;
    }
    this.resources.clear();
    this.totalFreedBytes += freedBytes;
    return freedBytes;
  }

  /**
   * Get current memory usage snapshot.
   * Returns null if the Performance memory API is not available.
   */
  public getMemorySnapshot(): MemoryUsageSnapshot | null {
    const memory = (performance as any).memory;
    if (!memory) return null;

    const snapshot: MemoryUsageSnapshot = {
      usedHeap: memory.usedJSHeapSize,
      totalHeap: memory.totalJSHeapSize,
      heapLimit: memory.jsHeapSizeLimit,
      usageRatio: memory.usedJSHeapSize / memory.jsHeapSizeLimit,
      timestamp: Date.now(),
    };

    this.memorySnapshots.push(snapshot);
    // Keep last 20 snapshots
    if (this.memorySnapshots.length > 20) {
      this.memorySnapshots.shift();
    }

    return snapshot;
  }

  /**
   * Get memory usage trend over recent snapshots.
   * Returns the average change in usage ratio per snapshot interval.
   */
  public getMemoryTrend(): number {
    if (this.memorySnapshots.length < 2) return 0;

    const recent = this.memorySnapshots.slice(-5);
    let totalDelta = 0;
    for (let i = 1; i < recent.length; i++) {
      totalDelta += recent[i].usageRatio - recent[i - 1].usageRatio;
    }
    return totalDelta / (recent.length - 1);
  }

  /**
   * Get total tracked resource memory (estimated).
   */
  public getTrackedMemory(): number {
    let total = 0;
    const values = Array.from(this.resources.values());
    for (const resource of values) {
      total += resource.estimatedSize;
    }
    return total;
  }

  /**
   * Get resource count by type.
   */
  public getResourceCounts(): Record<ResourceHandle['type'], number> {
    const counts: Record<ResourceHandle['type'], number> = {
      'video-buffer': 0,
      'image-bitmap': 0,
      canvas: 0,
      'audio-buffer': 0,
      'blob-url': 0,
      worker: 0,
    };

    const values = Array.from(this.resources.values());
    for (const resource of values) {
      counts[resource.type]++;
    }
    return counts;
  }

  /**
   * Get total number of tracked resources.
   */
  public getResourceCount(): number {
    return this.resources.size;
  }

  /**
   * Get total freed bytes since creation.
   */
  public getTotalFreedBytes(): number {
    return this.totalFreedBytes;
  }

  /**
   * Get recent memory snapshots.
   */
  public getSnapshots(): MemoryUsageSnapshot[] {
    return [...this.memorySnapshots];
  }

  /**
   * Hint the garbage collector to run (via structured gc if available).
   * This is advisory only and may not have any effect.
   */
  public hintGarbageCollection(): void {
    // Use gc() if exposed (e.g., Node.js with --expose-gc, or some browsers in dev)
    if (typeof globalThis.gc === 'function') {
      globalThis.gc();
    }
  }

  /**
   * Subscribe to memory pressure events.
   */
  public onMemoryPressure(callback: MemoryPressureCallback): () => void {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== callback);
    };
  }

  /**
   * Perform a memory check and trigger cleanup if needed.
   */
  public performMemoryCheck(): void {
    const snapshot = this.getMemorySnapshot();

    // Always clean idle resources
    const idleFreed = this.releaseIdleResources();

    if (!snapshot) {
      // Without memory API, just do idle cleanup
      return;
    }

    let totalFreed = idleFreed;

    if (snapshot.usageRatio >= this.config.criticalThreshold) {
      // Critical: aggressive cleanup
      totalFreed += this.aggressiveCleanup();
      this.notifyListeners({
        level: 'critical',
        usageRatio: snapshot.usageRatio,
        freedBytes: totalFreed,
        timestamp: Date.now(),
      });
    } else if (snapshot.usageRatio >= this.config.warningThreshold) {
      // Warning: release old buffers
      totalFreed += this.moderateCleanup();
      this.notifyListeners({
        level: 'warning',
        usageRatio: snapshot.usageRatio,
        freedBytes: totalFreed,
        timestamp: Date.now(),
      });
    }

    if (totalFreed > 0) {
      this.hintGarbageCollection();
    }
  }

  /**
   * Update configuration at runtime.
   */
  public updateConfig(config: Partial<MemoryManagerConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Full cleanup: stop monitoring, release all resources, clear state.
   */
  public destroy(): void {
    this.stopMonitoring();
    this.releaseAll();
    this.memorySnapshots = [];
    this.listeners = [];
  }

  // --- Private methods ---

  private enforceResourceLimits(type: ResourceHandle['type']): void {
    if (type !== 'video-buffer') return;

    const buffers = [...this.resources.entries()]
      .filter(([, r]) => r.type === 'video-buffer')
      .sort(([, a], [, b]) => a.lastAccessedAt - b.lastAccessedAt);

    while (buffers.length > this.config.maxVideoBuffers) {
      const [id, resource] = buffers.shift()!;
      resource.cleanup();
      this.totalFreedBytes += resource.estimatedSize;
      this.resources.delete(id);
    }
  }

  private moderateCleanup(): number {
    // Release oldest half of video buffers
    const buffers = [...this.resources.entries()]
      .filter(([, r]) => r.type === 'video-buffer')
      .sort(([, a], [, b]) => a.lastAccessedAt - b.lastAccessedAt);

    const toRelease = Math.ceil(buffers.length / 2);
    let freed = 0;

    for (let i = 0; i < toRelease && i < buffers.length; i++) {
      const [id, resource] = buffers[i];
      resource.cleanup();
      freed += resource.estimatedSize;
      this.resources.delete(id);
    }

    this.totalFreedBytes += freed;
    return freed;
  }

  private aggressiveCleanup(): number {
    let freed = 0;

    // Release all video buffers except the most recently accessed
    freed += this.releaseResourcesByType('video-buffer');

    // Release all image bitmaps
    freed += this.releaseResourcesByType('image-bitmap');

    // Release canvases
    freed += this.releaseResourcesByType('canvas');

    return freed;
  }

  private notifyListeners(event: MemoryPressureEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }
}

/** Singleton memory manager for video sessions. */
export const videoSessionMemory = new VideoSessionMemoryManager();
