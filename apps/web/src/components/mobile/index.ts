/**
 * Mobile-Specific Features
 * 
 * Exports all mobile-specific functionality including pull-to-refresh,
 * camera access, photo library integration, and mobile notifications.
 * 
 * Requirements: 10.6, 10.7, 10.8, 10.9
 */

export {
  PullToRefresh,
  PullToRefreshCSS,
  setupPullToRefreshCSS,
  type PullToRefreshOptions,
  type PullToRefreshState,
} from './pull-to-refresh.js';

export {
  isCameraAvailable,
  isVideoCaptureAvailable,
  getCameraPermissionState,
  requestCameraAccess,
  capturePhotoNative,
  captureVideoNative,
  releaseCamera,
  CameraError,
  type CameraOptions,
  type CaptureResult,
  type CameraPermissionState,
} from './camera-access.js';

export {
  openPhotoLibrary,
  revokeMediaPreviews,
  prepareForUpload,
  getThumbnailDimensions,
  PhotoLibraryError,
  type PhotoLibraryOptions,
  type SelectedMedia,
  type PhotoLibraryResult,
} from './photo-library.js';

export {
  MobileNotificationManager,
  urlBase64ToUint8Array,
  NotificationError,
  type NotificationOptions,
  type NotificationAction,
  type NotificationPermissionState,
  type PushSubscriptionInfo,
  type NotificationEventHandler,
} from './mobile-notifications.js';
