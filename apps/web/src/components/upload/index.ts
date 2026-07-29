/**
 * Upload Components
 * 
 * Export all upload-related UI components for the chunked upload system
 */

export { 
  UploadManagerComponent, 
  type UploadManagerConfig,
  UPLOAD_MANAGER_STYLES 
} from './upload-manager.js';

export { 
  UploadProgressWidget,
  type UploadProgressConfig
} from './upload-progress-widget.js';

export { 
  UploadQueuePanel,
  type UploadQueueConfig
} from './upload-queue-panel.js';

export {
  UploadProgressInterface,
  type UploadProgressConfig as UploadProgressPanelConfig,
  type SpeedMetrics,
  type UploadErrorInfo
} from './upload-progress.js';

export {
  UploadNotificationService,
  type NotificationOptions
} from './upload-notification.js';

export {
  VideoMetadataForm,
  type VideoMetadataFormData,
  type VideoMetadataFormConfig,
  type ProjectOption,
  type TagSuggestion
} from './video-metadata-form.js';

export { UPLOAD_PROGRESS_STYLES } from './upload-progress.css.js';
