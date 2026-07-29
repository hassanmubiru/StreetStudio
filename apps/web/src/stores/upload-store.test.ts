/**
 * Unit Tests for Upload Store
 * 
 * Tests upload progress tracking, state management, queue processing,
 * retry logic, pause/resume, and lifecycle management.
 * 
 * Requirements: 3.7, 3.8, 3.9
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { UploadStore, createUploadStore, getUploadStore } from './upload-store.js';
import type { UploadState, UploadItem } from './upload-store.js';

// Mock dependencies
vi.mock('../app/client-logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  }
}));

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

function createMockFile(name: string, size: number, type: string): File {
  const content = new ArrayBuffer(size);
  return new File([content], name, { type, lastModified: Date.now() });
}
