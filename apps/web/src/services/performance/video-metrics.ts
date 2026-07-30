/**
 * Custom Performance Metrics for Video Operations
 *
 * Tracks video-specific performance metrics including load time,
 * playback start time, editor operation latency, and upload throughput.
 *
 * Validates: Requirements 12.7
 */

export interface VideoMetricEntry {
  name: string;
  value: number;
  unit: 'ms' | 'bytes' | 'fps' | 'ratio';
  timestamp: number;
  metadata?: Record<string, unknown>;
}

export type VideoMetricCallback = (entry: VideoMetricEntry) => void;

/**
 * Tracks video loading and playback performance.
 * Uses the Performance API mark/measure pattern for precision timing.
 */
export class VideoPerformanceTracker {
  private callbacks: VideoMetricCallback[] = [];
  private activeMarks = new Map<string, number>();

  /**
   * Subscribe to metric reports.
   */
  public onMetric(callback: VideoMetricCallback): () => void {
    this.callbacks.push(callback);
    return () => {
      this.callbacks = this.callbacks.filter((cb) => cb !== callback);
    };
  }

  /**
   * Mark the start of a video load operation.
   * Call `endVideoLoad` when the video has enough data to play.
   */
  public startVideoLoad(videoId: string): void {
    const key = `video-load:${videoId}`;
    this.activeMarks.set(key, performance.now());
  }

  /**
   * Complete the video load measurement and report the metric.
   */
  public endVideoLoad(videoId: string, metadata?: Record<string, unknown>): number {
    const key = `video-load:${videoId}`;
    const start = this.activeMarks.get(key);
    if (start === undefined) return -1;

    const duration = performance.now() - start;
    this.activeMarks.delete(key);

    this.emit({
      name: 'video.load_time',
      value: duration,
      unit: 'ms',
      timestamp: Date.now(),
      metadata: { videoId, ...metadata },
    });

    return duration;
  }

  /**
   * Mark the start of playback initiation (user clicks play).
   * Call `endPlaybackStart` when the first frame renders.
   */
  public startPlaybackStart(videoId: string): void {
    const key = `playback-start:${videoId}`;
    this.activeMarks.set(key, performance.now());
  }

  /**
   * Complete the playback start measurement.
   */
  public endPlaybackStart(videoId: string, metadata?: Record<string, unknown>): number {
    const key = `playback-start:${videoId}`;
    const start = this.activeMarks.get(key);
    if (start === undefined) return -1;

    const duration = performance.now() - start;
    this.activeMarks.delete(key);

    this.emit({
      name: 'video.playback_start_time',
      value: duration,
      unit: 'ms',
      timestamp: Date.now(),
      metadata: { videoId, ...metadata },
    });

    return duration;
  }

  /**
   * Mark the start of an editor operation (trim, split, caption, etc.).
   */
  public startEditorOperation(operationId: string, operationType: string): void {
    const key = `editor-op:${operationId}`;
    this.activeMarks.set(key, performance.now());
    this.activeMarks.set(`editor-op-type:${operationId}`, 0); // stash type via separate naming
    // Store operation type in metadata-like fashion
    (this as any)[`__opType_${operationId}`] = operationType;
  }

  /**
   * Complete the editor operation measurement.
   */
  public endEditorOperation(operationId: string, metadata?: Record<string, unknown>): number {
    const key = `editor-op:${operationId}`;
    const start = this.activeMarks.get(key);
    if (start === undefined) return -1;

    const duration = performance.now() - start;
    this.activeMarks.delete(key);
    this.activeMarks.delete(`editor-op-type:${operationId}`);

    const operationType = (this as any)[`__opType_${operationId}`] ?? 'unknown';
    delete (this as any)[`__opType_${operationId}`];

    this.emit({
      name: 'editor.operation_latency',
      value: duration,
      unit: 'ms',
      timestamp: Date.now(),
      metadata: { operationId, operationType, ...metadata },
    });

    return duration;
  }

  /**
   * Record a buffering event during video playback.
   */
  public recordBufferingEvent(videoId: string, durationMs: number): void {
    this.emit({
      name: 'video.buffering_duration',
      value: durationMs,
      unit: 'ms',
      timestamp: Date.now(),
      metadata: { videoId },
    });
  }

  /**
   * Record a frame drop measurement.
   */
  public recordFrameDrops(videoId: string, droppedFrames: number, totalFrames: number): void {
    const ratio = totalFrames > 0 ? droppedFrames / totalFrames : 0;
    this.emit({
      name: 'video.frame_drop_ratio',
      value: ratio,
      unit: 'ratio',
      timestamp: Date.now(),
      metadata: { videoId, droppedFrames, totalFrames },
    });
  }

  /**
   * Record upload throughput for a video upload chunk.
   */
  public recordUploadThroughput(
    uploadId: string,
    bytesTransferred: number,
    durationMs: number
  ): void {
    const bytesPerSecond = durationMs > 0 ? (bytesTransferred / durationMs) * 1000 : 0;
    this.emit({
      name: 'video.upload_throughput',
      value: bytesPerSecond,
      unit: 'bytes',
      timestamp: Date.now(),
      metadata: { uploadId, bytesTransferred, durationMs },
    });
  }

  /**
   * Record a seek operation latency.
   */
  public recordSeekLatency(videoId: string, latencyMs: number): void {
    this.emit({
      name: 'video.seek_latency',
      value: latencyMs,
      unit: 'ms',
      timestamp: Date.now(),
      metadata: { videoId },
    });
  }

  /**
   * Get all pending (unfinished) marks. Useful for debugging leaked operations.
   */
  public getPendingOperations(): string[] {
    return Array.from(this.activeMarks.keys());
  }

  /**
   * Clear all pending marks.
   */
  public reset(): void {
    this.activeMarks.clear();
  }

  private emit(entry: VideoMetricEntry): void {
    for (const callback of this.callbacks) {
      try {
        callback(entry);
      } catch {
        // Don't let callback errors break the metric pipeline
      }
    }
  }
}

/** Singleton video performance tracker instance. */
export const videoMetrics = new VideoPerformanceTracker();
