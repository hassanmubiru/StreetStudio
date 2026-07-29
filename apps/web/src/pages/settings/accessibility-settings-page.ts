/**
 * Accessibility and Preference Settings Page
 * 
 * Provides user controls for accessibility preferences including high contrast mode,
 * reduced motion, screen reader optimizations, keyboard navigation preferences,
 * and theme selection (light, dark, system) with live preview.
 * 
 * Requirements: 9.4, 9.8, 11.4, 11.7
 */

export type ThemeMode = 'light' | 'dark' | 'system';

export interface AccessibilityPreferences {
  highContrast: boolean;
  reducedMotion: boolean;
  screenReaderOptimizations: boolean;
  keyboardNavigation: KeyboardNavigationPreferences;
  theme: ThemeMode;
}

export interface KeyboardNavigationPreferences {
  enabled: boolean;
  showFocusIndicators: boolean;
  skipLinkEnabled: boolean;
  arrowKeyNavigation: boolean;
}

export const STORAGE_KEY = 'streetstudio-accessibility-preferences';

/**
 * Create default accessibility preferences
 */
export function createDefaultAccessibilityPreferences(): AccessibilityPreferences {
  return {
    highContrast: false,
    reducedMotion: getSystemReducedMotion(),
    screenReaderOptimizations: false,
    keyboardNavigation: {
      enabled: true,
      showFocusIndicators: true,
      skipLinkEnabled: true,
      arrowKeyNavigation: true,
    },
    theme: 'system',
  };
}

/**
 * Detect system reduced motion preference
 */
export function getSystemReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Detect system color scheme preference
 */
export function getSystemTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/**
 * Resolve the effective theme based on preference and system setting
 */
export function resolveTheme(theme: ThemeMode): 'light' | 'dark' {
  if (theme === 'system') {
    return getSystemTheme();
  }
  return theme;
}

/**
 * Load saved preferences from localStorage
 */
export function loadAccessibilityPreferences(): AccessibilityPreferences {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return { ...createDefaultAccessibilityPreferences(), ...parsed };
    }
  } catch {
    // Fall through to defaults
  }
  return createDefaultAccessibilityPreferences();
}

/**
 * Save preferences to localStorage
 */
export function saveAccessibilityPreferences(prefs: AccessibilityPreferences): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Storage may be unavailable
  }
}

/**
 * Apply accessibility preferences to the document
 */
export function applyAccessibilityPreferences(prefs: AccessibilityPreferences): void {
  const root = document.documentElement;

  // High contrast
  root.classList.toggle('high-contrast', prefs.highContrast);
  root.setAttribute('data-high-contrast', String(prefs.highContrast));

  // Reduced motion
  root.classList.toggle('reduced-motion', prefs.reducedMotion);
  root.setAttribute('data-reduced-motion', String(prefs.reducedMotion));

  // Screen reader optimizations
  root.setAttribute('data-screen-reader-optimized', String(prefs.screenReaderOptimizations));

  // Keyboard navigation
  root.classList.toggle('keyboard-nav', prefs.keyboardNavigation.enabled);
  root.classList.toggle('show-focus', prefs.keyboardNavigation.showFocusIndicators);
  root.setAttribute('data-keyboard-nav', String(prefs.keyboardNavigation.enabled));

  // Theme
  const effectiveTheme = resolveTheme(prefs.theme);
  root.classList.remove('light', 'dark');
  root.classList.add(effectiveTheme);
  root.setAttribute('data-theme', effectiveTheme);
  root.setAttribute('data-theme-preference', prefs.theme);
}

/**
 * Get the CSS for accessibility settings page and preferences
 */
export function getAccessibilityCSS(): string {
  return `
    /* High contrast mode */
    .high-contrast {
      --contrast-text: #000000;
      --contrast-bg: #ffffff;
      --contrast-border: #000000;
      --contrast-link: #0000ee;
      --contrast-focus: #ff0000;
    }
    .high-contrast.dark {
      --contrast-text: #ffffff;
      --contrast-bg: #000000;
      --contrast-border: #ffffff;
      --contrast-link: #ffff00;
      --contrast-focus: #ff0000;
    }
    .high-contrast * {
      border-color: var(--contrast-border) !important;
    }
    .high-contrast a { color: var(--contrast-link) !important; }

    /* Reduced motion */
    .reduced-motion *,
    .reduced-motion *::before,
    .reduced-motion *::after {
      animation-duration: 0.01ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: 0.01ms !important;
      scroll-behavior: auto !important;
    }

    /* Focus indicators */
    .show-focus :focus-visible {
      outline: 3px solid #2563eb;
      outline-offset: 3px;
    }
    .high-contrast.show-focus :focus-visible {
      outline: 3px solid var(--contrast-focus);
      outline-offset: 3px;
    }

    /* Theme preview cards */
    .theme-preview-card {
      border: 2px solid transparent;
      border-radius: 0.5rem;
      padding: 1rem;
      cursor: pointer;
      transition: border-color 0.15s;
    }
    .theme-preview-card[aria-checked="true"] {
      border-color: #2563eb;
    }
    .theme-preview-card:hover {
      border-color: #93c5fd;
    }
    .reduced-motion .theme-preview-card {
      transition: none;
    }
  `;
}

export class AccessibilitySettingsPage {
  private element: HTMLElement;
  private preferences: AccessibilityPreferences;
  private isDirty = false;
  private isSaving = false;
  private systemThemeListener: ((e: MediaQueryListEvent) => void) | null = null;
  private systemMotionListener: ((e: MediaQueryListEvent) => void) | null = null;

  constructor(initialPreferences?: Partial<AccessibilityPreferences>) {
    const defaults = createDefaultAccessibilityPreferences();
    this.preferences = initialPreferences
      ? { ...defaults, ...initialPreferences }
      : loadAccessibilityPreferences();

    this.element = document.createElement('div');
    this.element.className = 'p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto';
    this.element.setAttribute('data-main-content', '');
    this.element.setAttribute('data-testid', 'accessibility-settings');

    this.injectStyles();
    this.render();
    this.setupSystemListeners();
    // Apply on load
    applyAccessibilityPreferences(this.preferences);
  }

  public getElement(): HTMLElement {
    return this.element;
  }

  public getPreferences(): AccessibilityPreferences {
    return { ...this.preferences };
  }

  public isDirtyState(): boolean {
    return this.isDirty;
  }

  /**
   * Update preferences externally (e.g., after successful save)
   */
  public updatePreferences(prefs: Partial<AccessibilityPreferences>): void {
    this.preferences = { ...this.preferences, ...prefs };
    this.isDirty = false;
    applyAccessibilityPreferences(this.preferences);
    this.render();
  }

  private injectStyles(): void {
    if (!document.getElementById('accessibility-settings-styles')) {
      const style = document.createElement('style');
      style.id = 'accessibility-settings-styles';
      style.textContent = getAccessibilityCSS();
      document.head.appendChild(style);
    }
  }

  private setupSystemListeners(): void {
    // Listen for system theme changes
    const darkMq = window.matchMedia('(prefers-color-scheme: dark)');
    this.systemThemeListener = () => {
      if (this.preferences.theme === 'system') {
        applyAccessibilityPreferences(this.preferences);
      }
    };
    darkMq.addEventListener('change', this.systemThemeListener);

    // Listen for system reduced motion changes
    const motionMq = window.matchMedia('(prefers-reduced-motion: reduce)');
    this.systemMotionListener = () => {
      // Optionally auto-sync with system
    };
    motionMq.addEventListener('change', this.systemMotionListener);
  }

  private render(): void {
    this.element.innerHTML = '';
    this.element.appendChild(this.renderHeader());
    this.element.appendChild(this.renderThemeSection());
    this.element.appendChild(this.renderHighContrastSection());
    this.element.appendChild(this.renderReducedMotionSection());
    this.element.appendChild(this.renderScreenReaderSection());
    this.element.appendChild(this.renderKeyboardNavSection());
    this.element.appendChild(this.renderSaveBar());
    this.setupEventListeners();
  }

  private renderHeader(): HTMLElement {
    const header = document.createElement('div');
    header.className = 'mb-8';
    header.innerHTML = `
      <h1 class="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">
        Accessibility & Preferences
      </h1>
      <p class="mt-1 text-sm text-gray-600 dark:text-gray-400">
        Customize your experience with accessibility options and visual preferences.
      </p>
    `;
    return header;
  }

  private renderThemeSection(): HTMLElement {
    const section = document.createElement('section');
    section.className = 'bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6 mb-6';
    section.setAttribute('aria-labelledby', 'theme-heading');

    const currentTheme = this.preferences.theme;
    const effectiveTheme = resolveTheme(currentTheme);

    section.innerHTML = `
      <h2 id="theme-heading" class="text-lg font-medium text-gray-900 dark:text-white mb-2">
        Theme
      </h2>
      <p class="text-sm text-gray-600 dark:text-gray-400 mb-4">
        Choose your preferred color scheme. Changes are previewed immediately.
      </p>
      <div id="theme-group" role="radiogroup" aria-labelledby="theme-heading" class="grid grid-cols-1 sm:grid-cols-3 gap-4">
        ${this.renderThemeCard('light', 'Light', 'Always use light mode', currentTheme === 'light')}
        ${this.renderThemeCard('dark', 'Dark', 'Always use dark mode', currentTheme === 'dark')}
        ${this.renderThemeCard('system', 'System', `Follow system preference (currently ${effectiveTheme})`, currentTheme === 'system')}
      </div>
    `;
    return section;
  }

  private renderThemeCard(value: ThemeMode, label: string, description: string, selected: boolean): string {
    const previewBg = value === 'dark' ? 'bg-gray-900' : value === 'light' ? 'bg-white' : 'bg-gradient-to-r from-white to-gray-900';
    const previewText = value === 'dark' ? 'text-white' : value === 'light' ? 'text-gray-900' : 'text-gray-600';
    const borderClass = selected ? 'border-blue-500 ring-2 ring-blue-200' : 'border-gray-200 dark:border-gray-600';

    return `
      <div
        role="radio"
        aria-checked="${selected}"
        aria-label="${label} theme"
        tabindex="${selected ? '0' : '-1'}"
        data-theme-value="${value}"
        class="theme-preview-card border-2 ${borderClass} rounded-lg p-4 cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        <div class="h-16 rounded ${previewBg} border border-gray-300 dark:border-gray-600 mb-3 flex items-center justify-center">
          <span class="text-xs ${previewText} font-medium">${label}</span>
        </div>
        <div class="text-sm font-medium text-gray-900 dark:text-white">${label}</div>
        <div class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">${description}</div>
      </div>
    `;
  }

  private renderHighContrastSection(): HTMLElement {
    const section = document.createElement('section');
    section.className = 'bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6 mb-6';
    section.setAttribute('aria-labelledby', 'contrast-heading');

    section.innerHTML = `
      <h2 id="contrast-heading" class="text-lg font-medium text-gray-900 dark:text-white mb-2">
        High Contrast
      </h2>
      <p class="text-sm text-gray-600 dark:text-gray-400 mb-4">
        Increase color contrast for better readability. Meets WCAG AA standards.
      </p>
      <div class="flex items-center justify-between">
        <div>
          <span class="text-sm font-medium text-gray-900 dark:text-white">Enable high contrast mode</span>
          <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            Increases contrast ratios and uses more distinct borders.
          </p>
        </div>
        <label class="relative inline-flex items-center cursor-pointer" aria-label="Toggle high contrast mode">
          <input
            type="checkbox"
            id="high-contrast-toggle"
            class="sr-only peer"
            ${this.preferences.highContrast ? 'checked' : ''}
            aria-describedby="contrast-heading"
          />
          <div class="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-500 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
        </label>
      </div>
    `;
    return section;
  }

  private renderReducedMotionSection(): HTMLElement {
    const section = document.createElement('section');
    section.className = 'bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6 mb-6';
    section.setAttribute('aria-labelledby', 'motion-heading');

    const systemMotion = getSystemReducedMotion();

    section.innerHTML = `
      <h2 id="motion-heading" class="text-lg font-medium text-gray-900 dark:text-white mb-2">
        Reduced Motion
      </h2>
      <p class="text-sm text-gray-600 dark:text-gray-400 mb-4">
        Minimize animations and transitions throughout the application.
        ${systemMotion ? '<span class="text-amber-600 dark:text-amber-400">(Your system prefers reduced motion)</span>' : ''}
      </p>
      <div class="flex items-center justify-between">
        <div>
          <span class="text-sm font-medium text-gray-900 dark:text-white">Enable reduced motion</span>
          <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            Disables animations, transitions, and auto-playing content.
          </p>
        </div>
        <label class="relative inline-flex items-center cursor-pointer" aria-label="Toggle reduced motion">
          <input
            type="checkbox"
            id="reduced-motion-toggle"
            class="sr-only peer"
            ${this.preferences.reducedMotion ? 'checked' : ''}
            aria-describedby="motion-heading"
          />
          <div class="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-500 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
        </label>
      </div>
    `;
    return section;
  }

  private renderScreenReaderSection(): HTMLElement {
    const section = document.createElement('section');
    section.className = 'bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6 mb-6';
    section.setAttribute('aria-labelledby', 'screenreader-heading');

    section.innerHTML = `
      <h2 id="screenreader-heading" class="text-lg font-medium text-gray-900 dark:text-white mb-2">
        Screen Reader Optimizations
      </h2>
      <p class="text-sm text-gray-600 dark:text-gray-400 mb-4">
        Enhance the experience for screen reader users with additional context and announcements.
      </p>
      <div class="flex items-center justify-between">
        <div>
          <span class="text-sm font-medium text-gray-900 dark:text-white">Enable screen reader optimizations</span>
          <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            Adds extra ARIA descriptions, live region announcements, and landmark hints.
          </p>
        </div>
        <label class="relative inline-flex items-center cursor-pointer" aria-label="Toggle screen reader optimizations">
          <input
            type="checkbox"
            id="screen-reader-toggle"
            class="sr-only peer"
            ${this.preferences.screenReaderOptimizations ? 'checked' : ''}
            aria-describedby="screenreader-heading"
          />
          <div class="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-500 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
        </label>
      </div>
    `;
    return section;
  }

  private renderKeyboardNavSection(): HTMLElement {
    const section = document.createElement('section');
    section.className = 'bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6 mb-6';
    section.setAttribute('aria-labelledby', 'keyboard-heading');

    const kbPrefs = this.preferences.keyboardNavigation;

    section.innerHTML = `
      <h2 id="keyboard-heading" class="text-lg font-medium text-gray-900 dark:text-white mb-2">
        Keyboard Navigation
      </h2>
      <p class="text-sm text-gray-600 dark:text-gray-400 mb-4">
        Configure keyboard navigation behavior and focus management.
      </p>
      <div class="space-y-4">
        ${this.renderKeyboardToggle('kb-enabled', 'Enhanced keyboard navigation', 'Enable enhanced keyboard shortcuts and navigation patterns.', kbPrefs.enabled)}
        ${this.renderKeyboardToggle('kb-focus-indicators', 'Visible focus indicators', 'Show prominent focus rings on interactive elements.', kbPrefs.showFocusIndicators)}
        ${this.renderKeyboardToggle('kb-skip-link', 'Skip navigation links', 'Show skip links to jump past repetitive navigation.', kbPrefs.skipLinkEnabled)}
        ${this.renderKeyboardToggle('kb-arrow-nav', 'Arrow key navigation', 'Navigate between items in lists and menus using arrow keys.', kbPrefs.arrowKeyNavigation)}
      </div>
    `;
    return section;
  }

  private renderKeyboardToggle(id: string, label: string, description: string, checked: boolean): string {
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
            class="sr-only peer keyboard-nav-toggle"
            ${checked ? 'checked' : ''}
          />
          <div class="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-500 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-blue-600"></div>
        </label>
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
      <span id="a11y-save-status" class="text-sm ${statusClass}" aria-live="polite">${statusText}</span>
      <div class="flex gap-3">
        <button
          id="a11y-discard-changes"
          type="button"
          class="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 disabled:opacity-50"
          ${!this.isDirty ? 'disabled' : ''}
        >
          Discard
        </button>
        <button
          id="a11y-save-settings"
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

  private setupEventListeners(): void {
    // Theme selection
    const themeCards = this.element.querySelectorAll('[data-theme-value]');
    themeCards.forEach(card => {
      card.addEventListener('click', () => {
        const value = card.getAttribute('data-theme-value') as ThemeMode;
        this.setTheme(value);
      });
      card.addEventListener('keydown', (e) => {
        const event = e as KeyboardEvent;
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          const value = card.getAttribute('data-theme-value') as ThemeMode;
          this.setTheme(value);
        }
        // Arrow key navigation between theme cards
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

    // High contrast toggle
    const hcToggle = this.element.querySelector('#high-contrast-toggle') as HTMLInputElement;
    hcToggle?.addEventListener('change', () => {
      this.preferences.highContrast = hcToggle.checked;
      this.markDirty();
      applyAccessibilityPreferences(this.preferences);
    });

    // Reduced motion toggle
    const rmToggle = this.element.querySelector('#reduced-motion-toggle') as HTMLInputElement;
    rmToggle?.addEventListener('change', () => {
      this.preferences.reducedMotion = rmToggle.checked;
      this.markDirty();
      applyAccessibilityPreferences(this.preferences);
    });

    // Screen reader toggle
    const srToggle = this.element.querySelector('#screen-reader-toggle') as HTMLInputElement;
    srToggle?.addEventListener('change', () => {
      this.preferences.screenReaderOptimizations = srToggle.checked;
      this.markDirty();
      applyAccessibilityPreferences(this.preferences);
    });

    // Keyboard navigation toggles
    const kbEnabled = this.element.querySelector('#kb-enabled') as HTMLInputElement;
    kbEnabled?.addEventListener('change', () => {
      this.preferences.keyboardNavigation.enabled = kbEnabled.checked;
      this.markDirty();
      applyAccessibilityPreferences(this.preferences);
    });

    const kbFocus = this.element.querySelector('#kb-focus-indicators') as HTMLInputElement;
    kbFocus?.addEventListener('change', () => {
      this.preferences.keyboardNavigation.showFocusIndicators = kbFocus.checked;
      this.markDirty();
      applyAccessibilityPreferences(this.preferences);
    });

    const kbSkip = this.element.querySelector('#kb-skip-link') as HTMLInputElement;
    kbSkip?.addEventListener('change', () => {
      this.preferences.keyboardNavigation.skipLinkEnabled = kbSkip.checked;
      this.markDirty();
      applyAccessibilityPreferences(this.preferences);
    });

    const kbArrow = this.element.querySelector('#kb-arrow-nav') as HTMLInputElement;
    kbArrow?.addEventListener('change', () => {
      this.preferences.keyboardNavigation.arrowKeyNavigation = kbArrow.checked;
      this.markDirty();
      applyAccessibilityPreferences(this.preferences);
    });

    // Save button
    const saveBtn = this.element.querySelector('#a11y-save-settings');
    saveBtn?.addEventListener('click', () => this.handleSave());

    // Discard button
    const discardBtn = this.element.querySelector('#a11y-discard-changes');
    discardBtn?.addEventListener('click', () => this.handleDiscard());
  }

  private setTheme(theme: ThemeMode): void {
    this.preferences.theme = theme;
    this.markDirty();
    applyAccessibilityPreferences(this.preferences);

    // Update radio group visuals
    const cards = this.element.querySelectorAll('[data-theme-value]');
    cards.forEach(card => {
      const isSelected = card.getAttribute('data-theme-value') === theme;
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

    // Announce to screen readers
    this.announceChange(`Theme changed to ${theme}`);
  }

  private markDirty(): void {
    if (!this.isDirty) {
      this.isDirty = true;
      this.updateSaveBar();
    }
  }

  private updateSaveBar(): void {
    const statusEl = this.element.querySelector('#a11y-save-status');
    const saveBtn = this.element.querySelector('#a11y-save-settings') as HTMLButtonElement;
    const discardBtn = this.element.querySelector('#a11y-discard-changes') as HTMLButtonElement;

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

    // Persist to storage
    saveAccessibilityPreferences(this.preferences);

    // Dispatch save event for external handling
    this.element.dispatchEvent(new CustomEvent('accessibility-settings-save', {
      bubbles: true,
      detail: { preferences: this.getPreferences() },
    }));

    // Complete save
    setTimeout(() => {
      this.isSaving = false;
      this.isDirty = false;
      this.updateSaveBar();
      this.announceChange('Settings saved successfully');
    }, 300);
  }

  private handleDiscard(): void {
    // Reload from storage
    this.preferences = loadAccessibilityPreferences();
    this.isDirty = false;
    applyAccessibilityPreferences(this.preferences);
    this.render();
    this.announceChange('Changes discarded');
  }

  private announceChange(message: string): void {
    // Create or reuse a live region for announcements
    let liveRegion = document.getElementById('a11y-announcements');
    if (!liveRegion) {
      liveRegion = document.createElement('div');
      liveRegion.id = 'a11y-announcements';
      liveRegion.setAttribute('role', 'status');
      liveRegion.setAttribute('aria-live', 'polite');
      liveRegion.setAttribute('aria-atomic', 'true');
      liveRegion.className = 'sr-only';
      document.body.appendChild(liveRegion);
    }
    liveRegion.textContent = message;
  }

  /**
   * Cleanup resources and listeners
   */
  public destroy(): void {
    if (this.systemThemeListener) {
      window.matchMedia('(prefers-color-scheme: dark)').removeEventListener('change', this.systemThemeListener);
    }
    if (this.systemMotionListener) {
      window.matchMedia('(prefers-reduced-motion: reduce)').removeEventListener('change', this.systemMotionListener);
    }
    const announcements = document.getElementById('a11y-announcements');
    announcements?.remove();
    const styles = document.getElementById('accessibility-settings-styles');
    styles?.remove();
    this.element.innerHTML = '';
  }
}
