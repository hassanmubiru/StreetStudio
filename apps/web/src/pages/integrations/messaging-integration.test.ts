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
