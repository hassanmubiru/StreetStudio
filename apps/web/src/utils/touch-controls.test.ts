/**
 * Unit tests for Touch-Friendly Controls Utility
 * 
 * Tests touch target creation, validation, and optimization.
 * 
 * Requirements: 10.2
 */

// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  MIN_TOUCH_TARGET,
  createTouchButton,
  ensureTouchTarget,
  validateTouchTargets,
  applyTouchOptimizations,
  createTouchNavLink,
} from './touch-controls.js';

// Mock matchMedia for jsdom
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

describe('Touch Controls Utility', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  describe('MIN_TOUCH_TARGET', () => {
    it('exports 44 as the minimum touch target size', () => {
      expect(MIN_TOUCH_TARGET).toBe(44);
    });
  });

  describe('createTouchButton', () => {
    it('creates a button element', () => {
      const button = createTouchButton({ label: 'Click me' });
      expect(button.tagName).toBe('BUTTON');
      expect(button.type).toBe('button');
    });

    it('sets minimum width to 44px', () => {
      const button = createTouchButton({ label: 'Click me' });
      expect(button.style.minWidth).toBe('44px');
    });

    it('sets minimum height to 44px', () => {
      const button = createTouchButton({ label: 'Click me' });
      expect(button.style.minHeight).toBe('44px');
    });

    it('sets aria-label from label by default', () => {
      const button = createTouchButton({ label: 'Save' });
      expect(button.getAttribute('aria-label')).toBe('Save');
    });

    it('uses custom ariaLabel when provided', () => {
      const button = createTouchButton({ label: 'X', ariaLabel: 'Close dialog' });
      expect(button.getAttribute('aria-label')).toBe('Close dialog');
    });

    it('applies default variant class', () => {
      const button = createTouchButton({ label: 'Save' });
      expect(button.className).toContain('touch-target--button');
    });

    it('applies icon variant class', () => {
      const button = createTouchButton({ label: 'Settings', variant: 'icon', icon: 'M10 10h4' });
      expect(button.className).toContain('touch-target--icon');
    });

    it('applies compact variant class', () => {
      const button = createTouchButton({ label: 'Tag', variant: 'compact' });
      expect(button.className).toContain('touch-target');
    });

    it('renders SVG icon when provided', () => {
      const button = createTouchButton({ label: 'Menu', icon: 'M3 12h18' });
      const svg = button.querySelector('svg');
      expect(svg).not.toBeNull();
      expect(svg?.getAttribute('aria-hidden')).toBe('true');
    });

    it('renders label text for non-icon variants', () => {
      const button = createTouchButton({ label: 'Submit', icon: 'M5 13l4 4L19 7' });
      expect(button.textContent).toContain('Submit');
    });

    it('does not render label text for icon variant', () => {
      const button = createTouchButton({ label: 'Close', variant: 'icon', icon: 'M6 18L18 6M6 6l12 12' });
      // Icon variant only shows the SVG, not the span text
      const span = button.querySelector('span');
      expect(span).toBeNull();
    });

    it('attaches click handler', () => {
      const onClick = vi.fn();
      const button = createTouchButton({ label: 'Click', onClick });
      button.click();
      expect(onClick).toHaveBeenCalledTimes(1);
    });

    it('can be disabled', () => {
      const button = createTouchButton({ label: 'Disabled', disabled: true });
      expect(button.disabled).toBe(true);
      expect(button.getAttribute('aria-disabled')).toBe('true');
    });

    it('applies custom className', () => {
      const button = createTouchButton({ label: 'Custom', className: 'my-class' });
      expect(button.className).toContain('my-class');
    });
  });

  describe('ensureTouchTarget', () => {
    it('returns true for elements already meeting 44px minimum', () => {
      const el = document.createElement('button');
      el.style.width = '48px';
      el.style.height = '48px';
      document.body.appendChild(el);

      // Mock getBoundingClientRect
      vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({
        width: 48,
        height: 48,
        top: 0, left: 0, bottom: 48, right: 48,
        x: 0, y: 0, toJSON: () => ({}),
      });

      const result = ensureTouchTarget(el);
      expect(result).toBe(true);
    });

    it('returns false and adjusts undersized elements', () => {
      const el = document.createElement('button');
      document.body.appendChild(el);

      vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({
        width: 24,
        height: 24,
        top: 0, left: 0, bottom: 24, right: 24,
        x: 0, y: 0, toJSON: () => ({}),
      });

      const result = ensureTouchTarget(el);
      expect(result).toBe(false);
      expect(el.style.minWidth).toBe('44px');
      expect(el.style.minHeight).toBe('44px');
    });

    it('sets data-touch-expanded attribute on adjusted elements', () => {
      const el = document.createElement('button');
      document.body.appendChild(el);

      vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({
        width: 30,
        height: 30,
        top: 0, left: 0, bottom: 30, right: 30,
        x: 0, y: 0, toJSON: () => ({}),
      });

      ensureTouchTarget(el);
      expect(el.dataset.touchExpanded).toBe('true');
    });

    it('only adjusts width if height is sufficient', () => {
      const el = document.createElement('button');
      document.body.appendChild(el);

      vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({
        width: 30,
        height: 50,
        top: 0, left: 0, bottom: 50, right: 30,
        x: 0, y: 0, toJSON: () => ({}),
      });

      ensureTouchTarget(el);
      expect(el.style.minWidth).toBe('44px');
      expect(el.style.minHeight).toBe(''); // Not set because height is already sufficient
    });
  });

  describe('validateTouchTargets', () => {
    it('returns empty array when all targets are compliant', () => {
      const container = document.createElement('div');
      const button = document.createElement('button');
      container.appendChild(button);
      document.body.appendChild(container);

      vi.spyOn(button, 'getBoundingClientRect').mockReturnValue({
        width: 48, height: 48,
        top: 0, left: 0, bottom: 48, right: 48,
        x: 0, y: 0, toJSON: () => ({}),
      });

      const nonCompliant = validateTouchTargets(container);
      expect(nonCompliant).toHaveLength(0);
    });

    it('returns non-compliant elements', () => {
      const container = document.createElement('div');
      const smallButton = document.createElement('button');
      const goodButton = document.createElement('button');
      container.appendChild(smallButton);
      container.appendChild(goodButton);
      document.body.appendChild(container);

      vi.spyOn(smallButton, 'getBoundingClientRect').mockReturnValue({
        width: 20, height: 20,
        top: 0, left: 0, bottom: 20, right: 20,
        x: 0, y: 0, toJSON: () => ({}),
      });
      vi.spyOn(goodButton, 'getBoundingClientRect').mockReturnValue({
        width: 48, height: 48,
        top: 0, left: 0, bottom: 48, right: 48,
        x: 0, y: 0, toJSON: () => ({}),
      });

      const nonCompliant = validateTouchTargets(container);
      expect(nonCompliant).toHaveLength(1);
      expect(nonCompliant[0]).toBe(smallButton);
    });

    it('checks buttons, links, inputs, selects, and role=button', () => {
      const container = document.createElement('div');
      const elements = [
        document.createElement('button'),
        document.createElement('a'),
        document.createElement('input'),
        document.createElement('select'),
      ];
      elements.forEach(el => {
        container.appendChild(el);
        vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({
          width: 20, height: 20,
          top: 0, left: 0, bottom: 20, right: 20,
          x: 0, y: 0, toJSON: () => ({}),
        });
      });
      document.body.appendChild(container);

      const nonCompliant = validateTouchTargets(container);
      expect(nonCompliant.length).toBe(4);
    });

    it('ignores zero-size elements (hidden)', () => {
      const container = document.createElement('div');
      const hiddenBtn = document.createElement('button');
      container.appendChild(hiddenBtn);
      document.body.appendChild(container);

      vi.spyOn(hiddenBtn, 'getBoundingClientRect').mockReturnValue({
        width: 0, height: 0,
        top: 0, left: 0, bottom: 0, right: 0,
        x: 0, y: 0, toJSON: () => ({}),
      });

      const nonCompliant = validateTouchTargets(container);
      expect(nonCompliant).toHaveLength(0);
    });
  });

  describe('applyTouchOptimizations', () => {
    it('applies touch-action: manipulation on touch devices', () => {
      // Mock touch device
      (window.matchMedia as any).mockReturnValue({ matches: true });

      const container = document.createElement('div');
      const button = document.createElement('button');
      container.appendChild(button);
      document.body.appendChild(container);

      vi.spyOn(button, 'getBoundingClientRect').mockReturnValue({
        width: 48, height: 48,
        top: 0, left: 0, bottom: 48, right: 48,
        x: 0, y: 0, toJSON: () => ({}),
      });

      applyTouchOptimizations(container);
      expect(button.style.touchAction).toBe('manipulation');
    });

    it('does nothing on non-touch devices', () => {
      // Mock non-touch device
      (window.matchMedia as any).mockReturnValue({ matches: false });

      const container = document.createElement('div');
      const button = document.createElement('button');
      container.appendChild(button);
      document.body.appendChild(container);

      applyTouchOptimizations(container);
      expect(button.style.touchAction).toBe('');
    });
  });

  describe('createTouchNavLink', () => {
    it('creates an anchor element', () => {
      const link = createTouchNavLink({ href: '/home', label: 'Home' });
      expect(link.tagName).toBe('A');
      expect(link.href).toContain('/home');
    });

    it('sets minimum 44px height', () => {
      const link = createTouchNavLink({ href: '/home', label: 'Home' });
      expect(link.style.minHeight).toBe('44px');
    });

    it('sets minimum 44px width', () => {
      const link = createTouchNavLink({ href: '/home', label: 'Home' });
      expect(link.style.minWidth).toBe('44px');
    });

    it('sets aria-label', () => {
      const link = createTouchNavLink({ href: '/settings', label: 'Settings' });
      expect(link.getAttribute('aria-label')).toBe('Settings');
    });

    it('marks active link with aria-current=page', () => {
      const link = createTouchNavLink({ href: '/dashboard', label: 'Dashboard', isActive: true });
      expect(link.getAttribute('aria-current')).toBe('page');
    });

    it('does not set aria-current for inactive links', () => {
      const link = createTouchNavLink({ href: '/other', label: 'Other', isActive: false });
      expect(link.hasAttribute('aria-current')).toBe(false);
    });

    it('renders icon SVG when provided', () => {
      const link = createTouchNavLink({ href: '/home', label: 'Home', icon: 'M3 12h18' });
      const svg = link.querySelector('svg');
      expect(svg).not.toBeNull();
      expect(svg?.getAttribute('aria-hidden')).toBe('true');
    });

    it('renders label text', () => {
      const link = createTouchNavLink({ href: '/projects', label: 'Projects' });
      expect(link.textContent).toContain('Projects');
    });

    it('renders badge when provided', () => {
      const link = createTouchNavLink({ href: '/notifications', label: 'Notifications', badge: 5 });
      expect(link.textContent).toContain('5');
      expect(link.innerHTML).toContain('5 notifications');
    });

    it('does not render badge when count is 0', () => {
      const link = createTouchNavLink({ href: '/notifications', label: 'Notifications', badge: 0 });
      expect(link.innerHTML).not.toContain('notifications');
    });
  });
});
