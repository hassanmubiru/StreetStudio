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

describe('isActionFullyGranted', () => {
  const resources = [
    { id: 'projects', name: 'Projects', description: '' },
    { id: 'videos', name: 'Videos', description: '' },
  ];

  it('returns true when action is granted across all resources', () => {
    const entries: PermissionEntry[] = [
      { resourceId: 'projects', actionId: 'view', granted: true },
      { resourceId: 'videos', actionId: 'view', granted: true },
    ];
    expect(isActionFullyGranted(entries, 'view', resources)).toBe(true);
  });

  it('returns false when action is not granted for all resources', () => {
    const entries: PermissionEntry[] = [
      { resourceId: 'projects', actionId: 'view', granted: true },
      { resourceId: 'videos', actionId: 'view', granted: false },
    ];
    expect(isActionFullyGranted(entries, 'view', resources)).toBe(false);
  });
});

// --------------------------------------------------------------------------
// Permission Matrix - Component
// --------------------------------------------------------------------------

describe('PermissionMatrix', () => {
  let container: HTMLElement;
  let callbacks: PermissionMatrixCallbacks;

  beforeEach(() => {
    container = createContainer();
    callbacks = { onPermissionToggle: vi.fn() };
  });

  it('renders grid with role="grid" and aria-label', () => {
    const permissions: PermissionEntry[] = [
      { resourceId: 'projects', actionId: 'view', granted: true },
    ];
    new PermissionMatrix(container, {
      resources: [{ id: 'projects', name: 'Projects', description: 'Project mgmt' }],
      actions: [{ id: 'view', name: 'View', description: 'View access' }],
      permissions,
    }, callbacks);

    expect(container.getAttribute('role')).toBe('grid');
    expect(container.getAttribute('aria-label')).toBe('Permission matrix');
  });

  it('renders column headers for each action', () => {
    new PermissionMatrix(container, {
      resources: [{ id: 'projects', name: 'Projects', description: '' }],
      actions: [
        { id: 'view', name: 'View', description: '' },
        { id: 'edit', name: 'Edit', description: '' },
      ],
      permissions: [],
    }, callbacks);

    const headers = container.querySelectorAll('.permission-matrix-col-header');
    expect(headers.length).toBe(2);
    expect(headers[0].textContent).toBe('View');
    expect(headers[1].textContent).toBe('Edit');
  });

  it('renders row headers for each resource', () => {
    new PermissionMatrix(container, {
      resources: [
        { id: 'projects', name: 'Projects', description: '' },
        { id: 'videos', name: 'Videos', description: '' },
      ],
      actions: [{ id: 'view', name: 'View', description: '' }],
      permissions: [],
    }, callbacks);

    const rowHeaders = container.querySelectorAll('.permission-matrix-row-header');
    expect(rowHeaders.length).toBe(2);
    expect(rowHeaders[0].textContent).toBe('Projects');
    expect(rowHeaders[1].textContent).toBe('Videos');
  });

  it('renders checkboxes with correct checked state', () => {
    new PermissionMatrix(container, {
      resources: [{ id: 'projects', name: 'Projects', description: '' }],
      actions: [
        { id: 'view', name: 'View', description: '' },
        { id: 'edit', name: 'Edit', description: '' },
      ],
      permissions: [
        { resourceId: 'projects', actionId: 'view', granted: true },
        { resourceId: 'projects', actionId: 'edit', granted: false },
      ],
    }, callbacks);

    const checkboxes = container.querySelectorAll('.permission-checkbox') as NodeListOf<HTMLInputElement>;
    expect(checkboxes.length).toBe(2);
    expect(checkboxes[0].checked).toBe(true);
    expect(checkboxes[1].checked).toBe(false);
  });

  it('calls onPermissionToggle when checkbox is changed', () => {
    new PermissionMatrix(container, {
      resources: [{ id: 'projects', name: 'Projects', description: '' }],
      actions: [{ id: 'view', name: 'View', description: '' }],
      permissions: [{ resourceId: 'projects', actionId: 'view', granted: false }],
    }, callbacks);

    const checkbox = container.querySelector('.permission-checkbox') as HTMLInputElement;
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event('change'));
    expect(callbacks.onPermissionToggle).toHaveBeenCalledWith('projects', 'view', true);
  });

  it('disables checkboxes when readOnly is true', () => {
    new PermissionMatrix(container, {
      resources: [{ id: 'projects', name: 'Projects', description: '' }],
      actions: [{ id: 'view', name: 'View', description: '' }],
      permissions: [{ resourceId: 'projects', actionId: 'view', granted: true }],
      readOnly: true,
    }, callbacks);

    const checkbox = container.querySelector('.permission-checkbox') as HTMLInputElement;
    expect(checkbox.disabled).toBe(true);
  });

  it('shows inherited class when permission is inherited', () => {
    new PermissionMatrix(container, {
      resources: [{ id: 'projects', name: 'Projects', description: '' }],
      actions: [{ id: 'view', name: 'View', description: '' }],
      permissions: [{ resourceId: 'projects', actionId: 'view', granted: true, inherited: true }],
      showInheritance: true,
    }, callbacks);

    const checkbox = container.querySelector('.permission-checkbox') as HTMLInputElement;
    expect(checkbox.classList.contains('inherited')).toBe(true);
  });

  it('displays correct summary text', () => {
    new PermissionMatrix(container, {
      resources: [{ id: 'projects', name: 'Projects', description: '' }],
      actions: [
        { id: 'view', name: 'View', description: '' },
        { id: 'edit', name: 'Edit', description: '' },
      ],
      permissions: [
        { resourceId: 'projects', actionId: 'view', granted: true },
        { resourceId: 'projects', actionId: 'edit', granted: false },
      ],
    }, callbacks);

    const summary = container.querySelector('.permission-matrix-summary');
    expect(summary?.textContent).toBe('1 of 2 permissions granted');
  });

  it('has aria-label on checkboxes', () => {
    new PermissionMatrix(container, {
      resources: [{ id: 'projects', name: 'Projects', description: '' }],
      actions: [{ id: 'view', name: 'View', description: '' }],
      permissions: [{ resourceId: 'projects', actionId: 'view', granted: true }],
    }, callbacks);

    const checkbox = container.querySelector('.permission-checkbox') as HTMLInputElement;
    expect(checkbox.getAttribute('aria-label')).toBe('View Projects');
  });

  it('updates permissions correctly', () => {
    const matrix = new PermissionMatrix(container, {
      resources: [{ id: 'projects', name: 'Projects', description: '' }],
      actions: [{ id: 'view', name: 'View', description: '' }],
      permissions: [{ resourceId: 'projects', actionId: 'view', granted: false }],
    }, callbacks);

    matrix.updatePermissions([{ resourceId: 'projects', actionId: 'view', granted: true }]);
    const checkbox = container.querySelector('.permission-checkbox') as HTMLInputElement;
    expect(checkbox.checked).toBe(true);
  });
});

// --------------------------------------------------------------------------
// Role Management - Utility functions
// --------------------------------------------------------------------------

describe('validateRoleName', () => {
  it('accepts valid role names', () => {
    expect(validateRoleName('Editor').valid).toBe(true);
    expect(validateRoleName('Content Manager').valid).toBe(true);
    expect(validateRoleName('super-admin_1').valid).toBe(true);
  });

  it('rejects empty names', () => {
    const result = validateRoleName('');
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Role name is required');
  });

  it('rejects whitespace-only names', () => {
    const result = validateRoleName('   ');
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Role name is required');
  });

  it('rejects names over 50 characters', () => {
    const longName = 'a'.repeat(51);
    const result = validateRoleName(longName);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('50 characters');
  });

  it('rejects names with special characters', () => {
    const result = validateRoleName('Admin<script>');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('letters, numbers');
  });
});

describe('rolePermissionsToEntries', () => {
  const resources = [{ id: 'projects', name: 'Projects', description: '' }];
  const actions = [
    { id: 'view', name: 'View', description: '' },
    { id: 'edit', name: 'Edit', description: '' },
  ];

  it('creates entries with correct granted state', () => {
    const entries = rolePermissionsToEntries(['projects:view'], resources, actions);
    expect(entries.length).toBe(2);
    expect(entries.find(e => e.actionId === 'view')?.granted).toBe(true);
    expect(entries.find(e => e.actionId === 'edit')?.granted).toBe(false);
  });

  it('handles empty permissions', () => {
    const entries = rolePermissionsToEntries([], resources, actions);
    expect(entries.every(e => e.granted === false)).toBe(true);
  });
});

describe('entriesToPermissionStrings', () => {
  it('converts granted entries to permission strings', () => {
    const entries: PermissionEntry[] = [
      { resourceId: 'projects', actionId: 'view', granted: true },
      { resourceId: 'projects', actionId: 'edit', granted: false },
      { resourceId: 'videos', actionId: 'view', granted: true },
    ];
    const strings = entriesToPermissionStrings(entries);
    expect(strings).toEqual(['projects:view', 'videos:view']);
  });

  it('returns empty array when none granted', () => {
    const entries: PermissionEntry[] = [
      { resourceId: 'projects', actionId: 'view', granted: false },
    ];
    expect(entriesToPermissionStrings(entries)).toEqual([]);
  });
});

// --------------------------------------------------------------------------
// Role Management - Component
// --------------------------------------------------------------------------

describe('RoleManagement', () => {
  let container: HTMLElement;
  let callbacks: RoleManagementCallbacks;

  beforeEach(() => {
    container = createContainer();
    callbacks = defaultRoleCallbacks();
  });

  it('renders with role="region" and aria-label', () => {
    new RoleManagement(container, defaultRoleOptions, callbacks);
    expect(container.getAttribute('role')).toBe('region');
    expect(container.getAttribute('aria-label')).toBe('Role management');
  });

  it('renders header with title and description', () => {
    new RoleManagement(container, defaultRoleOptions, callbacks);
    expect(container.querySelector('.role-management-title')?.textContent).toBe('Roles & Permissions');
    expect(container.querySelector('.role-management-description')).not.toBeNull();
  });

  it('shows create button for admins', () => {
    new RoleManagement(container, defaultRoleOptions, callbacks);
    const btn = container.querySelector('.role-create-btn');
    expect(btn).not.toBeNull();
    expect(btn?.textContent).toBe('Create Custom Role');
  });

  it('hides create button for non-admins', () => {
    new RoleManagement(container, { ...defaultRoleOptions, isAdmin: false }, callbacks);
    expect(container.querySelector('.role-create-btn')).toBeNull();
  });

  it('renders role list with all roles', () => {
    new RoleManagement(container, defaultRoleOptions, callbacks);
    const items = container.querySelectorAll('.role-list-item');
    expect(items.length).toBe(3);
  });

  it('shows built-in badge for built-in roles', () => {
    new RoleManagement(container, defaultRoleOptions, callbacks);
    const badges = container.querySelectorAll('.role-badge-builtin');
    expect(badges.length).toBe(2); // Owner and Admin
  });

  it('shows custom badge for custom roles', () => {
    new RoleManagement(container, defaultRoleOptions, callbacks);
    const badges = container.querySelectorAll('.role-badge-custom');
    expect(badges.length).toBe(1);
  });

  it('selects a role when clicked', () => {
    const mgmt = new RoleManagement(container, defaultRoleOptions, callbacks);
    const items = container.querySelectorAll('.role-list-item');
    (items[0] as HTMLElement).click();
    expect(mgmt.getSelectedRole()?.id).toBe('role-owner');
  });

  it('shows permission matrix when role is selected', () => {
    const mgmt = new RoleManagement(container, defaultRoleOptions, callbacks);
    mgmt.selectRole('role-admin');
    expect(container.querySelector('.permission-matrix')).not.toBeNull();
  });

  it('shows placeholder when no role is selected', () => {
    new RoleManagement(container, defaultRoleOptions, callbacks);
    expect(container.querySelector('.role-detail-placeholder')).not.toBeNull();
  });

  it('shows role editor when create button is clicked', () => {
    new RoleManagement(container, defaultRoleOptions, callbacks);
    const createBtn = container.querySelector('.role-create-btn') as HTMLButtonElement;
    createBtn.click();
    expect(container.querySelector('.role-editor')).not.toBeNull();
    expect(container.querySelector('.role-name-input')).not.toBeNull();
  });

  it('validates role name in editor', () => {
    const mgmt = new RoleManagement(container, defaultRoleOptions, callbacks);
    mgmt.startCreateRole();

    const nameInput = container.querySelector('.role-name-input') as HTMLInputElement;
    nameInput.value = '';
    const saveBtn = container.querySelector('.role-save-btn') as HTMLButtonElement;
    saveBtn.click();

    const error = container.querySelector('#role-name-error');
    expect(error?.textContent).toBe('Role name is required');
  });

  it('calls onCreateRole with correct data', async () => {
    const mgmt = new RoleManagement(container, defaultRoleOptions, callbacks);
    mgmt.startCreateRole();

    const nameInput = container.querySelector('.role-name-input') as HTMLInputElement;
    const descInput = container.querySelector('.role-desc-input') as HTMLInputElement;
    nameInput.value = 'New Role';
    descInput.value = 'A new custom role';

    const saveBtn = container.querySelector('.role-save-btn') as HTMLButtonElement;
    saveBtn.click();

    await vi.waitFor(() => {
      expect(callbacks.onCreateRole).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'New Role',
          description: 'A new custom role',
        })
      );
    });
  });

  it('shows delete button for custom roles (admin only)', () => {
    const mgmt = new RoleManagement(container, defaultRoleOptions, callbacks);
    mgmt.selectRole('role-custom');
    expect(container.querySelector('.role-delete-btn')).not.toBeNull();
  });

  it('does not show delete button for built-in roles', () => {
    const mgmt = new RoleManagement(container, defaultRoleOptions, callbacks);
    mgmt.selectRole('role-owner');
    expect(container.querySelector('.role-delete-btn')).toBeNull();
  });

  it('hides editor on cancel', () => {
    const mgmt = new RoleManagement(container, defaultRoleOptions, callbacks);
    mgmt.startCreateRole();
    expect(container.querySelector('.role-editor')).not.toBeNull();

    const cancelBtn = container.querySelector('.role-cancel-btn') as HTMLButtonElement;
    cancelBtn.click();
    expect(container.querySelector('.role-editor')).toBeNull();
  });
});

// --------------------------------------------------------------------------
// Team Management - Utility functions
// --------------------------------------------------------------------------

describe('validateTeamName', () => {
  it('accepts valid team names', () => {
    expect(validateTeamName('Engineering').valid).toBe(true);
    expect(validateTeamName('Content Team').valid).toBe(true);
    expect(validateTeamName('team-alpha_1').valid).toBe(true);
  });

  it('rejects empty names', () => {
    const result = validateTeamName('');
    expect(result.valid).toBe(false);
    expect(result.error).toBe('Team name is required');
  });

  it('rejects names over 100 characters', () => {
    const longName = 'a'.repeat(101);
    const result = validateTeamName(longName);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('100 characters');
  });

  it('rejects special characters', () => {
    const result = validateTeamName('Team<>!');
    expect(result.valid).toBe(false);
  });
});
