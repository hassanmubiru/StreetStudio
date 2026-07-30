/**
 * Browser Extension Communication Interface Tests
 *
 * Tests for message passing, extension detection,
 * version comparison, and authentication handoff.
 *
 * Validates: Requirements 15.4
 */

// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  BrowserExtensionBridge,
  generateMessageId,
  createMessage,
  compareVersions,
  isVersionSupported,
  getExtensionStatusInfo,
  MESSAGE_ORIGIN,
  EXTENSION_ORIGIN,
  MIN_SUPPORTED_VERSION,
  type ExtensionMessage,
  type AuthHandoffPayload,
  type RecordingStartPayload,
  type SettingsSyncPayload,
  type BrowserExtensionCallbacks,
} from './browser-extension-integration.js';

// --- Utility Function Tests ---

describe('generateMessageId', () => {
  it('generates unique IDs', () => {
    const id1 = generateMessageId();
    const id2 = generateMessageId();
    expect(id1).not.toBe(id2);
  });

  it('starts with msg_ prefix', () => {
    const id = generateMessageId();
    expect(id.startsWith('msg_')).toBe(true);
  });
});

describe('createMessage', () => {
  it('creates a message with the correct type', () => {
    const msg = createMessage('ping');
    expect(msg.type).toBe('ping');
    expect(msg.id).toBeTruthy();
    expect(msg.timestamp).toBeTruthy();
  });

  it('includes payload when provided', () => {
    const payload = { version: '1.2.0' };
    const msg = createMessage('pong', payload);
    expect(msg.payload).toEqual(payload);
  });

  it('has undefined payload when not provided', () => {
    const msg = createMessage('ping');
    expect(msg.payload).toBeUndefined();
  });
});

describe('compareVersions', () => {
  it('returns 0 for equal versions', () => {
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0);
    expect(compareVersions('2.3.4', '2.3.4')).toBe(0);
  });

  it('returns -1 when first version is lower', () => {
    expect(compareVersions('1.0.0', '2.0.0')).toBe(-1);
    expect(compareVersions('1.0.0', '1.1.0')).toBe(-1);
    expect(compareVersions('1.0.0', '1.0.1')).toBe(-1);
  });

  it('returns 1 when first version is higher', () => {
    expect(compareVersions('2.0.0', '1.0.0')).toBe(1);
    expect(compareVersions('1.1.0', '1.0.0')).toBe(1);
    expect(compareVersions('1.0.1', '1.0.0')).toBe(1);
  });

  it('handles versions with different segment counts', () => {
    expect(compareVersions('1.0', '1.0.0')).toBe(0);
    expect(compareVersions('1.0.0', '1.0')).toBe(0);
    expect(compareVersions('1.1', '1.0.1')).toBe(1);
  });
});

describe('isVersionSupported', () => {
  it('returns true for minimum version', () => {
    expect(isVersionSupported(MIN_SUPPORTED_VERSION)).toBe(true);
  });

  it('returns true for higher versions', () => {
    expect(isVersionSupported('2.0.0')).toBe(true);
    expect(isVersionSupported('1.5.0')).toBe(true);
  });

  it('returns false for lower versions', () => {
    expect(isVersionSupported('0.9.0')).toBe(false);
    expect(isVersionSupported('0.0.1')).toBe(false);
  });
});

describe('getExtensionStatusInfo', () => {
  it('returns correct info for installed', () => {
    const info = getExtensionStatusInfo('installed');
    expect(info.label).toBe('Installed');
    expect(info.color).toContain('green');
  });

  it('returns correct info for not_installed', () => {
    const info = getExtensionStatusInfo('not_installed');
    expect(info.label).toBe('Not Installed');
    expect(info.color).toContain('gray');
  });

  it('returns correct info for outdated', () => {
    const info = getExtensionStatusInfo('outdated');
    expect(info.label).toBe('Update Available');
    expect(info.color).toContain('yellow');
  });

  it('returns correct info for disabled', () => {
    const info = getExtensionStatusInfo('disabled');
    expect(info.label).toBe('Disabled');
    expect(info.color).toContain('red');
  });
});

// --- BrowserExtensionBridge Tests ---

describe('BrowserExtensionBridge', () => {
  let bridge: BrowserExtensionBridge;
  let callbacks: Partial<BrowserExtensionCallbacks>;

  beforeEach(() => {
    vi.useFakeTimers();
    callbacks = {
      onExtensionDetected: vi.fn(),
      onExtensionLost: vi.fn(),
      onRecordingStatusChange: vi.fn(),
      onRecordingComplete: vi.fn(),
      onError: vi.fn(),
    };
    bridge = new BrowserExtensionBridge({
      callbacks,
      pingIntervalMs: 5000,
      pingTimeoutMs: 1000,
    });
  });

  afterEach(() => {
    bridge.stop();
    vi.useRealTimers();
  });

  it('starts in not_installed state', () => {
    expect(bridge.getStatus()).toBe('not_installed');
    expect(bridge.isAvailable()).toBe(false);
    expect(bridge.getExtensionInfo()).toBeNull();
  });

  it('starts listening on start()', () => {
    const addSpy = vi.spyOn(window, 'addEventListener');
    bridge.start();
    expect(addSpy).toHaveBeenCalledWith('message', expect.any(Function));
    addSpy.mockRestore();
  });

  it('stops listening on stop()', () => {
    const removeSpy = vi.spyOn(window, 'removeEventListener');
    bridge.start();
    bridge.stop();
    expect(removeSpy).toHaveBeenCalledWith('message', expect.any(Function));
    removeSpy.mockRestore();
  });

  it('does not double-start', () => {
    const addSpy = vi.spyOn(window, 'addEventListener');
    bridge.start();
    bridge.start();
    // Should only add listener once
    const messageCalls = addSpy.mock.calls.filter(c => c[0] === 'message');
    expect(messageCalls.length).toBe(1);
    addSpy.mockRestore();
  });

  it('detects extension via pong response', () => {
    bridge.start();

    // Simulate extension responding to a ping with a pong event
    const pongEvent = new MessageEvent('message', {
      data: {
        source: EXTENSION_ORIGIN,
        type: 'pong',
        id: 'ext-msg-1',
        payload: { version: '1.2.0', capabilities: ['recording', 'screenshot'] },
      },
    });
    window.dispatchEvent(pongEvent);

    expect(callbacks.onExtensionDetected).toHaveBeenCalled();
    expect(bridge.getStatus()).toBe('installed');
    expect(bridge.isAvailable()).toBe(true);
    expect(bridge.getExtensionInfo()?.version).toBe('1.2.0');
  });

  it('marks extension as outdated for old versions', () => {
    bridge.start();

    const pongEvent = new MessageEvent('message', {
      data: {
        source: EXTENSION_ORIGIN,
        type: 'pong',
        id: 'ext-msg-1',
        payload: { version: '0.5.0', capabilities: [] },
      },
    });
    window.dispatchEvent(pongEvent);

    expect(bridge.getStatus()).toBe('outdated');
    expect(bridge.isAvailable()).toBe(false);
  });

  it('handles recording status events', () => {
    bridge.start();

    const statusEvent = new MessageEvent('message', {
      data: {
        source: EXTENSION_ORIGIN,
        type: 'recording_status',
        id: 'ext-msg-2',
        payload: { isRecording: true, duration: 30, mode: 'screen', isPaused: false },
      },
    });
    window.dispatchEvent(statusEvent);

    expect(callbacks.onRecordingStatusChange).toHaveBeenCalledWith({
      isRecording: true,
      duration: 30,
      mode: 'screen',
      isPaused: false,
    });
  });

  it('handles recording complete events', () => {
    bridge.start();

    const completeEvent = new MessageEvent('message', {
      data: {
        source: EXTENSION_ORIGIN,
        type: 'recording_complete',
        id: 'ext-msg-3',
        payload: { videoId: 'video-1', duration: 120, fileSize: 5000000, uploadProgress: 100 },
      },
    });
    window.dispatchEvent(completeEvent);

    expect(callbacks.onRecordingComplete).toHaveBeenCalledWith({
      videoId: 'video-1',
      duration: 120,
      fileSize: 5000000,
      uploadProgress: 100,
    });
  });

  it('handles error events', () => {
    bridge.start();

    const errorEvent = new MessageEvent('message', {
      data: {
        source: EXTENSION_ORIGIN,
        type: 'error',
        id: 'ext-msg-4',
        payload: 'Permission denied',
      },
    });
    window.dispatchEvent(errorEvent);

    expect(callbacks.onError).toHaveBeenCalledWith('Permission denied');
  });

  it('ignores messages from other sources', () => {
    bridge.start();

    const otherEvent = new MessageEvent('message', {
      data: {
        source: 'other-app',
        type: 'pong',
        id: 'ext-msg-5',
        payload: { version: '1.0.0' },
      },
    });
    window.dispatchEvent(otherEvent);

    expect(callbacks.onExtensionDetected).not.toHaveBeenCalled();
    expect(bridge.getStatus()).toBe('not_installed');
  });

  it('returns false for operations when extension is not available', async () => {
    bridge.start();
    const settings: SettingsSyncPayload = {
      defaultQuality: 'high',
      defaultMode: 'screen',
      audioEnabled: true,
      cameraEnabled: false,
      cursorHighlight: true,
      countdownEnabled: true,
      countdownSeconds: 3,
    };
    const result = await bridge.syncSettings(settings);
    expect(result).toBe(false);
  });
});
