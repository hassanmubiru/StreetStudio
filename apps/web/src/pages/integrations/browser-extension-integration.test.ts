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
