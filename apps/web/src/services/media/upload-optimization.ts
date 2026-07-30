/**
 * Upload Optimization Service
 *
 * Client-side compression, format detection, and optimization for uploaded content.
 * Handles image compression, video format validation, and content analysis
 * before upload to reduce transfer size and processing time.
 *
 * Validates: Requirements 12.8
 */

export type ImageFormat = 'jpeg' | 'png' | 'webp' | 'gif' | 'avif';
export type VideoFormat = 'mp4' | 'webm' | 'mov' | 'avi' | 'mkv';
export type ContentType = 'image' | 'video' | 'audio' | 'unknown';

export interface ContentAnalysis {
  /** Detected content type */
  type: ContentType;
  /** Detected format */
  format: string;
  /** MIME type */
  mimeType: string;
  /** File size in bytes */
  size: number;
  /** Whether compression is recommended */
  compressionRecommended: boolean;
  /** Estimated size after optimization */
  estimatedOptimizedSize: number;
  /** Savings percentage (0-100) */
  estimatedSavings: number;
}

export interface ImageCompressionOptions {
  /** Target quality (0-1). Default: 0.8 */
  quality: number;
  /** Maximum width. Images wider will be resized. Default: 4096 */
  maxWidth: number;
  /** Maximum height. Images taller will be resized. Default: 4096 */
  maxHeight: number;
  /** Output format. Default: 'webp' */
  outputFormat: ImageFormat;
  /** Whether to maintain aspect ratio. Default: true */
  maintainAspectRatio: boolean;
  /** Whether to strip EXIF metadata. Default: false */
  stripMetadata: boolean;
}

export interface OptimizationResult {
  /** Optimized file blob */
  blob: Blob;
  /** Original size in bytes */
  originalSize: number;
  /** Optimized size in bytes */
  optimizedSize: number;
  /** Savings percentage */
  savings: number;
  /** Output format used */
  format: string;
  /** Whether the file was modified */
  wasOptimized: boolean;
  /** Width after optimization (images only) */
  width?: number;
  /** Height after optimization (images only) */
  height?: number;
}

export interface UploadOptimizationConfig {
  /** Enable automatic image compression. Default: true */
  autoCompressImages: boolean;
  /** Maximum file size before compression is triggered (bytes). Default: 2MB */
  compressionThreshold: number;
  /** Default image compression quality (0-1). Default: 0.8 */
  defaultImageQuality: number;
  /** Preferred output format for images. Default: 'webp' */
  preferredImageFormat: ImageFormat;
  /** Maximum image dimension. Default: 4096 */
  maxImageDimension: number;
  /** Whether WebP encoding is available. Default: auto-detect */
  webpEncodingSupported: boolean | null;
}

const DEFAULT_CONFIG: UploadOptimizationConfig = {
  autoCompressImages: true,
  compressionThreshold: 2 * 1024 * 1024, // 2MB
  defaultImageQuality: 0.8,
  preferredImageFormat: 'webp',
  maxImageDimension: 4096,
  webpEncodingSupported: null,
};

const DEFAULT_COMPRESSION_OPTIONS: ImageCompressionOptions = {
  quality: 0.8,
  maxWidth: 4096,
  maxHeight: 4096,
  outputFormat: 'webp',
  maintainAspectRatio: true,
  stripMetadata: false,
};

const MIME_TO_FORMAT: Record<string, string> = {
  'image/jpeg': 'jpeg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
  'video/x-msvideo': 'avi',
  'video/x-matroska': 'mkv',
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
  'audio/ogg': 'ogg',
  'audio/webm': 'webm',
};

const FORMAT_TO_MIME: Record<string, string> = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  avif: 'image/avif',
};

/**
 * Upload Optimization Manager.
 * Handles client-side content analysis, compression, and format optimization.
 */
export class UploadOptimizer {
  private config: UploadOptimizationConfig;
  private canvasSupported: boolean;

  constructor(config: Partial<UploadOptimizationConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.canvasSupported = typeof HTMLCanvasElement !== 'undefined';
  }

  /**
   * Analyze a file and provide optimization recommendations.
   */
  public analyzeContent(file: File): ContentAnalysis {
    const type = this.detectContentType(file);
    const format = this.detectFormat(file);

    let compressionRecommended = false;
    let estimatedOptimizedSize = file.size;
    let estimatedSavings = 0;

    if (type === 'image') {
      if (file.size > this.config.compressionThreshold) {
        compressionRecommended = true;
        // Estimate ~40-60% savings for large images with quality compression
        estimatedSavings = format === 'png' ? 60 : 40;
        estimatedOptimizedSize = Math.round(file.size * (1 - estimatedSavings / 100));
      } else if (format === 'png' && file.size > 500_000) {
        compressionRecommended = true;
        estimatedSavings = 50;
        estimatedOptimizedSize = Math.round(file.size * 0.5);
      }
    }

    return {
      type,
      format,
      mimeType: file.type || 'application/octet-stream',
      size: file.size,
      compressionRecommended,
      estimatedOptimizedSize,
      estimatedSavings,
    };
  }

  /**
   * Detect the content type category from a file.
   */
  public detectContentType(file: File): ContentType {
    const mime = file.type.toLowerCase();
    if (mime.startsWith('image/')) return 'image';
    if (mime.startsWith('video/')) return 'video';
    if (mime.startsWith('audio/')) return 'audio';
    return 'unknown';
  }

  /**
   * Detect the specific format from a file.
   */
  public detectFormat(file: File): string {
    const mimeFormat = MIME_TO_FORMAT[file.type.toLowerCase()];
    if (mimeFormat) return mimeFormat;

    // Fallback: check file extension
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (ext) return ext;

    return 'unknown';
  }

  /**
   * Compress an image file using Canvas API.
   */
  public async compressImage(
    file: File,
    options: Partial<ImageCompressionOptions> = {}
  ): Promise<OptimizationResult> {
    const opts: ImageCompressionOptions = { ...DEFAULT_COMPRESSION_OPTIONS, ...options };

    if (!this.canvasSupported) {
      return {
        blob: file,
        originalSize: file.size,
        optimizedSize: file.size,
        savings: 0,
        format: this.detectFormat(file),
        wasOptimized: false,
      };
    }

    // Determine output format
    let outputMime = FORMAT_TO_MIME[opts.outputFormat] || 'image/webp';

    // Check if WebP encoding is supported
    if (opts.outputFormat === 'webp' && this.config.webpEncodingSupported === false) {
      outputMime = 'image/jpeg';
      opts.outputFormat = 'jpeg';
    }

    try {
      const bitmap = await this.loadImageBitmap(file);
      const { width, height } = this.calculateDimensions(
        bitmap.width,
        bitmap.height,
        opts.maxWidth,
        opts.maxHeight,
        opts.maintainAspectRatio
      );

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        return this.noOptimizationResult(file);
      }

      ctx.drawImage(bitmap, 0, 0, width, height);

      // Close the bitmap to free memory
      if ('close' in bitmap && typeof bitmap.close === 'function') {
        bitmap.close();
      }

      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (b) => {
            if (b) resolve(b);
            else reject(new Error('Canvas toBlob failed'));
          },
          outputMime,
          opts.quality
        );
      });

      // Only use optimized version if it's actually smaller
      const wasOptimized = blob.size < file.size;
      const resultBlob = wasOptimized ? blob : file;

      return {
        blob: resultBlob,
        originalSize: file.size,
        optimizedSize: resultBlob.size,
        savings: wasOptimized ? Math.round((1 - blob.size / file.size) * 100) : 0,
        format: wasOptimized ? opts.outputFormat : this.detectFormat(file),
        wasOptimized,
        width,
        height,
      };
    } catch {
      return this.noOptimizationResult(file);
    }
  }

  /**
   * Optimize a file (auto-detects type and applies appropriate optimization).
   */
  public async optimizeFile(file: File): Promise<OptimizationResult> {
    const contentType = this.detectContentType(file);

    if (contentType === 'image' && this.config.autoCompressImages) {
      return this.compressImage(file, {
        quality: this.config.defaultImageQuality,
        maxWidth: this.config.maxImageDimension,
        maxHeight: this.config.maxImageDimension,
        outputFormat: this.config.preferredImageFormat,
      });
    }

    // For video/audio, no client-side compression (handled server-side)
    return this.noOptimizationResult(file);
  }

  /**
   * Process multiple files with optimization.
   */
  public async optimizeBatch(files: File[]): Promise<OptimizationResult[]> {
    return Promise.all(files.map((file) => this.optimizeFile(file)));
  }

  /**
   * Check if WebP encoding is supported in the current environment.
   */
  public async checkWebPEncodingSupport(): Promise<boolean> {
    if (this.config.webpEncodingSupported !== null) {
      return this.config.webpEncodingSupported;
    }

    if (!this.canvasSupported) {
      this.config.webpEncodingSupported = false;
      return false;
    }

    try {
      const canvas = document.createElement('canvas');
      canvas.width = 1;
      canvas.height = 1;
      const dataUrl = canvas.toDataURL('image/webp');
      const supported = dataUrl.startsWith('data:image/webp');
      this.config.webpEncodingSupported = supported;
      return supported;
    } catch {
      this.config.webpEncodingSupported = false;
      return false;
    }
  }

  /**
   * Get a human-readable file size string.
   */
  public formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }

  /**
   * Validate a file against upload constraints.
   */
  public validateFile(
    file: File,
    constraints: { maxSize?: number; allowedTypes?: ContentType[]; allowedFormats?: string[] }
  ): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (constraints.maxSize && file.size > constraints.maxSize) {
      errors.push(
        `File size (${this.formatFileSize(file.size)}) exceeds maximum (${this.formatFileSize(constraints.maxSize)})`
      );
    }

    if (constraints.allowedTypes) {
      const type = this.detectContentType(file);
      if (!constraints.allowedTypes.includes(type)) {
        errors.push(`File type "${type}" is not allowed. Allowed: ${constraints.allowedTypes.join(', ')}`);
      }
    }

    if (constraints.allowedFormats) {
      const format = this.detectFormat(file);
      if (!constraints.allowedFormats.includes(format)) {
        errors.push(`File format "${format}" is not allowed. Allowed: ${constraints.allowedFormats.join(', ')}`);
      }
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Update configuration.
   */
  public updateConfig(config: Partial<UploadOptimizationConfig>): void {
    this.config = { ...this.config, ...config };
  }

  // --- Private methods ---

  private loadImageBitmap(file: File): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = URL.createObjectURL(file);
    });
  }

  private calculateDimensions(
    origWidth: number,
    origHeight: number,
    maxWidth: number,
    maxHeight: number,
    maintainAspectRatio: boolean
  ): { width: number; height: number } {
    if (origWidth <= maxWidth && origHeight <= maxHeight) {
      return { width: origWidth, height: origHeight };
    }

    if (!maintainAspectRatio) {
      return {
        width: Math.min(origWidth, maxWidth),
        height: Math.min(origHeight, maxHeight),
      };
    }

    const widthRatio = maxWidth / origWidth;
    const heightRatio = maxHeight / origHeight;
    const ratio = Math.min(widthRatio, heightRatio);

    return {
      width: Math.round(origWidth * ratio),
      height: Math.round(origHeight * ratio),
    };
  }

  private noOptimizationResult(file: File): OptimizationResult {
    return {
      blob: file,
      originalSize: file.size,
      optimizedSize: file.size,
      savings: 0,
      format: this.detectFormat(file),
      wasOptimized: false,
    };
  }
}

/** Singleton upload optimizer instance. */
export const uploadOptimizer = new UploadOptimizer();
