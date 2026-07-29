/**
 * Organization Settings and Billing Unit Tests
 *
 * Tests organization settings page rendering and billing interface display.
 * These tests validate the placeholder implementations pending full
 * feature completion (tasks 10.3, 10.4).
 *
 * Validates: Requirements 8.6, 8.7
 */

// @vitest-environment jsdom

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { OrganizationSettingsPage } from './organization-settings-page.js';
import { BillingSettingsPage } from './billing-settings-page.js';

describe('OrganizationSettingsPage', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  it('should render settings page element', () => {
    const page = new OrganizationSettingsPage();
    const element = page.getElement();
    container.appendChild(element);

    expect(element).toBeTruthy();
    expect(element.tagName).toBe('DIV');
  });

  it('should display page heading', () => {
    const page = new OrganizationSettingsPage();
    const element = page.getElement();
    container.appendChild(element);

    const heading = element.querySelector('h1');
    expect(heading).toBeTruthy();
    expect(heading?.textContent).toContain('Organization Settings');
  });

  it('should have data-main-content attribute for layout integration', () => {
    const page = new OrganizationSettingsPage();
    const element = page.getElement();

    expect(element.getAttribute('data-main-content')).toBe('');
  });
});

describe('BillingSettingsPage', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  it('should render billing page element', () => {
    const page = new BillingSettingsPage();
    const element = page.getElement();
    container.appendChild(element);

    expect(element).toBeTruthy();
    expect(element.tagName).toBe('DIV');
  });

  it('should display billing page heading', () => {
    const page = new BillingSettingsPage();
    const element = page.getElement();
    container.appendChild(element);

    const heading = element.querySelector('h1');
    expect(heading).toBeTruthy();
    expect(heading?.textContent).toContain('Billing Settings');
  });

  it('should have data-main-content attribute for layout integration', () => {
    const page = new BillingSettingsPage();
    const element = page.getElement();

    expect(element.getAttribute('data-main-content')).toBe('');
  });
});
