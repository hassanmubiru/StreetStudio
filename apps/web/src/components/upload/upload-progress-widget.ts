/**
 * Upload Progress Widget
 * 
 * A compact widget that shows overall upload progress and can be embedded
 * in navigation bars or status areas.
 */

import { getUploadStore, type UploadState } from '../../stores/upload-store.js';
import { uploadManager } from '../../services/upload.js';
import { logger } from '../../app/client-logger.js';

export interface UploadProgressConfig {
  position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left' | 'inline';
  showDetails?: boolean;
  autoHide?: boolean;
  clickToExpand?: boolean;
}

export class UploadProgressWidget {
  private container: HTMLElement;
  private config: Required<UploadProgressConfig>;
  private uploadStore = getUploadStore();
  private isExpanded = false;
  private unsubscribe?: () => void;

  private readonly DEFAULT_CONFIG: Required<UploadProgressConfig> = {
    position: 'top-right',
    showDetails: true,
    autoHide: false,
    clickToExpand: true
  };

  constructor(container: HTMLElement, config: UploadProgressConfig = {}) {
    this.container = container;
    this.config = { ...this.DEFAULT_CONFIG, ...config };
    
    this.initialize();
  }

  private initialize(): void {
    this.createWidget();
    this.setupEventListeners();
    
    // Subscribe to upload state changes
    this.unsubscribe = this.uploadStore.subscribe((state) => {
      this.updateWidget(state);
    });
  }

  private createWidget(): void {
    const widget = document.createElement('div');
    widget.className = `upload-progress-widget ${this.config.position}`;
    widget.innerHTML = `
      <div class="widget-header" id="widget-header">
        <div class="widget-icon">📤</div>
        <div class="widget-info" id="widget-info">
          <div class="widget-title">No uploads</div>
          <div class="widget-subtitle"></div>
        </div>
        ${this.config.clickToExpand ? `
        <div class="widget-expand" id="widget-expand">
          <span class="expand-icon">▼</span>
        </div>
        ` : ''}
      </div>
      
      ${this.config.showDetails ? `
      <div class="widget-details" id="widget-details" style="display: none;">
        <div class="progress-overview" id="progress-overview"></div>
        <div class="upload-summary" id="upload-summary"></div>
        <div class="widget-controls" id="widget-controls">
          <button type="button" class="btn-widget" id="pause-all-btn">Pause All</button>
          <button type="button" class="btn-widget" id="clear-completed-btn">Clear</button>
        </div>
      </div>
      ` : ''}
    `;

    this.container.appendChild(widget);
  }

  private setupEventListeners(): void {
    // Click to expand
    if (this.config.clickToExpand) {
      const header = this.container.querySelector('#widget-header');
      const expandIcon = this.container.querySelector('#widget-expand .expand-icon');
      
      header?.addEventListener('click', () => {
        this.toggleExpanded();
        if (expandIcon) {
          expandIcon.textContent = this.isExpanded ? '▲' : '▼';
        }
      });
    }

    // Control buttons
    const pauseAllBtn = this.container.querySelector('#pause-all-btn');
    pauseAllBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.uploadStore.pauseAllActiveUploads();
    });

    const clearCompletedBtn = this.container.querySelector('#clear-completed-btn');
    clearCompletedBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.uploadStore.clearCompleted();
    });
  }

  private updateWidget(state: UploadState): void {
    this.updateHeader(state);
    
    if (this.config.showDetails) {
      this.updateDetails(state);
    }
    
    this.updateVisibility(state);
  }

  private updateHeader(state: UploadState): void {
    const widgetInfo = this.container.querySelector('#widget-info');
    if (!widgetInfo) return;

    const titleElement = widgetInfo.querySelector('.widget-title') as HTMLElement;
    const subtitleElement = widgetInfo.querySelector('.widget-subtitle') as HTMLElement;

    if (state.uploads.length === 0) {
      titleElement.textContent = 'No uploads';
      subtitleElement.textContent = '';
      return;
    }

    const activeUploads = state.uploads.filter(u => u.status === 'uploading').length;
    const queuedUploads = state.queuedUploads;
    const completedUploads = state.completedUploads;
    const failedUploads = state.failedUploads;

    if (activeUploads > 0) {
      titleElement.textContent = `Uploading ${activeUploads} file${activeUploads > 1 ? 's' : ''}`;
      subtitleElement.textContent = `${Math.round(state.totalProgress)}% • ${this.formatSpeed(state.totalSpeed)}`;
    } else if (queuedUploads > 0) {
      titleElement.textContent = `${queuedUploads} queued`;
      subtitleElement.textContent = 'Waiting to upload';
    } else if (completedUploads > 0 || failedUploads > 0) {
      titleElement.textContent = 'Uploads finished';
      subtitleElement.textContent = `${completedUploads} completed, ${failedUploads} failed`;
    }
  }

  private updateDetails(state: UploadState): void {
    const progressOverview = this.container.querySelector('#progress-overview');
    const uploadSummary = this.container.querySelector('#upload-summary');
    
    if (!progressOverview || !uploadSummary) return;

    // Progress overview
    if (state.isUploading) {
      progressOverview.innerHTML = `
        <div class="overall-progress">
          <div class="progress-bar">
            <div class="progress-fill" style="width: ${state.totalProgress}%"></div>
          </div>
          <div class="progress-stats">
            <span>${Math.round(state.totalProgress)}%</span>
            <span>${this.formatSpeed(state.totalSpeed)}</span>
          </div>
        </div>
      `;
    } else {
      progressOverview.innerHTML = '';
    }

    // Upload summary
    uploadSummary.innerHTML = `
      <div class="upload-counts">
        <div class="count-item">
          <span class="count">${state.uploads.filter(u => u.status === 'uploading').length}</span>
          <span class="label">Active</span>
        </div>
        <div class="count-item">
          <span class="count">${state.queuedUploads}</span>
          <span class="label">Queued</span>
        </div>
        <div class="count-item">
          <span class="count">${state.completedUploads}</span>
          <span class="label">Done</span>
        </div>
        <div class="count-item">
          <span class="count">${state.failedUploads}</span>
          <span class="label">Failed</span>
        </div>
      </div>
    `;
  }

  private updateVisibility(state: UploadState): void {
    const widget = this.container.querySelector('.upload-progress-widget') as HTMLElement;
    if (!widget) return;

    if (this.config.autoHide && state.uploads.length === 0) {
      widget.style.display = 'none';
    } else {
      widget.style.display = 'block';
    }
  }

  private toggleExpanded(): void {
    if (!this.config.showDetails) return;

    const details = this.container.querySelector('#widget-details') as HTMLElement;
    if (!details) return;

    this.isExpanded = !this.isExpanded;
    details.style.display = this.isExpanded ? 'block' : 'none';
  }

  private formatSpeed(bytesPerSecond: number): string {
    if (bytesPerSecond === 0) return '0 B/s';
    
    const units = ['B/s', 'KB/s', 'MB/s', 'GB/s'];
    let size = bytesPerSecond;
    let unitIndex = 0;
    
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    
    return `${size.toFixed(1)} ${units[unitIndex]}`;
  }

  public expand(): void {
    if (this.config.showDetails && !this.isExpanded) {
      this.toggleExpanded();
      const expandIcon = this.container.querySelector('#widget-expand .expand-icon');
      if (expandIcon) {
        expandIcon.textContent = '▲';
      }
    }
  }

  public collapse(): void {
    if (this.config.showDetails && this.isExpanded) {
      this.toggleExpanded();
      const expandIcon = this.container.querySelector('#widget-expand .expand-icon');
      if (expandIcon) {
        expandIcon.textContent = '▼';
      }
    }
  }

  public destroy(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
    }
    
    const widget = this.container.querySelector('.upload-progress-widget');
    if (widget) {
      widget.remove();
    }
  }
}

// CSS styles for the upload progress widget
export const UPLOAD_PROGRESS_WIDGET_STYLES = `
.upload-progress-widget {
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  font-size: 14px;
  max-width: 320px;
  z-index: 1000;
}

.upload-progress-widget.top-right {
  position: fixed;
  top: 20px;
  right: 20px;
}

.upload-progress-widget.top-left {
  position: fixed;
  top: 20px;
  left: 20px;
}

.upload-progress-widget.bottom-right {
  position: fixed;
  bottom: 20px;
  right: 20px;
}

.upload-progress-widget.bottom-left {
  position: fixed;
  bottom: 20px;
  left: 20px;
}

.upload-progress-widget.inline {
  position: relative;
  width: 100%;
  max-width: none;
}

.widget-header {
  display: flex;
  align-items: center;
  padding: 12px 16px;
  cursor: pointer;
  user-select: none;
}

.widget-header:hover {
  background-color: #f7fafc;
}

.widget-icon {
  font-size: 18px;
  margin-right: 12px;
}

.widget-info {
  flex: 1;
  min-width: 0;
}

.widget-title {
  font-weight: 600;
  color: #2d3748;
  margin-bottom: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.widget-subtitle {
  font-size: 12px;
  color: #718096;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.widget-expand {
  margin-left: 8px;
  color: #a0aec0;
}

.expand-icon {
  font-size: 12px;
}

.widget-details {
  padding: 0 16px 16px 16px;
  border-top: 1px solid #e2e8f0;
  background-color: #f7fafc;
}

.overall-progress {
  margin-bottom: 12px;
}

.progress-bar {
  width: 100%;
  height: 6px;
  background-color: #e2e8f0;
  border-radius: 3px;
  overflow: hidden;
  margin-bottom: 8px;
}

.progress-fill {
  height: 100%;
  background-color: #4299e1;
  transition: width 0.3s ease;
}

.progress-stats {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: #718096;
}

.upload-counts {
  display: flex;
  justify-content: space-between;
  margin-bottom: 12px;
}

.count-item {
  text-align: center;
  flex: 1;
}

.count {
  display: block;
  font-size: 16px;
  font-weight: 600;
  color: #2d3748;
}

.label {
  font-size: 11px;
  color: #718096;
  text-transform: uppercase;
}

.widget-controls {
  display: flex;
  gap: 8px;
}

.btn-widget {
  flex: 1;
  padding: 6px 12px;
  border: 1px solid #cbd5e0;
  border-radius: 4px;
  background: white;
  color: #4a5568;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-widget:hover {
  background-color: #f7fafc;
  border-color: #a0aec0;
}

.btn-widget:active {
  background-color: #edf2f7;
}

@media (max-width: 480px) {
  .upload-progress-widget {
    left: 10px !important;
    right: 10px !important;
    max-width: none;
  }
  
  .upload-progress-widget.top-right,
  .upload-progress-widget.top-left {
    top: 10px;
  }
  
  .upload-progress-widget.bottom-right,
  .upload-progress-widget.bottom-left {
    bottom: 10px;
  }
}
`;