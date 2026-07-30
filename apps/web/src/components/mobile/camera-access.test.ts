/**
 * Unit tests for Camera Access Integration
 * 
 * Requirements: 10.8
 */

// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  isCameraAvailable,
  isVideoCaptureAvailable,
  getCameraPermissionState,
  requestCameraAccess,
  releaseCamera,
  CameraError,
} from './camera-access.js';

describe('Camera Access Integration', () => {
  beforeEach(() => {
    // Setup default mediaDevices mock
    Object.defineProperty(navigator, 'mediaDevices', {
      writable: true,
      value: {
        getUserMedia: vi.fn(),
        enumerateDevices: vi.fn(),
      },
    });

    Object.defineProperty(navigator, 'permissions', {
      writable: true,
      value: {
        query: vi.fn(),
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('isCameraAvailable', () => {
    it('returns true when mediaDevices.getUserMedia is available', () => {
      expect(isCameraAvailable()).toBe(true);
    });

    it('returns false when mediaDevices is not available', () => {
      Object.defineProperty(navigator, 'mediaDevices', {
        writable: true,
        value: undefined,
      });
      expect(isCameraAvailable()).toBe(false);
    });

    it('returns false when getUserMedia is not available', () => {
      Object.defineProperty(navigator, 'mediaDevices', {
        writable: true,
        value: {},
      });
      expect(isCameraAvailable()).toBe(false);
    });
  });

  describe('isVideoCaptureAvailable', () => {
    it('returns true when MediaRecorder is defined', () => {
      // MediaRecorder is typically available in jsdom test env since we mock it
      (global as any).MediaRecorder = vi.fn();
      expect(isVideoCaptureAvailable()).toBe(true);
    });

    it('returns false when MediaRecorder is undefined', () => {
      const original = (global as any).MediaRecorder;
      delete (global as any).MediaRecorder;
      expect(isVideoCaptureAvailable()).toBe(false);
      (global as any).MediaRecorder = original;
    });
  });

  describe('getCameraPermissionState', () => {
    it('returns "unavailable" when camera is not available', async () => {
      Object.defineProperty(navigator, 'mediaDevices', {
        writable: true,
        value: undefined,
      });
      const state = await getCameraPermissionState();
      expect(state).toBe('unavailable');
    });

    it('returns permission state from Permissions API', async () => {
      (navigator.permissions.query as ReturnType<typeof vi.fn>).mockResolvedValue({
        state: 'granted',
      });

      const state = await getCameraPermissionState();
      expect(state).toBe('granted');
    });

    it('returns "prompt" when Permissions API throws', async () => {
      (navigator.permissions.query as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Not supported')
      );

      const state = await getCameraPermissionState();
      expect(state).toBe('prompt');
    });

    it('returns "prompt" when Permissions API is not available', async () => {
      Object.defineProperty(navigator, 'permissions', {
        writable: true,
        value: undefined,
      });

      const state = await getCameraPermissionState();
      expect(state).toBe('prompt');
    });

    it('returns "denied" when permission is denied', async () => {
      (navigator.permissions.query as ReturnType<typeof vi.fn>).mockResolvedValue({
        state: 'denied',
      });

      const state = await getCameraPermissionState();
      expect(state).toBe('denied');
    });
  });

  describe('requestCameraAccess', () => {
    it('throws CameraError with code "camera-unavailable" when no mediaDevices', async () => {
      Object.defineProperty(navigator, 'mediaDevices', {
        writable: true,
        value: undefined,
      });

      await expect(requestCameraAccess()).rejects.toThrow(CameraError);
      try {
        await requestCameraAccess();
      } catch (error) {
        expect((error as CameraError).code).toBe('camera-unavailable');
      }
    });

    it('returns a MediaStream on success', async () => {
      const mockStream = { getTracks: () => [] } as unknown as MediaStream;
      (navigator.mediaDevices.getUserMedia as ReturnType<typeof vi.fn>).mockResolvedValue(mockStream);

      const stream = await requestCameraAccess();
      expect(stream).toBe(mockStream);
    });

    it('passes facingMode constraint to getUserMedia', async () => {
      const mockStream = { getTracks: () => [] } as unknown as MediaStream;
      (navigator.mediaDevices.getUserMedia as ReturnType<typeof vi.fn>).mockResolvedValue(mockStream);

      await requestCameraAccess('user');

      expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith(
        expect.objectContaining({
          video: expect.objectContaining({
            facingMode: { ideal: 'user' },
          }),
        })
      );
    });

    it('uses environment facing mode by default', async () => {
      const mockStream = { getTracks: () => [] } as unknown as MediaStream;
      (navigator.mediaDevices.getUserMedia as ReturnType<typeof vi.fn>).mockResolvedValue(mockStream);

      await requestCameraAccess();

      expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith(
        expect.objectContaining({
          video: expect.objectContaining({
            facingMode: { ideal: 'environment' },
          }),
        })
      );
    });

    it('throws CameraError with code "permission-denied" on NotAllowedError', async () => {
      const domError = new DOMException('Permission denied', 'NotAllowedError');
      (navigator.mediaDevices.getUserMedia as ReturnType<typeof vi.fn>).mockRejectedValue(domError);

      try {
        await requestCameraAccess();
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(CameraError);
        expect((error as CameraError).code).toBe('permission-denied');
      }
    });

    it('throws CameraError with code "no-camera" on NotFoundError', async () => {
      const domError = new DOMException('No camera found', 'NotFoundError');
      (navigator.mediaDevices.getUserMedia as ReturnType<typeof vi.fn>).mockRejectedValue(domError);

      try {
        await requestCameraAccess();
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(CameraError);
        expect((error as CameraError).code).toBe('no-camera');
      }
    });

    it('throws CameraError with code "camera-in-use" on NotReadableError', async () => {
      const domError = new DOMException('Camera in use', 'NotReadableError');
      (navigator.mediaDevices.getUserMedia as ReturnType<typeof vi.fn>).mockRejectedValue(domError);

      try {
        await requestCameraAccess();
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(CameraError);
        expect((error as CameraError).code).toBe('camera-in-use');
      }
    });

    it('throws CameraError with code "unknown" on unexpected errors', async () => {
      const domError = new DOMException('Something else', 'AbortError');
      (navigator.mediaDevices.getUserMedia as ReturnType<typeof vi.fn>).mockRejectedValue(domError);

      try {
        await requestCameraAccess();
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(CameraError);
        expect((error as CameraError).code).toBe('unknown');
      }
    });
  });

  describe('releaseCamera', () => {
    it('stops all tracks in the stream', () => {
      const track1 = { stop: vi.fn() };
      const track2 = { stop: vi.fn() };
      const mockStream = {
        getTracks: () => [track1, track2],
      } as unknown as MediaStream;

      releaseCamera(mockStream);

      expect(track1.stop).toHaveBeenCalledTimes(1);
      expect(track2.stop).toHaveBeenCalledTimes(1);
    });
  });

  describe('CameraError', () => {
    it('has the correct name', () => {
      const error = new CameraError('test-code', 'Test message');
      expect(error.name).toBe('CameraError');
    });

    it('has the correct code', () => {
      const error = new CameraError('permission-denied', 'Permission denied');
      expect(error.code).toBe('permission-denied');
    });

    it('has the correct message', () => {
      const error = new CameraError('test', 'Test message');
      expect(error.message).toBe('Test message');
    });

    it('is an instance of Error', () => {
      const error = new CameraError('test', 'Test');
      expect(error).toBeInstanceOf(Error);
    });
  });
});
