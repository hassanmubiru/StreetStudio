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

  // ============================================================
  // Section 1: Members Page with Role Display and Last Activity
  // Validates: Requirement 8.1
  // ============================================================

  describe('Members List Rendering (Requirement 8.1)', () => {
    it('should render members table with all members', async () => {
      const management = new MemberManagement({
        organizationId: 'org-1',
        currentUserId: 'member-1'
      });
      const element = await management.getElement();
      container.appendChild(element);

      const rows = element.querySelectorAll('[data-member-id]');
      expect(rows.length).toBe(3);
    });

    it('should display member name and email', async () => {
      const management = new MemberManagement({
        organizationId: 'org-1',
        currentUserId: 'member-1'
      });
      const element = await management.getElement();
      container.appendChild(element);

      const aliceRow = element.querySelector('[data-member-id="member-1"]');
      expect(aliceRow?.textContent).toContain('Alice Johnson');
      expect(aliceRow?.textContent).toContain('alice@example.com');
    });

    it('should display member roles', async () => {
      const management = new MemberManagement({
        organizationId: 'org-1',
        currentUserId: 'member-1'
      });
      const element = await management.getElement();
      container.appendChild(element);

      const roleEl = element.querySelector('[data-member-role="member-1"]');
      expect(roleEl?.textContent?.trim()).toBe('Admin');

      const editorRole = element.querySelector('[data-member-role="member-2"]');
      expect(editorRole?.textContent?.trim()).toBe('Editor');
    });

    it('should display last activity for each member', async () => {
      const management = new MemberManagement({
        organizationId: 'org-1',
        currentUserId: 'member-1'
      });
      const element = await management.getElement();
      container.appendChild(element);

      const activityEl = element.querySelector('[data-member-activity="member-1"]');
      expect(activityEl?.textContent?.trim()).toBeTruthy();
      // Activity should contain relative time
      expect(activityEl?.textContent).toMatch(/ago|Just now/);
    });

    it('should display member count', async () => {
      const management = new MemberManagement({
        organizationId: 'org-1',
        currentUserId: 'member-1'
      });
      const element = await management.getElement();
      container.appendChild(element);

      const countEl = element.querySelector('[data-member-count]');
      expect(countEl?.textContent).toContain('3 members');
    });

    it('should mark current user with "(you)" label', async () => {
      const management = new MemberManagement({
        organizationId: 'org-1',
        currentUserId: 'member-1'
      });
      const element = await management.getElement();
      container.appendChild(element);

      const aliceRow = element.querySelector('[data-member-id="member-1"]');
      expect(aliceRow?.textContent).toContain('(you)');
    });

    it('should not show remove button for current user', async () => {
      const management = new MemberManagement({
        organizationId: 'org-1',
        currentUserId: 'member-1'
      });
      const element = await management.getElement();
      container.appendChild(element);

      const aliceRow = element.querySelector('[data-member-id="member-1"]');
      const removeBtn = aliceRow?.querySelector('[data-action="remove-member"]');
      expect(removeBtn).toBeFalsy();
    });

    it('should show remove button for other members', async () => {
      const management = new MemberManagement({
        organizationId: 'org-1',
        currentUserId: 'member-1'
      });
      const element = await management.getElement();
      container.appendChild(element);

      const bobRow = element.querySelector('[data-member-id="member-2"]');
      const removeBtn = bobRow?.querySelector('[data-action="remove-member"]');
      expect(removeBtn).toBeTruthy();
    });
  });

  // ============================================================
  // Section 2: Member Search and Sorting
  // Validates: Requirement 8.1
  // ============================================================

  describe('Member Search and Sorting', () => {
    it('should filter members by search query', async () => {
      const management = new MemberManagement({
        organizationId: 'org-1',
        currentUserId: 'member-1'
      });
      const element = await management.getElement();
      container.appendChild(element);

      const searchInput = element.querySelector('[data-field="member-search"]') as HTMLInputElement;
      searchInput.value = 'alice';
      searchInput.dispatchEvent(new Event('input'));

      // After search, count should be updated
      const countEl = element.querySelector('[data-member-count]');
      expect(countEl?.textContent).toContain('1 member');
    });

    it('should filter members by email', async () => {
      const management = new MemberManagement({
        organizationId: 'org-1',
        currentUserId: 'member-1'
      });
      const element = await management.getElement();
      container.appendChild(element);

      const searchInput = element.querySelector('[data-field="member-search"]') as HTMLInputElement;
      searchInput.value = 'bob@';
      searchInput.dispatchEvent(new Event('input'));

      const countEl = element.querySelector('[data-member-count]');
      expect(countEl?.textContent).toContain('1 member');
    });

    it('should show empty state when no members match search', async () => {
      const management = new MemberManagement({
        organizationId: 'org-1',
        currentUserId: 'member-1'
      });
      const element = await management.getElement();
      container.appendChild(element);

      const searchInput = element.querySelector('[data-field="member-search"]') as HTMLInputElement;
      searchInput.value = 'nonexistent';
      searchInput.dispatchEvent(new Event('input'));

      const countEl = element.querySelector('[data-member-count]');
      expect(countEl?.textContent).toContain('0 members');
    });

    it('should have sortable table columns', async () => {
      const management = new MemberManagement({
        organizationId: 'org-1',
        currentUserId: 'member-1'
      });
      const element = await management.getElement();
      container.appendChild(element);

      const nameSort = element.querySelector('[data-sort="name"]');
      const roleSort = element.querySelector('[data-sort="role"]');
      const activitySort = element.querySelector('[data-sort="activity"]');

      expect(nameSort).toBeTruthy();
      expect(roleSort).toBeTruthy();
      expect(activitySort).toBeTruthy();
    });
  });
