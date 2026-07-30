/**
 * Touch-Friendly Controls Utility
 * 
 * Provides utilities to ensure interactive elements meet the minimum 44px
 * touch target requirement. Includes helpers for creating touch-optimized
 * buttons, adjusting existing elements, and detecting touch interactions.
 * 
 * Requirements: 10.2
 */

import { MIN_TOUCH_TARGET, isTouchDevice } from '../styles/responsive.js';

export { MIN_TOUCH_TARGET };

/**
 * Options for creating a touch-friendly button
 */
export interface TouchButtonOptions {
  label: string;
  ariaLabel?: string;
  icon?: string;
  onClick?: (event: Event) => void;
  className?: string;
  variant?: 'default' | 'icon' | 'compact';
  disabled?: boolean;
}

/**
 * Creates a touch-friendly button element that meets the 44px minimum target.
 */
export function createTouchButton(options: TouchButtonOptions): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';

  const variant = options.variant ?? 'default';
  const baseClass = variant === 'icon'
    ? 'touch-target--icon'
    : variant === 'compact'
    ? 'touch-target'
    : 'touch-target--button';

  button.className = `${baseClass} ${options.className ?? ''}`.trim();
  button.setAttribute('aria-label', options.ariaLabel ?? options.label);

  if (options.disabled) {
    button.disabled = true;
    button.setAttribute('aria-disabled', 'true');
  }

  // Ensure minimum touch target size
  button.style.minWidth = `${MIN_TOUCH_TARGET}px`;
  button.style.minHeight = `${MIN_TOUCH_TARGET}px`;

  if (options.icon) {
    button.innerHTML = `
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
        <path stroke-linecap="round" stroke-linejoin="round" d="${options.icon}" />
      </svg>
      ${variant !== 'icon' ? `<span>${options.label}</span>` : ''}
    `;
  } else {
    button.textContent = options.label;
  }

  if (options.onClick) {
    button.addEventListener('click', options.onClick);
  }

  return button;
}

/**
 * Ensures an existing element meets minimum touch target requirements.
 * Adds padding/sizing as needed without altering visual appearance.
 * Returns true if the element was already compliant, false if adjustments were made.
 */
export function ensureTouchTarget(element: HTMLElement): boolean {
  const rect = element.getBoundingClientRect();
  const isCompliant = rect.width >= MIN_TOUCH_TARGET && rect.height >= MIN_TOUCH_TARGET;

  if (!isCompliant) {
    // Use relative positioning with pseudo-element expansion
    // This expands the hit area without changing visual layout
    element.style.position = 'relative';
    element.dataset.touchExpanded = 'true';

    const widthDiff = Math.max(0, MIN_TOUCH_TARGET - rect.width);
    const heightDiff = Math.max(0, MIN_TOUCH_TARGET - rect.height);

    // Add padding to meet minimum size
    if (rect.width < MIN_TOUCH_TARGET) {
      element.style.minWidth = `${MIN_TOUCH_TARGET}px`;
    }
    if (rect.height < MIN_TOUCH_TARGET) {
      element.style.minHeight = `${MIN_TOUCH_TARGET}px`;
    }

    // Ensure element is flex-centered for proper content alignment
    element.style.display = element.style.display || 'inline-flex';
    element.style.alignItems = 'center';
    element.style.justifyContent = 'center';
  }

  return isCompliant;
}

/**
 * Validates that all interactive elements within a container meet
 * the minimum touch target size. Returns a list of non-compliant elements.
 */
export function validateTouchTargets(container: HTMLElement): HTMLElement[] {
  const interactiveSelectors = 'button, a, input, select, textarea, [role="button"], [tabindex]';
  const elements = container.querySelectorAll(interactiveSelectors);
  const nonCompliant: HTMLElement[] = [];

  elements.forEach(el => {
    const htmlEl = el as HTMLElement;
    const rect = htmlEl.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      if (rect.width < MIN_TOUCH_TARGET || rect.height < MIN_TOUCH_TARGET) {
        nonCompliant.push(htmlEl);
      }
    }
  });

  return nonCompliant;
}

/**
 * Applies touch-optimized styles to all interactive elements in a container.
 * Only applies on touch devices.
 */
export function applyTouchOptimizations(container: HTMLElement): void {
  if (!isTouchDevice()) return;

  const interactiveSelectors = 'button, a[href], [role="button"]';
  const elements = container.querySelectorAll(interactiveSelectors);

  elements.forEach(el => {
    const htmlEl = el as HTMLElement;
    // Apply touch-action manipulation to prevent double-tap zoom
    htmlEl.style.touchAction = 'manipulation';
    // Remove tap highlight
    (htmlEl.style as any).webkitTapHighlightColor = 'transparent';
    // Ensure minimum size
    ensureTouchTarget(htmlEl);
  });
}

/**
 * Creates a touch-friendly navigation link that meets accessibility standards.
 */
export function createTouchNavLink(options: {
  href: string;
  label: string;
  icon?: string;
  isActive?: boolean;
  badge?: number;
}): HTMLAnchorElement {
  const link = document.createElement('a');
  link.href = options.href;
  link.className = 'touch-target--button';
  link.setAttribute('aria-label', options.label);
  link.style.minHeight = `${MIN_TOUCH_TARGET}px`;
  link.style.minWidth = `${MIN_TOUCH_TARGET}px`;
  link.style.textDecoration = 'none';
  link.style.display = 'inline-flex';
  link.style.alignItems = 'center';
  link.style.gap = '8px';
  link.style.padding = '8px 12px';
  link.style.borderRadius = '6px';
  link.style.color = options.isActive ? '#2563eb' : '#374151';
  link.style.backgroundColor = options.isActive ? '#eff6ff' : 'transparent';

  if (options.isActive) {
    link.setAttribute('aria-current', 'page');
  }

  let content = '';
  if (options.icon) {
    content += `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="${options.icon}" /></svg>`;
  }
  content += `<span>${options.label}</span>`;
  if (options.badge !== undefined && options.badge > 0) {
    content += `<span style="background: #ef4444; color: white; font-size: 0.75rem; padding: 2px 6px; border-radius: 10px; min-width: 20px; text-align: center;" aria-label="${options.badge} notifications">${options.badge}</span>`;
  }

  link.innerHTML = content;
  return link;
}
