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
