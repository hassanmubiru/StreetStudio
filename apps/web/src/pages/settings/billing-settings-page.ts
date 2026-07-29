/**
 * Billing Settings Page
 * 
 * Organization billing and subscription management page providing
 * usage metrics display, payment method management, subscription
 * upgrade/downgrade workflows, and billing history with invoice downloads.
 * 
 * Validates: Requirements 8.7
 */

import type { Uuid } from '@streetstudio/shared';
import { apiClient } from '../../services/api.js';
import { logger } from '../../app/client-logger.js';

// --- Data Models ---

export interface UsageMetric {
  name: string;
  current: number;
  limit: number;
  unit: string;
  percentage: number;
}

export interface PaymentMethod {
  id: string;
  type: 'card' | 'bank_account';
  brand?: string;
  last4: string;
  expiryMonth?: number;
  expiryYear?: number;
  isDefault: boolean;
}

export interface SubscriptionPlan {
  id: string;
  name: string;
  price: number;
  currency: string;
  interval: 'monthly' | 'yearly';
  features: string[];
  isCurrentPlan: boolean;
  isPopular?: boolean;
}

export interface Invoice {
  id: string;
  date: string;
  amount: number;
  currency: string;
  status: 'paid' | 'pending' | 'failed' | 'refunded';
  description: string;
  downloadUrl: string;
}

export interface BillingData {
  subscription: {
    planId: string;
    planName: string;
    status: 'active' | 'trialing' | 'past_due' | 'canceled';
    currentPeriodEnd: string;
    cancelAtPeriodEnd: boolean;
  };
  usage: UsageMetric[];
  paymentMethods: PaymentMethod[];
  invoices: Invoice[];
  availablePlans: SubscriptionPlan[];
}

export interface BillingSettingsConfig {
  organizationId: Uuid;
}

type BillingView = 'overview' | 'change-plan';

// --- Helper Functions ---

export function formatCurrency(amount: number, currency: string): string {
  const formatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
    minimumFractionDigits: 2,
  });
  return formatter.format(amount / 100);
}

export function formatDate(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

export function getUsageColor(percentage: number): string {
  if (percentage >= 90) return 'red';
  if (percentage >= 75) return 'amber';
  return 'blue';
}

export function getStatusBadgeClass(status: string): string {
  switch (status) {
    case 'active':
    case 'paid':
      return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
    case 'trialing':
      return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
    case 'past_due':
    case 'pending':
      return 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200';
    case 'canceled':
    case 'failed':
      return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
    case 'refunded':
      return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200';
    default:
      return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200';
  }
}

// --- Main Class ---

export class BillingSettingsPage {
  private config: BillingSettingsConfig;
  private element: HTMLElement;
  private billingData: BillingData | null = null;
  private isLoading = false;
  private error: string | null = null;
  private currentView: BillingView = 'overview';

  constructor(config: BillingSettingsConfig) {
    this.config = config;
    this.element = document.createElement('div');
    this.element.className = 'p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto';
    this.element.setAttribute('data-main-content', '');
    this.element.setAttribute('data-page', 'billing-settings');
  }

  public async getElement(): Promise<HTMLElement> {
    await this.loadBillingData();
    this.render();
    return this.element;
  }

  public getBillingData(): BillingData | null {
    return this.billingData;
  }

  public getCurrentView(): BillingView {
    return this.currentView;
  }

  public isLoadingState(): boolean {
    return this.isLoading;
  }

  private async loadBillingData(): Promise<void> {
    this.isLoading = true;
    this.error = null;

    try {
      const response = await apiClient.get<BillingData>(
        `/organizations/${this.config.organizationId}/billing`
      );
      this.billingData = response.data;
      logger.info('Billing data loaded', {
        organizationId: this.config.organizationId,
      });
    } catch (err) {
      this.error = 'Failed to load billing information. Please try again.';
      logger.error('Failed to load billing data', {
        organizationId: this.config.organizationId,
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      this.isLoading = false;
    }
  }

  private render(): void {
    this.element.innerHTML = '';
    this.element.appendChild(this.renderHeader());

    if (this.isLoading) {
      this.element.appendChild(this.renderLoadingState());
      return;
    }

    if (this.error) {
      this.element.appendChild(this.renderError());
      return;
    }

    if (!this.billingData) {
      this.element.appendChild(this.renderError());
      return;
    }

    if (this.currentView === 'change-plan') {
      this.element.appendChild(this.renderChangePlanView());
    } else {
      this.element.appendChild(this.renderSubscriptionStatus());
      this.element.appendChild(this.renderUsageMetrics());
      this.element.appendChild(this.renderPaymentMethods());
      this.element.appendChild(this.renderBillingHistory());
    }

    this.setupEventListeners();
  }

  private renderHeader(): HTMLElement {
    const header = document.createElement('div');
    header.className = 'mb-8';
    header.innerHTML = `
      <h1 class="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">
        Billing & Subscription
      </h1>
      <p class="mt-1 text-sm text-gray-600 dark:text-gray-400">
        Manage your subscription, usage, payment methods, and billing history.
      </p>
    `;
    return header;
  }

  private renderLoadingState(): HTMLElement {
    const container = document.createElement('div');
    container.className = 'space-y-6';
    container.setAttribute('aria-busy', 'true');
    container.setAttribute('aria-label', 'Loading billing information');
    container.innerHTML = `
      <div class="animate-pulse space-y-6">
        <div class="bg-gray-200 dark:bg-gray-700 rounded-lg h-32"></div>
        <div class="bg-gray-200 dark:bg-gray-700 rounded-lg h-48"></div>
        <div class="bg-gray-200 dark:bg-gray-700 rounded-lg h-32"></div>
      </div>
    `;
    return container;
  }
