/**
 * High Contrast Mode and Color Accessibility
 * 
 * Provides CSS utilities for high contrast mode detection, color accessibility
 * validation helpers, and forced-colors media query support to meet WCAG AA
 * contrast ratio standards.
 * 
 * Requirements: 11.4 - High contrast mode with sufficient color contrast ratios
 * meeting WCAG AA standards
 */

/** Result of a contrast ratio check */
export interface ContrastResult {
  /** The calculated contrast ratio (e.g., 4.5:1 becomes 4.5) */
  ratio: number;
  /** Whether the pair passes WCAG AA for normal text (≥ 4.5:1) */
  passesAA: boolean;
  /** Whether the pair passes WCAG AA for large text (≥ 3:1) */
  passesAALargeText: boolean;
  /** Whether the pair passes WCAG AAA for normal text (≥ 7:1) */
  passesAAA: boolean;
  /** Whether the pair passes WCAG AAA for large text (≥ 4.5:1) */
  passesAAALargeText: boolean;
}

/** RGB color representation */
interface RGB {
  r: number;
  g: number;
  b: number;
}

/**
 * High contrast mode manager that detects and responds to system-level
 * forced colors / high contrast preferences.
 */
export class HighContrastMode {
  private isActive: boolean = false;
  private listeners: Array<(active: boolean) => void> = [];
  private mediaQuery: MediaQueryList | null = null;
  private styleElement: HTMLStyleElement | null = null;

  constructor() {
    if (typeof window !== 'undefined') {
      this.mediaQuery = window.matchMedia('(forced-colors: active)');
      this.isActive = this.mediaQuery.matches;
    }
  }

  /**
   * Initialize high contrast mode detection and listeners.
   */
  init(): void {
    if (!this.mediaQuery) return;

    // Set initial state
    this.updateState(this.mediaQuery.matches);

    // Listen for changes
    const handler = (event: MediaQueryListEvent) => {
      this.updateState(event.matches);
    };
    this.mediaQuery.addEventListener('change', handler);

    // Also check prefers-contrast: high
    const highContrastQuery = window.matchMedia('(prefers-contrast: high)');
    if (highContrastQuery.matches && !this.isActive) {
      this.updateState(true);
    }
    highContrastQuery.addEventListener('change', (event) => {
      if (event.matches && !this.isActive) {
        this.updateState(true);
      } else if (!event.matches && !this.mediaQuery?.matches) {
        this.updateState(false);
      }
    });

    // Inject high contrast utility styles
    this.injectStyles();
  }

  /**
   * Check if high contrast mode is currently active.
   */
  isHighContrastActive(): boolean {
    return this.isActive;
  }

  /**
   * Register a callback for high contrast mode changes.
   */
  onChange(callback: (active: boolean) => void): () => void {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== callback);
    };
  }

  /**
   * Manually enable high contrast mode (user preference override).
   */
  enable(): void {
    this.updateState(true);
  }

  /**
   * Manually disable high contrast mode.
   */
  disable(): void {
    this.updateState(false);
  }

  /**
   * Clean up event listeners and injected styles.
   */
  destroy(): void {
    if (this.styleElement?.parentNode) {
      this.styleElement.parentNode.removeChild(this.styleElement);
    }
    this.styleElement = null;
    this.listeners = [];
  }

  private updateState(active: boolean): void {
    const changed = this.isActive !== active;
    this.isActive = active;

    if (active) {
      document.body.classList.add('high-contrast');
      document.documentElement.setAttribute('data-high-contrast', 'true');
    } else {
      document.body.classList.remove('high-contrast');
      document.documentElement.removeAttribute('data-high-contrast');
    }

    if (changed) {
      this.listeners.forEach((listener) => listener(active));
    }
  }

  /**
   * Inject CSS styles that adapt to forced-colors mode.
   */
  private injectStyles(): void {
    if (this.styleElement) return;

    this.styleElement = document.createElement('style');
    this.styleElement.setAttribute('data-high-contrast-styles', 'true');
    this.styleElement.textContent = `
      /* High contrast mode utilities */
      .high-contrast {
        --hc-border-color: CanvasText;
        --hc-focus-color: Highlight;
        --hc-link-color: LinkText;
        --hc-button-bg: ButtonFace;
        --hc-button-text: ButtonText;
      }

      /* Ensure focus indicators are visible in forced-colors mode */
      @media (forced-colors: active) {
        *:focus {
          outline: 3px solid Highlight !important;
          outline-offset: 2px !important;
        }

        *:focus-visible {
          outline: 3px solid Highlight !important;
          outline-offset: 2px !important;
        }

        /* Ensure buttons are identifiable */
        button,
        [role="button"],
        input[type="submit"],
        input[type="button"] {
          border: 1px solid ButtonText;
        }

        /* Ensure links are identifiable */
        a {
          text-decoration: underline;
        }

        /* Ensure disabled state is visible */
        [aria-disabled="true"],
        :disabled {
          opacity: 0.5;
          border-style: dashed;
        }

        /* Ensure icons/images have visible borders */
        img,
        svg {
          border: 1px solid CanvasText;
        }

        /* Form inputs */
        input,
        textarea,
        select {
          border: 1px solid CanvasText;
        }

        /* Ensure custom checkboxes/radios are visible */
        [role="checkbox"],
        [role="radio"] {
          border: 2px solid CanvasText;
        }

        [role="checkbox"][aria-checked="true"],
        [role="radio"][aria-checked="true"] {
          background-color: Highlight;
        }
      }

      /* High contrast via user preference (prefers-contrast: high) */
      @media (prefers-contrast: high) {
        :root {
          --border-width: 2px;
          --focus-ring-width: 3px;
        }

        button,
        [role="button"] {
          border-width: 2px;
          font-weight: bold;
        }

        a {
          text-decoration: underline;
          text-underline-offset: 3px;
        }

        *:focus-visible {
          outline-width: 3px;
        }
      }

      /* Ensure high contrast body has sufficient contrast */
      .high-contrast {
        --text-primary: #000000;
        --text-secondary: #1a1a1a;
        --bg-primary: #ffffff;
        --bg-secondary: #f5f5f5;
        --border-color: #000000;
        --focus-color: #0000ff;
        --error-color: #cc0000;
        --success-color: #006600;
        --link-color: #0000ee;
      }
    `;
    document.head.appendChild(this.styleElement);
  }
}

/**
 * Color accessibility validation utilities for checking WCAG contrast ratios.
 */
export class ColorAccessibility {
  /**
   * Calculate the contrast ratio between two colors.
   * Colors can be hex strings (#RGB or #RRGGBB) or CSS color names.
   */
  static getContrastRatio(foreground: string, background: string): number {
    const fgRgb = ColorAccessibility.parseColor(foreground);
    const bgRgb = ColorAccessibility.parseColor(background);

    if (!fgRgb || !bgRgb) return 0;

    const fgLuminance = ColorAccessibility.getRelativeLuminance(fgRgb);
    const bgLuminance = ColorAccessibility.getRelativeLuminance(bgRgb);

    const lighter = Math.max(fgLuminance, bgLuminance);
    const darker = Math.min(fgLuminance, bgLuminance);

    return (lighter + 0.05) / (darker + 0.05);
  }

  /**
   * Check if a color pair meets various WCAG contrast requirements.
   */
  static checkContrast(foreground: string, background: string): ContrastResult {
    const ratio = ColorAccessibility.getContrastRatio(foreground, background);

    return {
      ratio: Math.round(ratio * 100) / 100,
      passesAA: ratio >= 4.5,
      passesAALargeText: ratio >= 3,
      passesAAA: ratio >= 7,
      passesAAALargeText: ratio >= 4.5,
    };
  }

  /**
   * Suggest a color adjustment to meet a target contrast ratio.
   * Returns a lightened or darkened version of the foreground color.
   */
  static suggestAccessibleColor(foreground: string, background: string, targetRatio: number = 4.5): string | null {
    const bgRgb = ColorAccessibility.parseColor(background);
    if (!bgRgb) return null;

    const bgLuminance = ColorAccessibility.getRelativeLuminance(bgRgb);

    // Try darkening and lightening the foreground
    const fgRgb = ColorAccessibility.parseColor(foreground);
    if (!fgRgb) return null;

    // Determine direction: if background is light, darken foreground; otherwise lighten
    const bgIsLight = bgLuminance > 0.5;

    for (let step = 0; step <= 100; step++) {
      const factor = step / 100;
      let adjusted: RGB;

      if (bgIsLight) {
        // Darken foreground
        adjusted = {
          r: Math.round(fgRgb.r * (1 - factor)),
          g: Math.round(fgRgb.g * (1 - factor)),
          b: Math.round(fgRgb.b * (1 - factor)),
        };
      } else {
        // Lighten foreground
        adjusted = {
          r: Math.round(fgRgb.r + (255 - fgRgb.r) * factor),
          g: Math.round(fgRgb.g + (255 - fgRgb.g) * factor),
          b: Math.round(fgRgb.b + (255 - fgRgb.b) * factor),
        };
      }

      const adjustedLuminance = ColorAccessibility.getRelativeLuminance(adjusted);
      const lighter = Math.max(adjustedLuminance, bgLuminance);
      const darker = Math.min(adjustedLuminance, bgLuminance);
      const ratio = (lighter + 0.05) / (darker + 0.05);

      if (ratio >= targetRatio) {
        return ColorAccessibility.rgbToHex(adjusted);
      }
    }

    return null;
  }

  /**
   * Calculate the relative luminance of a color per WCAG 2.1 spec.
   */
  static getRelativeLuminance(rgb: RGB): number {
    const rSRGB = rgb.r / 255;
    const gSRGB = rgb.g / 255;
    const bSRGB = rgb.b / 255;

    const r = rSRGB <= 0.03928 ? rSRGB / 12.92 : Math.pow((rSRGB + 0.055) / 1.055, 2.4);
    const g = gSRGB <= 0.03928 ? gSRGB / 12.92 : Math.pow((gSRGB + 0.055) / 1.055, 2.4);
    const b = bSRGB <= 0.03928 ? bSRGB / 12.92 : Math.pow((bSRGB + 0.055) / 1.055, 2.4);

    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }

  /**
   * Parse a hex color string into RGB values.
   */
  static parseColor(color: string): RGB | null {
    // Handle shorthand hex (#RGB)
    const shortHex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
    const expandedColor = color.replace(shortHex, (_, r, g, b) => r + r + g + g + b + b);

    // Handle full hex (#RRGGBB)
    const fullHex = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i;
    const result = fullHex.exec(expandedColor);

    if (!result) return null;

    return {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16),
    };
  }

  /**
   * Convert RGB values to a hex color string.
   */
  static rgbToHex(rgb: RGB): string {
    const toHex = (value: number) => {
      const clamped = Math.max(0, Math.min(255, value));
      return clamped.toString(16).padStart(2, '0');
    };
    return `#${toHex(rgb.r)}${toHex(rgb.g)}${toHex(rgb.b)}`;
  }

  /**
   * Check if a color is considered "light" (luminance > 0.5).
   */
  static isLightColor(color: string): boolean {
    const rgb = ColorAccessibility.parseColor(color);
    if (!rgb) return false;
    return ColorAccessibility.getRelativeLuminance(rgb) > 0.5;
  }
}
