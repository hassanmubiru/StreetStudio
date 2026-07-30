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

function createMockCallbacks(): CalendarIntegrationCallbacks {
  return {
    onConnectProvider: vi.fn().mockResolvedValue(createTestConnection()),
    onDisconnectProvider: vi.fn().mockResolvedValue(true),
    onSyncCalendar: vi.fn().mockResolvedValue(true),
    onCreateEvent: vi.fn().mockResolvedValue(createTestEvent()),
    onUpdateEvent: vi.fn().mockResolvedValue(createTestEvent()),
    onDeleteEvent: vi.fn().mockResolvedValue(true),
    onGenerateRecordingLink: vi.fn().mockResolvedValue('https://record.streetstudio.io/abc123'),
  };
}

// --- Utility Function Tests ---

describe('validateEventTitle', () => {
  it('rejects empty titles', () => {
    expect(validateEventTitle('').valid).toBe(false);
    expect(validateEventTitle('   ').valid).toBe(false);
  });

  it('accepts valid titles', () => {
    expect(validateEventTitle('Team Sync').valid).toBe(true);
    expect(validateEventTitle('a').valid).toBe(true);
  });

  it('rejects titles exceeding max length', () => {
    const longTitle = 'a'.repeat(EVENT_TITLE_MAX_LENGTH + 1);
    const result = validateEventTitle(longTitle);
    expect(result.valid).toBe(false);
    expect(result.error).toContain(`${EVENT_TITLE_MAX_LENGTH}`);
  });
});

describe('validateEventTimeRange', () => {
  it('rejects invalid start time', () => {
    const result = validateEventTimeRange('invalid', '2025-06-01T15:00:00Z');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('start time');
  });

  it('rejects invalid end time', () => {
    const result = validateEventTimeRange('2025-06-01T14:00:00Z', 'invalid');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('end time');
  });

  it('rejects end time before start time', () => {
    const result = validateEventTimeRange('2025-06-01T15:00:00Z', '2025-06-01T14:00:00Z');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('after start');
  });

  it('rejects start time in the past', () => {
    const result = validateEventTimeRange('2020-01-01T10:00:00Z', '2025-06-01T15:00:00Z');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('future');
  });

  it('accepts valid future time range', () => {
    const future = new Date(Date.now() + 86400000).toISOString();
    const futureEnd = new Date(Date.now() + 90000000).toISOString();
    expect(validateEventTimeRange(future, futureEnd).valid).toBe(true);
  });
});

describe('validateAttendeeEmail', () => {
  it('rejects empty email', () => {
    expect(validateAttendeeEmail('').valid).toBe(false);
  });

  it('rejects invalid email format', () => {
    expect(validateAttendeeEmail('notanemail').valid).toBe(false);
    expect(validateAttendeeEmail('missing@').valid).toBe(false);
  });

  it('accepts valid emails', () => {
    expect(validateAttendeeEmail('user@example.com').valid).toBe(true);
    expect(validateAttendeeEmail('name+tag@domain.co.uk').valid).toBe(true);
  });
});

describe('formatEventTime', () => {
  it('formats valid dates', () => {
    const result = formatEventTime('2024-03-15T14:30:00Z');
    expect(result).toBeTruthy();
    expect(result).not.toBe('Invalid date');
  });

  it('returns "Invalid date" for invalid input', () => {
    expect(formatEventTime('not-a-date')).toBe('Invalid date');
  });
});

describe('getEventDurationMinutes', () => {
  it('calculates duration correctly', () => {
    expect(getEventDurationMinutes('2024-01-01T10:00:00Z', '2024-01-01T11:00:00Z')).toBe(60);
    expect(getEventDurationMinutes('2024-01-01T10:00:00Z', '2024-01-01T10:30:00Z')).toBe(30);
  });

  it('returns 0 for invalid dates', () => {
    expect(getEventDurationMinutes('invalid', '2024-01-01T11:00:00Z')).toBe(0);
  });
});

describe('formatDuration', () => {
  it('formats minutes correctly', () => {
    expect(formatDuration(0)).toBe('0 min');
    expect(formatDuration(30)).toBe('30 min');
    expect(formatDuration(60)).toBe('1h');
    expect(formatDuration(90)).toBe('1h 30m');
  });
});

describe('getProviderInfo', () => {
  it('returns correct info for known providers', () => {
    expect(getProviderInfo('google').label).toBe('Google Calendar');
    expect(getProviderInfo('outlook').label).toBe('Microsoft Outlook');
  });
});

describe('getConnectionStatusColor', () => {
  it('returns correct colors for each status', () => {
    expect(getConnectionStatusColor('connected')).toContain('green');
    expect(getConnectionStatusColor('disconnected')).toContain('gray');
    expect(getConnectionStatusColor('error')).toContain('red');
  });
});

describe('getEventStatusColor', () => {
  it('returns correct colors for each status', () => {
    expect(getEventStatusColor('scheduled')).toContain('blue');
    expect(getEventStatusColor('in_progress')).toContain('yellow');
    expect(getEventStatusColor('completed')).toContain('green');
    expect(getEventStatusColor('cancelled')).toContain('gray');
  });
});
