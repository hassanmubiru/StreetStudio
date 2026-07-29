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
