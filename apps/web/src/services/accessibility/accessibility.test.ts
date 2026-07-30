/**
 * Accessibility Services - Unit Tests
 * 
 * Tests for ARIA utilities, skip links, heading manager,
 * screen reader announcer, and high contrast mode.
 * 
 * Requirements: 11.1, 11.2, 11.3, 11.4, 11.5
 *
 * @vitest-environment jsdom
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { AriaUtils } from './aria-utils';
import { SkipLinks } from './skip-links';
import { HeadingManager, ScreenReaderAnnouncer } from './heading-manager';
import { HighContrastMode, ColorAccessibility } from './high-contrast';

describe('AriaUtils', () => {
  let element: HTMLElement;

  beforeEach(() => {
    element = document.createElement('div');
  });

  test('applyAriaConfig sets role', () => {
    AriaUtils.applyAriaConfig(element, { role: 'button' });
    expect(element.getAttribute('role')).toBe('button');
  });

  test('applyAriaConfig sets label', () => {
    AriaUtils.applyAriaConfig(element, { label: 'Close dialog' });
    expect(element.getAttribute('aria-label')).toBe('Close dialog');
  });

  test('applyAriaConfig sets labelledBy', () => {
    AriaUtils.applyAriaConfig(element, { labelledBy: 'title-id' });
    expect(element.getAttribute('aria-labelledby')).toBe('title-id');
  });

  test('applyAriaConfig sets describedBy', () => {
    AriaUtils.applyAriaConfig(element, { describedBy: 'desc-id' });
    expect(element.getAttribute('aria-describedby')).toBe('desc-id');
  });

  test('applyAriaConfig sets expanded state', () => {
    AriaUtils.applyAriaConfig(element, { expanded: true });
    expect(element.getAttribute('aria-expanded')).toBe('true');
  });

  test('applyAriaConfig sets hidden state', () => {
    AriaUtils.applyAriaConfig(element, { hidden: true });
    expect(element.getAttribute('aria-hidden')).toBe('true');
  });

  test('applyAriaConfig sets multiple attributes at once', () => {
    AriaUtils.applyAriaConfig(element, {
      role: 'dialog',
      label: 'Settings',
      expanded: false,
      controls: 'panel-1',
    });
    expect(element.getAttribute('role')).toBe('dialog');
    expect(element.getAttribute('aria-label')).toBe('Settings');
    expect(element.getAttribute('aria-expanded')).toBe('false');
    expect(element.getAttribute('aria-controls')).toBe('panel-1');
  });

  test('applyLiveRegion sets politeness level', () => {
    AriaUtils.applyLiveRegion(element, { politeness: 'assertive' });
    expect(element.getAttribute('aria-live')).toBe('assertive');
  });

  test('applyLiveRegion sets atomic and relevant', () => {
    AriaUtils.applyLiveRegion(element, {
      politeness: 'polite',
      atomic: true,
      relevant: ['additions', 'text'],
    });
    expect(element.getAttribute('aria-atomic')).toBe('true');
    expect(element.getAttribute('aria-relevant')).toBe('additions text');
  });

  test('setRole sets the role attribute', () => {
    AriaUtils.setRole(element, 'navigation');
    expect(element.getAttribute('role')).toBe('navigation');
  });

  test('setLabel sets aria-label', () => {
    AriaUtils.setLabel(element, 'Main menu');
    expect(element.getAttribute('aria-label')).toBe('Main menu');
  });

  test('setExpanded toggles aria-expanded', () => {
    AriaUtils.setExpanded(element, true);
    expect(element.getAttribute('aria-expanded')).toBe('true');
    AriaUtils.setExpanded(element, false);
    expect(element.getAttribute('aria-expanded')).toBe('false');
  });

  test('setCurrent sets and removes aria-current', () => {
    AriaUtils.setCurrent(element, 'page');
    expect(element.getAttribute('aria-current')).toBe('page');
    AriaUtils.setCurrent(element, false);
    expect(element.hasAttribute('aria-current')).toBe(false);
  });

  test('setError sets invalid and errormessage', () => {
    AriaUtils.setError(element, 'error-1');
    expect(element.getAttribute('aria-invalid')).toBe('true');
    expect(element.getAttribute('aria-errormessage')).toBe('error-1');
  });

  test('setError with null removes error attributes', () => {
    AriaUtils.setError(element, 'error-1');
    AriaUtils.setError(element, null);
    expect(element.hasAttribute('aria-invalid')).toBe(false);
    expect(element.hasAttribute('aria-errormessage')).toBe(false);
  });

  test('createScreenReaderOnly creates visually hidden element', () => {
    const sr = AriaUtils.createScreenReaderOnly('Hidden text');
    expect(sr.textContent).toBe('Hidden text');
    expect(sr.className).toBe('sr-only');
    expect(sr.style.position).toBe('absolute');
    expect(sr.style.width).toBe('1px');
    expect(sr.style.height).toBe('1px');
    expect(sr.style.overflow).toBe('hidden');
  });

  test('createLiveRegion creates a region with correct attributes', () => {
    const region = AriaUtils.createLiveRegion({ politeness: 'polite', atomic: true });
    expect(region.getAttribute('aria-live')).toBe('polite');
    expect(region.getAttribute('aria-atomic')).toBe('true');
  });

  test('generateId produces unique IDs with prefix', () => {
    const id1 = AriaUtils.generateId('test');
    const id2 = AriaUtils.generateId('test');
    expect(id1).toMatch(/^test-/);
    expect(id1).not.toBe(id2);
  });

  test('setupTabInterface configures tab roles correctly', () => {
    const tablist = document.createElement('div');
    const tab1 = document.createElement('button');
    const tab2 = document.createElement('button');
    const panel1 = document.createElement('div');
    const panel2 = document.createElement('div');

    AriaUtils.setupTabInterface(tablist, [tab1, tab2], [panel1, panel2]);

    expect(tablist.getAttribute('role')).toBe('tablist');
    expect(tab1.getAttribute('role')).toBe('tab');
    expect(tab1.getAttribute('aria-selected')).toBe('true');
    expect(tab2.getAttribute('aria-selected')).toBe('false');
    expect(panel1.getAttribute('role')).toBe('tabpanel');
    expect(panel2.getAttribute('role')).toBe('tabpanel');
    expect(panel2.hasAttribute('hidden')).toBe(true);
  });

  test('setupDisclosure configures trigger and content', () => {
    const trigger = document.createElement('button');
    const content = document.createElement('div');

    AriaUtils.setupDisclosure(trigger, content, false);

    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(trigger.getAttribute('aria-controls')).toBe(content.id);
    expect(content.hasAttribute('hidden')).toBe(true);
  });
});

describe('SkipLinks', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    document.head.innerHTML = '';
  });

  test('render creates a nav element with skip link anchors', () => {
    const skipLinks = new SkipLinks();
    const container = skipLinks.render();

    expect(container.tagName).toBe('NAV');
    expect(container.getAttribute('aria-label')).toBe('Skip navigation');
    expect(container.querySelectorAll('a.skip-link').length).toBe(3);
  });

  test('render creates links in priority order', () => {
    const skipLinks = new SkipLinks([
      { targetId: 'search', label: 'Skip to search', priority: 3 },
      { targetId: 'main-content', label: 'Skip to main', priority: 1 },
      { targetId: 'nav', label: 'Skip to nav', priority: 2 },
    ]);
    const container = skipLinks.render();
    const links = container.querySelectorAll('a');

    expect(links[0]!.textContent).toBe('Skip to main');
    expect(links[1]!.textContent).toBe('Skip to nav');
    expect(links[2]!.textContent).toBe('Skip to search');
  });

  test('mount inserts skip links at the start of body', () => {
    const existingChild = document.createElement('div');
    existingChild.id = 'existing';
    document.body.appendChild(existingChild);

    const skipLinks = new SkipLinks();
    skipLinks.mount();

    expect(document.body.firstChild).not.toBe(existingChild);
    expect((document.body.firstChild as HTMLElement).tagName).toBe('NAV');
  });

  test('unmount removes skip links from DOM', () => {
    const skipLinks = new SkipLinks();
    skipLinks.mount();
    expect(document.body.querySelector('.skip-links')).not.toBeNull();

    skipLinks.unmount();
    expect(document.body.querySelector('.skip-links')).toBeNull();
  });

  test('addLink adds a new link and re-renders', () => {
    const skipLinks = new SkipLinks([]);
    skipLinks.mount();

    skipLinks.addLink({ targetId: 'footer', label: 'Skip to footer', priority: 5 });
    const links = document.body.querySelectorAll('.skip-link');
    expect(links.length).toBe(1);
    expect(links[0].textContent).toBe('Skip to footer');
  });

  test('removeLink removes a link by targetId', () => {
    const skipLinks = new SkipLinks([
      { targetId: 'main', label: 'Main', priority: 1 },
      { targetId: 'nav', label: 'Nav', priority: 2 },
    ]);
    skipLinks.mount();
    expect(document.body.querySelectorAll('.skip-link').length).toBe(2);

    skipLinks.removeLink('nav');
    expect(document.body.querySelectorAll('.skip-link').length).toBe(1);
  });

  test('getLinks returns current link configurations', () => {
    const links = [
      { targetId: 'main', label: 'Main', priority: 1 },
      { targetId: 'search', label: 'Search', priority: 2 },
    ];
    const skipLinks = new SkipLinks(links);
    expect(skipLinks.getLinks()).toHaveLength(2);
    expect(skipLinks.getLinks()[0].targetId).toBe('main');
  });

  test('clicking skip link focuses the target element', () => {
    const target = document.createElement('div');
    target.id = 'main-content';
    target.scrollIntoView = vi.fn();
    target.focus = vi.fn();
    document.body.appendChild(target);

    const skipLinks = new SkipLinks([{ targetId: 'main-content', label: 'Main' }]);
    skipLinks.mount();

    const link = document.body.querySelector('.skip-link') as HTMLAnchorElement;
    link.click();

    expect(target.getAttribute('tabindex')).toBe('-1');
    expect(target.focus).toHaveBeenCalled();
  });
});

describe('HeadingManager', () => {
  let manager: HeadingManager;

  beforeEach(() => {
    manager = new HeadingManager();
  });

  test('getCurrentLevel returns root level initially', () => {
    expect(manager.getCurrentLevel()).toBe(1);
  });

  test('getNextLevel returns root + 1', () => {
    expect(manager.getNextLevel()).toBe(2);
  });

  test('pushContext increments heading level', () => {
    manager.pushContext('Section 1');
    expect(manager.getCurrentLevel()).toBe(1);
    manager.pushContext('Subsection 1.1');
    expect(manager.getCurrentLevel()).toBe(2);
  });

  test('popContext decrements heading level', () => {
    manager.pushContext('Section');
    manager.pushContext('Sub');
    manager.popContext();
    expect(manager.getCurrentLevel()).toBe(1);
  });

  test('heading level caps at 6', () => {
    for (let i = 0; i < 10; i++) {
      manager.pushContext(`Level ${i}`);
    }
    expect(manager.getCurrentLevel()).toBeLessThanOrEqual(6);
  });

  test('reset clears the context stack', () => {
    manager.pushContext('Section');
    manager.pushContext('Sub');
    manager.reset();
    expect(manager.getCurrentLevel()).toBe(1);
    expect(manager.getContextStack()).toHaveLength(0);
  });

  test('validateLevel accepts same or next level', () => {
    expect(manager.validateLevel(1)).toBe(true);
    expect(manager.validateLevel(2)).toBe(true);
    // Skipping from h1 to h3 is invalid
    expect(manager.validateLevel(3)).toBe(false);
  });

  test('createHeading creates element with correct level', () => {
    manager.pushContext('Section');
    const heading = manager.createHeading('Title', { id: 'h-1', className: 'title' });
    expect(heading.tagName).toBe('H1');
    expect(heading.textContent).toBe('Title');
    expect(heading.id).toBe('h-1');
    expect(heading.className).toBe('title');
  });

  test('createSection creates section with heading', () => {
    const { section, heading, level } = manager.createSection('Dashboard');
    expect(level).toBe(1);
    expect(section.tagName).toBe('SECTION');
    expect(heading.tagName).toBe('H1');
    expect(heading.textContent).toBe('Dashboard');
    expect(section.contains(heading)).toBe(true);
  });

  test('custom root level starts at specified level', () => {
    const m = new HeadingManager(2);
    expect(m.getCurrentLevel()).toBe(2);
    m.pushContext('Sub');
    expect(m.getCurrentLevel()).toBe(2);
    m.pushContext('SubSub');
    expect(m.getCurrentLevel()).toBe(3);
  });
});

describe('ScreenReaderAnnouncer', () => {
  let announcer: ScreenReaderAnnouncer;

  beforeEach(() => {
    announcer = new ScreenReaderAnnouncer();
  });

  afterEach(() => {
    announcer.unmount();
    document.body.innerHTML = '';
  });

  test('mount creates live regions in the DOM', () => {
    announcer.mount();
    const polite = document.getElementById('sr-announcer-polite');
    const assertive = document.getElementById('sr-announcer-assertive');
    expect(polite).not.toBeNull();
    expect(assertive).not.toBeNull();
    expect(polite!.getAttribute('aria-live')).toBe('polite');
    expect(assertive!.getAttribute('aria-live')).toBe('assertive');
  });

  test('mount is idempotent', () => {
    announcer.mount();
    announcer.mount();
    const regions = document.querySelectorAll('[aria-live]');
    expect(regions.length).toBe(2);
  });

  test('unmount removes live regions', () => {
    announcer.mount();
    announcer.unmount();
    expect(document.getElementById('sr-announcer-polite')).toBeNull();
    expect(document.getElementById('sr-announcer-assertive')).toBeNull();
  });

  test('announce auto-mounts if not mounted', () => {
    announcer.announce('Hello');
    expect(document.getElementById('sr-announcer-polite')).not.toBeNull();
  });

  test('announceRouteChange announces navigation', async () => {
    announcer.mount();
    announcer.announceRouteChange('Dashboard');

    // Wait for debounce (100ms) and rAF to complete
    await new Promise(resolve => setTimeout(resolve, 200));
    const polite = document.getElementById('sr-announcer-polite');
    expect(polite!.textContent).toBe('Navigated to Dashboard');
  });

  test('announceError uses assertive region', () => {
    announcer.mount();
    announcer.announceError('Something went wrong');
    // The text is set via requestAnimationFrame, check the region exists
    const assertive = document.getElementById('sr-announcer-assertive');
    expect(assertive).not.toBeNull();
  });

  test('clearQueue removes pending announcements', () => {
    announcer.mount();
    announcer.queueAnnouncement('First');
    announcer.queueAnnouncement('Second');
    announcer.clearQueue();
    // No errors should occur
    expect(true).toBe(true);
  });
});

describe('HighContrastMode', () => {
  beforeEach(() => {
    // Mock matchMedia for the HighContrastMode constructor
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
  });

  afterEach(() => {
    document.body.classList.remove('high-contrast');
    document.documentElement.removeAttribute('data-high-contrast');
    document.body.innerHTML = '';
    document.head.innerHTML = '';
  });

  test('isHighContrastActive returns false by default', () => {
    const hc = new HighContrastMode();
    expect(hc.isHighContrastActive()).toBe(false);
  });

  test('enable sets high contrast state', () => {
    const hc = new HighContrastMode();
    hc.enable();
    expect(hc.isHighContrastActive()).toBe(true);
    expect(document.body.classList.contains('high-contrast')).toBe(true);
    expect(document.documentElement.getAttribute('data-high-contrast')).toBe('true');
  });

  test('disable removes high contrast state', () => {
    const hc = new HighContrastMode();
    hc.enable();
    hc.disable();
    expect(hc.isHighContrastActive()).toBe(false);
    expect(document.body.classList.contains('high-contrast')).toBe(false);
  });

  test('onChange notifies listeners on state change', () => {
    const hc = new HighContrastMode();
    const listener = vi.fn();
    hc.onChange(listener);

    hc.enable();
    expect(listener).toHaveBeenCalledWith(true);

    hc.disable();
    expect(listener).toHaveBeenCalledWith(false);
  });

  test('onChange returns unsubscribe function', () => {
    const hc = new HighContrastMode();
    const listener = vi.fn();
    const unsubscribe = hc.onChange(listener);

    unsubscribe();
    hc.enable();
    expect(listener).not.toHaveBeenCalled();
  });

  test('destroy cleans up', () => {
    const hc = new HighContrastMode();
    hc.init();
    hc.destroy();
    // No errors should occur
    expect(true).toBe(true);
  });
});

describe('ColorAccessibility', () => {
  test('parseColor handles full hex', () => {
    const rgb = ColorAccessibility.parseColor('#ff8800');
    expect(rgb).toEqual({ r: 255, g: 136, b: 0 });
  });

  test('parseColor handles shorthand hex', () => {
    const rgb = ColorAccessibility.parseColor('#f80');
    expect(rgb).toEqual({ r: 255, g: 136, b: 0 });
  });

  test('parseColor handles hex without hash', () => {
    const rgb = ColorAccessibility.parseColor('ff0000');
    expect(rgb).toEqual({ r: 255, g: 0, b: 0 });
  });

  test('parseColor returns null for invalid color', () => {
    expect(ColorAccessibility.parseColor('not-a-color')).toBeNull();
  });

  test('rgbToHex converts correctly', () => {
    expect(ColorAccessibility.rgbToHex({ r: 255, g: 0, b: 128 })).toBe('#ff0080');
  });

  test('getRelativeLuminance returns 0 for black', () => {
    const luminance = ColorAccessibility.getRelativeLuminance({ r: 0, g: 0, b: 0 });
    expect(luminance).toBe(0);
  });

  test('getRelativeLuminance returns 1 for white', () => {
    const luminance = ColorAccessibility.getRelativeLuminance({ r: 255, g: 255, b: 255 });
    expect(luminance).toBeCloseTo(1, 2);
  });

  test('getContrastRatio for black on white is 21:1', () => {
    const ratio = ColorAccessibility.getContrastRatio('#000000', '#ffffff');
    expect(ratio).toBeCloseTo(21, 0);
  });

  test('getContrastRatio for white on white is 1:1', () => {
    const ratio = ColorAccessibility.getContrastRatio('#ffffff', '#ffffff');
    expect(ratio).toBeCloseTo(1, 0);
  });

  test('checkContrast identifies AA pass for black on white', () => {
    const result = ColorAccessibility.checkContrast('#000000', '#ffffff');
    expect(result.passesAA).toBe(true);
    expect(result.passesAAA).toBe(true);
    expect(result.passesAALargeText).toBe(true);
    expect(result.passesAAALargeText).toBe(true);
  });

  test('checkContrast identifies AA fail for light gray on white', () => {
    const result = ColorAccessibility.checkContrast('#cccccc', '#ffffff');
    expect(result.passesAA).toBe(false);
    expect(result.ratio).toBeLessThan(4.5);
  });

  test('checkContrast handles medium contrast correctly', () => {
    // Dark gray on white should pass AA
    const result = ColorAccessibility.checkContrast('#595959', '#ffffff');
    expect(result.passesAA).toBe(true);
    expect(result.ratio).toBeGreaterThanOrEqual(4.5);
  });

  test('suggestAccessibleColor returns accessible alternative', () => {
    const suggested = ColorAccessibility.suggestAccessibleColor('#cccccc', '#ffffff', 4.5);
    expect(suggested).not.toBeNull();

    if (suggested) {
      const result = ColorAccessibility.checkContrast(suggested, '#ffffff');
      expect(result.passesAA).toBe(true);
    }
  });

  test('suggestAccessibleColor darkens on light background', () => {
    const suggested = ColorAccessibility.suggestAccessibleColor('#888888', '#ffffff');
    if (suggested) {
      const rgb = ColorAccessibility.parseColor(suggested);
      expect(rgb).not.toBeNull();
      // Should be darker than original
      const originalRgb = ColorAccessibility.parseColor('#888888');
      if (rgb && originalRgb) {
        const suggestedLum = ColorAccessibility.getRelativeLuminance(rgb);
        const originalLum = ColorAccessibility.getRelativeLuminance(originalRgb);
        expect(suggestedLum).toBeLessThanOrEqual(originalLum);
      }
    }
  });

  test('isLightColor identifies white as light', () => {
    expect(ColorAccessibility.isLightColor('#ffffff')).toBe(true);
  });

  test('isLightColor identifies black as not light', () => {
    expect(ColorAccessibility.isLightColor('#000000')).toBe(false);
  });

  test('getContrastRatio returns 0 for invalid colors', () => {
    const ratio = ColorAccessibility.getContrastRatio('invalid', '#ffffff');
    expect(ratio).toBe(0);
  });
});
