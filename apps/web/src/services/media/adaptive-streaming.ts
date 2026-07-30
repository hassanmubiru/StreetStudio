/**
 * Adaptive Bitrate Streaming Manager
 *
 * Manages video quality selection based on network conditions and buffer state.
 * Implements adaptive bitrate (ABR) logic to deliver optimal playback quality.
 *
 * Validates: Requirements 12.4
 */

export type QualityLevel = '2160p' | '1080p' | '720p' | '480p' | '360p' | '240p';

export interface StreamQuality {
  level: QualityLevel;
  bitrate: number; // bits per second
  width: number;
  height: number;
}

export interface NetworkConditions {
  /** Estimated bandwidth in bits per second */
  bandwidth: number;
  /** Round-trip time in milliseconds */
  rtt: number;
  /** Network effective type (4g, 3g, 2g, slow-2g) */
  effectiveType: string;
  /** Whether the connection is metered (e.g., mobile data) */
  saveData: boolean;
}

export interface BufferState {
  /** Current buffer level in seconds */
  bufferedAhead: number;
  /** Whether the player is currently rebuffering */
  isRebuffering: boolean;
  /** Total duration of the video in seconds */
  duration: number;
  /** Current playback position in seconds */
  currentTime: number;
}

export interface ABRConfig {
  /** Minimum buffer before upgrading quality (seconds). Default: 10 */
  minBufferForUpgrade: number;
  /** Buffer level that triggers a quality downgrade (seconds). Default: 3 */
  criticalBufferLevel: number;
  /** Bandwidth safety factor (0-1). Default: 0.7 */
  bandwidthSafetyFactor: number;
  /** Minimum time between quality switches (ms). Default: 5000 */
  minSwitchInterval: number;
  /** Maximum quality level allowed. Default: '2160p' */
  maxQuality: QualityLevel;
  /** Minimum quality level allowed. Default: '240p' */
  minQuality: QualityLevel;
  /** Whether to prefer lower quality on metered connections. Default: true */
  respectSaveData: boolean;
}

export interface QualityChangeEvent {
  previousLevel: QualityLevel;
  newLevel: QualityLevel;
  reason: 'bandwidth' | 'buffer' | 'user' | 'initial' | 'save-data';
  timestamp: number;
}

export type QualityChangeCallback = (event: QualityChangeEvent) => void;

const QUALITY_LEVELS: StreamQuality[] = [
  { level: '2160p', bitrate: 15_000_000, width: 3840, height: 2160 },
  { level: '1080p', bitrate: 5_000_000, width: 1920, height: 1080 },
  { level: '720p', bitrate: 2_500_000, width: 1280, height: 720 },
  { level: '480p', bitrate: 1_000_000, width: 854, height: 480 },
  { level: '360p', bitrate: 600_000, width: 640, height: 360 },
  { level: '240p', bitrate: 300_000, width: 426, height: 240 },
];

const DEFAULT_ABR_CONFIG: ABRConfig = {
  minBufferForUpgrade: 10,
  criticalBufferLevel: 3,
  bandwidthSafetyFactor: 0.7,
  minSwitchInterval: 5000,
  maxQuality: '2160p',
  minQuality: '240p',
  respectSaveData: true,
};

/**
 * Adaptive bitrate streaming manager.
 * Selects optimal quality based on network bandwidth, buffer state, and user preferences.
 */
export class AdaptiveBitrateManager {
  private config: ABRConfig;
  private currentLevel: QualityLevel;
  private lastSwitchTime: number = 0;
  private bandwidthHistory: number[] = [];
  private listeners: QualityChangeCallback[] = [];
  private availableLevels: StreamQuality[];

  constructor(config: Partial<ABRConfig> = {}) {
    this.config = { ...DEFAULT_ABR_CONFIG, ...config };
    this.availableLevels = this.computeAvailableLevels();
    const lastLevel = this.availableLevels[this.availableLevels.length - 1];
    this.currentLevel = lastLevel ? lastLevel.level : '240p';
  }

  /**
   * Get the current quality level.
   */
  public getCurrentLevel(): QualityLevel {
    return this.currentLevel;
  }

  /**
   * Get all available quality levels within configured bounds.
   */
  public getAvailableLevels(): StreamQuality[] {
    return [...this.availableLevels];
  }

  /**
   * Manually set the quality level (user override).
   */
  public setQualityLevel(level: QualityLevel): void {
    const available = this.availableLevels.find((q) => q.level === level);
    if (!available) return;

    const previous = this.currentLevel;
    this.currentLevel = level;
    this.lastSwitchTime = Date.now();

    if (previous !== level) {
      this.notifyListeners({
        previousLevel: previous,
        newLevel: level,
        reason: 'user',
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Evaluate and select the optimal quality based on current conditions.
   * Call this periodically (e.g., every segment download) to adapt quality.
   */
  public selectQuality(network: NetworkConditions, buffer: BufferState): QualityLevel {
    // Respect save-data preference
    if (this.config.respectSaveData && network.saveData) {
      return this.applyQualityChange(this.config.minQuality, 'save-data');
    }

    // Check if we can switch (respect minimum interval)
    const now = Date.now();
    if (now - this.lastSwitchTime < this.config.minSwitchInterval) {
      return this.currentLevel;
    }

    // Record bandwidth sample
    this.recordBandwidthSample(network.bandwidth);

    // Critical buffer: immediately downgrade
    if (buffer.isRebuffering || buffer.bufferedAhead < this.config.criticalBufferLevel) {
      const downgraded = this.downgradeQuality();
      if (downgraded !== this.currentLevel) {
        return this.applyQualityChange(downgraded, 'buffer');
      }
      return this.currentLevel;
    }

    // Calculate effective bandwidth with safety factor
    const effectiveBandwidth = this.getSmoothedBandwidth() * this.config.bandwidthSafetyFactor;

    // Find the highest quality that fits within bandwidth
    const bestFit = this.findBestQualityForBandwidth(effectiveBandwidth);

    // Only upgrade if buffer is healthy
    const currentIndex = this.getQualityIndex(this.currentLevel);
    const bestIndex = this.getQualityIndex(bestFit);

    if (bestIndex < currentIndex) {
      // Upgrade: only if buffer is sufficient
      if (buffer.bufferedAhead >= this.config.minBufferForUpgrade) {
        return this.applyQualityChange(bestFit, 'bandwidth');
      }
      return this.currentLevel;
    } else if (bestIndex > currentIndex) {
      // Downgrade: apply immediately
      return this.applyQualityChange(bestFit, 'bandwidth');
    }

    return this.currentLevel;
  }

  /**
   * Record a bandwidth measurement from a segment download.
   */
  public recordBandwidthSample(bandwidthBps: number): void {
    this.bandwidthHistory.push(bandwidthBps);
    // Keep last 10 samples for smoothing
    if (this.bandwidthHistory.length > 10) {
      this.bandwidthHistory.shift();
    }
  }

  /**
   * Get the smoothed bandwidth estimate using exponential weighted moving average.
   */
  public getSmoothedBandwidth(): number {
    if (this.bandwidthHistory.length === 0) return 0;
    if (this.bandwidthHistory.length === 1) return this.bandwidthHistory[0] ?? 0;

    // EWMA with alpha=0.3 (recent samples weighted more)
    const alpha = 0.3;
    let ewma: number = this.bandwidthHistory[0] ?? 0;
    for (let i = 1; i < this.bandwidthHistory.length; i++) {
      const sample = this.bandwidthHistory[i];
      if (sample !== undefined) {
        ewma = alpha * sample + (1 - alpha) * ewma;
      }
    }
    return ewma;
  }

  /**
   * Get the quality metadata for a given level.
   */
  public getQualityInfo(level: QualityLevel): StreamQuality | undefined {
    return this.availableLevels.find((q) => q.level === level);
  }

  /**
   * Subscribe to quality change events.
   */
  public onQualityChange(callback: QualityChangeCallback): () => void {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== callback);
    };
  }

  /**
   * Reset bandwidth history and state.
   */
  public reset(): void {
    this.bandwidthHistory = [];
    this.lastSwitchTime = 0;
    const lastLevel = this.availableLevels[this.availableLevels.length - 1];
    this.currentLevel = lastLevel ? lastLevel.level : '240p';
  }

  /**
   * Update configuration at runtime.
   */
  public updateConfig(config: Partial<ABRConfig>): void {
    this.config = { ...this.config, ...config };
    this.availableLevels = this.computeAvailableLevels();
  }

  // --- Private methods ---

  private computeAvailableLevels(): StreamQuality[] {
    const maxIdx = QUALITY_LEVELS.findIndex((q) => q.level === this.config.maxQuality);
    const minIdx = QUALITY_LEVELS.findIndex((q) => q.level === this.config.minQuality);
    const startIdx = maxIdx >= 0 ? maxIdx : 0;
    const endIdx = minIdx >= 0 ? minIdx : QUALITY_LEVELS.length - 1;
    return QUALITY_LEVELS.slice(startIdx, endIdx + 1);
  }

  private findBestQualityForBandwidth(bandwidthBps: number): QualityLevel {
    for (const quality of this.availableLevels) {
      if (quality.bitrate <= bandwidthBps) {
        return quality.level;
      }
    }
    // If nothing fits, return lowest available
    const lastLevel = this.availableLevels[this.availableLevels.length - 1];
    return lastLevel ? lastLevel.level : '240p';
  }

  private downgradeQuality(): QualityLevel {
    const currentIdx = this.getQualityIndex(this.currentLevel);
    if (currentIdx < this.availableLevels.length - 1) {
      const nextLevel = this.availableLevels[currentIdx + 1];
      if (nextLevel) {
        return nextLevel.level;
      }
    }
    return this.currentLevel;
  }

  private getQualityIndex(level: QualityLevel): number {
    return this.availableLevels.findIndex((q) => q.level === level);
  }

  private applyQualityChange(newLevel: QualityLevel, reason: QualityChangeEvent['reason']): QualityLevel {
    const previous = this.currentLevel;
    if (previous === newLevel) return newLevel;

    this.currentLevel = newLevel;
    this.lastSwitchTime = Date.now();

    this.notifyListeners({
      previousLevel: previous,
      newLevel,
      reason,
      timestamp: Date.now(),
    });

    return newLevel;
  }

  private notifyListeners(event: QualityChangeEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }
}

/** Singleton adaptive bitrate manager instance. */
export const adaptiveStreaming = new AdaptiveBitrateManager();
