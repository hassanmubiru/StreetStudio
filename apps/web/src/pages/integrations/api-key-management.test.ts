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
