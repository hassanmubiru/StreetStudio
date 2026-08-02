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

// Mock the API (billing-settings-page now uses inline fetch via apiFetch helper)
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Helper to build a fetch Response-like for apiFetch (which calls res.json())
function jsonResponse(data: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => data } as unknown as Response;
}

// Mock logger
vi.mock('../../app/client-logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

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
    vi.restoreAllMocks();
    mockFetch.mockReset();
    document.body.innerHTML = '<div id="app"></div>';
    // Default: successful billing data load
    mockFetch.mockResolvedValue(jsonResponse(structuredClone(mockBillingData)));
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

      expect(mockFetch).toHaveBeenCalledWith(
        '/organizations/org-123/billing',
        expect.objectContaining({ method: 'GET' }),
      );
    });

    it('should store billing data after successful load', async () => {
      page = new BillingSettingsPage({ organizationId: 'org-123' as any });
      await page.getElement();

      expect(page.getBillingData()).toEqual(mockBillingData);
    });

    it('should show error state when API fails', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

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

  describe('Subscription Status Section', () => {
    it('should display current plan name', async () => {
      page = new BillingSettingsPage({ organizationId: 'org-123' as any });
      const el = await page.getElement();
      document.body.appendChild(el);

      const planName = el.querySelector('#subscription-heading')?.closest('section');
      expect(planName?.textContent).toContain('Pro Plan');
    });

    it('should display subscription status badge', async () => {
      page = new BillingSettingsPage({ organizationId: 'org-123' as any });
      const el = await page.getElement();

      const badge = el.querySelector('[class*="rounded-full"]');
      expect(badge?.textContent?.trim()).toBe('active');
    });

    it('should show renewal date when not canceling', async () => {
      page = new BillingSettingsPage({ organizationId: 'org-123' as any });
      const el = await page.getElement();

      const section = el.querySelector('#subscription-heading')?.closest('section');
      expect(section?.textContent).toContain('Renews on');
    });

    it('should show cancellation date when cancel at period end', async () => {
      const canceledData = {
        ...mockBillingData,
        subscription: { ...mockBillingData.subscription, cancelAtPeriodEnd: true },
      };
      (apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: canceledData, status: 200, success: true,
      });

      page = new BillingSettingsPage({ organizationId: 'org-123' as any });
      const el = await page.getElement();

      const section = el.querySelector('#subscription-heading')?.closest('section');
      expect(section?.textContent).toContain('Cancels on');
    });

    it('should show change plan button', async () => {
      page = new BillingSettingsPage({ organizationId: 'org-123' as any });
      const el = await page.getElement();

      expect(el.querySelector('#change-plan-btn')).toBeTruthy();
    });

    it('should show cancel button when subscription is active', async () => {
      page = new BillingSettingsPage({ organizationId: 'org-123' as any });
      const el = await page.getElement();

      expect(el.querySelector('#cancel-subscription-btn')).toBeTruthy();
    });

    it('should hide cancel button when already canceling', async () => {
      const cancelingData = {
        ...mockBillingData,
        subscription: { ...mockBillingData.subscription, cancelAtPeriodEnd: true },
      };
      (apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: cancelingData, status: 200, success: true,
      });

      page = new BillingSettingsPage({ organizationId: 'org-123' as any });
      const el = await page.getElement();

      expect(el.querySelector('#cancel-subscription-btn')).toBeFalsy();
    });
  });

  describe('Usage Metrics Section', () => {
    it('should display all usage metrics', async () => {
      page = new BillingSettingsPage({ organizationId: 'org-123' as any });
      const el = await page.getElement();

      const metrics = el.querySelectorAll('.usage-metric');
      expect(metrics.length).toBe(3);
    });

    it('should display metric names and values', async () => {
      page = new BillingSettingsPage({ organizationId: 'org-123' as any });
      const el = await page.getElement();

      const storageMetric = el.querySelector('[data-metric="Storage"]');
      expect(storageMetric?.textContent).toContain('45');
      expect(storageMetric?.textContent).toContain('100');
      expect(storageMetric?.textContent).toContain('GB');
    });

    it('should render progress bars with correct aria attributes', async () => {
      page = new BillingSettingsPage({ organizationId: 'org-123' as any });
      const el = await page.getElement();

      const progressBars = el.querySelectorAll('[role="progressbar"]');
      expect(progressBars.length).toBe(3);

      const storageBar = el.querySelector('[aria-label="Storage usage"]');
      expect(storageBar?.getAttribute('aria-valuenow')).toBe('45');
      expect(storageBar?.getAttribute('aria-valuemin')).toBe('0');
      expect(storageBar?.getAttribute('aria-valuemax')).toBe('100');
    });

    it('should show usage heading', async () => {
      page = new BillingSettingsPage({ organizationId: 'org-123' as any });
      const el = await page.getElement();

      expect(el.querySelector('#usage-heading')?.textContent).toBe('Usage');
    });

    it('should handle empty usage data', async () => {
      const emptyData = { ...mockBillingData, usage: [] };
      (apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: emptyData, status: 200, success: true,
      });

      page = new BillingSettingsPage({ organizationId: 'org-123' as any });
      const el = await page.getElement();

      const section = el.querySelector('#usage-heading')?.closest('section');
      expect(section?.textContent).toContain('No usage data available');
    });
  });

  describe('Payment Methods Section', () => {
    it('should display all payment methods', async () => {
      page = new BillingSettingsPage({ organizationId: 'org-123' as any });
      const el = await page.getElement();

      const methods = el.querySelectorAll('.payment-method');
      expect(methods.length).toBe(2);
    });

    it('should show card details with last4 digits', async () => {
      page = new BillingSettingsPage({ organizationId: 'org-123' as any });
      const el = await page.getElement();

      const method = el.querySelector('[data-method-id="pm_1"]');
      expect(method?.textContent).toContain('4242');
      expect(method?.textContent).toContain('Visa');
    });

    it('should show expiry date for cards', async () => {
      page = new BillingSettingsPage({ organizationId: 'org-123' as any });
      const el = await page.getElement();

      const method = el.querySelector('[data-method-id="pm_1"]');
      expect(method?.textContent).toContain('12/2025');
    });

    it('should show default badge on default method', async () => {
      page = new BillingSettingsPage({ organizationId: 'org-123' as any });
      const el = await page.getElement();

      const defaultMethod = el.querySelector('[data-method-id="pm_1"]');
      expect(defaultMethod?.textContent).toContain('Default');
    });

    it('should show set default button for non-default methods', async () => {
      page = new BillingSettingsPage({ organizationId: 'org-123' as any });
      const el = await page.getElement();

      const setDefaultBtn = el.querySelector('.set-default-btn[data-method-id="pm_2"]');
      expect(setDefaultBtn).toBeTruthy();
    });

    it('should not show set default button for the default method', async () => {
      page = new BillingSettingsPage({ organizationId: 'org-123' as any });
      const el = await page.getElement();

      const setDefaultBtn = el.querySelector('.set-default-btn[data-method-id="pm_1"]');
      expect(setDefaultBtn).toBeFalsy();
    });

    it('should show add payment method button', async () => {
      page = new BillingSettingsPage({ organizationId: 'org-123' as any });
      const el = await page.getElement();

      expect(el.querySelector('#add-payment-method-btn')).toBeTruthy();
    });

    it('should show remove buttons for all methods', async () => {
      page = new BillingSettingsPage({ organizationId: 'org-123' as any });
      const el = await page.getElement();

      const removeBtns = el.querySelectorAll('.remove-method-btn');
      expect(removeBtns.length).toBe(2);
    });

    it('should have accessible remove button labels', async () => {
      page = new BillingSettingsPage({ organizationId: 'org-123' as any });
      const el = await page.getElement();

      const removeBtn = el.querySelector('.remove-method-btn[data-method-id="pm_1"]');
      expect(removeBtn?.getAttribute('aria-label')).toContain('4242');
    });

    it('should handle empty payment methods', async () => {
      const emptyData = { ...mockBillingData, paymentMethods: [] };
      (apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: emptyData, status: 200, success: true,
      });

      page = new BillingSettingsPage({ organizationId: 'org-123' as any });
      const el = await page.getElement();

      const section = el.querySelector('#payment-heading')?.closest('section');
      expect(section?.textContent).toContain('No payment methods on file');
    });
  });

  describe('Billing History Section', () => {
    it('should display invoice table', async () => {
      page = new BillingSettingsPage({ organizationId: 'org-123' as any });
      const el = await page.getElement();

      const table = el.querySelector('table[aria-label="Billing history"]');
      expect(table).toBeTruthy();
    });

    it('should display correct number of invoice rows', async () => {
      page = new BillingSettingsPage({ organizationId: 'org-123' as any });
      const el = await page.getElement();

      const rows = el.querySelectorAll('table[aria-label="Billing history"] tbody tr');
      expect(rows.length).toBe(2);
    });

    it('should display invoice date and description', async () => {
      page = new BillingSettingsPage({ organizationId: 'org-123' as any });
      const el = await page.getElement();

      const firstRow = el.querySelector('table[aria-label="Billing history"] tbody tr');
      expect(firstRow?.textContent).toContain('Jan');
      expect(firstRow?.textContent).toContain('Pro Plan - January 2024');
    });

    it('should display formatted amount', async () => {
      page = new BillingSettingsPage({ organizationId: 'org-123' as any });
      const el = await page.getElement();

      const firstRow = el.querySelector('table[aria-label="Billing history"] tbody tr');
      expect(firstRow?.textContent).toContain('$29.00');
    });

    it('should display status badges', async () => {
      page = new BillingSettingsPage({ organizationId: 'org-123' as any });
      const el = await page.getElement();

      const firstRow = el.querySelector('table[aria-label="Billing history"] tbody tr');
      expect(firstRow?.textContent).toContain('paid');
    });

    it('should show download links for invoices', async () => {
      page = new BillingSettingsPage({ organizationId: 'org-123' as any });
      const el = await page.getElement();

      const downloadLinks = el.querySelectorAll('.invoice-download');
      expect(downloadLinks.length).toBe(2);

      const firstLink = downloadLinks[0] as HTMLAnchorElement;
      expect(firstLink.href).toContain('/api/invoices/inv_1/download');
      expect(firstLink.hasAttribute('download')).toBe(true);
    });

    it('should have accessible download link labels', async () => {
      page = new BillingSettingsPage({ organizationId: 'org-123' as any });
      const el = await page.getElement();

      const downloadLink = el.querySelector('.invoice-download[data-invoice-id="inv_1"]');
      expect(downloadLink?.getAttribute('aria-label')).toContain('Download invoice');
    });

    it('should handle empty invoice list', async () => {
      const emptyData = { ...mockBillingData, invoices: [] };
      (apiClient.get as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: emptyData, status: 200, success: true,
      });

      page = new BillingSettingsPage({ organizationId: 'org-123' as any });
      const el = await page.getElement();

      const section = el.querySelector('#history-heading')?.closest('section');
      expect(section?.textContent).toContain('No billing history available');
    });
  });

  describe('Change Plan View', () => {
    it('should switch to change plan view on button click', async () => {
      page = new BillingSettingsPage({ organizationId: 'org-123' as any });
      const el = await page.getElement();
      document.body.appendChild(el);

      const changePlanBtn = el.querySelector('#change-plan-btn') as HTMLButtonElement;
      changePlanBtn.click();

      expect(page.getCurrentView()).toBe('change-plan');
    });

    it('should display available plans in grid', async () => {
      page = new BillingSettingsPage({ organizationId: 'org-123' as any });
      const el = await page.getElement();
      document.body.appendChild(el);

      const changePlanBtn = el.querySelector('#change-plan-btn') as HTMLButtonElement;
      changePlanBtn.click();

      const planCards = el.querySelectorAll('.plan-card');
      expect(planCards.length).toBe(3);
    });

    it('should mark current plan card with aria-checked', async () => {
      page = new BillingSettingsPage({ organizationId: 'org-123' as any });
      const el = await page.getElement();
      document.body.appendChild(el);

      const changePlanBtn = el.querySelector('#change-plan-btn') as HTMLButtonElement;
      changePlanBtn.click();

      const currentPlanCard = el.querySelector('[data-plan-id="pro"]');
      expect(currentPlanCard?.getAttribute('aria-checked')).toBe('true');
    });

    it('should disable select button on current plan', async () => {
      page = new BillingSettingsPage({ organizationId: 'org-123' as any });
      const el = await page.getElement();
      document.body.appendChild(el);

      const changePlanBtn = el.querySelector('#change-plan-btn') as HTMLButtonElement;
      changePlanBtn.click();

      const currentBtn = el.querySelector('.select-plan-btn[data-plan-id="pro"]') as HTMLButtonElement;
      expect(currentBtn.disabled).toBe(true);
      expect(currentBtn.textContent?.trim()).toBe('Current Plan');
    });

    it('should show plan features', async () => {
      page = new BillingSettingsPage({ organizationId: 'org-123' as any });
      const el = await page.getElement();
      document.body.appendChild(el);

      const changePlanBtn = el.querySelector('#change-plan-btn') as HTMLButtonElement;
      changePlanBtn.click();

      const freePlan = el.querySelector('[data-plan-id="free"]');
      expect(freePlan?.textContent).toContain('5 videos');
      expect(freePlan?.textContent).toContain('1 GB storage');
    });

    it('should show popular badge on popular plan', async () => {
      page = new BillingSettingsPage({ organizationId: 'org-123' as any });
      const el = await page.getElement();
      document.body.appendChild(el);

      const changePlanBtn = el.querySelector('#change-plan-btn') as HTMLButtonElement;
      changePlanBtn.click();

      const proPlan = el.querySelector('[data-plan-id="pro"]');
      expect(proPlan?.textContent).toContain('Most Popular');
    });

    it('should show back button to return to overview', async () => {
      page = new BillingSettingsPage({ organizationId: 'org-123' as any });
      const el = await page.getElement();
      document.body.appendChild(el);

      const changePlanBtn = el.querySelector('#change-plan-btn') as HTMLButtonElement;
      changePlanBtn.click();

      const backBtn = el.querySelector('#back-to-overview-btn');
      expect(backBtn).toBeTruthy();
    });

    it('should navigate back to overview on back button click', async () => {
      page = new BillingSettingsPage({ organizationId: 'org-123' as any });
      const el = await page.getElement();
      document.body.appendChild(el);

      const changePlanBtn = el.querySelector('#change-plan-btn') as HTMLButtonElement;
      changePlanBtn.click();
      expect(page.getCurrentView()).toBe('change-plan');

      const backBtn = el.querySelector('#back-to-overview-btn') as HTMLButtonElement;
      backBtn.click();
      expect(page.getCurrentView()).toBe('overview');
    });
  });

  describe('Payment Method Actions', () => {
    it('should call API to set default payment method', async () => {
      (apiClient.put as ReturnType<typeof vi.fn>).mockResolvedValue({ data: {}, status: 200, success: true });

      page = new BillingSettingsPage({ organizationId: 'org-123' as any });
      const el = await page.getElement();
      document.body.appendChild(el);

      const setDefaultBtn = el.querySelector('.set-default-btn[data-method-id="pm_2"]') as HTMLButtonElement;
      setDefaultBtn.click();

      await vi.waitFor(() => {
        expect(apiClient.put).toHaveBeenCalledWith(
          '/organizations/org-123/billing/payment-methods/pm_2/default',
          {}
        );
      });
    });

    it('should call API to remove non-default payment method', async () => {
      (apiClient.delete as ReturnType<typeof vi.fn>).mockResolvedValue({ data: {}, status: 200, success: true });
      vi.spyOn(window, 'confirm').mockReturnValue(true);

      page = new BillingSettingsPage({ organizationId: 'org-123' as any });
      const el = await page.getElement();
      document.body.appendChild(el);

      const removeBtn = el.querySelector('.remove-method-btn[data-method-id="pm_2"]') as HTMLButtonElement;
      removeBtn.click();

      await vi.waitFor(() => {
        expect(apiClient.delete).toHaveBeenCalledWith(
          '/organizations/org-123/billing/payment-methods/pm_2'
        );
      });
    });

    it('should emit event when add payment method is clicked', async () => {
      page = new BillingSettingsPage({ organizationId: 'org-123' as any });
      const el = await page.getElement();
      document.body.appendChild(el);

      const eventSpy = vi.fn();
      el.addEventListener('add-payment-method', eventSpy);

      const addBtn = el.querySelector('#add-payment-method-btn') as HTMLButtonElement;
      addBtn.click();

      expect(eventSpy).toHaveBeenCalled();
    });
  });

  describe('Subscription Actions', () => {
    it('should call API to cancel subscription on confirm', async () => {
      (apiClient.post as ReturnType<typeof vi.fn>).mockResolvedValue({ data: {}, status: 200, success: true });
      vi.spyOn(window, 'confirm').mockReturnValue(true);

      page = new BillingSettingsPage({ organizationId: 'org-123' as any });
      const el = await page.getElement();
      document.body.appendChild(el);

      const cancelBtn = el.querySelector('#cancel-subscription-btn') as HTMLButtonElement;
      cancelBtn.click();

      await vi.waitFor(() => {
        expect(apiClient.post).toHaveBeenCalledWith(
          '/organizations/org-123/billing/cancel',
          {}
        );
      });
    });

    it('should not call API when cancel is not confirmed', async () => {
      vi.spyOn(window, 'confirm').mockReturnValue(false);

      page = new BillingSettingsPage({ organizationId: 'org-123' as any });
      const el = await page.getElement();
      document.body.appendChild(el);

      const cancelBtn = el.querySelector('#cancel-subscription-btn') as HTMLButtonElement;
      expect(cancelBtn).toBeTruthy();
      cancelBtn.click();

      // Give async handler time to potentially call the API
      await new Promise(resolve => setTimeout(resolve, 50));
      expect(apiClient.post).not.toHaveBeenCalled();
    });

    it('should call API to change plan on confirm', async () => {
      (apiClient.post as ReturnType<typeof vi.fn>).mockResolvedValue({ data: {}, status: 200, success: true });
      vi.spyOn(window, 'confirm').mockReturnValue(true);

      page = new BillingSettingsPage({ organizationId: 'org-123' as any });
      const el = await page.getElement();
      document.body.appendChild(el);

      // Switch to change plan view
      const changePlanBtn = el.querySelector('#change-plan-btn') as HTMLButtonElement;
      changePlanBtn.click();

      // Select the enterprise plan
      const selectBtn = el.querySelector('.select-plan-btn[data-plan-id="enterprise"]') as HTMLButtonElement;
      selectBtn.click();

      await vi.waitFor(() => {
        expect(apiClient.post).toHaveBeenCalledWith(
          '/organizations/org-123/billing/change-plan',
          { planId: 'enterprise' }
        );
      });
    });

    it('should return to overview after successful plan change', async () => {
      (apiClient.post as ReturnType<typeof vi.fn>).mockResolvedValue({ data: {}, status: 200, success: true });
      vi.spyOn(window, 'confirm').mockReturnValue(true);

      page = new BillingSettingsPage({ organizationId: 'org-123' as any });
      const el = await page.getElement();
      document.body.appendChild(el);

      const changePlanBtn = el.querySelector('#change-plan-btn') as HTMLButtonElement;
      changePlanBtn.click();

      const selectBtn = el.querySelector('.select-plan-btn[data-plan-id="enterprise"]') as HTMLButtonElement;
      selectBtn.click();

      await vi.waitFor(() => {
        expect(page.getCurrentView()).toBe('overview');
      }, { timeout: 3000 });
    });
  });

  describe('Accessibility', () => {
    it('should have proper heading hierarchy', async () => {
      page = new BillingSettingsPage({ organizationId: 'org-123' as any });
      const el = await page.getElement();

      const h1 = el.querySelector('h1');
      expect(h1).toBeTruthy();

      const h2s = el.querySelectorAll('h2');
      expect(h2s.length).toBeGreaterThanOrEqual(4);
    });

    it('should have aria-labelledby on sections', async () => {
      page = new BillingSettingsPage({ organizationId: 'org-123' as any });
      const el = await page.getElement();

      const sections = el.querySelectorAll('section[aria-labelledby]');
      expect(sections.length).toBe(4);
    });

    it('should have role="list" on payment methods container', async () => {
      page = new BillingSettingsPage({ organizationId: 'org-123' as any });
      const el = await page.getElement();

      const list = el.querySelector('[role="list"][aria-label="Payment methods"]');
      expect(list).toBeTruthy();
    });

    it('should have accessible progress bars for usage metrics', async () => {
      page = new BillingSettingsPage({ organizationId: 'org-123' as any });
      const el = await page.getElement();

      const progressBars = el.querySelectorAll('[role="progressbar"]');
      progressBars.forEach(bar => {
        expect(bar.getAttribute('aria-valuenow')).toBeTruthy();
        expect(bar.getAttribute('aria-valuemin')).toBe('0');
        expect(bar.getAttribute('aria-valuemax')).toBe('100');
        expect(bar.getAttribute('aria-label')).toBeTruthy();
      });
    });

    it('should have accessible table in billing history', async () => {
      page = new BillingSettingsPage({ organizationId: 'org-123' as any });
      const el = await page.getElement();

      const table = el.querySelector('table');
      expect(table?.getAttribute('aria-label')).toBe('Billing history');
    });

    it('should have radiogroup on plan cards', async () => {
      page = new BillingSettingsPage({ organizationId: 'org-123' as any });
      const el = await page.getElement();
      document.body.appendChild(el);

      const changePlanBtn = el.querySelector('#change-plan-btn') as HTMLButtonElement;
      changePlanBtn.click();

      const radiogroup = el.querySelector('[role="radiogroup"]');
      expect(radiogroup).toBeTruthy();
      expect(radiogroup?.getAttribute('aria-label')).toBe('Available subscription plans');
    });
  });

  describe('Error Handling', () => {
    it('should show retry button on error', async () => {
      mockFetch.mockRejectedValue(new Error('Fail'));

      page = new BillingSettingsPage({ organizationId: 'org-123' as any });
      const el = await page.getElement();

      expect(el.querySelector('#retry-load')).toBeTruthy();
    });

    it('should retry loading on retry button click', async () => {
      (apiClient.get as ReturnType<typeof vi.fn>)
        .mockRejectedValueOnce(new Error('Fail'))
        .mockResolvedValueOnce({ data: structuredClone(mockBillingData), status: 200, success: true });

      page = new BillingSettingsPage({ organizationId: 'org-123' as any });
      const el = await page.getElement();
      document.body.appendChild(el);

      const retryBtn = el.querySelector('#retry-load') as HTMLButtonElement;
      retryBtn.click();

      await vi.waitFor(() => {
        expect(apiClient.get).toHaveBeenCalledTimes(2);
      }, { timeout: 3000 });
    });
  });
});
