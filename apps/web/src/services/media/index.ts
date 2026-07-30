/**
 * Media Optimization Services
 *
 * Provides adaptive bitrate streaming, progressive image loading,
 * memory management for video sessions, and upload optimization.
 *
 * Usage:
 *   import { adaptiveStreaming, progressiveImages, videoSessionMemory, uploadOptimizer } from './services/media';
 *
 * Validates: Requirements 12.4, 12.5, 12.8, 12.9
 */

export {
  AdaptiveBitrateManager,
  adaptiveStreaming,
  type QualityLevel,
  type StreamQuality,
  type NetworkConditions,
  type BufferState,
  type ABRConfig,
  type QualityChangeEvent,
  type QualityChangeCallback,
} from './adaptive-streaming.js';

export {
  ProgressiveImageLoader,
  progressiveImages,
  type ImageSource,
  type ResponsiveImageConfig,
  type ProgressiveLoadConfig,
  type ImageLoadEvent,
  type ImageLoadCallback,
} from './progressive-image.js';

export {
  VideoSessionMemoryManager,
  videoSessionMemory,
  type MemoryUsageSnapshot,
  type ResourceHandle,
  type MemoryManagerConfig,
  type MemoryPressureEvent,
  type MemoryPressureCallback,
} from './memory-management.js';

export {
  UploadOptimizer,
  uploadOptimizer,
  type ImageFormat,
  type VideoFormat,
  type ContentType,
  type ContentAnalysis,
  type ImageCompressionOptions,
  type OptimizationResult,
  type UploadOptimizationConfig,
} from './upload-optimization.js';
