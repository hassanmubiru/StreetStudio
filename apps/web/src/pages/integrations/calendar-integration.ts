/**
 * Calendar Integration for Recording Scheduling
 *
 * Provides calendar provider connection (Google Calendar, Outlook),
 * recording event scheduling with calendar sync, and event management
 * with recording links.
 *
 * Requirements: 15.6
 */

// --- Types ---

export type Uuid = string;

export type CalendarProvider = 'google' | 'outlook' | 'apple';

export type CalendarConnectionStatus = 'connected' | 'disconnected' | 'error';

export type RecordingEventStatus = 'scheduled' | 'in_progress' | 'completed' | 'cancelled';

export interface CalendarConnection {
  id: Uuid;
  provider: CalendarProvider;
  email: string;
  status: CalendarConnectionStatus;
  connectedAt: string;
  lastSyncAt?: string;
  error?: string;
}

export interface RecordingEvent {
  id: Uuid;
  title: string;
  description?: string;
  startTime: string;
  endTime: string;
  timezone: string;
  calendarId?: Uuid;
  recordingLink?: string;
  status: RecordingEventStatus;
  attendees: string[];
  reminders: EventReminder[];
  createdAt: string;
}

export interface EventReminder {
  type: 'email' | 'notification';
  minutesBefore: number;
}

export interface CreateRecordingEventRequest {
  title: string;
  description?: string;
  startTime: string;
  endTime: string;
  timezone: string;
  calendarId?: Uuid;
  attendees: string[];
  reminders: EventReminder[];
}

export interface UpdateRecordingEventRequest {
  title?: string;
  description?: string;
  startTime?: string;
  endTime?: string;
  timezone?: string;
  attendees?: string[];
  reminders?: EventReminder[];
  status?: RecordingEventStatus;
}

export interface CalendarIntegrationCallbacks {
  onConnectProvider: (provider: CalendarProvider) => Promise<CalendarConnection>;
  onDisconnectProvider: (connectionId: Uuid) => Promise<boolean>;
  onSyncCalendar: (connectionId: Uuid) => Promise<boolean>;
  onCreateEvent: (request: CreateRecordingEventRequest) => Promise<RecordingEvent>;
  onUpdateEvent: (eventId: Uuid, request: UpdateRecordingEventRequest) => Promise<RecordingEvent>;
  onDeleteEvent: (eventId: Uuid) => Promise<boolean>;
  onGenerateRecordingLink: (eventId: Uuid) => Promise<string>;
}

export interface CalendarIntegrationOptions {
  connections?: CalendarConnection[];
  events?: RecordingEvent[];
  callbacks?: Partial<CalendarIntegrationCallbacks>;
}

// --- Constants ---

export const CALENDAR_PROVIDERS: { provider: CalendarProvider; label: string; icon: string }[] = [
  { provider: 'google', label: 'Google Calendar', icon: 'google-calendar' },
  { provider: 'outlook', label: 'Microsoft Outlook', icon: 'outlook' },
  { provider: 'apple', label: 'Apple Calendar', icon: 'apple-calendar' },
];

export const REMINDER_OPTIONS: { value: number; label: string }[] = [
  { value: 5, label: '5 minutes before' },
  { value: 10, label: '10 minutes before' },
  { value: 15, label: '15 minutes before' },
  { value: 30, label: '30 minutes before' },
  { value: 60, label: '1 hour before' },
  { value: 1440, label: '1 day before' },
];

export const TIMEZONE_OPTIONS: { value: string; label: string }[] = [
  { value: 'America/New_York', label: 'Eastern Time (ET)' },
  { value: 'America/Chicago', label: 'Central Time (CT)' },
  { value: 'America/Denver', label: 'Mountain Time (MT)' },
  { value: 'America/Los_Angeles', label: 'Pacific Time (PT)' },
  { value: 'Europe/London', label: 'GMT/BST' },
  { value: 'Europe/Paris', label: 'Central European Time (CET)' },
  { value: 'Asia/Tokyo', label: 'Japan Standard Time (JST)' },
  { value: 'Australia/Sydney', label: 'Australian Eastern Time (AET)' },
];

export const EVENT_TITLE_MAX_LENGTH = 200;
export const EVENT_TITLE_MIN_LENGTH = 1;
export const EVENT_DESCRIPTION_MAX_LENGTH = 2000;
export const MAX_ATTENDEES = 50;
