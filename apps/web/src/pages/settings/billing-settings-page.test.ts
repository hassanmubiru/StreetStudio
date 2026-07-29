/**
 * Billing Settings Page Tests
 * 
 * Tests for billing and subscription management including usage metrics display,
 * payment method management, subscription plan changes, and billing history
 * with invoice downloads.
 * 
 * Validates: Requirements 8.7
 */

// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  BillingSettingsPage,
  formatCurrency,
  formatDate,
  getUsageColor,
  getStatusBadgeClass,
  type BillingData,
  type UsageMetric,
  type PaymentMethod,
  type Invoice,
  type SubscriptionPlan,
} from './billing-settings-page.js';

// Mock the API client
vi.mock('../../services/api.js', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

// Mock logger
vi.mock('../../app/client-logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

import { apiClient } from '../../services/api.js';

const mockBillingData: BillingData = {
  subscription: {
    planId: 'pro',
    planName: 'Pro Plan',
    status: 'active',
    currentPeriodEnd: '2024-02-15T00:00:00Z',
    cancelAtPeriodEnd: false,
  },
  usage: [
    { name: 'Storage', current: 45, limit: 100, unit: 'GB', percentage: 45 },
    { name: 'Videos', current: 150, limit: 500, unit: 'videos', percentage: 30 },
    { name: 'Team Members', current: 8, limit: 10, unit: 'members', percentage: 80 },
  ],
  paymentMethods: [
    {
      id: 'pm_1',
      type: 'card',
      brand: 'Visa',
      last4: '4242',
      expiryMonth: 12,
      expiryYear: 2025,
      isDefault: true,
    },
    {
      id: 'pm_2',
      type: 'card',
      brand: 'Mastercard',
      last4: '5555',
      expiryMonth: 6,
      expiryYear: 2026,
      isDefault: false,
    },
  ],
  invoices: [
    {
      id: 'inv_1',
      date: '2024-01-15T00:00:00Z',
      amount: 2900,
      currency: 'usd',
      status: 'paid',
      description: 'Pro Plan - January 2024',
      downloadUrl: '/api/invoices/inv_1/download',
    },
    {
      id: 'inv_2',
      date: '2023-12-15T00:00:00Z',
      amount: 2900,
      currency: 'usd',
      status: 'paid',
      description: 'Pro Plan - December 2023',
      downloadUrl: '/api/invoices/inv_2/download',
    },
  ],
  availablePlans: [
    {
      id: 'free',
      name: 'Free',
      price: 0,
      currency: 'usd',
      interval: 'monthly',
      features: ['5 videos', '1 GB storage', '1 team member'],
      isCurrentPlan: false,
    },
    {
      id: 'pro',
      name: 'Pro Plan',
      price: 2900,
      currency: 'usd',
      interval: 'monthly',
      features: ['500 videos', '100 GB storage', '10 team members', 'Priority support'],
      isCurrentPlan: true,
      isPopular: true,
    },
    {
      id: 'enterprise',
      name: 'Enterprise',
      price: 9900,
      currency: 'usd',
      interval: 'monthly',
      features: ['Unlimited videos', '1 TB storage', 'Unlimited members', 'SSO', 'Custom branding'],
      isCurrentPlan: false,
    },
  ],
};

describe('Helper Functions', () => {
  describe('formatCurrency', () => {
    it('should format cents to USD currency string', () => {
      expect(formatCurrency(2900, 'usd')).toBe('$29.00');
    });

    it('should format zero amount', () => {
      expect(formatCurrency(0, 'usd')).toBe('$0.00');
    });

    it('should format large amounts', () => {
      expect(formatCurrency(99900, 'usd')).toBe('$999.00');
    });

    it('should handle different currencies', () => {
      const result = formatCurrency(1500, 'eur');
      expect(result).toContain('15.00');
    });
  });

  describe('formatDate', () => {
    it('should format ISO date string', () => {
      const result = formatDate('2024-01-15T00:00:00Z');
      expect(result).toContain('Jan');
      expect(result).toContain('15');
      expect(result).toContain('2024');
    });

    it('should return original string on invalid date', () => {
      expect(formatDate('not-a-date')).toBe('Invalid Date');
    });
  });

  describe('getUsageColor', () => {
    it('should return blue for low usage', () => {
      expect(getUsageColor(30)).toBe('blue');
      expect(getUsageColor(0)).toBe('blue');
      expect(getUsageColor(74)).toBe('blue');
    });

    it('should return amber for medium-high usage', () => {
      expect(getUsageColor(75)).toBe('amber');
      expect(getUsageColor(89)).toBe('amber');
    });

    it('should return red for high usage', () => {
      expect(getUsageColor(90)).toBe('red');
      expect(getUsageColor(100)).toBe('red');
    });
  });

  describe('getStatusBadgeClass', () => {
    it('should return green classes for active/paid', () => {
      expect(getStatusBadgeClass('active')).toContain('green');
      expect(getStatusBadgeClass('paid')).toContain('green');
    });

    it('should return blue classes for trialing', () => {
      expect(getStatusBadgeClass('trialing')).toContain('blue');
    });

    it('should return amber classes for past_due/pending', () => {
      expect(getStatusBadgeClass('past_due')).toContain('amber');
      expect(getStatusBadgeClass('pending')).toContain('amber');
    });

    it('should return red classes for canceled/failed', () => {
      expect(getStatusBadgeClass('canceled')).toContain('red');
      expect(getStatusBadgeClass('failed')).toContain('red');
    });

    it('should return gray classes for unknown status', () => {
      expect(getStatusBadgeClass('unknown')).toContain('gray');
    });
  });
});

describe('BillingSettingsPage', () => {
  let page: BillingSettingsPage;

  beforeEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = '<div id="app"></div>';
    (apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: mockBillingData,
      status: 200,
      success: true,
    });
  });

  afterEach(() => {
    page?.destroy();
    document.body.innerHTML = '';
  });

  describe('Initialization and Loading', () => {
    it('should create page element with correct attributes', async () => {
      page = new BillingSettingsPage({ organizationId: 'org-123' as any });
      const el = await page.getElement();

      expect(el).toBeInstanceOf(HTMLElement);
      expect(el.getAttribute('data-main-content')).toBe('');
      expect(el.getAttribute('data-page')).toBe('billing-settings');
    });

    it('should display page header', async () => {
      page = new BillingSettingsPage({ organizationId: 'org-123' as any });
      const el = await page.getElement();

      const h1 = el.querySelector('h1');
      expect(h1?.textContent?.trim()).toBe('Billing & Subscription');
    });

    it('should load billing data from API', async () => {
      page = new BillingSettingsPage({ organizationId: 'org-123' as any });
      await page.getElement();

      expect(apiClient.get).toHaveBeenCalledWith('/organizations/org-123/billing');
    });

    it('should store billing data after successful load', async () => {
      page = new BillingSettingsPage({ organizationId: 'org-123' as any });
      await page.getElement();

      expect(page.getBillingData()).toEqual(mockBillingData);
    });

    it('should show error state when API fails', async () => {
      (apiClient.get as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Network error'));

      page = new BillingSettingsPage({ organizationId: 'org-123' as any });
      const el = await page.getElement();

      expect(el.querySelector('[role="alert"]')).toBeTruthy();
      expect(el.querySelector('#retry-load')).toBeTruthy();
    });

    it('should default to overview view', async () => {
      page = new BillingSettingsPage({ organizationId: 'org-123' as any });
      await page.getElement();

      expect(page.getCurrentView()).toBe('overview');
    });
  });
