/**
 * Unit tests for Photo Library Integration
 * 
 * Requirements: 10.8
 */

// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  openPhotoLibrary,
  revokeMediaPreviews,
  prepareForUpload,
  getThumbnailDimensions,
  PhotoLibraryError,
  type PhotoLibraryResult,
  type SelectedMedia,
} from './photo-library.js';

// Mock URL.createObjectURL and revokeObjectURL
const mockCreateObjectURL = vi.fn((blob: Blob) => `blob:mock-url-${Math.random()}`);
const mockRevokeObjectURL = vi.fn();

Object.defineProperty(URL, 'createObjectURL', {
  writable: true,
  value: mockCreateObjectURL,
});
Object.defineProperty(URL, 'revokeObjectURL', {
  writable: true,
  value: mockRevokeObjectURL,
});

describe('Photo Library Integration', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    mockCreateObjectURL.mockClear();
    mockRevokeObjectURL.mockClear();
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  describe('openPhotoLibrary', () => {
    it('creates a file input element', () => {
      // We can't fully test file picker interaction since it requires user gesture,
      // but we can verify the input is created with correct attributes
      const promise = openPhotoLibrary({ mediaType: 'photo' });

      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      expect(input).not.toBeNull();
      expect(input.accept).toBe('image/*');

      // Simulate cancel to clean up
      input.dispatchEvent(new Event('cancel'));
      return promise.catch(() => {}); // Suppress expected rejection
    });

    it('sets accept to video/* for video media type', () => {
      const promise = openPhotoLibrary({ mediaType: 'video' });

      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      expect(input.accept).toBe('video/*');

      input.dispatchEvent(new Event('cancel'));
      return promise.catch(() => {});
    });

    it('sets accept to image/*,video/* for all media type', () => {
      const promise = openPhotoLibrary({ mediaType: 'all' });

      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      expect(input.accept).toBe('image/*,video/*');

      input.dispatchEvent(new Event('cancel'));
      return promise.catch(() => {});
    });

    it('uses custom accepted types when provided', () => {
      const promise = openPhotoLibrary({ acceptedTypes: ['image/png', 'image/jpeg'] });

      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      expect(input.accept).toBe('image/png,image/jpeg');

      input.dispatchEvent(new Event('cancel'));
      return promise.catch(() => {});
    });

    it('sets multiple attribute when multiple is true', () => {
      const promise = openPhotoLibrary({ multiple: true });

      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      expect(input.multiple).toBe(true);

      input.dispatchEvent(new Event('cancel'));
      return promise.catch(() => {});
    });

    it('does not set multiple attribute when multiple is false', () => {
      const promise = openPhotoLibrary({ multiple: false });

      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      expect(input.multiple).toBe(false);

      input.dispatchEvent(new Event('cancel'));
      return promise.catch(() => {});
    });

    it('rejects with PhotoLibraryError on cancel', async () => {
      const promise = openPhotoLibrary();

      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      input.dispatchEvent(new Event('cancel'));

      await expect(promise).rejects.toThrow(PhotoLibraryError);
      await expect(promise).rejects.toThrow('File selection was cancelled.');
    });

    it('resolves with selected files on change', async () => {
      const promise = openPhotoLibrary();

      const input = document.querySelector('input[type="file"]') as HTMLInputElement;

      // Create mock file
      const file = new File(['test content'], 'photo.jpg', { type: 'image/jpeg' });
      Object.defineProperty(input, 'files', {
        value: createFileList([file]),
      });

      input.dispatchEvent(new Event('change'));

      const result = await promise;
      expect(result.count).toBe(1);
      expect(result.items[0]!.name).toBe('photo.jpg');
      expect(result.items[0]!.isImage).toBe(true);
      expect(result.items[0]!.isVideo).toBe(false);
    });

    it('rejects when file exceeds maxFileSize', async () => {
      const promise = openPhotoLibrary({ maxFileSize: 100 });

      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      const file = new File(['x'.repeat(200)], 'large.jpg', { type: 'image/jpeg' });
      Object.defineProperty(input, 'files', {
        value: createFileList([file]),
      });

      input.dispatchEvent(new Event('change'));

      await expect(promise).rejects.toThrow(PhotoLibraryError);
      await expect(promise).rejects.toThrow('exceeds the maximum size');
    });

    it('rejects when file is not a media type', async () => {
      const promise = openPhotoLibrary();

      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      const file = new File(['data'], 'document.pdf', { type: 'application/pdf' });
      Object.defineProperty(input, 'files', {
        value: createFileList([file]),
      });

      input.dispatchEvent(new Event('change'));

      await expect(promise).rejects.toThrow(PhotoLibraryError);
      await expect(promise).rejects.toThrow('not a supported media type');
    });

    it('limits files to maxFiles count', async () => {
      const promise = openPhotoLibrary({ multiple: true, maxFiles: 2 });

      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      const files = [
        new File(['a'], 'photo1.jpg', { type: 'image/jpeg' }),
        new File(['b'], 'photo2.jpg', { type: 'image/jpeg' }),
        new File(['c'], 'photo3.jpg', { type: 'image/jpeg' }),
      ];
      Object.defineProperty(input, 'files', {
        value: createFileList(files),
      });

      input.dispatchEvent(new Event('change'));

      const result = await promise;
      expect(result.count).toBe(2);
    });

    it('calculates total size of selected files', async () => {
      const promise = openPhotoLibrary({ multiple: true });

      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      const files = [
        new File(['aaaa'], 'photo1.jpg', { type: 'image/jpeg' }),
        new File(['bb'], 'photo2.jpg', { type: 'image/jpeg' }),
      ];
      Object.defineProperty(input, 'files', {
        value: createFileList(files),
      });

      input.dispatchEvent(new Event('change'));

      const result = await promise;
      expect(result.totalSize).toBe(6); // 4 + 2
    });

    it('correctly identifies video files', async () => {
      const promise = openPhotoLibrary({ mediaType: 'all' });

      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      const file = new File(['video data'], 'clip.mp4', { type: 'video/mp4' });
      Object.defineProperty(input, 'files', {
        value: createFileList([file]),
      });

      input.dispatchEvent(new Event('change'));

      const result = await promise;
      expect(result.items[0]!.isVideo).toBe(true);
      expect(result.items[0]!.isImage).toBe(false);
    });

    it('cleans up input element after selection', async () => {
      const promise = openPhotoLibrary();

      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      const file = new File(['test'], 'photo.jpg', { type: 'image/jpeg' });
      Object.defineProperty(input, 'files', {
        value: createFileList([file]),
      });

      input.dispatchEvent(new Event('change'));
      await promise;

      expect(document.querySelector('input[type="file"]')).toBeNull();
    });
  });

  describe('revokeMediaPreviews', () => {
    it('revokes all preview URLs', () => {
      const result: PhotoLibraryResult = {
        items: [
          createSelectedMedia('photo1.jpg', 'blob:url1'),
          createSelectedMedia('photo2.jpg', 'blob:url2'),
        ],
        count: 2,
        totalSize: 200,
      };

      revokeMediaPreviews(result);

      expect(mockRevokeObjectURL).toHaveBeenCalledTimes(2);
      expect(mockRevokeObjectURL).toHaveBeenCalledWith('blob:url1');
      expect(mockRevokeObjectURL).toHaveBeenCalledWith('blob:url2');
    });
  });

  describe('prepareForUpload', () => {
    it('prepares files with upload metadata', () => {
      const result: PhotoLibraryResult = {
        items: [
          createSelectedMedia('photo.jpg', 'blob:url', true, false),
        ],
        count: 1,
        totalSize: 100,
      };

      const prepared = prepareForUpload(result);

      expect(prepared).toHaveLength(1);
      expect(prepared[0]!.metadata.source).toBe('photo-library');
      expect(prepared[0]!.metadata.isImage).toBe(true);
      expect(prepared[0]!.metadata.isVideo).toBe(false);
      expect(prepared[0]!.metadata.name).toBe('photo.jpg');
    });

    it('handles video files', () => {
      const result: PhotoLibraryResult = {
        items: [
          createSelectedMedia('video.mp4', 'blob:url', false, true),
        ],
        count: 1,
        totalSize: 5000,
      };

      const prepared = prepareForUpload(result);

      expect(prepared[0]!.metadata.isVideo).toBe(true);
      expect(prepared[0]!.metadata.isImage).toBe(false);
    });

    it('preserves file references', () => {
      const file = new File(['data'], 'test.jpg', { type: 'image/jpeg' });
      const result: PhotoLibraryResult = {
        items: [{
          file,
          previewUrl: 'blob:url',
          mimeType: 'image/jpeg',
          name: 'test.jpg',
          size: 4,
          isImage: true,
          isVideo: false,
        }],
        count: 1,
        totalSize: 4,
      };

      const prepared = prepareForUpload(result);
      expect(prepared[0]!.file).toBe(file);
    });
  });

  describe('getThumbnailDimensions', () => {
    it('returns 120x120 for images', () => {
      const item = createSelectedMedia('photo.jpg', 'url', true, false);
      const dims = getThumbnailDimensions(item);
      expect(dims.width).toBe(120);
      expect(dims.height).toBe(120);
    });

    it('returns 160x90 for videos', () => {
      const item = createSelectedMedia('video.mp4', 'url', false, true);
      const dims = getThumbnailDimensions(item);
      expect(dims.width).toBe(160);
      expect(dims.height).toBe(90);
    });
  });

  describe('PhotoLibraryError', () => {
    it('has the correct name', () => {
      const error = new PhotoLibraryError('test-code', 'Test message');
      expect(error.name).toBe('PhotoLibraryError');
    });

    it('has the correct code', () => {
      const error = new PhotoLibraryError('cancelled', 'Cancelled');
      expect(error.code).toBe('cancelled');
    });

    it('has the correct message', () => {
      const error = new PhotoLibraryError('test', 'Test message');
      expect(error.message).toBe('Test message');
    });

    it('is an instance of Error', () => {
      const error = new PhotoLibraryError('test', 'Test');
      expect(error).toBeInstanceOf(Error);
    });
  });
});

// Helper functions

function createFileList(files: File[]): FileList {
  const fileList = {
    length: files.length,
    item: (index: number) => files[index] || null,
    [Symbol.iterator]: function* () {
      for (const file of files) yield file;
    },
  } as unknown as FileList;

  // Add numeric indices
  files.forEach((file, index) => {
    Object.defineProperty(fileList, index, { value: file, enumerable: true });
  });

  return fileList;
}

function createSelectedMedia(
  name: string,
  previewUrl: string,
  isImage = true,
  isVideo = false
): SelectedMedia {
  return {
    file: new File(['data'], name, { type: isImage ? 'image/jpeg' : 'video/mp4' }),
    previewUrl,
    mimeType: isImage ? 'image/jpeg' : 'video/mp4',
    name,
    size: 100,
    isImage,
    isVideo,
  };
}
