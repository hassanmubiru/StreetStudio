/**
 * Unit tests for Real-Time Collaboration Features
 *
 * Tests presence indicators (existing), typing indicators, collaborative
 * viewing mode, and activity feed components.
 *
 * Requirements: 7.1, 7.2, 7.3, 7.4, 7.8, 7.9
 */

// @vitest-environment jsdom

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  PresenceTracker,
  PresenceIndicators,
  getInitials,
  getAvatarColor,
  isValidPresenceUser,
} from './presence-indicators';
import type { PresenceUser, PresenceIndicatorsOptions } from './presence-indicators';

import {
  formatTypingMessage,
  isTypingExpired,
  filterExpiredTyping,
  TypingIndicators,
} from './typing-indicators';
import type { TypingUser } from './typing-indicators';

import {
  needsSyncCorrection,
  adjustForLatency,
  formatSyncStatus,
  CollaborativeViewing,
} from './collaborative-viewing';

import {
  getActivityIcon,
  formatRelativeTime,
  groupActivities,
  filterActivities,
  ActivityFeed,
} from './activity-feed';
import type { ActivityEvent } from './activity-feed';

// --------------------------------------------------------------------------
// Test helpers
// --------------------------------------------------------------------------

function createContainer(): HTMLElement {
  const container = document.createElement('div');
  document.body.appendChild(container);
  return container;
}
