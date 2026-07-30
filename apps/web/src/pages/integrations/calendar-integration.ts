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
