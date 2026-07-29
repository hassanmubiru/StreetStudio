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
