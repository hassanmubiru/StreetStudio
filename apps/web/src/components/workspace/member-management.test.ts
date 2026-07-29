/**
 * Member Management Unit Tests
 * 
 * Tests member listing with roles and activity,
 * invitation form with role selection,
 * member profile navigation, and removal with confirmation.
 * 
 * Validates: Requirements 8.1, 8.2, 8.8
 */

// @vitest-environment jsdom

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MemberManagement, type OrganizationMember } from './member-management.js';
import type { RoleDto, InvitationDto } from '@streetstudio/shared';

// Mock API client
vi.mock('../../services/api.js', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn()
  }
}));

// Mock logger
vi.mock('../../app/client-logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}));

const mockMembers: OrganizationMember[] = [
  {
    id: 'member-1',
    email: 'alice@example.com',
    displayName: 'Alice Johnson',
    role: 'Admin',
    roleId: 'role-admin',
    joinedAt: '2024-01-15T10:00:00Z',
    lastActivity: new Date(Date.now() - 3600000).toISOString(),
    status: 'active'
  },
  {
    id: 'member-2',
    email: 'bob@example.com',
    displayName: 'Bob Smith',
    role: 'Editor',
    roleId: 'role-editor',
    joinedAt: '2024-02-20T10:00:00Z',
    lastActivity: new Date(Date.now() - 86400000).toISOString(),
    status: 'active'
  },
