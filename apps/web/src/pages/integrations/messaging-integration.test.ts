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

// --- Component Tests ---

describe('MessagingIntegrationPage', () => {
  let page: MessagingIntegrationPage;
  let callbacks: MessagingIntegrationCallbacks;

  beforeEach(() => {
    callbacks = createMockCallbacks();
  });

  it('renders with default empty state', () => {
    page = new MessagingIntegrationPage();
    const el = page.getElement();
    expect(el.getAttribute('data-page')).toBe('messaging-integration');
    expect(page.getConnections()).toEqual([]);
    expect(page.getRules()).toEqual([]);
  });

  it('renders with initial data', () => {
    const conn = createTestConnection();
    const rule = createTestRule();
    page = new MessagingIntegrationPage({ connections: [conn], rules: [rule] });
    expect(page.getConnections()).toHaveLength(1);
    expect(page.getRules()).toHaveLength(1);
  });

  it('connects a platform', async () => {
    page = new MessagingIntegrationPage({ callbacks });
    await page.connectPlatform('slack');
    expect(callbacks.onConnectPlatform).toHaveBeenCalledWith('slack');
    expect(page.getConnections()).toHaveLength(1);
  });

  it('disconnects a platform and removes associated rules', async () => {
    const conn = createTestConnection();
    const rule = createTestRule({ connectionId: conn.id });
    page = new MessagingIntegrationPage({ connections: [conn], rules: [rule], callbacks });
    await page.disconnectPlatform(conn.id);
    expect(page.getConnections()).toHaveLength(0);
    expect(page.getRules()).toHaveLength(0);
  });

  it('fetches channels for a connection', async () => {
    const conn = createTestConnection();
    page = new MessagingIntegrationPage({ connections: [conn], callbacks });
    await page.fetchChannels(conn.id);
    expect(callbacks.onFetchChannels).toHaveBeenCalledWith(conn.id);
    expect(page.getChannels()).toHaveLength(1);
  });

  it('shows and hides rule form', () => {
    page = new MessagingIntegrationPage();
    expect(page.isRuleFormVisible()).toBe(false);
    page.showCreateRule();
    expect(page.isRuleFormVisible()).toBe(true);
    page.hideCreateRule();
    expect(page.isRuleFormVisible()).toBe(false);
  });

  it('creates a notification rule', async () => {
    const conn = createTestConnection();
    const channel = createTestChannel();
    page = new MessagingIntegrationPage({
      connections: [conn],
      channels: [channel],
      callbacks,
    });
    page.showCreateRule();
    // Set rule form data
    (page as any).ruleFormData.connectionId = conn.id;
    (page as any).ruleFormData.channelId = channel.id;
    (page as any).ruleFormData.events = new Set(['video.ready']);

    await page.createRule();
    expect(callbacks.onCreateRule).toHaveBeenCalled();
    expect(page.getRules()).toHaveLength(1);
    expect(page.isRuleFormVisible()).toBe(false);
  });

  it('toggles a rule active state', async () => {
    const rule = createTestRule({ isActive: true });
    page = new MessagingIntegrationPage({ rules: [rule], callbacks });
    await page.toggleRule(rule.id);
    expect(callbacks.onUpdateRule).toHaveBeenCalledWith(rule.id, { isActive: false });
  });

  it('deletes a rule', async () => {
    const rule = createTestRule();
    page = new MessagingIntegrationPage({ rules: [rule], callbacks });
    await page.deleteRule(rule.id);
    expect(callbacks.onDeleteRule).toHaveBeenCalledWith(rule.id);
    expect(page.getRules()).toHaveLength(0);
  });

  it('shows and hides share form', () => {
    page = new MessagingIntegrationPage();
    expect(page.isShareFormVisible()).toBe(false);
    page.showShare('video-1', 'My Video');
    expect(page.isShareFormVisible()).toBe(true);
    page.hideShare();
    expect(page.isShareFormVisible()).toBe(false);
  });

  it('shares a video to a channel', async () => {
    const conn = createTestConnection();
    const channel = createTestChannel();
    page = new MessagingIntegrationPage({
      connections: [conn],
      channels: [channel],
      callbacks,
    });
    page.showShare('video-1', 'My Video');
    (page as any).shareFormData.connectionId = conn.id;
    (page as any).shareFormData.channelId = channel.id;

    await page.shareVideo();
    expect(callbacks.onShareVideo).toHaveBeenCalled();
    expect(page.isShareFormVisible()).toBe(false);
  });

  it('destroy cleans up state', () => {
    const conn = createTestConnection();
    page = new MessagingIntegrationPage({ connections: [conn] });
    page.destroy();
    expect(page.getConnections()).toHaveLength(0);
    expect(page.getRules()).toHaveLength(0);
  });
});
