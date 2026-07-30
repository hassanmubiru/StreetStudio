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
