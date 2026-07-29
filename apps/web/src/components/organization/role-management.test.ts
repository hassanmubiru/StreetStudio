/**
 * Unit tests for Role and Permission Management
 *
 * Tests permission matrix display, custom role configuration,
 * team management, and permission inheritance controls.
 *
 * Requirements: 8.3, 8.4, 8.5
 */

// @vitest-environment jsdom

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  PermissionMatrix,
  buildPermissionMap,
  getPermissionKey,
  countGrantedPermissions,
  isResourceFullyGranted,
  isActionFullyGranted,
  DEFAULT_RESOURCES,
  DEFAULT_ACTIONS,
} from './permission-matrix';
import type { PermissionEntry, PermissionMatrixCallbacks } from './permission-matrix';
import {
  RoleManagement,
  validateRoleName,
  rolePermissionsToEntries,
  entriesToPermissionStrings,
  BUILT_IN_ROLES,
} from './role-management';
import type { Role, RoleManagementCallbacks, RoleManagementOptions } from './role-management';
import {
  TeamManagement,
  validateTeamName,
  getTeamMembers,
  getAvailableMembers,
} from './team-management';
import type { Team, TeamMember, TeamManagementCallbacks } from './team-management';
import {
  PermissionInheritance,
  resolvePermissions,
  getEffectivePermission,
  countOverrides,
} from './permission-inheritance';
import type { PermissionSource, PermissionOverride } from './permission-inheritance';

// --------------------------------------------------------------------------
// Test helpers
// --------------------------------------------------------------------------

function createContainer(): HTMLElement {
  const container = document.createElement('div');
  document.body.appendChild(container);
  return container;
}

function makeRole(overrides: Partial<Role> = {}): Role {
  return {
    id: 'role-1',
    organizationId: 'org-1',
    name: 'Test Role',
    description: 'A test role',
    isBuiltIn: false,
    permissions: ['projects:view', 'videos:view'],
    memberCount: 3,
    ...overrides,
  };
}

function makeTeam(overrides: Partial<Team> = {}): Team {
  return {
    id: 'team-1',
    organizationId: 'org-1',
    name: 'Engineering',
    description: 'Engineering team',
    memberIds: ['user-1', 'user-2'],
    createdAt: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeTeamMember(overrides: Partial<TeamMember> = {}): TeamMember {
  return {
    id: 'user-1',
    displayName: 'Alice',
    email: 'alice@test.com',
    ...overrides,
  };
}

const defaultRoleOptions: RoleManagementOptions = {
  organizationId: 'org-1',
  currentUserId: 'user-1',
  isAdmin: true,
  roles: [
    makeRole({ id: 'role-owner', name: 'Owner', isBuiltIn: true, permissions: [] }),
    makeRole({ id: 'role-admin', name: 'Admin', isBuiltIn: true }),
    makeRole({ id: 'role-custom', name: 'Custom Role', isBuiltIn: false }),
  ],
};

function defaultRoleCallbacks(): RoleManagementCallbacks {
  return {
    onCreateRole: vi.fn().mockResolvedValue(makeRole({ id: 'new-role' })),
    onUpdateRole: vi.fn().mockResolvedValue(makeRole()),
    onDeleteRole: vi.fn().mockResolvedValue(true),
    onAssignRole: vi.fn().mockResolvedValue(true),
  };
}

function defaultTeamCallbacks(): TeamManagementCallbacks {
  return {
    onCreateTeam: vi.fn().mockResolvedValue(makeTeam({ id: 'new-team' })),
    onUpdateTeam: vi.fn().mockResolvedValue(makeTeam()),
    onDeleteTeam: vi.fn().mockResolvedValue(true),
    onAddMember: vi.fn().mockResolvedValue(true),
    onRemoveMember: vi.fn().mockResolvedValue(true),
  };
}

// --------------------------------------------------------------------------
// Permission Matrix - Utility functions
// --------------------------------------------------------------------------

describe('getPermissionKey', () => {
  it('creates correct permission key', () => {
    expect(getPermissionKey('projects', 'view')).toBe('projects:view');
  });

  it('handles empty strings', () => {
    expect(getPermissionKey('', '')).toBe(':');
  });
});

describe('buildPermissionMap', () => {
  it('builds map from permission entries', () => {
    const entries: PermissionEntry[] = [
      { resourceId: 'projects', actionId: 'view', granted: true },
      { resourceId: 'videos', actionId: 'edit', granted: false },
    ];
    const map = buildPermissionMap(entries);
    expect(map.size).toBe(2);
    expect(map.get('projects:view')?.granted).toBe(true);
    expect(map.get('videos:edit')?.granted).toBe(false);
  });

  it('returns empty map for empty input', () => {
    const map = buildPermissionMap([]);
    expect(map.size).toBe(0);
  });
});

describe('countGrantedPermissions', () => {
  it('counts granted permissions', () => {
    const entries: PermissionEntry[] = [
      { resourceId: 'projects', actionId: 'view', granted: true },
      { resourceId: 'projects', actionId: 'edit', granted: false },
      { resourceId: 'videos', actionId: 'view', granted: true },
    ];
    expect(countGrantedPermissions(entries)).toBe(2);
  });

  it('returns 0 for empty array', () => {
    expect(countGrantedPermissions([])).toBe(0);
  });

  it('returns 0 when none granted', () => {
    const entries: PermissionEntry[] = [
      { resourceId: 'projects', actionId: 'view', granted: false },
    ];
    expect(countGrantedPermissions(entries)).toBe(0);
  });
});

describe('isResourceFullyGranted', () => {
  const actions = [
    { id: 'view', name: 'View', description: '' },
    { id: 'edit', name: 'Edit', description: '' },
  ];

  it('returns true when all actions are granted for a resource', () => {
    const entries: PermissionEntry[] = [
      { resourceId: 'projects', actionId: 'view', granted: true },
      { resourceId: 'projects', actionId: 'edit', granted: true },
    ];
    expect(isResourceFullyGranted(entries, 'projects', actions)).toBe(true);
  });

  it('returns false when some actions are denied', () => {
    const entries: PermissionEntry[] = [
      { resourceId: 'projects', actionId: 'view', granted: true },
      { resourceId: 'projects', actionId: 'edit', granted: false },
    ];
    expect(isResourceFullyGranted(entries, 'projects', actions)).toBe(false);
  });
});
