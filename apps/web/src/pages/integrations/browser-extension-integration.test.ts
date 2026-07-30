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
