/**
 * Video Management Unit Tests
 * 
 * Tests project creation and member invitation workflows,
 * video organization and bulk operations,
 * and folder management and hierarchy display.
 * 
 * Validates: Requirements 4.1, 4.4, 4.5
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { ProjectDto, FolderDto, VideoDto } from '@streetstudio/shared';
import { ProjectDetailPage } from './project-detail-page.js';
import { ProjectsPage } from './projects-page.js';
import { BulkOperationsController } from '../../components/video-library/bulk-operations-controller.js';
import { FolderManager } from '../../components/folder-management/folder-manager.js';

// Mock API client
vi.mock('../../services/api.js', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn()
  }
}));

// Mock error handler and logger
vi.mock('../../app/error-handler.js', () => ({
  handleError: vi.fn()
}));

vi.mock('../../app/client-logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}));
