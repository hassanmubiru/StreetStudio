/**
 * Privacy and Data Management Settings Page
 * 
 * Provides privacy controls including profile visibility settings,
 * data export functionality with progress tracking, data deletion
 * with multi-step confirmation workflows, and activity sharing preferences.
 * 
 * Requirements: 9.5, 9.9
 */

// --- Types ---

export type ProfileVisibility = 'public' | 'organization' | 'private';

export interface ActivitySharingPreferences {
  showOnlineStatus: boolean;
  showRecentActivity: boolean;
  showVideoHistory: boolean;
  showProjectMembership: boolean;
  allowActivityFeed: boolean;
}

export interface PrivacySettings {
  profileVisibility: ProfileVisibility;
  activitySharing: ActivitySharingPreferences;
}

export type DataExportStatus = 'idle' | 'preparing' | 'exporting' | 'completed' | 'failed';

export interface DataExportState {
  status: DataExportStatus;
  progress: number; // 0-100
  estimatedTimeRemaining?: number; // seconds
  downloadUrl?: string;
  error?: string;
  requestedAt?: string;
}

export type DeletionStep = 'initial' | 'confirm' | 'verify' | 'complete';

export interface DataDeletionState {
  step: DeletionStep;
  confirmationText: string;
  isProcessing: boolean;
  error?: string;
}

export const PRIVACY_STORAGE_KEY = 'streetstudio-privacy-settings';
export const DELETION_CONFIRMATION_TEXT = 'DELETE MY DATA';

// --- Defaults ---

export function createDefaultActivitySharing(): ActivitySharingPreferences {
  return {
    showOnlineStatus: true,
    showRecentActivity: true,
    showVideoHistory: true,
    showProjectMembership: true,
    allowActivityFeed: true,
  };
}

export function createDefaultPrivacySettings(): PrivacySettings {
  return {
    profileVisibility: 'organization',
    activitySharing: createDefaultActivitySharing(),
  };
}

export function createDefaultExportState(): DataExportState {
  return {
    status: 'idle',
    progress: 0,
  };
}

export function createDefaultDeletionState(): DataDeletionState {
  return {
    step: 'initial',
    confirmationText: '',
    isProcessing: false,
  };
}

// --- Storage ---

export function loadPrivacySettings(): PrivacySettings {
  try {
    const stored = localStorage.getItem(PRIVACY_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return { ...createDefaultPrivacySettings(), ...parsed };
    }
  } catch {
    // Fall through to defaults
  }
  return createDefaultPrivacySettings();
}

export function savePrivacySettings(settings: PrivacySettings): void {
  try {
    localStorage.setItem(PRIVACY_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Storage may be unavailable
  }
}

// --- Visibility helpers ---

export const VISIBILITY_OPTIONS: { value: ProfileVisibility; label: string; description: string }[] = [
  { value: 'public', label: 'Public', description: 'Anyone can view your profile and activity' },
  { value: 'organization', label: 'Organization Only', description: 'Only members of your organizations can see your profile' },
  { value: 'private', label: 'Private', description: 'Your profile is hidden from everyone except you' },
];

// --- Main Page Class ---

export class PrivacySettingsPage {
  private element: HTMLElement;
  private settings: PrivacySettings;
  private exportState: DataExportState;
  private deletionState: DataDeletionState;
  private isDirty = false;
  private isSaving = false;
  private exportTimer: ReturnType<typeof setInterval> | null = null;

  constructor(initialSettings?: Partial<PrivacySettings>) {
    const defaults = createDefaultPrivacySettings();
    this.settings = initialSettings
      ? { ...defaults, ...initialSettings }
      : loadPrivacySettings();
    this.exportState = createDefaultExportState();
    this.deletionState = createDefaultDeletionState();

    this.element = document.createElement('div');
    this.element.className = 'p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto';
    this.element.setAttribute('data-main-content', '');
    this.element.setAttribute('data-testid', 'privacy-settings');

    this.render();
  }

  public getElement(): HTMLElement {
    return this.element;
  }

  public getSettings(): PrivacySettings {
    return { ...this.settings, activitySharing: { ...this.settings.activitySharing } };
  }

  public getExportState(): DataExportState {
    return { ...this.exportState };
  }

  public getDeletionState(): DataDeletionState {
    return { ...this.deletionState };
  }

  public isDirtyState(): boolean {
    return this.isDirty;
  }

  public destroy(): void {
    if (this.exportTimer) {
      clearInterval(this.exportTimer);
      this.exportTimer = null;
    }
    const announcements = document.getElementById('privacy-announcements');
    announcements?.remove();
  }

  // --- Render Methods ---

  private render(): void {
    this.element.innerHTML = '';
    this.element.appendChild(this.renderHeader());
    this.element.appendChild(this.renderVisibilitySection());
    this.element.appendChild(this.renderActivitySharingSection());
    this.element.appendChild(this.renderDataExportSection());
    this.element.appendChild(this.renderDataDeletionSection());
    this.element.appendChild(this.renderSaveBar());
    this.setupEventListeners();
  }

  private renderHeader(): HTMLElement {
    const header = document.createElement('div');
    header.className = 'mb-8';
    header.innerHTML = `
      <h1 class="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">
        Privacy & Data Management
      </h1>
      <p class="mt-1 text-sm text-gray-600 dark:text-gray-400">
        Control your profile visibility, manage activity sharing, and handle your data.
      </p>
    `;
    return header;
  }

  private renderVisibilitySection(): HTMLElement {
    const section = document.createElement('section');
    section.className = 'bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6 mb-6';
    section.setAttribute('aria-labelledby', 'visibility-heading');

    const optionsHtml = VISIBILITY_OPTIONS.map(opt => {
      const isSelected = this.settings.profileVisibility === opt.value;
      const borderClass = isSelected
        ? 'border-blue-500 ring-2 ring-blue-200'
        : 'border-gray-200 dark:border-gray-600';
      return `
        <div
          role="radio"
          aria-checked="${isSelected}"
          aria-label="${opt.label} visibility"
          tabindex="${isSelected ? '0' : '-1'}"
          data-visibility-value="${opt.value}"
          class="visibility-option border-2 ${borderClass} rounded-lg p-4 cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <div class="text-sm font-medium text-gray-900 dark:text-white">${opt.label}</div>
          <div class="text-xs text-gray-500 dark:text-gray-400 mt-1">${opt.description}</div>
        </div>
      `;
    }).join('');

    section.innerHTML = `
      <h2 id="visibility-heading" class="text-lg font-medium text-gray-900 dark:text-white mb-2">
        Profile Visibility
      </h2>
      <p class="text-sm text-gray-600 dark:text-gray-400 mb-4">
        Choose who can see your profile information and activity.
      </p>
      <div id="visibility-group" role="radiogroup" aria-labelledby="visibility-heading" class="grid grid-cols-1 sm:grid-cols-3 gap-4">
        ${optionsHtml}
      </div>
    `;
    return section;
  }

  private renderActivitySharingSection(): HTMLElement {
    const section = document.createElement('section');
    section.className = 'bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6 mb-6';
    section.setAttribute('aria-labelledby', 'activity-sharing-heading');

    const prefs = this.settings.activitySharing;

    section.innerHTML = `
      <h2 id="activity-sharing-heading" class="text-lg font-medium text-gray-900 dark:text-white mb-2">
        Activity Sharing
      </h2>
      <p class="text-sm text-gray-600 dark:text-gray-400 mb-4">
        Control what activity information is visible to others.
      </p>
      <div class="space-y-4">
        ${this.renderActivityToggle('show-online-status', 'Show online status', 'Let others see when you are online.', prefs.showOnlineStatus)}
        ${this.renderActivityToggle('show-recent-activity', 'Show recent activity', 'Display your recent actions in organization feeds.', prefs.showRecentActivity)}
        ${this.renderActivityToggle('show-video-history', 'Show video viewing history', 'Let others see which videos you have watched.', prefs.showVideoHistory)}
        ${this.renderActivityToggle('show-project-membership', 'Show project membership', 'Display projects you belong to on your profile.', prefs.showProjectMembership)}
        ${this.renderActivityToggle('allow-activity-feed', 'Allow activity feed', 'Include your actions in team activity feeds.', prefs.allowActivityFeed)}
      </div>
    `;
    return section;
  }

  private renderActivityToggle(id: string, label: string, description: string, checked: boolean): string {
    return `
      <div class="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-700 last:border-0">
        <div>
          <span class="text-sm font-medium text-gray-900 dark:text-white">${label}</span>
          <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">${description}</p>
        </div>
        <label class="relative inline-flex items-center cursor-pointer" aria-label="Toggle ${label.toLowerCase()}">
          <input
            type="checkbox"
            id="${id}"
            class="sr-only peer activity-toggle"
            ${checked ? 'checked' : ''}
          />
          <div class="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-500 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
        </label>
      </div>
    `;
  }

  private renderDataExportSection(): HTMLElement {
    const section = document.createElement('section');
    section.className = 'bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6 mb-6';
    section.setAttribute('aria-labelledby', 'data-export-heading');

    let statusContent: string;

    switch (this.exportState.status) {
      case 'preparing':
      case 'exporting':
        statusContent = this.renderExportProgress();
        break;
      case 'completed':
        statusContent = this.renderExportCompleted();
        break;
      case 'failed':
        statusContent = this.renderExportFailed();
        break;
      default:
        statusContent = this.renderExportIdle();
    }

    section.innerHTML = `
      <h2 id="data-export-heading" class="text-lg font-medium text-gray-900 dark:text-white mb-2">
        Data Export
      </h2>
      <p class="text-sm text-gray-600 dark:text-gray-400 mb-4">
        Download a copy of all your data including profile, videos, comments, and settings.
      </p>
      <div id="export-status-container">${statusContent}</div>
    `;
    return section;
  }

  private renderExportIdle(): string {
    return `
      <button
        id="start-export-btn"
        type="button"
        class="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md shadow-sm hover:bg-blue-700 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
      >
        Request Data Export
      </button>
      <p class="mt-2 text-xs text-gray-500 dark:text-gray-400">
        This process may take several minutes depending on the amount of data.
      </p>
    `;
  }

  private renderExportProgress(): string {
    const percent = this.exportState.progress;
    const eta = this.exportState.estimatedTimeRemaining;
    const etaText = eta != null ? `Estimated time remaining: ${formatSeconds(eta)}` : 'Calculating...';
    const statusLabel = this.exportState.status === 'preparing' ? 'Preparing export...' : 'Exporting data...';

    return `
      <div class="space-y-3" aria-live="polite">
        <div class="flex items-center justify-between text-sm">
          <span class="font-medium text-gray-900 dark:text-white">${statusLabel}</span>
          <span id="export-percent" class="text-gray-600 dark:text-gray-400">${percent}%</span>
        </div>
        <div class="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5" role="progressbar" aria-valuenow="${percent}" aria-valuemin="0" aria-valuemax="100" aria-label="Data export progress">
          <div id="export-progress-bar" class="bg-blue-600 h-2.5 rounded-full transition-all" style="width: ${percent}%"></div>
        </div>
        <p id="export-eta" class="text-xs text-gray-500 dark:text-gray-400">${etaText}</p>
        <button
          id="cancel-export-btn"
          type="button"
          class="text-sm text-red-600 dark:text-red-400 hover:text-red-500 font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-red-500 rounded px-2 py-1"
        >
          Cancel Export
        </button>
      </div>
    `;
  }

  private renderExportCompleted(): string {
    return `
      <div class="flex items-center gap-3 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg mb-4" role="alert">
        <svg class="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
        </svg>
        <span class="text-sm text-green-800 dark:text-green-200">Your data export is ready for download.</span>
      </div>
      <div class="flex gap-3">
        <button
          id="download-export-btn"
          type="button"
          class="px-4 py-2 text-sm font-medium text-white bg-green-600 border border-transparent rounded-md shadow-sm hover:bg-green-700 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
        >
          Download Export
        </button>
        <button
          id="new-export-btn"
          type="button"
          class="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
        >
          Request New Export
        </button>
      </div>
    `;
  }

  private renderExportFailed(): string {
    const errorMsg = this.exportState.error || 'An unexpected error occurred during export.';
    return `
      <div class="flex items-center gap-3 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg mb-4" role="alert">
        <svg class="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
        </svg>
        <span class="text-sm text-red-800 dark:text-red-200">${this.escapeHtml(errorMsg)}</span>
      </div>
      <button
        id="retry-export-btn"
        type="button"
        class="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md shadow-sm hover:bg-blue-700 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
      >
        Retry Export
      </button>
    `;
  }

  private renderDataDeletionSection(): HTMLElement {
    const section = document.createElement('section');
    section.className = 'bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6 mb-6';
    section.setAttribute('aria-labelledby', 'data-deletion-heading');

    let content: string;
    switch (this.deletionState.step) {
      case 'confirm':
        content = this.renderDeletionConfirmStep();
        break;
      case 'verify':
        content = this.renderDeletionVerifyStep();
        break;
      case 'complete':
        content = this.renderDeletionComplete();
        break;
      default:
        content = this.renderDeletionInitial();
    }

    section.innerHTML = `
      <h2 id="data-deletion-heading" class="text-lg font-medium text-red-700 dark:text-red-400 mb-2">
        Data Deletion
      </h2>
      <p class="text-sm text-gray-600 dark:text-gray-400 mb-4">
        Permanently delete your account data. This action cannot be undone.
      </p>
      <div id="deletion-container">${content}</div>
    `;
    return section;
  }

  private renderDeletionInitial(): string {
    return `
      <div class="flex items-center gap-3 p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg mb-4">
        <svg class="w-5 h-5 text-yellow-600 dark:text-yellow-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"></path>
        </svg>
        <span class="text-sm text-yellow-800 dark:text-yellow-200">
          We recommend exporting your data before deletion. Once deleted, your data cannot be recovered.
        </span>
      </div>
      <button
        id="begin-deletion-btn"
        type="button"
        class="px-4 py-2 text-sm font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
      >
        Delete My Data
      </button>
    `;
  }

  private renderDeletionConfirmStep(): string {
    return `
      <div class="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg mb-4" role="alert">
        <h3 class="text-sm font-semibold text-red-800 dark:text-red-200 mb-2">Are you sure?</h3>
        <p class="text-sm text-red-700 dark:text-red-300 mb-1">This will permanently delete:</p>
        <ul class="text-sm text-red-700 dark:text-red-300 list-disc list-inside space-y-1">
          <li>Your profile and account information</li>
          <li>All videos and recordings you own</li>
          <li>All comments and reactions you have made</li>
          <li>Your project memberships and permissions</li>
        </ul>
      </div>
      <div class="flex gap-3">
        <button
          id="confirm-deletion-btn"
          type="button"
          class="px-4 py-2 text-sm font-medium text-white bg-red-600 border border-transparent rounded-md shadow-sm hover:bg-red-700 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
        >
          Yes, Continue to Delete
        </button>
        <button
          id="cancel-deletion-btn"
          type="button"
          class="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
        >
          Cancel
        </button>
      </div>
    `;
  }

  private renderDeletionVerifyStep(): string {
    const errorHtml = this.deletionState.error
      ? `<p id="deletion-verify-error" class="mt-2 text-sm text-red-600 dark:text-red-400" role="alert">${this.escapeHtml(this.deletionState.error)}</p>`
      : '';

    return `
      <div class="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg mb-4">
        <h3 class="text-sm font-semibold text-red-800 dark:text-red-200 mb-2">Final Verification</h3>
        <p class="text-sm text-red-700 dark:text-red-300">
          Type <strong>${DELETION_CONFIRMATION_TEXT}</strong> below to confirm permanent deletion.
        </p>
      </div>
      <div class="mb-4">
        <label for="deletion-confirm-input" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Confirmation
        </label>
        <input
          id="deletion-confirm-input"
          type="text"
          autocomplete="off"
          placeholder="Type ${DELETION_CONFIRMATION_TEXT}"
          class="w-full max-w-sm px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-gray-900 dark:text-white bg-white dark:bg-gray-700 focus:ring-2 focus:ring-red-500 focus:border-red-500 transition-colors"
          aria-describedby="deletion-confirm-help"
        />
        <p id="deletion-confirm-help" class="mt-1 text-xs text-gray-500 dark:text-gray-400">
          This action is irreversible.
        </p>
        ${errorHtml}
      </div>
      <div class="flex gap-3">
        <button
          id="execute-deletion-btn"
          type="button"
          class="px-4 py-2 text-sm font-medium text-white bg-red-600 border border-transparent rounded-md shadow-sm hover:bg-red-700 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50 disabled:cursor-not-allowed"
          ${this.deletionState.isProcessing ? 'disabled' : ''}
        >
          ${this.deletionState.isProcessing ? 'Deleting...' : 'Permanently Delete All Data'}
        </button>
        <button
          id="cancel-deletion-btn"
          type="button"
          class="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
          ${this.deletionState.isProcessing ? 'disabled' : ''}
        >
          Cancel
        </button>
      </div>
    `;
  }

  private renderDeletionComplete(): string {
    return `
      <div class="flex items-center gap-3 p-4 bg-gray-50 dark:bg-gray-900/20 border border-gray-200 dark:border-gray-700 rounded-lg" role="alert">
        <svg class="w-5 h-5 text-gray-600 dark:text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
        </svg>
        <span class="text-sm text-gray-800 dark:text-gray-200">
          Your data deletion request has been submitted. You will be signed out shortly.
        </span>
      </div>
    `;
  }

  private renderSaveBar(): HTMLElement {
    const bar = document.createElement('div');
    bar.className = 'sticky bottom-0 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 p-4 -mx-4 sm:-mx-6 lg:-mx-8 flex items-center justify-between';
    bar.setAttribute('role', 'toolbar');
    bar.setAttribute('aria-label', 'Save actions');

    const statusText = this.isSaving ? 'Saving...' : this.isDirty ? 'Unsaved changes' : 'All changes saved';
    const statusClass = this.isDirty ? 'text-amber-600 dark:text-amber-400' : 'text-green-600 dark:text-green-400';

    bar.innerHTML = `
      <span id="privacy-save-status" class="text-sm ${statusClass}" aria-live="polite">${statusText}</span>
      <div class="flex gap-3">
        <button
          id="privacy-discard-changes"
          type="button"
          class="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 disabled:opacity-50"
          ${!this.isDirty ? 'disabled' : ''}
        >
          Discard
        </button>
        <button
          id="privacy-save-settings"
          type="button"
          class="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md shadow-sm hover:bg-blue-700 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          ${!this.isDirty || this.isSaving ? 'disabled' : ''}
        >
          ${this.isSaving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
    `;
    return bar;
  }

  // --- Event Listeners ---

  private setupEventListeners(): void {
    this.setupVisibilityListeners();
    this.setupActivityToggleListeners();
    this.setupExportListeners();
    this.setupDeletionListeners();
    this.setupSaveBarListeners();
  }

  private setupVisibilityListeners(): void {
    const cards = this.element.querySelectorAll('[data-visibility-value]');
    cards.forEach(card => {
      card.addEventListener('click', () => {
        const value = card.getAttribute('data-visibility-value') as ProfileVisibility;
        this.setVisibility(value);
      });
      card.addEventListener('keydown', (e) => {
        const event = e as KeyboardEvent;
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          const value = card.getAttribute('data-visibility-value') as ProfileVisibility;
          this.setVisibility(value);
        }
        if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
          event.preventDefault();
          const next = card.nextElementSibling as HTMLElement;
          next?.focus();
        }
        if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
          event.preventDefault();
          const prev = card.previousElementSibling as HTMLElement;
          prev?.focus();
        }
      });
    });
  }

  private setupActivityToggleListeners(): void {
    const toggleMap: Record<string, keyof ActivitySharingPreferences> = {
      'show-online-status': 'showOnlineStatus',
      'show-recent-activity': 'showRecentActivity',
      'show-video-history': 'showVideoHistory',
      'show-project-membership': 'showProjectMembership',
      'allow-activity-feed': 'allowActivityFeed',
    };

    for (const [id, key] of Object.entries(toggleMap)) {
      const toggle = this.element.querySelector(`#${id}`) as HTMLInputElement;
      toggle?.addEventListener('change', () => {
        this.settings.activitySharing[key] = toggle.checked;
        this.markDirty();
      });
    }
  }

  private setupExportListeners(): void {
    const startBtn = this.element.querySelector('#start-export-btn');
    startBtn?.addEventListener('click', () => this.startExport());

    const cancelBtn = this.element.querySelector('#cancel-export-btn');
    cancelBtn?.addEventListener('click', () => this.cancelExport());

    const downloadBtn = this.element.querySelector('#download-export-btn');
    downloadBtn?.addEventListener('click', () => this.downloadExport());

    const newExportBtn = this.element.querySelector('#new-export-btn');
    newExportBtn?.addEventListener('click', () => this.startExport());

    const retryBtn = this.element.querySelector('#retry-export-btn');
    retryBtn?.addEventListener('click', () => this.startExport());
  }

  private setupDeletionListeners(): void {
    const beginBtn = this.element.querySelector('#begin-deletion-btn');
    beginBtn?.addEventListener('click', () => this.advanceDeletion('confirm'));

    const confirmBtn = this.element.querySelector('#confirm-deletion-btn');
    confirmBtn?.addEventListener('click', () => this.advanceDeletion('verify'));

    const cancelBtn = this.element.querySelector('#cancel-deletion-btn');
    cancelBtn?.addEventListener('click', () => this.resetDeletion());

    const executeBtn = this.element.querySelector('#execute-deletion-btn');
    executeBtn?.addEventListener('click', () => this.executeDeletion());
  }

  private setupSaveBarListeners(): void {
    const saveBtn = this.element.querySelector('#privacy-save-settings');
    saveBtn?.addEventListener('click', () => this.handleSave());

    const discardBtn = this.element.querySelector('#privacy-discard-changes');
    discardBtn?.addEventListener('click', () => this.handleDiscard());
  }

  // --- Actions ---

  private setVisibility(value: ProfileVisibility): void {
    this.settings.profileVisibility = value;
    this.markDirty();

    // Update radio group visuals
    const cards = this.element.querySelectorAll('[data-visibility-value]');
    cards.forEach(card => {
      const isSelected = card.getAttribute('data-visibility-value') === value;
      card.setAttribute('aria-checked', String(isSelected));
      card.setAttribute('tabindex', isSelected ? '0' : '-1');
      if (isSelected) {
        card.classList.add('border-blue-500', 'ring-2', 'ring-blue-200');
        card.classList.remove('border-gray-200', 'dark:border-gray-600');
      } else {
        card.classList.remove('border-blue-500', 'ring-2', 'ring-blue-200');
        card.classList.add('border-gray-200', 'dark:border-gray-600');
      }
    });

    this.announceChange(`Profile visibility set to ${value}`);
  }

  public startExport(): void {
    this.exportState = {
      status: 'preparing',
      progress: 0,
      estimatedTimeRemaining: 60,
      requestedAt: new Date().toISOString(),
    };
    this.render();

    // Dispatch event for external handling
    this.element.dispatchEvent(new CustomEvent('privacy-export-start', {
      bubbles: true,
      detail: { state: this.getExportState() },
    }));

    // Simulate progress (in production, this would be driven by API polling)
    this.simulateExportProgress();
  }

  private simulateExportProgress(): void {
    if (this.exportTimer) {
      clearInterval(this.exportTimer);
    }

    this.exportTimer = setInterval(() => {
      if (this.exportState.status === 'idle' || this.exportState.status === 'completed' || this.exportState.status === 'failed') {
        if (this.exportTimer) {
          clearInterval(this.exportTimer);
          this.exportTimer = null;
        }
        return;
      }

      this.exportState.progress = Math.min(100, this.exportState.progress + Math.random() * 15);
      if (this.exportState.progress >= 20 && this.exportState.status === 'preparing') {
        this.exportState.status = 'exporting';
      }
      if (this.exportState.estimatedTimeRemaining != null) {
        this.exportState.estimatedTimeRemaining = Math.max(0, this.exportState.estimatedTimeRemaining - 3);
      }

      if (this.exportState.progress >= 100) {
        this.exportState.progress = 100;
        this.exportState.status = 'completed';
        this.exportState.downloadUrl = '/api/data-export/download';
        this.exportState.estimatedTimeRemaining = 0;
        if (this.exportTimer) {
          clearInterval(this.exportTimer);
          this.exportTimer = null;
        }
        this.render();
        this.announceChange('Data export completed');
        this.element.dispatchEvent(new CustomEvent('privacy-export-complete', {
          bubbles: true,
          detail: { state: this.getExportState() },
        }));
      } else {
        this.updateExportProgressUI();
      }
    }, 500);
  }

  private updateExportProgressUI(): void {
    const bar = this.element.querySelector('#export-progress-bar') as HTMLElement;
    const percent = this.element.querySelector('#export-percent');
    const eta = this.element.querySelector('#export-eta');
    const progressbar = this.element.querySelector('[role="progressbar"]');

    if (bar) bar.style.width = `${Math.round(this.exportState.progress)}%`;
    if (percent) percent.textContent = `${Math.round(this.exportState.progress)}%`;
    if (progressbar) progressbar.setAttribute('aria-valuenow', String(Math.round(this.exportState.progress)));
    if (eta && this.exportState.estimatedTimeRemaining != null) {
      eta.textContent = `Estimated time remaining: ${formatSeconds(this.exportState.estimatedTimeRemaining)}`;
    }
  }

  public cancelExport(): void {
    if (this.exportTimer) {
      clearInterval(this.exportTimer);
      this.exportTimer = null;
    }
    this.exportState = createDefaultExportState();
    this.render();
    this.announceChange('Data export cancelled');
    this.element.dispatchEvent(new CustomEvent('privacy-export-cancel', { bubbles: true }));
  }

  private downloadExport(): void {
    this.element.dispatchEvent(new CustomEvent('privacy-export-download', {
      bubbles: true,
      detail: { downloadUrl: this.exportState.downloadUrl },
    }));
  }

  /**
   * Programmatically update export state (e.g., from API polling)
   */
  public updateExportState(state: Partial<DataExportState>): void {
    this.exportState = { ...this.exportState, ...state };
    if (state.status === 'completed' || state.status === 'failed' || state.status === 'idle') {
      if (this.exportTimer) {
        clearInterval(this.exportTimer);
        this.exportTimer = null;
      }
    }
    this.render();
  }

  private advanceDeletion(step: DeletionStep): void {
    this.deletionState.step = step;
    this.deletionState.error = undefined;
    this.render();

    this.element.dispatchEvent(new CustomEvent('privacy-deletion-step', {
      bubbles: true,
      detail: { step },
    }));
  }

  private resetDeletion(): void {
    this.deletionState = createDefaultDeletionState();
    this.render();
  }

  private executeDeletion(): void {
    const input = this.element.querySelector('#deletion-confirm-input') as HTMLInputElement;
    const value = input?.value?.trim() || '';

    if (value !== DELETION_CONFIRMATION_TEXT) {
      this.deletionState.error = `Please type "${DELETION_CONFIRMATION_TEXT}" exactly to confirm.`;
      this.render();
      return;
    }

    this.deletionState.isProcessing = true;
    this.deletionState.error = undefined;
    this.render();

    // Dispatch event for external handling
    this.element.dispatchEvent(new CustomEvent('privacy-deletion-execute', {
      bubbles: true,
      detail: { confirmed: true },
    }));

    // Simulate completion (in production, backend drives this)
    setTimeout(() => {
      this.deletionState.step = 'complete';
      this.deletionState.isProcessing = false;
      this.render();
      this.announceChange('Data deletion request submitted');
    }, 1500);
  }

  // --- Save/Discard ---

  private markDirty(): void {
    if (!this.isDirty) {
      this.isDirty = true;
      this.updateSaveBar();
    }
  }

  private updateSaveBar(): void {
    const statusEl = this.element.querySelector('#privacy-save-status');
    const saveBtn = this.element.querySelector('#privacy-save-settings') as HTMLButtonElement;
    const discardBtn = this.element.querySelector('#privacy-discard-changes') as HTMLButtonElement;

    if (statusEl) {
      if (this.isSaving) {
        statusEl.textContent = 'Saving...';
        statusEl.className = 'text-sm text-blue-600 dark:text-blue-400';
      } else if (this.isDirty) {
        statusEl.textContent = 'Unsaved changes';
        statusEl.className = 'text-sm text-amber-600 dark:text-amber-400';
      } else {
        statusEl.textContent = 'All changes saved';
        statusEl.className = 'text-sm text-green-600 dark:text-green-400';
      }
    }

    if (saveBtn) {
      saveBtn.disabled = !this.isDirty || this.isSaving;
      saveBtn.textContent = this.isSaving ? 'Saving...' : 'Save Changes';
    }
    if (discardBtn) {
      discardBtn.disabled = !this.isDirty;
    }
  }

  private handleSave(): void {
    this.isSaving = true;
    this.updateSaveBar();

    savePrivacySettings(this.settings);

    this.element.dispatchEvent(new CustomEvent('privacy-settings-save', {
      bubbles: true,
      detail: { settings: this.getSettings() },
    }));

    setTimeout(() => {
      this.isSaving = false;
      this.isDirty = false;
      this.updateSaveBar();
      this.announceChange('Privacy settings saved');
    }, 300);
  }

  private handleDiscard(): void {
    this.settings = loadPrivacySettings();
    this.isDirty = false;
    this.render();
    this.announceChange('Changes discarded');
  }

  // --- Utilities ---

  private announceChange(message: string): void {
    let liveRegion = document.getElementById('privacy-announcements');
    if (!liveRegion) {
      liveRegion = document.createElement('div');
      liveRegion.id = 'privacy-announcements';
      liveRegion.setAttribute('role', 'status');
      liveRegion.setAttribute('aria-live', 'polite');
      liveRegion.setAttribute('aria-atomic', 'true');
      liveRegion.className = 'sr-only';
      document.body.appendChild(liveRegion);
    }
    liveRegion.textContent = message;
  }

  private escapeHtml(str: string): string {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
}

// --- Module-level utility ---

export function formatSeconds(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)} seconds`;
  const minutes = Math.floor(seconds / 60);
  const remaining = Math.round(seconds % 60);
  if (remaining === 0) return `${minutes} minute${minutes > 1 ? 's' : ''}`;
  return `${minutes}m ${remaining}s`;
}
