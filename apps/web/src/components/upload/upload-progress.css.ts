/**
 * Upload Progress Panel Styles
 * 
 * CSS styles for the upload progress visualization panel including
 * individual file progress bars, batch progress, speed/ETA display,
 * and error messaging.
 */

export const UPLOAD_PROGRESS_STYLES = `
.upload-progress-panel {
  position: fixed;
  display: flex;
  flex-direction: column;
  width: 380px;
  max-height: 520px;
  background: white;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  font-size: 14px;
  z-index: 9999;
  overflow: hidden;
  transition: height 0.3s ease, opacity 0.2s ease;
}

.upload-progress-panel.bottom-right {
  bottom: 24px;
  right: 24px;
}

.upload-progress-panel.bottom-left {
  bottom: 24px;
  left: 24px;
}

.upload-progress-panel.top-right {
  top: 24px;
  right: 24px;
}

.upload-progress-panel.top-left {
  top: 24px;
  left: 24px;
}

/* Header */
.upload-progress-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-bottom: 1px solid #e2e8f0;
  background: #f8fafc;
  border-radius: 12px 12px 0 0;
  user-select: none;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.upload-icon {
  font-size: 16px;
}

.header-title {
  font-weight: 600;
  color: #1a202c;
  font-size: 14px;
}

.upload-count {
  font-size: 12px;
  color: #64748b;
  margin-left: 4px;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 4px;
}

.btn-minimize,
.btn-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: #64748b;
  cursor: pointer;
  font-size: 14px;
  transition: background-color 0.15s, color 0.15s;
}

.btn-minimize:hover,
.btn-close:hover {
  background-color: #e2e8f0;
  color: #334155;
}

.btn-minimize:focus-visible,
.btn-close:focus-visible {
  outline: 2px solid #3b82f6;
  outline-offset: 2px;
}

/* Body */
.upload-progress-body {
  flex: 1;
  overflow-y: auto;
  padding: 12px 16px;
  max-height: 380px;
}

/* Batch Progress Section */
.batch-progress-section {
  margin-bottom: 14px;
  padding-bottom: 14px;
  border-bottom: 1px solid #f1f5f9;
}

.batch-progress-bar {
  width: 100%;
  height: 8px;
  background-color: #e2e8f0;
  border-radius: 4px;
  overflow: hidden;
  margin-bottom: 8px;
}

.batch-progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #3b82f6, #2563eb);
  border-radius: 4px;
  transition: width 0.4s ease;
}

.batch-stats {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 12px;
  color: #64748b;
}

.batch-percentage {
  font-weight: 600;
  color: #1e40af;
}

.batch-speed {
  display: flex;
  align-items: center;
  gap: 4px;
}

.batch-speed::before {
  content: '↑';
  font-size: 10px;
}

.batch-eta {
  display: flex;
  align-items: center;
  gap: 4px;
}

.batch-eta::before {
  content: '⏱';
  font-size: 10px;
}

/* Upload Items List */
.upload-items-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.upload-item {
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid #e2e8f0;
  background: #fafafa;
  transition: border-color 0.2s, background-color 0.2s;
}

.upload-item:hover {
  border-color: #cbd5e1;
}

.upload-item--uploading {
  border-left: 3px solid #3b82f6;
}

.upload-item--completed {
  border-left: 3px solid #22c55e;
  background: #f0fdf4;
}

.upload-item--failed {
  border-left: 3px solid #ef4444;
  background: #fef2f2;
}

.upload-item--paused {
  border-left: 3px solid #f59e0b;
  background: #fffbeb;
}

.upload-item--queued {
  border-left: 3px solid #94a3b8;
}

.upload-item-info {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}

.upload-item-name {
  font-size: 13px;
  font-weight: 500;
  color: #1e293b;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 200px;
}

.upload-item-size {
  font-size: 11px;
  color: #94a3b8;
  white-space: nowrap;
}

.upload-item-progress {
  margin-bottom: 4px;
}

.upload-item-bar {
  width: 100%;
  height: 4px;
  background-color: #e2e8f0;
  border-radius: 2px;
  overflow: hidden;
  margin-bottom: 4px;
}

.upload-item-fill {
  height: 100%;
  border-radius: 2px;
  transition: width 0.3s ease;
}

.upload-item-fill--uploading {
  background: linear-gradient(90deg, #3b82f6, #60a5fa);
}

.upload-item-fill--completed {
  background: #22c55e;
}

.upload-item-fill--failed {
  background: #ef4444;
}

.upload-item-fill--paused {
  background: #f59e0b;
}

.upload-item-fill--queued {
  background: #94a3b8;
}

.upload-item-meta {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 11px;
  color: #64748b;
}

.upload-item-percent {
  font-weight: 500;
}

.upload-item-speed {
  color: #3b82f6;
}

.upload-item-eta {
  color: #64748b;
}

.upload-item-done {
  color: #16a34a;
  font-weight: 500;
}

.upload-item-error {
  color: #dc2626;
  font-weight: 500;
}

.upload-item-paused {
  color: #d97706;
  font-weight: 500;
}

.upload-item-actions {
  display: flex;
  gap: 4px;
  margin-top: 6px;
}

.btn-item-action {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border: 1px solid #e2e8f0;
  border-radius: 5px;
  background: white;
  color: #64748b;
  cursor: pointer;
  font-size: 12px;
  transition: all 0.15s;
}

.btn-item-action:hover {
  background-color: #f1f5f9;
  border-color: #94a3b8;
  color: #334155;
}

.btn-item-action:focus-visible {
  outline: 2px solid #3b82f6;
  outline-offset: 2px;
}

.btn-item-action--danger:hover {
  background-color: #fef2f2;
  border-color: #fca5a5;
  color: #dc2626;
}

.upload-item-overflow {
  text-align: center;
  padding: 8px;
  font-size: 12px;
  color: #64748b;
  font-style: italic;
}

/* Error Section */
.upload-errors-section {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid #fecaca;
}

.upload-error-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px;
  border-radius: 8px;
  background: #fef2f2;
  border: 1px solid #fecaca;
  margin-bottom: 8px;
}

.upload-error-item:last-child {
  margin-bottom: 0;
}

.error-icon {
  font-size: 16px;
  flex-shrink: 0;
  margin-top: 1px;
}

.error-content {
  flex: 1;
  min-width: 0;
}

.error-file-name {
  font-size: 13px;
  font-weight: 500;
  color: #991b1b;
  margin-bottom: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.error-message {
  font-size: 12px;
  color: #b91c1c;
  margin-bottom: 4px;
}

.error-suggestion {
  font-size: 11px;
  color: #6b7280;
  font-style: italic;
}

.btn-error-retry {
  flex-shrink: 0;
  padding: 6px 12px;
  border: 1px solid #fca5a5;
  border-radius: 6px;
  background: white;
  color: #dc2626;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
}

.btn-error-retry:hover {
  background-color: #fef2f2;
  border-color: #f87171;
}

.btn-error-retry:focus-visible {
  outline: 2px solid #3b82f6;
  outline-offset: 2px;
}

/* Footer */
.upload-progress-footer {
  display: flex;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid #e2e8f0;
  background: #f8fafc;
  border-radius: 0 0 12px 12px;
}

.btn-footer {
  flex: 1;
  padding: 8px 12px;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  background: white;
  color: #475569;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
}

.btn-footer:hover {
  background-color: #f1f5f9;
  border-color: #94a3b8;
}

.btn-footer:focus-visible {
  outline: 2px solid #3b82f6;
  outline-offset: 2px;
}

/* Responsive */
@media (max-width: 480px) {
  .upload-progress-panel {
    width: calc(100vw - 32px);
    left: 16px !important;
    right: 16px !important;
    max-width: none;
  }

  .upload-progress-panel.bottom-right,
  .upload-progress-panel.bottom-left {
    bottom: 16px;
  }

  .upload-progress-panel.top-right,
  .upload-progress-panel.top-left {
    top: 16px;
  }
}

/* Reduced motion */
@media (prefers-reduced-motion: reduce) {
  .batch-progress-fill,
  .upload-item-fill,
  .upload-progress-panel,
  .btn-item-action,
  .btn-footer,
  .btn-error-retry {
    transition: none;
  }
}

/* High contrast */
@media (forced-colors: active) {
  .upload-progress-panel {
    border: 2px solid CanvasText;
  }

  .upload-item-bar,
  .batch-progress-bar {
    border: 1px solid CanvasText;
  }

  .upload-item-fill,
  .batch-progress-fill {
    background: Highlight;
  }
}
`;
