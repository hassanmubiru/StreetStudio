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
