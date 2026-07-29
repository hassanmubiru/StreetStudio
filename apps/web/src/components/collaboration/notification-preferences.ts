/**
 * Notification Preferences and Delivery Controls
 *
 * Provides UI for managing per-category notification preferences,
 * delivery channel controls, and quiet hours configuration.
 * Integrates with the NotificationPreferenceDto from the shared package.
 *
 * Requirements: 5.7, 7.6
 */

import type { Uuid } from '@streetstudio/shared';

// --------------------------------------------------------------------------
// Types
// --------------------------------------------------------------------------

/** Notification event categories for preference configuration. */
export type NotificationCategory =
  | 'mentions'
  | 'comment_replies'
  | 'reactions'
  | 'video_shared'
  | 'project_invites'
  | 'team_activity'
  | 'system_updates';

/** Delivery channels that can be toggled per category. */
export type PreferenceChannel = 'in_app' | 'email' | 'push';

/** A single preference entry: category + channel + enabled. */
export interface NotificationPreference {
  category: NotificationCategory;
  channel: PreferenceChannel;
  enabled: boolean;
}

/** Complete preference set for a user. */
export interface NotificationPreferencesState {
  memberId: Uuid;
  preferences: NotificationPreference[];
  quietHoursEnabled: boolean;
  quietHoursStart: string; // "HH:MM" format
  quietHoursEnd: string; // "HH:MM" format
  doNotDisturb: boolean;
}

/** Callbacks for preference management. */
export interface PreferenceCallbacks {
  onSave?: (preferences: NotificationPreferencesState) => Promise<boolean>;
  onLoad?: () => Promise<NotificationPreferencesState | null>;
}

/** Category display metadata. */
export interface CategoryInfo {
  category: NotificationCategory;
  label: string;
  description: string;
}

// --------------------------------------------------------------------------
// Constants
// --------------------------------------------------------------------------

/** Default preference categories with metadata. */
export const NOTIFICATION_CATEGORIES: CategoryInfo[] = [
  {
    category: 'mentions',
    label: 'Mentions',
    description: 'When someone @mentions you in a comment',
  },
  {
    category: 'comment_replies',
    label: 'Replies',
    description: 'When someone replies to your comment',
  },
  {
    category: 'reactions',
    label: 'Reactions',
    description: 'When someone reacts to your comment or video',
  },
  {
    category: 'video_shared',
    label: 'Shared videos',
    description: 'When a video is shared with you',
  },
  {
    category: 'project_invites',
    label: 'Project invitations',
    description: 'When you are invited to join a project',
  },
  {
    category: 'team_activity',
    label: 'Team activity',
    description: 'Activity from your team members',
  },
  {
    category: 'system_updates',
    label: 'System updates',
    description: 'Platform updates and announcements',
  },
];

/** Available delivery channels with labels. */
export const DELIVERY_CHANNELS: Array<{ channel: PreferenceChannel; label: string }> = [
  { channel: 'in_app', label: 'In-app' },
  { channel: 'email', label: 'Email' },
  { channel: 'push', label: 'Push' },
];

// --------------------------------------------------------------------------
// Utility Functions
// --------------------------------------------------------------------------

/**
 * Creates a default set of notification preferences (all enabled).
 */
export function createDefaultPreferences(memberId: Uuid): NotificationPreferencesState {
  const preferences: NotificationPreference[] = [];

  for (const { category } of NOTIFICATION_CATEGORIES) {
    for (const { channel } of DELIVERY_CHANNELS) {
      preferences.push({
        category,
        channel,
        enabled: true,
      });
    }
  }

  return {
    memberId,
    preferences,
    quietHoursEnabled: false,
    quietHoursStart: '22:00',
    quietHoursEnd: '08:00',
    doNotDisturb: false,
  };
}

/**
 * Gets the preference for a specific category and channel.
 */
export function getPreference(
  state: NotificationPreferencesState,
  category: NotificationCategory,
  channel: PreferenceChannel
): boolean {
  const pref = state.preferences.find(
    (p) => p.category === category && p.channel === channel
  );
  return pref?.enabled ?? true;
}

/**
 * Updates a single preference in the state (immutably).
 */
export function updatePreference(
  state: NotificationPreferencesState,
  category: NotificationCategory,
  channel: PreferenceChannel,
  enabled: boolean
): NotificationPreferencesState {
  const preferences = state.preferences.map((p) => {
    if (p.category === category && p.channel === channel) {
      return { ...p, enabled };
    }
    return p;
  });

  return { ...state, preferences };
}

/**
 * Toggles all preferences for a category (enable or disable all channels).
 */
export function toggleCategory(
  state: NotificationPreferencesState,
  category: NotificationCategory,
  enabled: boolean
): NotificationPreferencesState {
  const preferences = state.preferences.map((p) => {
    if (p.category === category) {
      return { ...p, enabled };
    }
    return p;
  });

  return { ...state, preferences };
}

/**
 * Toggles all preferences for a channel across all categories.
 */
export function toggleChannel(
  state: NotificationPreferencesState,
  channel: PreferenceChannel,
  enabled: boolean
): NotificationPreferencesState {
  const preferences = state.preferences.map((p) => {
    if (p.channel === channel) {
      return { ...p, enabled };
    }
    return p;
  });

  return { ...state, preferences };
}

/**
 * Checks if a notification should be delivered based on current preferences
 * and quiet hours settings.
 */
export function shouldDeliverNotification(
  state: NotificationPreferencesState,
  category: NotificationCategory,
  channel: PreferenceChannel,
  currentTime?: Date
): boolean {
  // Do not disturb overrides everything
  if (state.doNotDisturb) return false;

  // Check quiet hours
  if (state.quietHoursEnabled && channel !== 'in_app') {
    const now = currentTime || new Date();
    if (isInQuietHours(now, state.quietHoursStart, state.quietHoursEnd)) {
      return false;
    }
  }

  // Check category+channel preference
  return getPreference(state, category, channel);
}

/**
 * Determines if the given time falls within quiet hours.
 */
export function isInQuietHours(
  time: Date,
  startStr: string,
  endStr: string
): boolean {
  const [startH, startM] = startStr.split(':').map(Number);
  const [endH, endM] = endStr.split(':').map(Number);

  const hours = time.getHours();
  const minutes = time.getMinutes();
  const currentMinutes = hours * 60 + minutes;
  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;

  if (startMinutes <= endMinutes) {
    // Same day range (e.g., 08:00 to 17:00)
    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
  } else {
    // Overnight range (e.g., 22:00 to 08:00)
    return currentMinutes >= startMinutes || currentMinutes < endMinutes;
  }
}

/**
 * Counts how many channels are enabled for a given category.
 */
export function getEnabledChannelCount(
  state: NotificationPreferencesState,
  category: NotificationCategory
): number {
  return state.preferences.filter(
    (p) => p.category === category && p.enabled
  ).length;
}

// --------------------------------------------------------------------------
// NotificationPreferencesPanel Class
// --------------------------------------------------------------------------

/**
 * NotificationPreferencesPanel renders a UI for managing notification preferences.
 * Displays a matrix of categories × channels with toggle controls,
 * plus quiet hours and do-not-disturb settings.
 */
export class NotificationPreferencesPanel {
  private container: HTMLElement;
  private callbacks: PreferenceCallbacks;
  private state: NotificationPreferencesState;
  private isSaving = false;

  constructor(
    container: HTMLElement,
    initialState: NotificationPreferencesState,
    callbacks: PreferenceCallbacks = {}
  ) {
    this.container = container;
    this.state = initialState;
    this.callbacks = callbacks;
    this.render();
  }

  private render(): void {
    this.container.innerHTML = '';
    this.container.className = 'notification-preferences-panel';
    this.container.setAttribute('role', 'region');
    this.container.setAttribute('aria-label', 'Notification preferences');

    // Header
    const header = document.createElement('div');
    header.className = 'preferences-header';
    header.innerHTML = `
      <h2 class="preferences-title">Notification Preferences</h2>
      <p class="preferences-description">Choose how and when you receive notifications.</p>
    `;
    this.container.appendChild(header);

    // Do Not Disturb toggle
    this.container.appendChild(this.renderDoNotDisturb());

    // Quiet Hours
    this.container.appendChild(this.renderQuietHours());

    // Category preferences matrix
    this.container.appendChild(this.renderPreferencesMatrix());

    // Save button
    const saveRow = document.createElement('div');
    saveRow.className = 'preferences-save-row';
    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.className = 'preferences-save-btn';
    saveBtn.textContent = 'Save Preferences';
    saveBtn.setAttribute('aria-label', 'Save notification preferences');
    saveBtn.disabled = this.isSaving;
    saveBtn.addEventListener('click', () => this.handleSave());
    saveRow.appendChild(saveBtn);
    this.container.appendChild(saveRow);
  }

  private renderDoNotDisturb(): HTMLElement {
    const section = document.createElement('div');
    section.className = 'preferences-section dnd-section';

    const label = document.createElement('label');
    label.className = 'preference-toggle-label';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = this.state.doNotDisturb;
    checkbox.className = 'preference-checkbox';
    checkbox.setAttribute('aria-label', 'Do Not Disturb');
    checkbox.addEventListener('change', () => {
      this.state = { ...this.state, doNotDisturb: checkbox.checked };
    });

    const text = document.createElement('span');
    text.className = 'preference-toggle-text';
    text.innerHTML = `<strong>Do Not Disturb</strong><br><small>Pause all notifications</small>`;

    label.appendChild(checkbox);
    label.appendChild(text);
    section.appendChild(label);

    return section;
  }

  private renderQuietHours(): HTMLElement {
    const section = document.createElement('div');
    section.className = 'preferences-section quiet-hours-section';

    // Enable toggle
    const toggleLabel = document.createElement('label');
    toggleLabel.className = 'preference-toggle-label';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = this.state.quietHoursEnabled;
    checkbox.className = 'preference-checkbox';
    checkbox.setAttribute('aria-label', 'Enable quiet hours');
    checkbox.addEventListener('change', () => {
      this.state = { ...this.state, quietHoursEnabled: checkbox.checked };
      this.render();
    });

    const text = document.createElement('span');
    text.className = 'preference-toggle-text';
    text.innerHTML = `<strong>Quiet Hours</strong><br><small>Suppress push/email during specified hours</small>`;

    toggleLabel.appendChild(checkbox);
    toggleLabel.appendChild(text);
    section.appendChild(toggleLabel);

    // Time inputs (shown only when enabled)
    if (this.state.quietHoursEnabled) {
      const timeRow = document.createElement('div');
      timeRow.className = 'quiet-hours-times';

      const startLabel = document.createElement('label');
      startLabel.className = 'quiet-hours-time-label';
      startLabel.textContent = 'From: ';
      const startInput = document.createElement('input');
      startInput.type = 'time';
      startInput.value = this.state.quietHoursStart;
      startInput.className = 'quiet-hours-time-input';
      startInput.setAttribute('aria-label', 'Quiet hours start time');
      startInput.addEventListener('change', () => {
        this.state = { ...this.state, quietHoursStart: startInput.value };
      });
      startLabel.appendChild(startInput);

      const endLabel = document.createElement('label');
      endLabel.className = 'quiet-hours-time-label';
      endLabel.textContent = 'To: ';
      const endInput = document.createElement('input');
      endInput.type = 'time';
      endInput.value = this.state.quietHoursEnd;
      endInput.className = 'quiet-hours-time-input';
      endInput.setAttribute('aria-label', 'Quiet hours end time');
      endInput.addEventListener('change', () => {
        this.state = { ...this.state, quietHoursEnd: endInput.value };
      });
      endLabel.appendChild(endInput);

      timeRow.appendChild(startLabel);
      timeRow.appendChild(endLabel);
      section.appendChild(timeRow);
    }

    return section;
  }

  private renderPreferencesMatrix(): HTMLElement {
    const section = document.createElement('div');
    section.className = 'preferences-section matrix-section';

    // Table header
    const table = document.createElement('table');
    table.className = 'preferences-matrix-table';
    table.setAttribute('role', 'grid');
    table.setAttribute('aria-label', 'Notification preferences by category and channel');

    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');

    const categoryHeader = document.createElement('th');
    categoryHeader.textContent = 'Category';
    categoryHeader.scope = 'col';
    headerRow.appendChild(categoryHeader);

    for (const { channel, label } of DELIVERY_CHANNELS) {
      const th = document.createElement('th');
      th.textContent = label;
      th.scope = 'col';
      th.className = 'channel-header';

      // Column toggle
      th.addEventListener('click', () => {
        const allEnabled = NOTIFICATION_CATEGORIES.every(({ category }) =>
          getPreference(this.state, category, channel)
        );
        this.state = toggleChannel(this.state, channel, !allEnabled);
        this.render();
      });
      th.style.cursor = 'pointer';
      th.setAttribute('aria-label', `Toggle all ${label} notifications`);

      headerRow.appendChild(th);
    }
    thead.appendChild(headerRow);
    table.appendChild(thead);

    // Table body - one row per category
    const tbody = document.createElement('tbody');
    for (const { category, label, description } of NOTIFICATION_CATEGORIES) {
      const row = document.createElement('tr');
      row.className = 'preference-row';

      const categoryCell = document.createElement('td');
      categoryCell.className = 'category-cell';
      categoryCell.innerHTML = `<span class="category-label">${label}</span><br><small class="category-desc">${description}</small>`;
      row.appendChild(categoryCell);

      for (const { channel, label: channelLabel } of DELIVERY_CHANNELS) {
        const cell = document.createElement('td');
        cell.className = 'channel-cell';

        const toggle = document.createElement('input');
        toggle.type = 'checkbox';
        toggle.checked = getPreference(this.state, category, channel);
        toggle.className = 'preference-toggle';
        toggle.setAttribute(
          'aria-label',
          `${label} notifications via ${channelLabel}`
        );
        toggle.addEventListener('change', () => {
          this.state = updatePreference(this.state, category, channel, toggle.checked);
        });

        cell.appendChild(toggle);
        row.appendChild(cell);
      }

      tbody.appendChild(row);
    }
    table.appendChild(tbody);
    section.appendChild(table);

    return section;
  }

  private async handleSave(): Promise<void> {
    if (this.isSaving) return;
    this.isSaving = true;

    const saveBtn = this.container.querySelector('.preferences-save-btn') as HTMLButtonElement;
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.textContent = 'Saving...';
    }

    try {
      if (this.callbacks.onSave) {
        await this.callbacks.onSave(this.state);
      }
      if (saveBtn) {
        saveBtn.textContent = 'Saved!';
        setTimeout(() => {
          saveBtn.textContent = 'Save Preferences';
          saveBtn.disabled = false;
        }, 2000);
      }
    } catch {
      if (saveBtn) {
        saveBtn.textContent = 'Failed — Retry';
        saveBtn.disabled = false;
      }
    } finally {
      this.isSaving = false;
    }
  }

  /** Get the current preferences state. */
  public getState(): NotificationPreferencesState {
    return { ...this.state };
  }

  /** Update state externally (e.g., after loading from API). */
  public setState(state: NotificationPreferencesState): void {
    this.state = state;
    this.render();
  }

  public getElement(): HTMLElement {
    return this.container;
  }
}
