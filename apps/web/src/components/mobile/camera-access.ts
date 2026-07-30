/**
 * Camera Access Integration
 * 
 * Provides mobile camera access for capturing photos and videos directly
 * from the device camera. Integrates with the upload flow for seamless
 * capture-to-upload experience on mobile devices.
 * 
 * Requirements: 10.8
 */

export interface CameraOptions {
  /** Whether to capture photo or video */
  mode: 'photo' | 'video';
  /** Which camera to prefer (default: 'environment' for rear camera) */
  facingMode?: 'user' | 'environment';
  /** Maximum video duration in seconds (video mode only) */
  maxDuration?: number;
  /** Image quality for photos (0-1, default: 0.85) */
  quality?: number;
  /** Maximum resolution width */
  maxWidth?: number;
  /** Maximum resolution height */
  maxHeight?: number;
}

export interface CaptureResult {
  /** The captured file (photo or video) */
  file: File;
  /** Object URL for preview */
  previewUrl: string;
  /** MIME type of the captured content */
  mimeType: string;
  /** Width of captured content */
  width?: number;
  /** Height of captured content */
  height?: number;
  /** Duration in seconds (video only) */
  duration?: number;
}

export type CameraPermissionState = 'prompt' | 'granted' | 'denied' | 'unavailable';

/**
 * Checks whether the device has camera access capabilities.
 */
export function isCameraAvailable(): boolean {
  return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
}

/**
 * Checks whether the MediaRecorder API is available for video capture.
 */
export function isVideoCaptureAvailable(): boolean {
  return typeof MediaRecorder !== 'undefined';
}

/**
 * Queries the current camera permission state.
 */
export async function getCameraPermissionState(): Promise<CameraPermissionState> {
  if (!isCameraAvailable()) {
    return 'unavailable';
  }

  try {
    // Use Permissions API if available
    if (navigator.permissions && navigator.permissions.query) {
      const result = await navigator.permissions.query({ name: 'camera' as PermissionName });
      return result.state as CameraPermissionState;
    }
    // Fallback: assume prompt state if Permissions API not available
    return 'prompt';
  } catch {
    // Some browsers don't support querying camera permission
    return 'prompt';
  }
}

/**
 * Requests camera access and returns a MediaStream.
 * Handles permission errors and provides user-friendly error messages.
 */
export async function requestCameraAccess(
  facingMode: 'user' | 'environment' = 'environment'
): Promise<MediaStream> {
  if (!isCameraAvailable()) {
    throw new CameraError(
      'camera-unavailable',
      'Camera is not available on this device or browser.'
    );
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: facingMode },
        width: { ideal: 1920 },
        height: { ideal: 1080 },
      },
      audio: false,
    });
    return stream;
  } catch (error) {
    const err = error as DOMException;
    if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
      throw new CameraError(
        'permission-denied',
        'Camera access was denied. Please enable camera permission in your browser settings.'
      );
    }
    if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
      throw new CameraError(
        'no-camera',
        'No camera was found on this device.'
      );
    }
    if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
      throw new CameraError(
        'camera-in-use',
        'Camera is currently in use by another application.'
      );
    }
    throw new CameraError(
      'unknown',
      `Failed to access camera: ${err.message || 'Unknown error'}`
    );
  }
}

/**
 * Captures a photo from the camera using the device's native capture input.
 * This uses the HTML input[type=file] with capture attribute for best mobile UX.
 */
export function capturePhotoNative(options: Partial<CameraOptions> = {}): Promise<CaptureResult> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.capture = options.facingMode === 'user' ? 'user' : 'environment';
    input.style.display = 'none';

    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      if (!file) {
        cleanup();
        reject(new CameraError('cancelled', 'Photo capture was cancelled.'));
        return;
      }

      try {
        const result = await processImageFile(file, options);
        cleanup();
        resolve(result);
      } catch (error) {
        cleanup();
        reject(error);
      }
    });

    input.addEventListener('cancel', () => {
      cleanup();
      reject(new CameraError('cancelled', 'Photo capture was cancelled.'));
    });

    function cleanup() {
      if (input.parentNode) {
        input.parentNode.removeChild(input);
      }
    }

    document.body.appendChild(input);
    input.click();
  });
}

/**
 * Captures a video from the camera using the device's native capture input.
 */
export function captureVideoNative(): Promise<CaptureResult> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'video/*';
    input.capture = 'environment';
    input.style.display = 'none';

    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      if (!file) {
        cleanup();
        reject(new CameraError('cancelled', 'Video capture was cancelled.'));
        return;
      }

      const previewUrl = URL.createObjectURL(file);
      cleanup();
      resolve({
        file,
        previewUrl,
        mimeType: file.type || 'video/mp4',
      });
    });

    input.addEventListener('cancel', () => {
      cleanup();
      reject(new CameraError('cancelled', 'Video capture was cancelled.'));
    });

    function cleanup() {
      if (input.parentNode) {
        input.parentNode.removeChild(input);
      }
    }

    document.body.appendChild(input);
    input.click();
  });
}

/**
 * Processes a captured image file, optionally resizing it.
 */
async function processImageFile(
  file: File,
  options: Partial<CameraOptions> = {}
): Promise<CaptureResult> {
  const previewUrl = URL.createObjectURL(file);
  const quality = options.quality ?? 0.85;
  const maxWidth = options.maxWidth;
  const maxHeight = options.maxHeight;

  // If no resizing needed, return the file directly
  if (!maxWidth && !maxHeight) {
    return {
      file,
      previewUrl,
      mimeType: file.type || 'image/jpeg',
    };
  }

  // Resize the image using canvas
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;

      // Calculate resized dimensions maintaining aspect ratio
      if (maxWidth && width > maxWidth) {
        height = Math.round(height * (maxWidth / width));
        width = maxWidth;
      }
      if (maxHeight && height > maxHeight) {
        width = Math.round(width * (maxHeight / height));
        height = maxHeight;
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve({ file, previewUrl, mimeType: file.type || 'image/jpeg', width: img.width, height: img.height });
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            resolve({ file, previewUrl, mimeType: file.type || 'image/jpeg', width, height });
            return;
          }

          const resizedFile = new File([blob], file.name, {
            type: 'image/jpeg',
            lastModified: file.lastModified,
          });

          // Revoke the old preview URL and create a new one
          URL.revokeObjectURL(previewUrl);
          const newPreviewUrl = URL.createObjectURL(resizedFile);

          resolve({
            file: resizedFile,
            previewUrl: newPreviewUrl,
            mimeType: 'image/jpeg',
            width,
            height,
          });
        },
        'image/jpeg',
        quality
      );
    };

    img.onerror = () => {
      reject(new CameraError('processing-failed', 'Failed to process the captured image.'));
    };

    img.src = previewUrl;
  });
}

/**
 * Stops all tracks in a MediaStream and releases the camera.
 */
export function releaseCamera(stream: MediaStream): void {
  stream.getTracks().forEach(track => track.stop());
}

/**
 * Custom error class for camera-related errors.
 */
export class CameraError extends Error {
  public readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'CameraError';
    this.code = code;
  }
}
