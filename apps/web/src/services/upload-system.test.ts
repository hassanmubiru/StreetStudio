// @vitest-environment jsdom
/**
 * Upload System Unit Tests
 *
 * Comprehensive tests covering:
 * - Chunked upload logic and retry mechanisms (Requirement 3.7, 3.8)
 * - Upload progress tracking and state management (Requirement 3.8)
 * - Metadata form validation and submission (Requirement 3.9)
 */

import { describe, it, expect, beforeEach, afterEach, vi, type MockedFunction } from 'vitest';
import { FormValidator, ValidationRules } from '../utils/validation.js';

// ============================================================================
// Mock Setup
// ============================================================================

// Mock error-handler
vi.mock('../app/error-handler.js', () => ({
  handleError: vi.fn(),
  getDegradationManager: vi.fn(() => ({
    isFeatureFailed: vi.fn(() => false)
  }))
}));

// Mock client-logger
vi.mock('../app/client-logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  }
}));

// Mock api client
vi.mock('../services/api.js', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn()
  }
}));

const mockFetch = vi.fn() as MockedFunction<typeof fetch>;
global.fetch = mockFetch;

// Mock crypto.randomUUID
Object.defineProperty(global, 'crypto', {
  value: { randomUUID: () => 'test-uuid-1234' }
});

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
    removeItem: vi.fn((key: string) => { delete store[key]; }),
    clear: vi.fn(() => { store = {}; })
  };
})();
Object.defineProperty(window, 'localStorage', { value: localStorageMock });

// Helper to create mock File objects
function createMockFile(name: string, size: number, type = 'video/mp4'): File {
  const content = new ArrayBuffer(size);
  return new File([content], name, { type, lastModified: Date.now() });
}

// ============================================================================
// 1. CHUNKED UPLOAD LOGIC AND RETRY MECHANISMS
// ============================================================================

describe('Upload System - Chunked Upload Logic', () => {
  let UploadManager: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    localStorageMock.clear();
    // Dynamic import to allow mocks to be set up first
    const mod = await import('./upload.js');
    UploadManager = mod.UploadManager;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });
