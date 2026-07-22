/**
 * UI Utilities and Accessibility Helpers
 * 
 * Common utilities for building accessible, responsive UI components.
 */

// Class name merging utility (like clsx/classnames)
export const cn = (...classes: (string | undefined | null | false)[]): string => {
  return classes.filter(Boolean).join(' ');
};

// Generate unique IDs for form controls and ARIA relationships
let idCounter = 0;
export const generateId = (prefix = 'ui'): string => {
  return `${prefix}-${++idCounter}`;
};

// Focus management utilities
export const focusableElementsSelector = 
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export const getFocusableElements = (container: Element): HTMLElement[] => {
  return Array.from(container.querySelectorAll(focusableElementsSelector));
};

export const trapFocus = (container: Element): (() => void) => {
  const focusableElements = getFocusableElements(container);
  const firstElement = focusableElements[0];
  const lastElement = focusableElements[focusableElements.length - 1];
  
  if (!firstElement) return () => {};
  
  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Tab') {
      if (event.shiftKey) {
        if (document.activeElement === firstElement) {
          event.preventDefault();
          lastElement?.focus();
        }
      } else {
        if (document.activeElement === lastElement) {
          event.preventDefault();
          firstElement?.focus();
        }
      }
    }
  };
  
  container.addEventListener('keydown', handleKeyDown);
  firstElement.focus();
  
  return () => {
    container.removeEventListener('keydown', handleKeyDown);
  };
};

// Screen reader utilities
export const announceToScreenReader = (message: string): void => {
  const announcement = document.createElement('div');
  announcement.setAttribute('aria-live', 'polite');
  announcement.setAttribute('aria-atomic', 'true');
  announcement.className = 'sr-only';
  announcement.textContent = message;
  
  document.body.appendChild(announcement);
  
  setTimeout(() => {
    document.body.removeChild(announcement);
  }, 1000);
};

export const announceToScreenReaderUrgent = (message: string): void => {
  const announcement = document.createElement('div');
  announcement.setAttribute('aria-live', 'assertive');
  announcement.setAttribute('aria-atomic', 'true');
  announcement.className = 'sr-only';
  announcement.textContent = message;
  
  document.body.appendChild(announcement);
  
  setTimeout(() => {
    document.body.removeChild(announcement);
  }, 1000);
};

// Keyboard navigation helpers
export const createKeyboardHandler = (keyMap: Record<string, () => void>) => {
  return (event: KeyboardEvent) => {
    const handler = keyMap[event.key];
    if (handler) {
      event.preventDefault();
      handler();
    }
  };
};

// Common keyboard shortcuts
export const KEYBOARD_SHORTCUTS = {
  ESCAPE: 'Escape',
  ENTER: 'Enter',
  SPACE: ' ',
  TAB: 'Tab',
  ARROW_UP: 'ArrowUp',
  ARROW_DOWN: 'ArrowDown',
  ARROW_LEFT: 'ArrowLeft',
  ARROW_RIGHT: 'ArrowRight',
  HOME: 'Home',
  END: 'End',
  PAGE_UP: 'PageUp',
  PAGE_DOWN: 'PageDown',
} as const;

// Media query helpers
export const mediaQueries = {
  prefersReducedMotion: '(prefers-reduced-motion: reduce)',
  prefersHighContrast: '(prefers-contrast: high)',
  prefersDark: '(prefers-color-scheme: dark)',
  prefersLight: '(prefers-color-scheme: light)',
} as const;

export const checkMediaQuery = (query: string): boolean => {
  if (typeof window === 'undefined') return false;
  return window.matchMedia(query).matches;
};

// Responsive design helpers
export const createBreakpointObserver = (
  breakpoint: string,
  callback: (matches: boolean) => void
): (() => void) => {
  if (typeof window === 'undefined') return () => {};
  
  const mediaQuery = window.matchMedia(`(min-width: ${breakpoint})`);
  const handler = (event: MediaQueryListEvent) => callback(event.matches);
  
  mediaQuery.addEventListener('change', handler);
  callback(mediaQuery.matches); // Initial call
  
  return () => mediaQuery.removeEventListener('change', handler);
};

// Color contrast utilities
export const hexToRgb = (hex: string): { r: number; g: number; b: number } | null => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : null;
};

export const getLuminance = (r: number, g: number, b: number): number => {
  const [rs, gs, bs] = [r, g, b].map(c => {
    c = c / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
};

export const getContrastRatio = (color1: string, color2: string): number => {
  const rgb1 = hexToRgb(color1);
  const rgb2 = hexToRgb(color2);
  
  if (!rgb1 || !rgb2) return 1;
  
  const lum1 = getLuminance(rgb1.r, rgb1.g, rgb1.b);
  const lum2 = getLuminance(rgb2.r, rgb2.g, rgb2.b);
  
  const brightest = Math.max(lum1, lum2);
  const darkest = Math.min(lum1, lum2);
  
  return (brightest + 0.05) / (darkest + 0.05);
};

// WCAG AA requires 4.5:1 for normal text, 3:1 for large text
// WCAG AAA requires 7:1 for normal text, 4.5:1 for large text
export const meetsWCAG = (color1: string, color2: string, level: 'AA' | 'AAA' = 'AA', isLarge = false): boolean => {
  const ratio = getContrastRatio(color1, color2);
  
  if (level === 'AAA') {
    return isLarge ? ratio >= 4.5 : ratio >= 7;
  }
  
  return isLarge ? ratio >= 3 : ratio >= 4.5;
};

// Animation utilities
export const prefersReducedMotion = (): boolean => {
  return checkMediaQuery(mediaQueries.prefersReducedMotion);
};

export const getAnimationDuration = (defaultMs: number): number => {
  return prefersReducedMotion() ? 0 : defaultMs;
};

// Viewport utilities
export const getViewportSize = (): { width: number; height: number } => {
  if (typeof window === 'undefined') return { width: 0, height: 0 };
  
  return {
    width: window.innerWidth,
    height: window.innerHeight,
  };
};

export const isElementInViewport = (element: Element): boolean => {
  const rect = element.getBoundingClientRect();
  const viewport = getViewportSize();
  
  return (
    rect.top >= 0 &&
    rect.left >= 0 &&
    rect.bottom <= viewport.height &&
    rect.right <= viewport.width
  );
};

// Touch and pointer utilities
export const isTouchDevice = (): boolean => {
  if (typeof window === 'undefined') return false;
  return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
};

// Form validation utilities
export const validateEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

export const validatePassword = (password: string): {
  isValid: boolean;
  errors: string[];
} => {
  const errors: string[] = [];
  
  if (password.length < 8) {
    errors.push('Password must be at least 8 characters long');
  }
  
  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }
  
  if (!/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }
  
  if (!/\d/.test(password)) {
    errors.push('Password must contain at least one number');
  }
  
  return {
    isValid: errors.length === 0,
    errors,
  };
};

// Debounce and throttle utilities
export const debounce = <T extends (...args: any[]) => any>(
  func: T,
  delay: number
): (...args: Parameters<T>) => void => {
  let timeoutId: number;
  
  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = window.setTimeout(() => func(...args), delay);
  };
};

export const throttle = <T extends (...args: any[]) => any>(
  func: T,
  delay: number
): (...args: Parameters<T>) => void => {
  let lastCall = 0;
  
  return (...args: Parameters<T>) => {
    const now = Date.now();
    if (now - lastCall >= delay) {
      lastCall = now;
      func(...args);
    }
  };
};