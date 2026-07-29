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
  VideoMetadataForm,
  type VideoMetadataFormData,
  type VideoMetadataFormConfig,
  type ProjectOption,
  type TagSuggestion,
} from './video-metadata-form.js';