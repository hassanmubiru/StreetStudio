/**
 * Responsive Design System
 * 
 * Mobile-first responsive design with appropriate breakpoints for the
 * StreetStudio web application. Provides CSS utilities, media query helpers,
 * and a breakpoint observation system.
 * 
 * Breakpoints:
 * - mobile: 320px - 639px (default, mobile-first)
 * - tablet: 640px - 1023px
 * - desktop: 1024px+
 * 
 * Requirements: 10.1, 10.2, 10.3
 */

/** Breakpoint definitions for the responsive system */
export const BREAKPOINTS = {
  mobile: 320,
  tablet: 640,
  desktop: 1024,
} as const;

export type BreakpointName = keyof typeof BREAKPOINTS;

/** Minimum touch target size per WCAG/Apple HIG guidelines */
export const MIN_TOUCH_TARGET = 44;

/** Media query strings for use in CSS and matchMedia */
export const MEDIA_QUERIES = {
  mobile: `(min-width: ${BREAKPOINTS.mobile}px) and (max-width: ${BREAKPOINTS.tablet - 1}px)`,
  tablet: `(min-width: ${BREAKPOINTS.tablet}px) and (max-width: ${BREAKPOINTS.desktop - 1}px)`,
  desktop: `(min-width: ${BREAKPOINTS.desktop}px)`,
  tabletUp: `(min-width: ${BREAKPOINTS.tablet}px)`,
  desktopUp: `(min-width: ${BREAKPOINTS.desktop}px)`,
  mobileOnly: `(max-width: ${BREAKPOINTS.tablet - 1}px)`,
  tabletOnly: `(min-width: ${BREAKPOINTS.tablet}px) and (max-width: ${BREAKPOINTS.desktop - 1}px)`,
  /** Detects coarse pointer (touch device) */
  touch: '(pointer: coarse)',
  /** Detects fine pointer (mouse/trackpad) */
  fine: '(pointer: fine)',
  /** Detects reduced motion preference */
  reducedMotion: '(prefers-reduced-motion: reduce)',
} as const;

/**
 * Returns the current breakpoint name based on window width.
 */
export function getCurrentBreakpoint(): BreakpointName {
  const width = window.innerWidth;
  if (width >= BREAKPOINTS.desktop) return 'desktop';
  if (width >= BREAKPOINTS.tablet) return 'tablet';
  return 'mobile';
}

/**
 * Checks if the current viewport matches or exceeds the given breakpoint.
 */
export function isBreakpointActive(breakpoint: BreakpointName): boolean {
  return window.innerWidth >= BREAKPOINTS[breakpoint];
}

/**
 * Returns true if the device appears to be a touch device.
 */
export function isTouchDevice(): boolean {
  return window.matchMedia(MEDIA_QUERIES.touch).matches;
}

/**
 * Listener callback for breakpoint changes.
 */
export type BreakpointChangeListener = (breakpoint: BreakpointName, width: number) => void;

/**
 * BreakpointObserver
 * 
 * Observes viewport changes and notifies listeners when the active
 * breakpoint changes. Debounces resize events to avoid excessive updates.
 */
export class BreakpointObserver {
  private listeners: Set<BreakpointChangeListener> = new Set();
  private currentBreakpoint: BreakpointName;
  private resizeTimer: ReturnType<typeof setTimeout> | null = null;
  private boundHandleResize: () => void;

  constructor() {
    this.currentBreakpoint = getCurrentBreakpoint();
    this.boundHandleResize = this.handleResize.bind(this);
  }

  /** Start observing viewport changes */
  public start(): void {
    window.addEventListener('resize', this.boundHandleResize);
  }

  /** Stop observing viewport changes */
  public stop(): void {
    window.removeEventListener('resize', this.boundHandleResize);
    if (this.resizeTimer !== null) {
      clearTimeout(this.resizeTimer);
      this.resizeTimer = null;
    }
  }

  /** Get the current breakpoint */
  public getBreakpoint(): BreakpointName {
    return this.currentBreakpoint;
  }

  /** Register a listener for breakpoint changes. Returns unsubscribe function. */
  public onChange(listener: BreakpointChangeListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private handleResize(): void {
    if (this.resizeTimer !== null) {
      clearTimeout(this.resizeTimer);
    }
    this.resizeTimer = setTimeout(() => {
      const newBreakpoint = getCurrentBreakpoint();
      if (newBreakpoint !== this.currentBreakpoint) {
        this.currentBreakpoint = newBreakpoint;
        const width = window.innerWidth;
        this.listeners.forEach(listener => listener(newBreakpoint, width));
      }
    }, 150);
  }

  /** Destroy observer and release resources */
  public destroy(): void {
    this.stop();
    this.listeners.clear();
  }
}

/**
 * Responsive CSS utility classes injected into the document.
 * Uses mobile-first approach: base styles target mobile, media queries add
 * tablet/desktop overrides.
 */
export const ResponsiveCSS = `
/* ==========================================================================
   Responsive Design System - StreetStudio
   Mobile-first breakpoints: 320px | 640px | 1024px
   ========================================================================== */

/* ---------- Responsive visibility utilities ---------- */
.hide-mobile {
  display: none;
}

.show-mobile {
  display: block;
}

.hide-tablet {
  display: none;
}

@media ${MEDIA_QUERIES.tabletUp} {
  .hide-mobile {
    display: block;
  }
  .show-mobile {
    display: none;
  }
  .hide-tablet {
    display: block;
  }
  .show-tablet {
    display: block;
  }
}

@media ${MEDIA_QUERIES.desktopUp} {
  .hide-desktop {
    display: none;
  }
  .show-desktop {
    display: block;
  }
}

/* ---------- Responsive container ---------- */
.responsive-container {
  width: 100%;
  margin-left: auto;
  margin-right: auto;
  padding-left: 16px;
  padding-right: 16px;
}

@media ${MEDIA_QUERIES.tabletUp} {
  .responsive-container {
    padding-left: 24px;
    padding-right: 24px;
    max-width: 960px;
  }
}

@media ${MEDIA_QUERIES.desktopUp} {
  .responsive-container {
    padding-left: 32px;
    padding-right: 32px;
    max-width: 1280px;
  }
}

/* ---------- Responsive grid ---------- */
.responsive-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 16px;
}

@media ${MEDIA_QUERIES.tabletUp} {
  .responsive-grid {
    grid-template-columns: repeat(2, 1fr);
    gap: 20px;
  }
}

@media ${MEDIA_QUERIES.desktopUp} {
  .responsive-grid {
    grid-template-columns: repeat(3, 1fr);
    gap: 24px;
  }
}

.responsive-grid--2-col {
  grid-template-columns: 1fr;
}

@media ${MEDIA_QUERIES.tabletUp} {
  .responsive-grid--2-col {
    grid-template-columns: repeat(2, 1fr);
  }
}

.responsive-grid--4-col {
  grid-template-columns: 1fr;
}

@media ${MEDIA_QUERIES.tabletUp} {
  .responsive-grid--4-col {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media ${MEDIA_QUERIES.desktopUp} {
  .responsive-grid--4-col {
    grid-template-columns: repeat(4, 1fr);
  }
}

/* ---------- Touch-friendly controls ---------- */
.touch-target {
  min-width: ${MIN_TOUCH_TARGET}px;
  min-height: ${MIN_TOUCH_TARGET}px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  touch-action: manipulation;
}

.touch-target--icon {
  min-width: ${MIN_TOUCH_TARGET}px;
  min-height: ${MIN_TOUCH_TARGET}px;
  padding: 10px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  touch-action: manipulation;
}

.touch-target--button {
  min-height: ${MIN_TOUCH_TARGET}px;
  padding: 10px 16px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  touch-action: manipulation;
}

/* Ensure all interactive elements meet minimum touch size on touch devices */
@media ${MEDIA_QUERIES.touch} {
  button,
  [role="button"],
  a,
  input[type="checkbox"],
  input[type="radio"],
  select {
    min-height: ${MIN_TOUCH_TARGET}px;
    min-width: ${MIN_TOUCH_TARGET}px;
  }

  input[type="text"],
  input[type="email"],
  input[type="password"],
  input[type="search"],
  input[type="url"],
  input[type="tel"],
  input[type="number"],
  textarea,
  select {
    min-height: ${MIN_TOUCH_TARGET}px;
    font-size: 16px; /* prevent iOS zoom on focus */
  }
}

/* ---------- Responsive typography ---------- */
.responsive-text-sm {
  font-size: 0.875rem;
  line-height: 1.25rem;
}

.responsive-text-base {
  font-size: 1rem;
  line-height: 1.5rem;
}

.responsive-text-lg {
  font-size: 1.125rem;
  line-height: 1.75rem;
}

.responsive-text-xl {
  font-size: 1.25rem;
  line-height: 1.75rem;
}

@media ${MEDIA_QUERIES.desktopUp} {
  .responsive-text-sm {
    font-size: 0.875rem;
  }
  .responsive-text-base {
    font-size: 1rem;
  }
  .responsive-text-lg {
    font-size: 1.25rem;
    line-height: 1.875rem;
  }
  .responsive-text-xl {
    font-size: 1.5rem;
    line-height: 2rem;
  }
}

/* ---------- Responsive spacing ---------- */
.responsive-p {
  padding: 16px;
}

@media ${MEDIA_QUERIES.tabletUp} {
  .responsive-p {
    padding: 24px;
  }
}

@media ${MEDIA_QUERIES.desktopUp} {
  .responsive-p {
    padding: 32px;
  }
}

.responsive-gap {
  gap: 12px;
}

@media ${MEDIA_QUERIES.tabletUp} {
  .responsive-gap {
    gap: 16px;
  }
}

@media ${MEDIA_QUERIES.desktopUp} {
  .responsive-gap {
    gap: 24px;
  }
}

/* ---------- Responsive navigation ---------- */
.responsive-nav {
  display: none;
}

.responsive-nav--mobile {
  display: flex;
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 50;
  background: white;
  border-top: 1px solid #e5e7eb;
  padding: 8px 16px;
  justify-content: space-around;
  align-items: center;
}

@media ${MEDIA_QUERIES.tabletUp} {
  .responsive-nav--mobile {
    display: none;
  }
  .responsive-nav--sidebar {
    display: flex;
    flex-direction: column;
    width: 240px;
    min-height: 100vh;
    border-right: 1px solid #e5e7eb;
    padding: 16px;
  }
}

@media ${MEDIA_QUERIES.desktopUp} {
  .responsive-nav--sidebar {
    width: 280px;
  }
}

/* ---------- Responsive layout compositions ---------- */
.responsive-layout {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}

.responsive-layout__main {
  flex: 1;
  padding: 16px;
  padding-bottom: 72px; /* Space for mobile bottom nav */
}

@media ${MEDIA_QUERIES.tabletUp} {
  .responsive-layout {
    flex-direction: row;
  }
  .responsive-layout__main {
    flex: 1;
    padding: 24px;
    padding-bottom: 24px; /* No bottom nav */
  }
}

@media ${MEDIA_QUERIES.desktopUp} {
  .responsive-layout__main {
    padding: 32px;
  }
}

/* ---------- Responsive breadcrumbs ---------- */
.responsive-breadcrumbs {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 0.875rem;
  overflow: hidden;
  white-space: nowrap;
}

.responsive-breadcrumbs__item {
  display: none;
}

.responsive-breadcrumbs__item--current,
.responsive-breadcrumbs__item--parent {
  display: inline-flex;
  align-items: center;
}

.responsive-breadcrumbs__item--collapsed {
  display: inline-flex;
  align-items: center;
}

@media ${MEDIA_QUERIES.tabletUp} {
  .responsive-breadcrumbs__item {
    display: inline-flex;
    align-items: center;
  }
  .responsive-breadcrumbs__item--collapsed {
    display: none;
  }
}

/* ---------- Adaptive card layouts ---------- */
.responsive-card {
  padding: 12px;
  border-radius: 8px;
  border: 1px solid #e5e7eb;
  background: white;
}

@media ${MEDIA_QUERIES.tabletUp} {
  .responsive-card {
    padding: 16px;
    border-radius: 12px;
  }
}

@media ${MEDIA_QUERIES.desktopUp} {
  .responsive-card {
    padding: 20px;
  }
}
`;

/**
 * Injects the responsive CSS into the document head.
 */
export function setupResponsiveCSS(): void {
  let styleElement = document.getElementById('streetstudio-responsive-styles') as HTMLStyleElement;
  if (!styleElement) {
    styleElement = document.createElement('style');
    styleElement.id = 'streetstudio-responsive-styles';
    document.head.appendChild(styleElement);
  }
  styleElement.textContent = ResponsiveCSS;
}
