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

// --- Utility Functions ---

/**
 * Validate an event title.
 */
export function validateEventTitle(title: string): { valid: boolean; error?: string } {
  const trimmed = title.trim();
  if (trimmed.length < EVENT_TITLE_MIN_LENGTH) {
    return { valid: false, error: 'Event title is required' };
  }
  if (trimmed.length > EVENT_TITLE_MAX_LENGTH) {
    return { valid: false, error: `Title must be ${EVENT_TITLE_MAX_LENGTH} characters or fewer` };
  }
  return { valid: true };
}

/**
 * Validate event time range. Start must be before end, both must be in the future.
 */
export function validateEventTimeRange(
  startTime: string,
  endTime: string
): { valid: boolean; error?: string } {
  const start = new Date(startTime);
  const end = new Date(endTime);

  if (isNaN(start.getTime())) {
    return { valid: false, error: 'Invalid start time' };
  }
  if (isNaN(end.getTime())) {
    return { valid: false, error: 'Invalid end time' };
  }
  if (start >= end) {
    return { valid: false, error: 'End time must be after start time' };
  }
  if (start.getTime() < Date.now()) {
    return { valid: false, error: 'Start time must be in the future' };
  }
  return { valid: true };
}

/**
 * Validate an email address for attendees.
 */
export function validateAttendeeEmail(email: string): { valid: boolean; error?: string } {
  const trimmed = email.trim();
  if (trimmed.length === 0) {
    return { valid: false, error: 'Email is required' };
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(trimmed)) {
    return { valid: false, error: 'Invalid email address' };
  }
  return { valid: true };
}

/**
 * Format a date/time for display.
 */
export function formatEventTime(dateStr: string): string {
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return 'Invalid date';
  return date.toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

/**
 * Calculate event duration in minutes.
 */
export function getEventDurationMinutes(startTime: string, endTime: string): number {
  const start = new Date(startTime);
  const end = new Date(endTime);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return 0;
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000));
}

/**
 * Format duration in minutes to a human-readable string.
 */
export function formatDuration(minutes: number): string {
  if (minutes < 1) return '0 min';
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  if (remaining === 0) return `${hours}h`;
  return `${hours}h ${remaining}m`;
}

/**
 * Get provider display info.
 */
export function getProviderInfo(provider: CalendarProvider): { label: string; icon: string } {
  const info = CALENDAR_PROVIDERS.find(p => p.provider === provider);
  return info ?? { label: provider, icon: 'calendar' };
}

/**
 * Get connection status display color.
 */
export function getConnectionStatusColor(status: CalendarConnectionStatus): string {
  switch (status) {
    case 'connected': return 'bg-green-100 text-green-800';
    case 'disconnected': return 'bg-gray-100 text-gray-600';
    case 'error': return 'bg-red-100 text-red-800';
    default: return 'bg-gray-100 text-gray-600';
  }
}

/**
 * Get event status display color.
 */
export function getEventStatusColor(status: RecordingEventStatus): string {
  switch (status) {
    case 'scheduled': return 'bg-blue-100 text-blue-800';
    case 'in_progress': return 'bg-yellow-100 text-yellow-800';
    case 'completed': return 'bg-green-100 text-green-800';
    case 'cancelled': return 'bg-gray-100 text-gray-600';
    default: return 'bg-gray-100 text-gray-600';
  }
}

// --- Component ---

export class CalendarIntegrationPage {
  private element: HTMLElement;
  private connections: CalendarConnection[];
  private events: RecordingEvent[];
  private callbacks: Partial<CalendarIntegrationCallbacks>;
  private showCreateForm = false;
  private confirmDisconnectId: Uuid | null = null;
  private confirmDeleteEventId: Uuid | null = null;
  private createFormData: {
    title: string;
    description: string;
    startTime: string;
    endTime: string;
    timezone: string;
    calendarId: Uuid | null;
    attendees: string[];
    reminders: EventReminder[];
    newAttendee: string;
  } = {
    title: '',
    description: '',
    startTime: '',
    endTime: '',
    timezone: 'America/New_York',
    calendarId: null,
    attendees: [],
    reminders: [{ type: 'notification', minutesBefore: 15 }],
    newAttendee: '',
  };

  constructor(options: CalendarIntegrationOptions = {}) {
    this.connections = options.connections ?? [];
    this.events = options.events ?? [];
    this.callbacks = options.callbacks ?? {};
    this.element = document.createElement('div');
    this.element.setAttribute('data-page', 'calendar-integration');
    this.element.setAttribute('data-main-content', '');
    this.render();
  }

  public getElement(): HTMLElement {
    return this.element;
  }

  public getConnections(): CalendarConnection[] {
    return [...this.connections];
  }

  public getEvents(): RecordingEvent[] {
    return [...this.events];
  }

  public isCreateFormVisible(): boolean {
    return this.showCreateForm;
  }

  public getCreateFormData() {
    return {
      title: this.createFormData.title,
      description: this.createFormData.description,
      startTime: this.createFormData.startTime,
      endTime: this.createFormData.endTime,
      timezone: this.createFormData.timezone,
      calendarId: this.createFormData.calendarId,
      attendees: [...this.createFormData.attendees],
      reminders: [...this.createFormData.reminders],
    };
  }

  public updateConnections(connections: CalendarConnection[]): void {
    this.connections = connections;
    this.render();
  }

  public updateEvents(events: RecordingEvent[]): void {
    this.events = events;
    this.render();
  }

  public showCreate(): void {
    this.showCreateForm = true;
    this.createFormData = {
      title: '',
      description: '',
      startTime: '',
      endTime: '',
      timezone: 'America/New_York',
      calendarId: null,
      attendees: [],
      reminders: [{ type: 'notification', minutesBefore: 15 }],
      newAttendee: '',
    };
    this.render();
  }

  public hideCreate(): void {
    this.showCreateForm = false;
    this.render();
  }

  public async connectProvider(provider: CalendarProvider): Promise<void> {
    if (this.callbacks.onConnectProvider) {
      try {
        const connection = await this.callbacks.onConnectProvider(provider);
        this.connections = [...this.connections, connection];
        this.render();
      } catch (error) {
        this.showError('connect-error', `Failed to connect ${getProviderInfo(provider).label}. Please try again.`);
      }
    }
  }

  public async disconnectProvider(connectionId: Uuid): Promise<void> {
    if (this.callbacks.onDisconnectProvider) {
      try {
        const success = await this.callbacks.onDisconnectProvider(connectionId);
        if (success) {
          this.connections = this.connections.filter(c => c.id !== connectionId);
          this.confirmDisconnectId = null;
          this.render();
        }
      } catch (error) {
        this.showError(`disconnect-error-${connectionId}`, 'Failed to disconnect.');
      }
    }
  }

  public async syncCalendar(connectionId: Uuid): Promise<void> {
    if (this.callbacks.onSyncCalendar) {
      try {
        await this.callbacks.onSyncCalendar(connectionId);
        this.connections = this.connections.map(c =>
          c.id === connectionId ? { ...c, lastSyncAt: new Date().toISOString() } : c
        );
        this.render();
      } catch (error) {
        this.showError(`sync-error-${connectionId}`, 'Sync failed. Please try again.');
      }
    }
  }
