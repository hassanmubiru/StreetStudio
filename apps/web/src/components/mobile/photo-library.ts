/**
 * Photo Library Integration
 * 
 * Provides access to the device's photo and video library for selecting
 * media to upload. Integrates with the upload flow for a seamless
 * select-and-upload experience on mobile devices.
 * 
 * Requirements: 10.8
 */

export interface PhotoLibraryOptions {
  /** Which media types to allow (default: 'all') */
  mediaType?: 'photo' | 'video' | 'all';
  /** Whether to allow multiple file selection (default: false) */
  multiple?: boolean;
  /** Maximum number of files when multiple is true (default: 10) */
  maxFiles?: number;
  /** Maximum file size in bytes (default: no limit) */
  maxFileSize?: number;
  /** Accepted MIME types (overrides mediaType if provided) */
  acceptedTypes?: string[];
}

export interface SelectedMedia {
  /** The selected file */
  file: File;
  /** Object URL for preview */
  previewUrl: string;
  /** MIME type of the file */
  mimeType: string;
  /** File name */
  name: string;
  /** File size in bytes */
  size: number;
  /** Whether this is an image */
  isImage: boolean;
  /** Whether this is a video */
  isVideo: boolean;
}

export interface PhotoLibraryResult {
  /** Array of selected media items */
  items: SelectedMedia[];
  /** Total count of selected items */
  count: number;
  /** Total size of all selected files in bytes */
  totalSize: number;
}

/**
 * Opens the device photo library for media selection.
 * Uses the native file picker with appropriate accept attributes.
 */
export function openPhotoLibrary(options: PhotoLibraryOptions = {}): Promise<PhotoLibraryResult> {
  const {
    mediaType = 'all',
    multiple = false,
    maxFiles = 10,
    maxFileSize,
    acceptedTypes,
  } = options;

  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.style.display = 'none';

    // Set accept attribute based on media type
    if (acceptedTypes && acceptedTypes.length > 0) {
      input.accept = acceptedTypes.join(',');
    } else {
      switch (mediaType) {
        case 'photo':
          input.accept = 'image/*';
          break;
        case 'video':
          input.accept = 'video/*';
          break;
        case 'all':
        default:
          input.accept = 'image/*,video/*';
          break;
      }
    }

    if (multiple) {
      input.multiple = true;
    }

    input.addEventListener('change', () => {
      const files = input.files;
      if (!files || files.length === 0) {
        cleanup();
        reject(new PhotoLibraryError('cancelled', 'No files were selected.'));
        return;
      }

      try {
        const result = processSelectedFiles(files, { maxFiles, maxFileSize });
        cleanup();
        resolve(result);
      } catch (error) {
        cleanup();
        reject(error);
      }
    });

    input.addEventListener('cancel', () => {
      cleanup();
      reject(new PhotoLibraryError('cancelled', 'File selection was cancelled.'));
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
 * Process selected files from the file input, applying validations.
 */
function processSelectedFiles(
  files: FileList,
  constraints: { maxFiles: number; maxFileSize?: number }
): PhotoLibraryResult {
  const items: SelectedMedia[] = [];
  const fileCount = Math.min(files.length, constraints.maxFiles);

  for (let i = 0; i < fileCount; i++) {
    const file = files[i];
    if (!file) continue;

    // Validate file size
    if (constraints.maxFileSize && file.size > constraints.maxFileSize) {
      throw new PhotoLibraryError(
        'file-too-large',
        `File "${file.name}" exceeds the maximum size of ${formatFileSize(constraints.maxFileSize)}.`
      );
    }

    // Validate MIME type
    if (!isMediaFile(file)) {
      throw new PhotoLibraryError(
        'invalid-type',
        `File "${file.name}" is not a supported media type.`
      );
    }

    const previewUrl = URL.createObjectURL(file);
    const isImage = file.type.startsWith('image/');
    const isVideo = file.type.startsWith('video/');

    items.push({
      file,
      previewUrl,
      mimeType: file.type,
      name: file.name,
      size: file.size,
      isImage,
      isVideo,
    });
  }

  if (items.length === 0) {
    throw new PhotoLibraryError('no-valid-files', 'No valid media files were selected.');
  }

  const totalSize = items.reduce((sum, item) => sum + item.size, 0);

  return {
    items,
    count: items.length,
    totalSize,
  };
}

/**
 * Checks if a file is a supported media file.
 */
function isMediaFile(file: File): boolean {
  return file.type.startsWith('image/') || file.type.startsWith('video/');
}

/**
 * Revokes all preview URLs for the selected media items.
 * Should be called when the previews are no longer needed.
 */
export function revokeMediaPreviews(result: PhotoLibraryResult): void {
  for (const item of result.items) {
    URL.revokeObjectURL(item.previewUrl);
  }
}

/**
 * Creates an upload-ready file list from a PhotoLibraryResult.
 * Prepares files for the upload service with metadata.
 */
export function prepareForUpload(result: PhotoLibraryResult): Array<{
  file: File;
  metadata: {
    name: string;
    size: number;
    mimeType: string;
    isImage: boolean;
    isVideo: boolean;
    source: 'photo-library';
  };
}> {
  return result.items.map(item => ({
    file: item.file,
    metadata: {
      name: item.name,
      size: item.size,
      mimeType: item.mimeType,
      isImage: item.isImage,
      isVideo: item.isVideo,
      source: 'photo-library' as const,
    },
  }));
}

/**
 * Gets the thumbnail dimensions for a media item preview.
 * Returns appropriate dimensions based on the media type.
 */
export function getThumbnailDimensions(item: SelectedMedia): { width: number; height: number } {
  if (item.isVideo) {
    return { width: 160, height: 90 }; // 16:9 aspect ratio
  }
  return { width: 120, height: 120 }; // Square for photos
}

/**
 * Formats a file size in bytes to a human-readable string.
 */
function formatFileSize(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(1)} ${units[unitIndex]}`;
}

/**
 * Custom error class for photo library operations.
 */
export class PhotoLibraryError extends Error {
  public readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'PhotoLibraryError';
    this.code = code;
  }
}
