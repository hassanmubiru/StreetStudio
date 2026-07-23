/**
 * Video Metadata Renderer
 * Renders video metadata with processing status indicators
 * Implements Requirements 4.9, 4.10: Video metadata display and real-time processing progress
 */

import { VideoDto, VideoStatus } from '@streetstudio/shared';

export interface RenderedMetadata {
  statusBadge: string;
  progressBar: string;
  durationText: string;
  sizeText: string;
  createdText: string;
  qualityIndicator: string;
}

export interface ProcessingProgress {
  percentage: number;
  stage: string;
  estimatedTimeRemaining?: number;
}

export class VideoMetadataRenderer {
  private processingProgress: Map<string, ProcessingProgress> = new Map();
  private updateCallbacks: Map<string, () => void> = new Map();

  public render(video: VideoDto): RenderedMetadata {
    return {
      statusBadge: this.renderStatusBadge(video),
      progressBar: this.renderProgressBar(video),
      durationText: this.formatDuration(video.durationSeconds),
      sizeText: this.estimateFileSize(video.durationSeconds),
      createdText: this.formatCreatedDate(video.createdAt),
      qualityIndicator: this.renderQualityIndicator(video)
    };
  }

  private renderStatusBadge(video: VideoDto): string {
    const statusConfig = this.getStatusConfig(video.status);
    
    return `
      <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusConfig.className}">
        ${statusConfig.icon}
        <span class="ml-1">${statusConfig.label}</span>
      </span>
    `;
  }

  private renderProgressBar(video: VideoDto): string {
    if (!this.isProcessingStatus(video.status)) {
      return '';
    }

    const progress = this.processingProgress.get(video.id);
    const percentage = progress?.percentage || 0;
    const stage = progress?.stage || 'Processing';
    const eta = progress?.estimatedTimeRemaining;

    return `
      <div class="mt-2">
        <div class="flex items-center justify-between text-xs text-gray-600 dark:text-gray-400 mb-1">
          <span>${stage}</span>
          <span>${Math.round(percentage)}%</span>
        </div>
        <div class="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
          <div class="bg-blue-600 h-2 rounded-full transition-all duration-300 ease-out" 
               style="width: ${percentage}%"></div>
        </div>
        ${eta ? `
          <div class="text-xs text-gray-500 dark:text-gray-400 mt-1">
            ${this.formatETA(eta)} remaining
          </div>
        ` : ''}
      </div>
    `;
  }

  private renderQualityIndicator(video: VideoDto): string {
    if (!this.isReadyStatus(video.status)) {
      return '';
    }

    // Mock quality data - in real implementation, this would come from renditions
    const qualities = ['720p', '1080p', '4K'];
    const availableQuality = video.durationSeconds > 300 ? '1080p' : '720p';

    return `
      <div class="flex items-center gap-1">
        <svg class="w-3 h-3 text-green-500" fill="currentColor" viewBox="0 0 20 20">
          <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"/>
        </svg>
        <span class="text-xs text-gray-600 dark:text-gray-400">${availableQuality}</span>
      </div>
    `;
  }

  private getStatusConfig(status: VideoStatus): { className: string; label: string; icon: string } {
    switch (status) {
      case 'uploading':
        return {
          className: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
          label: 'Uploading',
          icon: this.getUploadIcon()
        };
      case 'queued':
        return {
          className: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
          label: 'Queued',
          icon: this.getClockIcon()
        };
      case 'processing':
        return {
          className: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
          label: 'Processing',
          icon: this.getProcessingIcon()
        };
      case 'ready':
        return {
          className: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
          label: 'Ready',
          icon: this.getCheckIcon()
        };
      case 'failed':
        return {
          className: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
          label: 'Failed',
          icon: this.getErrorIcon()
        };
      default:
        return {
          className: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200',
          label: 'Unknown',
          icon: this.getQuestionIcon()
        };
    }
  }

  private isProcessingStatus(status: VideoStatus): boolean {
    return ['uploading', 'queued', 'processing'].includes(status);
  }

  private isReadyStatus(status: VideoStatus): boolean {
    return status === 'ready';
  }

  private formatDuration(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = seconds % 60;
    
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
    } else {
      return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
    }
  }

  private estimateFileSize(durationSeconds: number): string {
    // Rough estimation: ~5MB per minute for 1080p video
    const estimatedMB = Math.round((durationSeconds / 60) * 5);
    
    if (estimatedMB < 1024) {
      return `~${estimatedMB} MB`;
    } else {
      return `~${(estimatedMB / 1024).toFixed(1)} GB`;
    }
  }

  private formatCreatedDate(isoString: string): string {
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return 'Today';
    } else if (diffDays === 1) {
      return 'Yesterday';
    } else if (diffDays < 7) {
      return `${diffDays} days ago`;
    } else {
      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
      });
    }
  }

  private formatETA(seconds: number): string {
    if (seconds < 60) {
      return `${Math.round(seconds)}s`;
    } else if (seconds < 3600) {
      return `${Math.round(seconds / 60)}m`;
    } else {
      return `${Math.round(seconds / 3600)}h`;
    }
  }
  // Real-time progress updates (Requirement 4.10)
  public updateProgress(videoId: string, progress: ProcessingProgress): void {
    this.processingProgress.set(videoId, progress);
    
    // Trigger UI update if callback exists
    const callback = this.updateCallbacks.get(videoId);
    if (callback) {
      callback();
    }
  }

  public registerUpdateCallback(videoId: string, callback: () => void): void {
    this.updateCallbacks.set(videoId, callback);
  }

  public unregisterUpdateCallback(videoId: string): void {
    this.updateCallbacks.delete(videoId);
  }

  public getProgress(videoId: string): ProcessingProgress | null {
    return this.processingProgress.get(videoId) || null;
  }

  public clearProgress(videoId: string): void {
    this.processingProgress.delete(videoId);
    this.updateCallbacks.delete(videoId);
  }

  // SVG Icons for status indicators
  private getUploadIcon(): string {
    return `
      <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
        <path fill-rule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 6.707a1 1 0 010-1.414l3-3a1 1 0 011.414 0l3 3a1 1 0 01-1.414 1.414L11 5.414V13a1 1 0 11-2 0V5.414L7.707 6.707a1 1 0 01-1.414 0z"/>
      </svg>
    `;
  }

  private getClockIcon(): string {
    return `
      <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
        <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z"/>
      </svg>
    `;
  }

  private getProcessingIcon(): string {
    return `
      <svg class="w-3 h-3 animate-spin" fill="currentColor" viewBox="0 0 20 20">
        <path fill-rule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z"/>
      </svg>
    `;
  }

  private getCheckIcon(): string {
    return `
      <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
        <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"/>
      </svg>
    `;
  }

  private getErrorIcon(): string {
    return `
      <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
        <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"/>
      </svg>
    `;
  }

  private getQuestionIcon(): string {
    return `
      <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
        <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-3a1 1 0 00-.867.5 1 1 0 11-1.731-1A3 3 0 0113 8a3.001 3.001 0 01-2 2.83V11a1 1 0 11-2 0v-1a1 1 0 011-1 1 1 0 100-2zm0 8a1 1 0 100-2 1 1 0 000 2z"/>
      </svg>
    `;
  }
}