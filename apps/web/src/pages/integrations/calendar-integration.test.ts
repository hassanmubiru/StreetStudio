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

// --- Component Tests ---

describe('CalendarIntegrationPage', () => {
  let page: CalendarIntegrationPage;
  let callbacks: CalendarIntegrationCallbacks;

  beforeEach(() => {
    callbacks = createMockCallbacks();
  });

  it('renders with default empty state', () => {
    page = new CalendarIntegrationPage();
    const el = page.getElement();
    expect(el.getAttribute('data-page')).toBe('calendar-integration');
    expect(page.getConnections()).toEqual([]);
    expect(page.getEvents()).toEqual([]);
  });

  it('renders with initial connections and events', () => {
    const conn = createTestConnection();
    const event = createTestEvent();
    page = new CalendarIntegrationPage({ connections: [conn], events: [event] });
    expect(page.getConnections()).toHaveLength(1);
    expect(page.getEvents()).toHaveLength(1);
  });

  it('shows and hides create form', () => {
    page = new CalendarIntegrationPage();
    expect(page.isCreateFormVisible()).toBe(false);
    page.showCreate();
    expect(page.isCreateFormVisible()).toBe(true);
    page.hideCreate();
    expect(page.isCreateFormVisible()).toBe(false);
  });

  it('connects a calendar provider', async () => {
    page = new CalendarIntegrationPage({ callbacks });
    expect(page.getConnections()).toHaveLength(0);
    await page.connectProvider('google');
    expect(callbacks.onConnectProvider).toHaveBeenCalledWith('google');
    expect(page.getConnections()).toHaveLength(1);
  });

  it('disconnects a provider', async () => {
    const conn = createTestConnection();
    page = new CalendarIntegrationPage({ connections: [conn], callbacks });
    await page.disconnectProvider(conn.id);
    expect(callbacks.onDisconnectProvider).toHaveBeenCalledWith(conn.id);
    expect(page.getConnections()).toHaveLength(0);
  });

  it('syncs a calendar', async () => {
    const conn = createTestConnection();
    page = new CalendarIntegrationPage({ connections: [conn], callbacks });
    await page.syncCalendar(conn.id);
    expect(callbacks.onSyncCalendar).toHaveBeenCalledWith(conn.id);
    const updated = page.getConnections().find(c => c.id === conn.id);
    expect(updated?.lastSyncAt).toBeTruthy();
  });

  it('adds and removes attendees', () => {
    page = new CalendarIntegrationPage();
    page.showCreate();
    const added = page.addAttendee('alice@example.com');
    expect(added).toBe(true);
    expect(page.getCreateFormData().attendees).toContain('alice@example.com');

    page.removeAttendee('alice@example.com');
    expect(page.getCreateFormData().attendees).not.toContain('alice@example.com');
  });

  it('rejects invalid attendee emails', () => {
    page = new CalendarIntegrationPage();
    page.showCreate();
    expect(page.addAttendee('not-an-email')).toBe(false);
    expect(page.getCreateFormData().attendees).toHaveLength(0);
  });

  it('rejects duplicate attendees', () => {
    page = new CalendarIntegrationPage();
    page.showCreate();
    page.addAttendee('alice@example.com');
    expect(page.addAttendee('alice@example.com')).toBe(false);
    expect(page.getCreateFormData().attendees).toHaveLength(1);
  });

  it('creates an event successfully', async () => {
    page = new CalendarIntegrationPage({ callbacks });
    page.showCreate();

    // Manually set form data for the test
    const formData = page.getCreateFormData();
    expect(formData.title).toBe('');

    // The createEvent uses internal form data, so we test through the callback
    // Mock valid form data through internal state
    (page as any).createFormData.title = 'Test Recording';
    const future = new Date(Date.now() + 86400000).toISOString();
    const futureEnd = new Date(Date.now() + 90000000).toISOString();
    (page as any).createFormData.startTime = future;
    (page as any).createFormData.endTime = futureEnd;

    await page.createEvent();
    expect(callbacks.onCreateEvent).toHaveBeenCalled();
    expect(page.getEvents()).toHaveLength(1);
  });

  it('deletes an event', async () => {
    const event = createTestEvent();
    page = new CalendarIntegrationPage({ events: [event], callbacks });
    await page.deleteEvent(event.id);
    expect(callbacks.onDeleteEvent).toHaveBeenCalledWith(event.id);
    expect(page.getEvents()).toHaveLength(0);
  });

  it('generates a recording link', async () => {
    const event = createTestEvent();
    page = new CalendarIntegrationPage({ events: [event], callbacks });
    await page.generateRecordingLink(event.id);
    expect(callbacks.onGenerateRecordingLink).toHaveBeenCalledWith(event.id);
    const updated = page.getEvents().find(e => e.id === event.id);
    expect(updated?.recordingLink).toBe('https://record.streetstudio.io/abc123');
  });

  it('destroy cleans up state', () => {
    const conn = createTestConnection();
    page = new CalendarIntegrationPage({ connections: [conn] });
    page.destroy();
    expect(page.getConnections()).toHaveLength(0);
    expect(page.getEvents()).toHaveLength(0);
  });
});
