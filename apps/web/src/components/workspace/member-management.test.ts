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
  {
    id: 'member-3',
    email: 'charlie@example.com',
    displayName: 'Charlie Brown',
    role: 'Viewer',
    roleId: 'role-viewer',
    joinedAt: '2024-03-10T10:00:00Z',
    lastActivity: new Date(Date.now() - 604800000).toISOString(),
    status: 'inactive'
  }
];

const mockRoles: RoleDto[] = [
  { id: 'role-admin', organizationId: 'org-1', name: 'Admin', permissions: ['*'] },
  { id: 'role-editor', organizationId: 'org-1', name: 'Editor', permissions: ['read', 'write'] },
  { id: 'role-viewer', organizationId: 'org-1', name: 'Viewer', permissions: ['read'] }
];

const mockInvitations: InvitationDto[] = [
  {
    id: 'inv-1',
    organizationId: 'org-1',
    email: 'pending@example.com',
    status: 'pending',
    createdAt: '2024-03-01T10:00:00Z',
    expiresAt: '2024-04-01T10:00:00Z'
  }
];

describe('MemberManagement', () => {
  let container: HTMLElement;
  let mockApiClient: any;

  beforeEach(async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    const { apiClient } = await import('../../services/api.js');
    mockApiClient = apiClient;
    vi.clearAllMocks();

    // Default mock responses
    mockApiClient.get.mockImplementation((url: string) => {
      if (url.includes('/members')) return Promise.resolve({ data: mockMembers });
      if (url.includes('/roles')) return Promise.resolve({ data: mockRoles });
      if (url.includes('/invitations')) return Promise.resolve({ data: mockInvitations });
      return Promise.resolve({ data: [] });
    });
  });

  afterEach(() => {
    document.body.removeChild(container);
  });
