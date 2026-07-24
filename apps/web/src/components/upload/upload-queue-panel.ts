/**
 * Upload Queue Panel
 * 
 * A full-featured panel for managing upload queues with detailed progress,
 * retry controls, and batch operations.
 */

import { getUploadStore, type UploadState, type UploadItem } from '../../stores/upload-store.js';
import { uploadManager } from '../../services/upload.js';
import { logger } from '../../app/client-logger.js';

export interface UploadQueueConfig {
  showCompleted?: boolean;
  showFailed?: boolean;
  allowReorder?: boolean;
  enableBatchOperations?: boolean;
  maxDisplayItems?: number;
}

export class UploadQueuePanel {
  private container: HTMLElement;
  private config: Required<UploadQueueConfig>;
  private uploadStore = getUploadStore();
  private selectedItems = new Set<string>();
  private unsubscribe?: () => void;

  private readonly DEFAULT_CONFIG: Required<UploadQueueConfig> = {
    showCompleted: true,
    showFailed: true,
    allowReorder: false,
    enableBatchOperations: true,
    maxDisplayItems: 50
  };

  constructor(container: HTMLElement, config: UploadQueueConfig = {}) {
    this.container = container;
    this.config = { ...this.DEFAULT_CONFIG, ...config };
    
    this.initialize();
  }

  private initialize(): void {
    this.createPanel();
    this.setupEventListeners();
    
    // Subscribe to upload state changes
    this.unsubscribe = this.uploadStore.subscribe((state) => {
      this.updatePanel(state);
    });
  }

  private createPanel(): void {
    this.container.innerHTML = `
      <div class="upload-queue-panel">
        <div class="panel-header">
          <h3 class="panel-title">Upload Queue</h3>
          <div class="panel-stats" id="panel-stats"></div>
        </div>

        ${this.config.enableBatchOperations ? `
        <div class="batch-operations" id="batch-operations" style="display: none;">
          <div class="batch-info">
            <span id="selected-count">0</span> items selected
          </div>
          <div class="batch-actions">
            <button type="button" class="btn-batch" id="batch-retry">Retry Selected</button>
            <button type="button" class="btn-batch" id="batch-pause">Pause Selected</button>
            <button type="button" class="btn-batch" id="batch-cancel">Cancel Selected</button>
            <button type="button" class="btn-batch" id="batch-remove">Remove Selected</button>
          </div>
        </div>
        ` : ''}

        <div class="queue-controls">
          <div class="filter-controls">
            <label class="filter-option">
              <input type="checkbox" id="show-active" checked>
              Active
            </label>
            <label class="filter-option">
              <input type="checkbox" id="show-queued" checked>
              Queued
            </label>
            <label class="filter-option">
              <input type="checkbox" id="show-completed" ${this.config.showCompleted ? 'checked' : ''}>
              Completed
            </label>
            <label class="filter-option">
              <input type="checkbox" id="show-failed" ${this.config.showFailed ? 'checked' : ''}>
              Failed
            </label>
          </div>
          
          <div class="global-controls">
            <button type="button" class="btn-control" id="pause-all">Pause All</button>
            <button type="button" class="btn-control" id="resume-all">Resume All</button>
            <button type="button" class="btn-control" id="clear-completed">Clear Completed</button>
            <button type="button" class="btn-control" id="clear-all">Clear All</button>
          </div>
        </div>

        <div class="queue-content">
          <div class="queue-list" id="queue-list">
            <div class="empty-state">No uploads in queue</div>
          </div>
        </div>
      </div>
    `;
  }

  private setupEventListeners(): void {
    // Filter controls
    const showActiveCheckbox = this.container.querySelector('#show-active') as HTMLInputElement;
    const showQueuedCheckbox = this.container.querySelector('#show-queued') as HTMLInputElement;
    const showCompletedCheckbox = this.container.querySelector('#show-completed') as HTMLInputElement;
    const showFailedCheckbox = this.container.querySelector('#show-failed') as HTMLInputElement;

    [showActiveCheckbox, showQueuedCheckbox, showCompletedCheckbox, showFailedCheckbox].forEach(checkbox => {
      checkbox?.addEventListener('change', () => {
        this.updateDisplay();
      });
    });

    // Global controls
    const pauseAllBtn = this.container.querySelector('#pause-all');
    pauseAllBtn?.addEventListener('click', () => {
      this.uploadStore.pauseAllActiveUploads();
    });

    const resumeAllBtn = this.container.querySelector('#resume-all');
    resumeAllBtn?.addEventListener('click', () => {
      this.uploadStore.resumeQueuedUploads();
    });

    const clearCompletedBtn = this.container.querySelector('#clear-completed');
    clearCompletedBtn?.addEventListener('click', () => {
      this.uploadStore.clearCompleted();
    });

    const clearAllBtn = this.container.querySelector('#clear-all');
    clearAllBtn?.addEventListener('click', () => {
      if (confirm('Are you sure you want to clear all uploads? This will cancel active uploads.')) {
        this.uploadStore.clearAll();
      }
    });

    // Batch operations
    if (this.config.enableBatchOperations) {
      const batchRetryBtn = this.container.querySelector('#batch-retry');
      batchRetryBtn?.addEventListener('click', () => {
        this.selectedItems.forEach(itemId => {
          this.uploadStore.retryUpload(itemId);
        });
        this.clearSelection();
      });

      const batchPauseBtn = this.container.querySelector('#batch-pause');
      batchPauseBtn?.addEventListener('click', () => {
        this.selectedItems.forEach(itemId => {
          this.uploadStore.pauseUpload(itemId);
        });
        this.clearSelection();
      });

      const batchCancelBtn = this.container.querySelector('#batch-cancel');
      batchCancelBtn?.addEventListener('click', () => {
        this.selectedItems.forEach(itemId => {
          this.uploadStore.cancelUpload(itemId);
        });
        this.clearSelection();
      });

      const batchRemoveBtn = this.container.querySelector('#batch-remove');
      batchRemoveBtn?.addEventListener('click', () => {
        if (confirm(`Remove ${this.selectedItems.size} selected uploads?`)) {
          this.selectedItems.forEach(itemId => {
            this.uploadStore.removeUpload(itemId);
          });
          this.clearSelection();
        }
      });
    }
  }

  private updatePanel(state: UploadState): void {
    this.updateStats(state);
    this.updateDisplay();
  }

  private updateStats(state: UploadState): void {
    const statsElement = this.container.querySelector('#panel-stats');
    if (!statsElement) return;

    const totalUploads = state.uploads.length;
    const activeUploads = state.uploads.filter(u => u.status === 'uploading').length;
    const queuedUploads = state.queuedUploads;

    if (totalUploads === 0) {
      statsElement.innerHTML = '<span class="stat-item">No uploads</span>';
    } else {
      statsElement.innerHTML = `
        <span class="stat-item">${totalUploads} total</span>
        <span class="stat-item">${activeUploads} active</span>
        <span class="stat-item">${queuedUploads} queued</span>
        ${state.isUploading ? `<span class="stat-item">${this.formatSpeed(state.totalSpeed)}</span>` : ''}
      `;
    }
  }

  private updateDisplay(): void {
    const state = this.uploadStore.getState();
    const queueList = this.container.querySelector('#queue-list');
    if (!queueList) return;

    // Get filter states
    const showActive = (this.container.querySelector('#show-active') as HTMLInputElement)?.checked ?? true;
    const showQueued = (this.container.querySelector('#show-queued') as HTMLInputElement)?.checked ?? true;
    const showCompleted = (this.container.querySelector('#show-completed') as HTMLInputElement)?.checked ?? false;
    const showFailed = (this.container.querySelector('#show-failed') as HTMLInputElement)?.checked ?? false;

    // Filter uploads
    const filteredUploads = state.uploads.filter(upload => {
      switch (upload.status) {
        case 'uploading': return showActive;
        case 'queued': return showQueued;
        case 'completed': return showCompleted;
        case 'failed': return showFailed;
        case 'paused': return showQueued; // Show paused with queued
        case 'cancelled': return showFailed; // Show cancelled with failed
        default: return true;
      }
    });

    // Limit display items
    const displayUploads = filteredUploads.slice(0, this.config.maxDisplayItems);

    if (displayUploads.length === 0) {
      queueList.innerHTML = '<div class="empty-state">No uploads match current filters</div>';
      return;
    }

    queueList.innerHTML = displayUploads.map(upload => this.renderUploadItem(upload)).join('');

    // Update selection state
    this.updateSelectionDisplay();
  }

  private renderUploadItem(upload: UploadItem): string {
    const isSelected = this.selectedItems.has(upload.id);
    const progress = upload.progress;
    const statusClass = upload.status.toLowerCase();

    return `
      <div class="upload-item ${statusClass} ${isSelected ? 'selected' : ''}" data-upload-id="${upload.id}">
        ${this.config.enableBatchOperations ? `
        <div class="item-selection">
          <input type="checkbox" class="item-checkbox" ${isSelected ? 'checked' : ''} 
                 onchange="this.toggleSelection('${upload.id}', this.checked)">
        </div>
        ` : ''}
        
        <div class="item-info">
          <div class="file-name" title="${upload.file.name}">${upload.file.name}</div>
          <div class="file-details">
            <span class="file-size">${this.formatFileSize(upload.file.size)}</span>
            ${upload.startTime ? `<span class="start-time">${this.formatRelativeTime(upload.startTime)}</span>` : ''}
            ${upload.retryCount > 0 ? `<span class="retry-count">Retry ${upload.retryCount}</span>` : ''}
          </div>
        </div>

        <div class="item-progress">
          <div class="progress-bar">
            <div class="progress-fill" style="width: ${progress}%"></div>
          </div>
          <div class="progress-text">${Math.round(progress)}%</div>
          ${upload.status === 'uploading' && upload.speed ? `
            <div class="upload-speed">${this.formatSpeed(upload.speed)}</div>
          ` : ''}
        </div>

        <div class="item-status">
          <span class="status-badge ${statusClass}">${this.formatStatus(upload.status)}</span>
          ${upload.error ? `<div class="error-message" title="${upload.error}">${upload.error}</div>` : ''}
        </div>

        <div class="item-actions">
          ${this.renderItemActions(upload)}
        </div>
      </div>
    `;
  }

  private renderItemActions(upload: UploadItem): string {
    const actions: string[] = [];

    switch (upload.status) {
      case 'uploading':
        actions.push(`<button type="button" class="btn-action" onclick="uploadStore.pauseUpload('${upload.id}')">Pause</button>`);
        actions.push(`<button type="button" class="btn-action danger" onclick="uploadStore.cancelUpload('${upload.id}')">Cancel</button>`);
        break;
        
      case 'paused':
        actions.push(`<button type="button" class="btn-action" onclick="uploadStore.resumeUpload('${upload.id}')">Resume</button>`);
        actions.push(`<button type="button" class="btn-action danger" onclick="uploadStore.cancelUpload('${upload.id}')">Cancel</button>`);
        break;
        
      case 'queued':
        actions.push(`<button type="button" class="btn-action danger" onclick="uploadStore.cancelUpload('${upload.id}')">Cancel</button>`);
        break;
        
      case 'failed':
        actions.push(`<button type="button" class="btn-action" onclick="uploadStore.retryUpload('${upload.id}')">Retry</button>`);
        actions.push(`<button type="button" class="btn-action" onclick="uploadStore.removeUpload('${upload.id}')">Remove</button>`);
        break;
        
      case 'completed':
      case 'cancelled':
        actions.push(`<button type="button" class="btn-action" onclick="uploadStore.removeUpload('${upload.id}')">Remove</button>`);
        break;
    }

    return actions.join('');
  }

  private formatStatus(status: UploadItem['status']): string {
    const statusMap = {
      'queued': 'Queued',
      'uploading': 'Uploading',
      'completed': 'Completed',
      'failed': 'Failed',
      'cancelled': 'Cancelled',
      'paused': 'Paused'
    };
    
    return statusMap[status] || status;
  }

  private formatFileSize(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;
    
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    
    return `${size.toFixed(1)} ${units[unitIndex]}`;
  }

  private formatSpeed(bytesPerSecond: number): string {
    if (bytesPerSecond === 0) return '0 B/s';
    return `${this.formatFileSize(bytesPerSecond)}/s`;
  }

  private formatRelativeTime(date: Date): string {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    
    if (diffMinutes < 1) return 'Just now';
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    
    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  }

  private toggleSelection(uploadId: string, selected: boolean): void {
    if (selected) {
      this.selectedItems.add(uploadId);
    } else {
      this.selectedItems.delete(uploadId);
    }
    
    this.updateSelectionDisplay();
  }

  private clearSelection(): void {
    this.selectedItems.clear();
    this.updateSelectionDisplay();
    
    // Uncheck all checkboxes
    const checkboxes = this.container.querySelectorAll('.item-checkbox') as NodeListOf<HTMLInputElement>;
    checkboxes.forEach(checkbox => {
      checkbox.checked = false;
    });
  }

  private updateSelectionDisplay(): void {
    if (!this.config.enableBatchOperations) return;

    const batchOperations = this.container.querySelector('#batch-operations') as HTMLElement;
    const selectedCountElement = this.container.querySelector('#selected-count');
    
    if (!batchOperations || !selectedCountElement) return;

    const hasSelection = this.selectedItems.size > 0;
    batchOperations.style.display = hasSelection ? 'flex' : 'none';
    selectedCountElement.textContent = this.selectedItems.size.toString();
  }

  public selectAll(): void {
    if (!this.config.enableBatchOperations) return;

    const state = this.uploadStore.getState();
    this.selectedItems.clear();
    
    state.uploads.forEach(upload => {
      this.selectedItems.add(upload.id);
    });
    
    this.updateDisplay();
  }

  public clearAll(): void {
    this.clearSelection();
  }

  public destroy(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
    }
    
    this.selectedItems.clear();
  }
}

// Make functions globally available for onclick handlers
(window as any).uploadStore = getUploadStore();
(window as any).toggleSelection = (uploadId: string, selected: boolean) => {
  // This would be handled by the specific panel instance
  // In a real implementation, we'd use event delegation instead of onclick
};

// CSS styles for the upload queue panel
export const UPLOAD_QUEUE_PANEL_STYLES = `
.upload-queue-panel {
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  font-size: 14px;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid #e2e8f0;
}

.panel-title {
  font-size: 18px;
  font-weight: 600;
  color: #2d3748;
  margin: 0;
}

.panel-stats {
  display: flex;
  gap: 16px;
}

.stat-item {
  font-size: 12px;
  color: #718096;
  padding: 4px 8px;
  background-color: #f7fafc;
  border-radius: 4px;
}

.batch-operations {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 20px;
  background-color: #ebf8ff;
  border-bottom: 1px solid #bee3f8;
}

.batch-info {
  font-weight: 500;
  color: #2b6cb0;
}

.batch-actions {
  display: flex;
  gap: 8px;
}

.btn-batch {
  padding: 6px 12px;
  border: 1px solid #3182ce;
  border-radius: 4px;
  background: white;
  color: #3182ce;
  font-size: 12px;
  cursor: pointer;
}

.btn-batch:hover {
  background-color: #3182ce;
  color: white;
}

.queue-controls {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid #e2e8f0;
  background-color: #f7fafc;
}

.filter-controls {
  display: flex;
  gap: 16px;
}

.filter-option {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: #4a5568;
  cursor: pointer;
}

.filter-option input[type="checkbox"] {
  margin: 0;
}

.global-controls {
  display: flex;
  gap: 8px;
}

.btn-control {
  padding: 6px 12px;
  border: 1px solid #cbd5e0;
  border-radius: 4px;
  background: white;
  color: #4a5568;
  font-size: 12px;
  cursor: pointer;
}

.btn-control:hover {
  background-color: #f7fafc;
}

.queue-content {
  max-height: 600px;
  overflow-y: auto;
}

.queue-list {
  padding: 0;
}

.upload-item {
  display: flex;
  align-items: center;
  padding: 12px 20px;
  border-bottom: 1px solid #f1f5f9;
  transition: background-color 0.2s;
}

.upload-item:hover {
  background-color: #f8fafc;
}

.upload-item.selected {
  background-color: #ebf8ff;
  border-color: #bee3f8;
}

.upload-item.uploading {
  border-left: 3px solid #4299e1;
}

.upload-item.completed {
  border-left: 3px solid #48bb78;
}

.upload-item.failed {
  border-left: 3px solid #f56565;
}

.upload-item.paused {
  border-left: 3px solid #ed8936;
}

.item-selection {
  margin-right: 12px;
}

.item-info {
  flex: 1;
  min-width: 0;
  margin-right: 12px;
}

.file-name {
  font-weight: 500;
  color: #2d3748;
  margin-bottom: 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.file-details {
  display: flex;
  gap: 12px;
  font-size: 12px;
  color: #718096;
}

.item-progress {
  width: 200px;
  margin-right: 12px;
}

.progress-bar {
  width: 100%;
  height: 6px;
  background-color: #e2e8f0;
  border-radius: 3px;
  overflow: hidden;
  margin-bottom: 4px;
}

.progress-fill {
  height: 100%;
  background-color: #4299e1;
  transition: width 0.3s ease;
}

.progress-text {
  font-size: 11px;
  color: #718096;
  text-align: center;
}

.upload-speed {
  font-size: 11px;
  color: #4299e1;
  text-align: center;
}

.item-status {
  width: 120px;
  margin-right: 12px;
}

.status-badge {
  display: inline-block;
  padding: 2px 6px;
  border-radius: 12px;
  font-size: 11px;
  font-weight: 500;
  text-transform: uppercase;
}

.status-badge.uploading {
  background-color: #bee3f8;
  color: #2b6cb0;
}

.status-badge.completed {
  background-color: #c6f6d5;
  color: #22543d;
}

.status-badge.failed {
  background-color: #fed7d7;
  color: #c53030;
}

.status-badge.queued {
  background-color: #e2e8f0;
  color: #4a5568;
}

.status-badge.paused {
  background-color: #feebc8;
  color: #c05621;
}

.error-message {
  font-size: 11px;
  color: #e53e3e;
  margin-top: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.item-actions {
  display: flex;
  gap: 6px;
}

.btn-action {
  padding: 4px 8px;
  border: 1px solid #cbd5e0;
  border-radius: 3px;
  background: white;
  color: #4a5568;
  font-size: 11px;
  cursor: pointer;
}

.btn-action:hover {
  background-color: #f7fafc;
}

.btn-action.danger {
  border-color: #feb2b2;
  color: #c53030;
}

.btn-action.danger:hover {
  background-color: #fed7d7;
}

.empty-state {
  padding: 40px 20px;
  text-align: center;
  color: #718096;
  font-style: italic;
}

@media (max-width: 768px) {
  .queue-controls {
    flex-direction: column;
    gap: 12px;
    align-items: stretch;
  }
  
  .filter-controls,
  .global-controls {
    justify-content: center;
  }
  
  .upload-item {
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
  }
  
  .item-progress,
  .item-status {
    width: auto;
    margin-right: 0;
  }
}
`;