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

  private renderError(): HTMLElement {
    const container = document.createElement('div');
    container.className = 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-6 text-center';
    container.setAttribute('role', 'alert');
    container.innerHTML = `
      <svg class="w-12 h-12 mx-auto text-red-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.5 0L4.268 16.5c-.77.833.192 2.5 1.732 2.5z"></path>
      </svg>
      <p class="text-red-700 dark:text-red-300 font-medium mb-2">${this.error || 'Unable to load billing information'}</p>
      <button
        id="retry-load"
        class="inline-flex items-center px-4 py-2 text-sm font-medium text-red-700 dark:text-red-200 bg-red-100 dark:bg-red-900/40 border border-red-300 dark:border-red-700 rounded-md hover:bg-red-200 dark:hover:bg-red-900/60 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
      >
        Try Again
      </button>
    `;
    return container;
  }

  private renderSubscriptionStatus(): HTMLElement {
    const data = this.billingData!;
    const sub = data.subscription;
    const statusClass = getStatusBadgeClass(sub.status);
    const periodEnd = formatDate(sub.currentPeriodEnd);

    const section = document.createElement('section');
    section.className = 'bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6 mb-6';
    section.setAttribute('aria-labelledby', 'subscription-heading');
    section.innerHTML = `
      <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 id="subscription-heading" class="text-lg font-medium text-gray-900 dark:text-white">
            Current Plan
          </h2>
          <div class="mt-2 flex items-center gap-3">
            <span class="text-2xl font-bold text-gray-900 dark:text-white">${this.escapeHtml(sub.planName)}</span>
            <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusClass}">
              ${sub.status}
            </span>
          </div>
          <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
            ${sub.cancelAtPeriodEnd
              ? `Cancels on ${periodEnd}`
              : `Renews on ${periodEnd}`}
          </p>
        </div>
        <div class="flex gap-3">
          <button
            id="change-plan-btn"
            class="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md shadow-sm hover:bg-blue-700 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            Change Plan
          </button>
          ${!sub.cancelAtPeriodEnd ? `
            <button
              id="cancel-subscription-btn"
              class="inline-flex items-center px-4 py-2 text-sm font-medium text-red-700 dark:text-red-200 bg-white dark:bg-gray-700 border border-red-300 dark:border-red-600 rounded-md shadow-sm hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
            >
              Cancel Plan
            </button>
          ` : ''}
        </div>
      </div>
    `;
    return section;
  }

  private renderUsageMetrics(): HTMLElement {
    const data = this.billingData!;
    const section = document.createElement('section');
    section.className = 'bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6 mb-6';
    section.setAttribute('aria-labelledby', 'usage-heading');

    const metricsHtml = data.usage.map(metric => {
      const color = getUsageColor(metric.percentage);
      const barColorClass = color === 'red'
        ? 'bg-red-500'
        : color === 'amber'
          ? 'bg-amber-500'
          : 'bg-blue-500';
      const textColorClass = color === 'red'
        ? 'text-red-600 dark:text-red-400'
        : color === 'amber'
          ? 'text-amber-600 dark:text-amber-400'
          : 'text-blue-600 dark:text-blue-400';

      return `
        <div class="usage-metric" data-metric="${this.escapeHtml(metric.name)}">
          <div class="flex items-center justify-between mb-1">
            <span class="text-sm font-medium text-gray-700 dark:text-gray-300">${this.escapeHtml(metric.name)}</span>
            <span class="text-sm ${textColorClass}">${metric.current} / ${metric.limit} ${this.escapeHtml(metric.unit)}</span>
          </div>
          <div class="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5" role="progressbar" aria-valuenow="${metric.percentage}" aria-valuemin="0" aria-valuemax="100" aria-label="${this.escapeHtml(metric.name)} usage">
            <div class="${barColorClass} h-2.5 rounded-full transition-all" style="width: ${Math.min(metric.percentage, 100)}%"></div>
          </div>
        </div>
      `;
    }).join('');

    section.innerHTML = `
      <h2 id="usage-heading" class="text-lg font-medium text-gray-900 dark:text-white mb-4">Usage</h2>
      <div class="space-y-4">
        ${metricsHtml || '<p class="text-sm text-gray-500 dark:text-gray-400">No usage data available.</p>'}
      </div>
    `;
    return section;
  }
