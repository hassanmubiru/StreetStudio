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

  public addAttendee(email: string): boolean {
    const validation = validateAttendeeEmail(email);
    if (!validation.valid) {
      this.showError('attendee-error', validation.error!);
      return false;
    }
    if (this.createFormData.attendees.length >= MAX_ATTENDEES) {
      this.showError('attendee-error', `Maximum ${MAX_ATTENDEES} attendees allowed`);
      return false;
    }
    if (this.createFormData.attendees.includes(email.trim())) {
      this.showError('attendee-error', 'Attendee already added');
      return false;
    }
    this.createFormData.attendees.push(email.trim());
    this.createFormData.newAttendee = '';
    this.render();
    return true;
  }

  public removeAttendee(email: string): void {
    this.createFormData.attendees = this.createFormData.attendees.filter(a => a !== email);
    this.render();
  }

  public async createEvent(): Promise<void> {
    const titleValidation = validateEventTitle(this.createFormData.title);
    if (!titleValidation.valid) {
      this.showError('title-error', titleValidation.error!);
      return;
    }

    const timeValidation = validateEventTimeRange(
      this.createFormData.startTime,
      this.createFormData.endTime
    );
    if (!timeValidation.valid) {
      this.showError('time-error', timeValidation.error!);
      return;
    }

    const request: CreateRecordingEventRequest = {
      title: this.createFormData.title.trim(),
      description: this.createFormData.description.trim() || undefined,
      startTime: this.createFormData.startTime,
      endTime: this.createFormData.endTime,
      timezone: this.createFormData.timezone,
      calendarId: this.createFormData.calendarId ?? undefined,
      attendees: this.createFormData.attendees,
      reminders: this.createFormData.reminders,
    };

    if (this.callbacks.onCreateEvent) {
      try {
        const event = await this.callbacks.onCreateEvent(request);
        this.events = [event, ...this.events];
        this.showCreateForm = false;
        this.render();
      } catch (error) {
        this.showError('create-error', 'Failed to create event. Please try again.');
      }
    }
  }

  public async deleteEvent(eventId: Uuid): Promise<void> {
    if (this.callbacks.onDeleteEvent) {
      try {
        const success = await this.callbacks.onDeleteEvent(eventId);
        if (success) {
          this.events = this.events.filter(e => e.id !== eventId);
          this.confirmDeleteEventId = null;
          this.render();
        }
      } catch (error) {
        this.showError(`delete-event-error-${eventId}`, 'Failed to delete event.');
      }
    }
  }

  public async generateRecordingLink(eventId: Uuid): Promise<void> {
    if (this.callbacks.onGenerateRecordingLink) {
      try {
        const link = await this.callbacks.onGenerateRecordingLink(eventId);
        this.events = this.events.map(e =>
          e.id === eventId ? { ...e, recordingLink: link } : e
        );
        this.render();
      } catch (error) {
        this.showError(`link-error-${eventId}`, 'Failed to generate recording link.');
      }
    }
  }

  public destroy(): void {
    this.element.innerHTML = '';
    this.connections = [];
    this.events = [];
    this.callbacks = {};
  }

  // --- Private Rendering ---

  private render(): void {
    this.element.innerHTML = '';
    this.element.appendChild(this.renderHeader());
    this.element.appendChild(this.renderConnectionsSection());

    if (this.showCreateForm) {
      this.element.appendChild(this.renderCreateEventForm());
    }

    this.element.appendChild(this.renderEventsSection());
  }

  private renderHeader(): HTMLElement {
    const header = document.createElement('header');
    header.className = 'flex items-center justify-between mb-6';
    header.innerHTML = `
      <div>
        <h1 class="text-2xl font-semibold text-gray-900">Calendar Integration</h1>
        <p class="text-sm text-gray-500 mt-1">Schedule recordings and sync with your calendar</p>
      </div>
      <button
        id="btn-schedule-recording"
        type="button"
        class="inline-flex items-center px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        aria-label="Schedule a new recording"
      >Schedule Recording</button>
    `;
    return header;
  }

  private renderConnectionsSection(): HTMLElement {
    const section = document.createElement('section');
    section.id = 'calendar-connections';
    section.className = 'mb-8';
    section.setAttribute('aria-labelledby', 'connections-heading');

    const connectedProviders = this.connections.map(c => c.provider);
    const availableProviders = CALENDAR_PROVIDERS.filter(
      p => !connectedProviders.includes(p.provider)
    );

    const connectionsHtml = this.connections.map(c => {
      const info = getProviderInfo(c.provider);
      const statusColor = getConnectionStatusColor(c.status);
      return `
        <div class="flex items-center justify-between p-4 bg-white border border-gray-200 rounded-lg" data-connection-id="${c.id}">
          <div class="flex items-center gap-3">
            <span class="text-lg font-medium text-gray-900">${this.escapeHtml(info.label)}</span>
            <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${statusColor}">${c.status}</span>
          </div>
          <div class="flex items-center gap-2">
            <span class="text-xs text-gray-500">${c.email}</span>
            <button type="button" class="btn-sync-calendar px-2 py-1 text-xs font-medium text-blue-700 bg-blue-50 rounded hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-blue-500" data-connection-id="${c.id}" aria-label="Sync ${info.label}">Sync</button>
            <button type="button" class="btn-disconnect px-2 py-1 text-xs font-medium text-red-700 bg-red-50 rounded hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-red-500" data-connection-id="${c.id}" aria-label="Disconnect ${info.label}">Disconnect</button>
          </div>
        </div>
      `;
    }).join('');

    const availableHtml = availableProviders.map(p => `
      <button type="button" class="btn-connect-provider flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500" data-provider="${p.provider}" aria-label="Connect ${p.label}">
        <span class="text-sm font-medium text-gray-700">Connect ${this.escapeHtml(p.label)}</span>
      </button>
    `).join('');

    section.innerHTML = `
      <h2 id="connections-heading" class="text-lg font-medium text-gray-900 mb-4">Connected Calendars</h2>
      <div class="space-y-3 mb-4">${connectionsHtml || '<p class="text-sm text-gray-500">No calendars connected yet.</p>'}</div>
      ${availableProviders.length > 0 ? `
        <div class="flex flex-wrap gap-3">${availableHtml}</div>
      ` : ''}
      <p id="connect-error" class="mt-2 text-sm text-red-600 hidden" role="alert"></p>
    `;
    return section;
  }

  private renderCreateEventForm(): HTMLElement {
    const form = document.createElement('section');
    form.id = 'create-event-form';
    form.className = 'mb-6 p-6 bg-white border border-gray-200 rounded-lg shadow-sm';
    form.setAttribute('aria-labelledby', 'create-event-heading');

    const attendeeTags = this.createFormData.attendees.map(email => `
      <span class="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full">
        ${this.escapeHtml(email)}
        <button type="button" class="btn-remove-attendee text-blue-600 hover:text-blue-800" data-email="${this.escapeHtml(email)}" aria-label="Remove ${this.escapeHtml(email)}">&times;</button>
      </span>
    `).join('');

    form.innerHTML = `
      <h2 id="create-event-heading" class="text-lg font-medium text-gray-900 mb-4">Schedule Recording</h2>
      <div class="space-y-4">
        <div>
          <label for="event-title-input" class="block text-sm font-medium text-gray-700 mb-1">Title</label>
          <input id="event-title-input" type="text" class="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 text-sm" placeholder="Recording session title" maxlength="${EVENT_TITLE_MAX_LENGTH}" value="${this.escapeHtml(this.createFormData.title)}" aria-required="true" />
          <p id="title-error" class="mt-1 text-sm text-red-600 hidden" role="alert"></p>
        </div>
        <div>
          <label for="event-description-input" class="block text-sm font-medium text-gray-700 mb-1">Description (optional)</label>
          <textarea id="event-description-input" class="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 text-sm" rows="3" maxlength="${EVENT_DESCRIPTION_MAX_LENGTH}" placeholder="Add details about the recording session">${this.escapeHtml(this.createFormData.description)}</textarea>
        </div>
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label for="event-start-input" class="block text-sm font-medium text-gray-700 mb-1">Start Time</label>
            <input id="event-start-input" type="datetime-local" class="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 text-sm" value="${this.createFormData.startTime}" aria-required="true" />
          </div>
          <div>
            <label for="event-end-input" class="block text-sm font-medium text-gray-700 mb-1">End Time</label>
            <input id="event-end-input" type="datetime-local" class="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 text-sm" value="${this.createFormData.endTime}" aria-required="true" />
          </div>
        </div>
        <p id="time-error" class="text-sm text-red-600 hidden" role="alert"></p>
        <div>
          <label for="event-timezone-select" class="block text-sm font-medium text-gray-700 mb-1">Timezone</label>
          <select id="event-timezone-select" class="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 text-sm">
            ${TIMEZONE_OPTIONS.map(tz => `<option value="${tz.value}" ${this.createFormData.timezone === tz.value ? 'selected' : ''}>${this.escapeHtml(tz.label)}</option>`).join('')}
          </select>
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Attendees</label>
          <div class="flex gap-2 mb-2">
            <input id="attendee-input" type="email" class="flex-1 px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 text-sm" placeholder="email@example.com" value="${this.escapeHtml(this.createFormData.newAttendee)}" />
            <button id="btn-add-attendee" type="button" class="px-3 py-2 bg-gray-100 text-gray-700 text-sm rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-500">Add</button>
          </div>
          <div class="flex flex-wrap gap-2">${attendeeTags}</div>
          <p id="attendee-error" class="mt-1 text-sm text-red-600 hidden" role="alert"></p>
        </div>
        <p id="create-error" class="text-sm text-red-600 hidden" role="alert"></p>
        <div class="flex items-center gap-3 pt-2">
          <button id="btn-submit-event" type="button" class="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2">Create Event</button>
          <button id="btn-cancel-event" type="button" class="px-4 py-2 bg-white text-gray-700 text-sm font-medium rounded-md border border-gray-300 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2">Cancel</button>
        </div>
      </div>
    `;
    return form;
  }

  private renderEventsSection(): HTMLElement {
    const section = document.createElement('section');
    section.id = 'scheduled-events';
    section.setAttribute('aria-labelledby', 'events-heading');

    if (this.events.length === 0) {
      section.innerHTML = `
        <h2 id="events-heading" class="text-lg font-medium text-gray-900 mb-4">Scheduled Recordings</h2>
        <div class="text-center py-12 bg-white border border-gray-200 rounded-lg">
          <h3 class="text-sm font-medium text-gray-900">No scheduled recordings</h3>
          <p class="mt-1 text-sm text-gray-500">Schedule a recording to get started.</p>
        </div>
      `;
      return section;
    }

    const eventCards = this.events.map(event => {
      const statusColor = getEventStatusColor(event.status);
      const duration = getEventDurationMinutes(event.startTime, event.endTime);
      return `
        <div class="p-4 bg-white border border-gray-200 rounded-lg" data-event-id="${event.id}">
          <div class="flex items-start justify-between">
            <div>
              <h3 class="text-sm font-medium text-gray-900">${this.escapeHtml(event.title)}</h3>
              <p class="text-xs text-gray-500 mt-1">${formatEventTime(event.startTime)} — ${formatDuration(duration)}</p>
              ${event.attendees.length > 0 ? `<p class="text-xs text-gray-500 mt-1">${event.attendees.length} attendee${event.attendees.length !== 1 ? 's' : ''}</p>` : ''}
            </div>
            <div class="flex items-center gap-2">
              <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${statusColor}">${event.status.replace('_', ' ')}</span>
              ${!event.recordingLink && event.status === 'scheduled' ? `<button type="button" class="btn-generate-link px-2 py-1 text-xs font-medium text-blue-700 bg-blue-50 rounded hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-blue-500" data-event-id="${event.id}" aria-label="Generate recording link">Get Link</button>` : ''}
              ${event.recordingLink ? `<a href="${this.escapeHtml(event.recordingLink)}" class="px-2 py-1 text-xs font-medium text-green-700 bg-green-50 rounded" target="_blank" rel="noopener noreferrer">Join</a>` : ''}
              <button type="button" class="btn-delete-event px-2 py-1 text-xs font-medium text-red-700 bg-red-50 rounded hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-red-500" data-event-id="${event.id}" aria-label="Delete event ${this.escapeHtml(event.title)}">Delete</button>
            </div>
          </div>
        </div>
      `;
    }).join('');

    section.innerHTML = `
      <h2 id="events-heading" class="text-lg font-medium text-gray-900 mb-4">Scheduled Recordings</h2>
      <div class="space-y-3">${eventCards}</div>
    `;
    return section;
  }

  private showError(elementId: string, message: string): void {
    const el = this.element.querySelector(`#${elementId}`);
    if (el) {
      el.textContent = message;
      el.classList.remove('hidden');
    }
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}
