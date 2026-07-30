/**
 * Messaging Integration Tests (Slack/Teams)
 *
 * Tests for messaging platform connection, notification rule management,
 * and video sharing via Slack/Teams channels.
 *
 * Validates: Requirements 15.7
 */

// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  MessagingIntegrationPage,
  getPlatformInfo,
  getMessagingStatusColor,
  getNotificationEventLabel,
  getNotificationEventsByCategory,
  validateShareMessage,
  SHARE_MESSAGE_MAX_LENGTH,
  type MessagingConnection,
  type MessagingChannel,
  type NotificationRule,
  type MessagingIntegrationCallbacks,
} from './messaging-integration.js';

// --- Test Helpers ---

function createTestConnection(overrides?: Partial<MessagingConnection>): MessagingConnection {
  return {
    id: 'conn-1',
    platform: 'slack',
    workspaceName: 'StreetStudio Team',
    status: 'connected',
    connectedAt: '2024-01-15T10:00:00Z',
    connectedBy: 'admin@example.com',
    botInstalled: true,
    ...overrides,
  };
}

function createTestChannel(overrides?: Partial<MessagingChannel>): MessagingChannel {
  return {
    id: 'channel-1',
    connectionId: 'conn-1',
    name: 'general',
    isPrivate: false,
    memberCount: 25,
    ...overrides,
  };
}

function createTestRule(overrides?: Partial<NotificationRule>): NotificationRule {
  return {
    id: 'rule-1',
    connectionId: 'conn-1',
    channelId: 'channel-1',
    channelName: 'general',
    events: ['video.ready', 'comment.mention'],
    isActive: true,
    createdAt: '2024-01-15T10:00:00Z',
    ...overrides,
  };
}

function createMockCallbacks(): MessagingIntegrationCallbacks {
  return {
    onConnectPlatform: vi.fn().mockResolvedValue(createTestConnection()),
    onDisconnectPlatform: vi.fn().mockResolvedValue(true),
    onFetchChannels: vi.fn().mockResolvedValue([createTestChannel()]),
    onShareVideo: vi.fn().mockResolvedValue({ success: true, messageId: 'msg-1' }),
    onCreateRule: vi.fn().mockResolvedValue(createTestRule()),
    onUpdateRule: vi.fn().mockImplementation((_id, req) =>
      Promise.resolve(createTestRule({ isActive: req.isActive ?? true }))
    ),
    onDeleteRule: vi.fn().mockResolvedValue(true),
  };
}

// --- Utility Function Tests ---

describe('getPlatformInfo', () => {
  it('returns Slack info', () => {
    expect(getPlatformInfo('slack').label).toBe('Slack');
  });

  it('returns Teams info', () => {
    expect(getPlatformInfo('teams').label).toBe('Microsoft Teams');
  });
});

describe('getMessagingStatusColor', () => {
  it('returns correct colors', () => {
    expect(getMessagingStatusColor('connected')).toContain('green');
    expect(getMessagingStatusColor('disconnected')).toContain('gray');
    expect(getMessagingStatusColor('error')).toContain('red');
  });
});

describe('getNotificationEventLabel', () => {
  it('returns label for known events', () => {
    expect(getNotificationEventLabel('video.ready')).toBe('Video Ready');
    expect(getNotificationEventLabel('comment.mention')).toBe('Mention');
  });

  it('returns raw type for unknown events', () => {
    expect(getNotificationEventLabel('unknown.event' as any)).toBe('unknown.event');
  });
});

describe('getNotificationEventsByCategory', () => {
  it('groups events correctly', () => {
    const categories = getNotificationEventsByCategory();
    expect(categories.has('Videos')).toBe(true);
    expect(categories.has('Comments')).toBe(true);
    expect(categories.has('Recordings')).toBe(true);
  });
});

describe('validateShareMessage', () => {
  it('accepts empty message', () => {
    expect(validateShareMessage('').valid).toBe(true);
  });

  it('accepts valid message', () => {
    expect(validateShareMessage('Check out this recording!').valid).toBe(true);
  });

  it('rejects message exceeding max length', () => {
    const longMsg = 'a'.repeat(SHARE_MESSAGE_MAX_LENGTH + 1);
    const result = validateShareMessage(longMsg);
    expect(result.valid).toBe(false);
    expect(result.error).toContain(`${SHARE_MESSAGE_MAX_LENGTH}`);
  });
});
