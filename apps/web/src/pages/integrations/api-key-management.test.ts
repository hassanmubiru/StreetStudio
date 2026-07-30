/**
 * API Key Management Interface Tests
 *
 * Tests for key generation, partial masking, revocation/rotation,
 * and usage analytics display.
 *
 * Validates: Requirements 15.1
 */

// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  ApiKeyManagementPage,
  maskApiKey,
  formatKeyDate,
  getRateLimitPercentage,
  getStatusColor,
  validateKeyName,
  AVAILABLE_SCOPES,
  EXPIRATION_OPTIONS,
  KEY_NAME_MAX_LENGTH,
  type ApiKey,
  type ApiKeyScope,
  type CreateApiKeyResponse,
  type ApiKeyManagementCallbacks,
} from './api-key-management.js';

// --- Test Helpers ---

function createTestKey(overrides?: Partial<ApiKey>): ApiKey {
  return {
    id: 'key-1',
    name: 'Test Key',
    prefix: 'sk_test',
    maskedKey: '••••••••••••abcd',
    scopes: ['read:videos', 'write:videos'],
    status: 'active',
    createdAt: '2024-01-15T10:00:00Z',
    lastUsedAt: '2024-01-20T14:30:00Z',
    requestCount: 1234,
    rateLimitPerHour: 1000,
    rateLimitRemaining: 750,
    ...overrides,
  };
}

function createMockCallbacks(): ApiKeyManagementCallbacks {
  return {
    onCreateKey: vi.fn().mockResolvedValue({
      key: createTestKey({ id: 'new-key-1', name: 'New Key' }),
      fullKey: 'sk_test_abc123xyz789fullkey',
    } as CreateApiKeyResponse),
    onRevokeKey: vi.fn().mockResolvedValue(true),
    onRotateKey: vi.fn().mockResolvedValue({
      key: createTestKey({ id: 'rotated-key-1', name: 'Rotated Key' }),
      fullKey: 'sk_test_rotated123fullkey',
    } as CreateApiKeyResponse),
    onDeleteKey: vi.fn().mockResolvedValue(true),
  };
}

describe('Utility Functions', () => {
  describe('maskApiKey', () => {
    it('should mask key showing only last 4 characters', () => {
      const result = maskApiKey('sk_test_abc123xyz789');
      expect(result).toMatch(/•+xyz789$/);
      expect(result.slice(-4)).toBe('9789');
    });

    it('should show only dots for very short keys', () => {
      expect(maskApiKey('ab')).toBe('****');
    });

    it('should handle exactly 4 character key', () => {
      expect(maskApiKey('abcd')).toBe('****');
    });

    it('should handle 5 character key', () => {
      const result = maskApiKey('abcde');
      expect(result).toBe('•bcde');
    });
  });

  describe('formatKeyDate', () => {
    it('should return "Never" for undefined', () => {
      expect(formatKeyDate(undefined)).toBe('Never');
    });

    it('should return "Invalid date" for invalid string', () => {
      expect(formatKeyDate('not-a-date')).toBe('Invalid date');
    });

    it('should show relative time for recent dates', () => {
      const recent = new Date(Date.now() - 5 * 60000).toISOString();
      expect(formatKeyDate(recent)).toBe('5m ago');
    });

    it('should show hours for dates within a day', () => {
      const hoursAgo = new Date(Date.now() - 3 * 3600000).toISOString();
      expect(formatKeyDate(hoursAgo)).toBe('3h ago');
    });

    it('should show days for dates within a month', () => {
      const daysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
      expect(formatKeyDate(daysAgo)).toBe('7d ago');
    });
  });

  describe('getRateLimitPercentage', () => {
    it('should calculate percentage used', () => {
      expect(getRateLimitPercentage(750, 1000)).toBe(25);
    });

    it('should return 0 for total of 0', () => {
      expect(getRateLimitPercentage(0, 0)).toBe(0);
    });

    it('should cap at 100%', () => {
      expect(getRateLimitPercentage(-50, 1000)).toBe(100);
    });

    it('should return 0 when nothing used', () => {
      expect(getRateLimitPercentage(1000, 1000)).toBe(0);
    });
  });

  describe('getStatusColor', () => {
    it('should return green for active', () => {
      expect(getStatusColor('active')).toContain('green');
    });

    it('should return red for revoked', () => {
      expect(getStatusColor('revoked')).toContain('red');
    });

    it('should return gray for expired', () => {
      expect(getStatusColor('expired')).toContain('gray');
    });
  });

  describe('validateKeyName', () => {
    it('should accept valid names', () => {
      expect(validateKeyName('My API Key').valid).toBe(true);
      expect(validateKeyName('ci-cd-pipeline').valid).toBe(true);
      expect(validateKeyName('production_app_v2').valid).toBe(true);
    });

    it('should reject empty names', () => {
      const result = validateKeyName('');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('required');
    });

    it('should reject names exceeding max length', () => {
      const result = validateKeyName('a'.repeat(KEY_NAME_MAX_LENGTH + 1));
      expect(result.valid).toBe(false);
      expect(result.error).toContain('characters');
    });

    it('should reject names with special characters', () => {
      const result = validateKeyName('key<script>');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('letters, numbers');
    });
  });
});

describe('ApiKeyManagementPage', () => {
  let page: ApiKeyManagementPage;
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    page?.destroy();
    if (container.parentNode) {
      document.body.removeChild(container);
    }
  });

  describe('Initialization', () => {
    it('should create page element with correct structure', () => {
      page = new ApiKeyManagementPage();
      const el = page.getElement();

      expect(el).toBeInstanceOf(HTMLElement);
      expect(el.getAttribute('data-page')).toBe('api-key-management');
      expect(el.getAttribute('data-main-content')).toBe('');
    });

    it('should display heading and description', () => {
      page = new ApiKeyManagementPage();
      const el = page.getElement();

      expect(el.querySelector('h1')?.textContent).toContain('API Keys');
      expect(el.textContent).toContain('programmatic access');
    });

    it('should render generate button', () => {
      page = new ApiKeyManagementPage();
      const el = page.getElement();

      const btn = el.querySelector('#btn-create-key') as HTMLButtonElement;
      expect(btn).toBeTruthy();
      expect(btn.textContent).toContain('Generate New Key');
      expect(btn.getAttribute('aria-label')).toContain('Generate');
    });

    it('should show empty state when no keys', () => {
      page = new ApiKeyManagementPage({ keys: [] });
      const el = page.getElement();

      expect(el.textContent).toContain('No API keys');
      expect(el.textContent).toContain('Generate a key');
    });

    it('should render key table when keys exist', () => {
      const keys = [createTestKey()];
      page = new ApiKeyManagementPage({ keys });
      const el = page.getElement();

      const table = el.querySelector('table');
      expect(table).toBeTruthy();
      expect(table?.getAttribute('aria-label')).toContain('API keys');
    });
  });

  describe('Key Display with Partial Masking', () => {
    it('should display masked key in table', () => {
      const key = createTestKey({ maskedKey: '••••••••••••abcd' });
      page = new ApiKeyManagementPage({ keys: [key] });
      const el = page.getElement();
      container.appendChild(el);

      const codeEl = el.querySelector('code');
      expect(codeEl?.textContent).toContain('abcd');
    });

    it('should display key name', () => {
      const key = createTestKey({ name: 'Production API' });
      page = new ApiKeyManagementPage({ keys: [key] });
      const el = page.getElement();
      container.appendChild(el);

      expect(el.textContent).toContain('Production API');
    });

    it('should display scope count', () => {
      const key = createTestKey({ scopes: ['read:videos', 'write:videos', 'read:projects'] });
      page = new ApiKeyManagementPage({ keys: [key] });
      const el = page.getElement();
      container.appendChild(el);

      expect(el.textContent).toContain('3 scopes');
    });

    it('should display singular scope for single scope', () => {
      const key = createTestKey({ scopes: ['read:videos'] });
      page = new ApiKeyManagementPage({ keys: [key] });
      const el = page.getElement();
      container.appendChild(el);

      expect(el.textContent).toContain('1 scope');
      expect(el.textContent).not.toContain('1 scopes');
    });

    it('should display status badge', () => {
      const key = createTestKey({ status: 'active' });
      page = new ApiKeyManagementPage({ keys: [key] });
      const el = page.getElement();
      container.appendChild(el);

      expect(el.textContent).toContain('Active');
    });

    it('should display revoked status', () => {
      const key = createTestKey({ status: 'revoked' });
      page = new ApiKeyManagementPage({ keys: [key] });
      const el = page.getElement();
      container.appendChild(el);

      expect(el.textContent).toContain('Revoked');
    });
  });

  describe('Usage Analytics and Rate Limiting', () => {
    it('should display request count', () => {
      const key = createTestKey({ requestCount: 5000 });
      page = new ApiKeyManagementPage({ keys: [key] });
      const el = page.getElement();
      container.appendChild(el);

      expect(el.textContent).toContain('5,000 requests');
    });

    it('should display rate limit progress bar', () => {
      const key = createTestKey({ rateLimitPerHour: 1000, rateLimitRemaining: 600 });
      page = new ApiKeyManagementPage({ keys: [key] });
      const el = page.getElement();
      container.appendChild(el);

      const progressbar = el.querySelector('[role="progressbar"]');
      expect(progressbar).toBeTruthy();
      expect(progressbar?.getAttribute('aria-valuenow')).toBe('40');
      expect(progressbar?.getAttribute('aria-label')).toContain('Rate limit');
    });

    it('should display remaining/total rate limit', () => {
      const key = createTestKey({ rateLimitPerHour: 1000, rateLimitRemaining: 750 });
      page = new ApiKeyManagementPage({ keys: [key] });
      const el = page.getElement();
      container.appendChild(el);

      expect(el.textContent).toContain('750/1000 remaining/hr');
    });

    it('should display last used time', () => {
      const recentDate = new Date(Date.now() - 2 * 3600000).toISOString();
      const key = createTestKey({ lastUsedAt: recentDate });
      page = new ApiKeyManagementPage({ keys: [key] });
      const el = page.getElement();
      container.appendChild(el);

      expect(el.textContent).toContain('2h ago');
    });

    it('should display Never for unused keys', () => {
      const key = createTestKey({ lastUsedAt: undefined });
      page = new ApiKeyManagementPage({ keys: [key] });
      const el = page.getElement();
      container.appendChild(el);

      expect(el.textContent).toContain('Never');
    });
  });
