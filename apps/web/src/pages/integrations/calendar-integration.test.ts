/**
 * Calendar Integration Tests
 *
 * Tests for calendar provider connection, recording event scheduling,
 * and event management with recording links.
 *
 * Validates: Requirements 15.6
 */

// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  CalendarIntegrationPage,
  validateEventTitle,
  validateEventTimeRange,
  validateAttendeeEmail,
  formatEventTime,
  getEventDurationMinutes,
  formatDuration,
  getProviderInfo,
  getConnectionStatusColor,
  getEventStatusColor,
  EVENT_TITLE_MAX_LENGTH,
  MAX_ATTENDEES,
  type CalendarConnection,
  type RecordingEvent,
  type CalendarIntegrationCallbacks,
} from './calendar-integration.js';

// --- Test Helpers ---

function createTestConnection(overrides?: Partial<CalendarConnection>): CalendarConnection {
  return {
    id: 'conn-1',
    provider: 'google',
    email: 'user@example.com',
    status: 'connected',
    connectedAt: '2024-01-15T10:00:00Z',
    ...overrides,
  };
}

function createTestEvent(overrides?: Partial<RecordingEvent>): RecordingEvent {
  return {
    id: 'event-1',
    title: 'Team Recording',
    startTime: '2025-06-01T14:00:00Z',
    endTime: '2025-06-01T15:00:00Z',
    timezone: 'America/New_York',
    status: 'scheduled',
    attendees: ['alice@example.com'],
    reminders: [{ type: 'notification', minutesBefore: 15 }],
    createdAt: '2024-01-15T10:00:00Z',
    ...overrides,
  };
}
