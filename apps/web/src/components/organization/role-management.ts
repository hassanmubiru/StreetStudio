/**
 * Role Management Component
 *
 * Provides role management interface with predefined and custom roles,
 * permission matrix display, and role CRUD operations.
 *
 * Requirements: 8.3, 8.4
 */

import {
  PermissionMatrix,
  DEFAULT_RESOURCES,
  DEFAULT_ACTIONS,
  buildPermissionMap,
  getPermissionKey,
  type PermissionEntry,
  type PermissionResource,
  type PermissionAction,
  type PermissionMatrixOptions,
} from './permission-matrix.js';

export type Uuid = string;

/** Represents a role in the system */
export interface Role {
  id: Uuid;
  organizationId: Uuid;
  name: string;
  description: string;
  isBuiltIn: boolean;
  permissions: string[]; // format: "resource:action"
  memberCount?: number;
}

/** Callbacks for role management operations */
export interface RoleManagementCallbacks {
  onCreateRole: (role: Omit<Role, 'id' | 'organizationId' | 'isBuiltIn' | 'memberCount'>) => Promise<Role>;
  onUpdateRole: (roleId: Uuid, updates: { name?: string; description?: string; permissions?: string[] }) => Promise<Role>;
  onDeleteRole: (roleId: Uuid) => Promise<boolean>;
  onAssignRole: (memberId: Uuid, roleId: Uuid) => Promise<boolean>;
}

/** Options for role management component */
export interface RoleManagementOptions {
  organizationId: Uuid;
  currentUserId: Uuid;
  isAdmin: boolean;
  roles: Role[];
  resources?: PermissionResource[];
  actions?: PermissionAction[];
}

/** Built-in role definitions */
export const BUILT_IN_ROLES: Omit<Role, 'id' | 'organizationId'>[] = [
  {
    name: 'Owner',
    description: 'Full access to all resources and settings',
    isBuiltIn: true,
    permissions: [], // All permissions granted implicitly
  },
  {
    name: 'Admin',
    description: 'Manage members, roles, and most settings',
    isBuiltIn: true,
    permissions: [
      'projects:view', 'projects:create', 'projects:edit', 'projects:delete', 'projects:manage',
      'videos:view', 'videos:create', 'videos:edit', 'videos:delete', 'videos:manage',
      'recordings:view', 'recordings:create', 'recordings:edit', 'recordings:delete', 'recordings:manage',
      'comments:view', 'comments:create', 'comments:edit', 'comments:delete', 'comments:manage',
      'members:view', 'members:create', 'members:edit', 'members:delete', 'members:manage',
      'teams:view', 'teams:create', 'teams:edit', 'teams:delete', 'teams:manage',
      'settings:view', 'settings:edit', 'settings:manage',
    ],
  },
  {
    name: 'Editor',
    description: 'Create and edit content, manage own recordings',
    isBuiltIn: true,
    permissions: [
      'projects:view', 'projects:create', 'projects:edit',
      'videos:view', 'videos:create', 'videos:edit',
      'recordings:view', 'recordings:create', 'recordings:edit', 'recordings:delete',
      'comments:view', 'comments:create', 'comments:edit',
      'members:view',
      'teams:view',
    ],
  },
  {
    name: 'Viewer',
    description: 'View content and leave comments',
    isBuiltIn: true,
    permissions: [
      'projects:view',
      'videos:view',
      'recordings:view',
      'comments:view', 'comments:create',
      'members:view',
      'teams:view',
    ],
  },
];

/**
 * Converts a role's permission strings to PermissionEntry[] for the matrix
 */
export function rolePermissionsToEntries(
  permissions: string[],
  resources: PermissionResource[],
  actions: PermissionAction[]
): PermissionEntry[] {
  const entries: PermissionEntry[] = [];
  for (const resource of resources) {
    for (const action of actions) {
      const key = getPermissionKey(resource.id, action.id);
      entries.push({
        resourceId: resource.id,
        actionId: action.id,
        granted: permissions.includes(key),
      });
    }
  }
  return entries;
}

/**
 * Converts PermissionEntry[] back to permission strings
 */
export function entriesToPermissionStrings(entries: PermissionEntry[]): string[] {
  return entries
    .filter(e => e.granted)
    .map(e => getPermissionKey(e.resourceId, e.actionId));
}

/**
 * Validates a role name
 */
export function validateRoleName(name: string): { valid: boolean; error?: string } {
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    return { valid: false, error: 'Role name is required' };
  }
  if (trimmed.length > 50) {
    return { valid: false, error: 'Role name must be 50 characters or less' };
  }
  if (!/^[a-zA-Z0-9\s\-_]+$/.test(trimmed)) {
    return { valid: false, error: 'Role name can only contain letters, numbers, spaces, hyphens, and underscores' };
  }
  return { valid: true };
}

/**
 * Role Management UI Component
 *
 * Displays a list of roles with their permissions and provides
 * interfaces for creating, editing, and deleting custom roles.
 */
export class RoleManagement {
  private container: HTMLElement;
  private options: RoleManagementOptions;
  private callbacks: RoleManagementCallbacks;
  private selectedRoleId: Uuid | null = null;
  private isCreating = false;
  private permissionMatrix: PermissionMatrix | null = null;
  private resources: PermissionResource[];
  private actions: PermissionAction[];

  constructor(
    container: HTMLElement,
    options: RoleManagementOptions,
    callbacks: RoleManagementCallbacks
  ) {
    this.container = container;
    this.options = options;
    this.callbacks = callbacks;
    this.resources = options.resources ?? DEFAULT_RESOURCES;
    this.actions = options.actions ?? DEFAULT_ACTIONS;
    this.render();
  }

  public setRoles(roles: Role[]): void {
    this.options.roles = roles;
    this.render();
  }

  public getSelectedRole(): Role | undefined {
    return this.options.roles.find(r => r.id === this.selectedRoleId);
  }

  public selectRole(roleId: Uuid): void {
    this.selectedRoleId = roleId;
    this.isCreating = false;
    this.render();
  }

  public startCreateRole(): void {
    this.isCreating = true;
    this.selectedRoleId = null;
    this.render();
  }

  private render(): void {
    this.container.innerHTML = '';
    this.container.className = 'role-management';
    this.container.setAttribute('role', 'region');
    this.container.setAttribute('aria-label', 'Role management');

    // Header
    const header = document.createElement('div');
    header.className = 'role-management-header';
    header.innerHTML = `
      <h2 class="role-management-title">Roles & Permissions</h2>
      <p class="role-management-description">Manage organization roles and their permission levels</p>
    `;

    if (this.options.isAdmin) {
      const createBtn = document.createElement('button');
      createBtn.className = 'role-create-btn';
      createBtn.textContent = 'Create Custom Role';
      createBtn.setAttribute('aria-label', 'Create a new custom role');
      createBtn.addEventListener('click', () => this.startCreateRole());
      header.appendChild(createBtn);
    }

    this.container.appendChild(header);

    // Two-panel layout: role list + detail/editor
    const layout = document.createElement('div');
    layout.className = 'role-management-layout';

    // Role list panel
    const listPanel = this.renderRoleList();
    layout.appendChild(listPanel);

    // Detail/editor panel
    const detailPanel = document.createElement('div');
    detailPanel.className = 'role-detail-panel';

    if (this.isCreating) {
      const editor = this.renderRoleEditor();
      detailPanel.appendChild(editor);
    } else if (this.selectedRoleId) {
      const detail = this.renderRoleDetail();
      detailPanel.appendChild(detail);
    } else {
      detailPanel.innerHTML = '<p class="role-detail-placeholder">Select a role to view its permissions</p>';
    }

    layout.appendChild(detailPanel);
    this.container.appendChild(layout);
  }

  private renderRoleList(): HTMLElement {
    const panel = document.createElement('div');
    panel.className = 'role-list-panel';
    panel.setAttribute('role', 'listbox');
    panel.setAttribute('aria-label', 'Organization roles');

    for (const role of this.options.roles) {
      const item = document.createElement('div');
      item.className = 'role-list-item';
      item.setAttribute('role', 'option');
      item.setAttribute('aria-selected', (role.id === this.selectedRoleId).toString());
      item.dataset.roleId = role.id;

      if (role.id === this.selectedRoleId) {
        item.classList.add('selected');
      }

      item.innerHTML = `
        <div class="role-item-info">
          <span class="role-item-name">${this.escapeHtml(role.name)}</span>
          ${role.isBuiltIn ? '<span class="role-badge-builtin">Built-in</span>' : '<span class="role-badge-custom">Custom</span>'}
        </div>
        <span class="role-item-description">${this.escapeHtml(role.description)}</span>
        ${role.memberCount !== undefined ? `<span class="role-item-members">${role.memberCount} member${role.memberCount !== 1 ? 's' : ''}</span>` : ''}
      `;

      item.addEventListener('click', () => this.selectRole(role.id));
      panel.appendChild(item);
    }

    return panel;
  }

  private renderRoleDetail(): HTMLElement {
    const role = this.options.roles.find(r => r.id === this.selectedRoleId);
    if (!role) {
      const el = document.createElement('div');
      el.textContent = 'Role not found';
      return el;
    }

    const detail = document.createElement('div');
    detail.className = 'role-detail';

    // Role info header
    const infoHeader = document.createElement('div');
    infoHeader.className = 'role-detail-header';
    infoHeader.innerHTML = `
      <h3 class="role-detail-name">${this.escapeHtml(role.name)}</h3>
      <p class="role-detail-description">${this.escapeHtml(role.description)}</p>
    `;

    // Action buttons for custom roles
    if (!role.isBuiltIn && this.options.isAdmin) {
      const actionsBar = document.createElement('div');
      actionsBar.className = 'role-detail-actions';

      const editBtn = document.createElement('button');
      editBtn.className = 'role-edit-btn';
      editBtn.textContent = 'Edit Role';
      editBtn.addEventListener('click', () => {
        this.isCreating = true; // reuse editor for editing
        this.render();
      });

      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'role-delete-btn';
      deleteBtn.textContent = 'Delete Role';
      deleteBtn.setAttribute('aria-label', `Delete role ${role.name}`);
      deleteBtn.addEventListener('click', () => this.handleDeleteRole(role.id));

      actionsBar.appendChild(editBtn);
      actionsBar.appendChild(deleteBtn);
      infoHeader.appendChild(actionsBar);
    }

    detail.appendChild(infoHeader);

    // Permission matrix (read-only for viewing)
    const matrixContainer = document.createElement('div');
    matrixContainer.className = 'role-permission-matrix-container';

    const entries = rolePermissionsToEntries(role.permissions, this.resources, this.actions);

    this.permissionMatrix = new PermissionMatrix(
      matrixContainer,
      {
        resources: this.resources,
        actions: this.actions,
        permissions: entries,
        readOnly: true,
        showInheritance: false,
      },
      { onPermissionToggle: () => {} }
    );

    detail.appendChild(matrixContainer);
    return detail;
  }

  private renderRoleEditor(): HTMLElement {
    const existingRole = this.selectedRoleId
      ? this.options.roles.find(r => r.id === this.selectedRoleId)
      : undefined;

    const editor = document.createElement('div');
    editor.className = 'role-editor';
    editor.setAttribute('role', 'form');
    editor.setAttribute('aria-label', existingRole ? 'Edit role' : 'Create new role');

    // Name field
    const nameGroup = document.createElement('div');
    nameGroup.className = 'form-group';
    nameGroup.innerHTML = `
      <label for="role-name-input" class="form-label">Role Name</label>
      <input type="text" id="role-name-input" class="role-name-input form-input"
        placeholder="Enter role name" maxlength="50"
        value="${existingRole ? this.escapeHtml(existingRole.name) : ''}"
        aria-describedby="role-name-error" />
      <span id="role-name-error" class="form-error" aria-live="polite"></span>
    `;
    editor.appendChild(nameGroup);

    // Description field
    const descGroup = document.createElement('div');
    descGroup.className = 'form-group';
    descGroup.innerHTML = `
      <label for="role-desc-input" class="form-label">Description</label>
      <input type="text" id="role-desc-input" class="role-desc-input form-input"
        placeholder="Describe this role's purpose" maxlength="200"
        value="${existingRole ? this.escapeHtml(existingRole.description) : ''}" />
    `;
    editor.appendChild(descGroup);

    // Permission matrix (editable)
    const matrixLabel = document.createElement('h4');
    matrixLabel.className = 'form-label';
    matrixLabel.textContent = 'Permissions';
    editor.appendChild(matrixLabel);

    const matrixContainer = document.createElement('div');
    matrixContainer.className = 'role-editor-matrix';

    const currentPermissions = existingRole
      ? rolePermissionsToEntries(existingRole.permissions, this.resources, this.actions)
      : rolePermissionsToEntries([], this.resources, this.actions);

    let editablePermissions = [...currentPermissions];

    this.permissionMatrix = new PermissionMatrix(
      matrixContainer,
      {
        resources: this.resources,
        actions: this.actions,
        permissions: currentPermissions,
        readOnly: false,
        showInheritance: false,
      },
      {
        onPermissionToggle: (resourceId, actionId, granted) => {
          const idx = editablePermissions.findIndex(
            p => p.resourceId === resourceId && p.actionId === actionId
          );
          if (idx >= 0) {
            const existing = editablePermissions[idx];
            if (existing) {
              editablePermissions[idx] = {
                resourceId: existing.resourceId,
                actionId: existing.actionId,
                granted,
                inherited: existing.inherited,
                overridden: existing.overridden,
              };
            }
          }
        },
      }
    );

    editor.appendChild(matrixContainer);

    // Action buttons
    const actionsBar = document.createElement('div');
    actionsBar.className = 'role-editor-actions';

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'role-cancel-btn';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', () => {
      this.isCreating = false;
      this.render();
    });

    const saveBtn = document.createElement('button');
    saveBtn.className = 'role-save-btn';
    saveBtn.textContent = existingRole ? 'Update Role' : 'Create Role';
    saveBtn.addEventListener('click', async () => {
      const nameInput = editor.querySelector('.role-name-input') as HTMLInputElement | null;
      const descInput = editor.querySelector('.role-desc-input') as HTMLInputElement | null;
      const errorEl = editor.querySelector('.form-error') as HTMLElement | null;

      if (!nameInput || !descInput || !errorEl) return;

      const validation = validateRoleName(nameInput.value);
      if (!validation.valid) {
        errorEl.textContent = validation.error ?? '';
        nameInput.setAttribute('aria-invalid', 'true');
        return;
      }

      errorEl.textContent = '';
      nameInput.removeAttribute('aria-invalid');

      const permStrings = entriesToPermissionStrings(editablePermissions);

      try {
        if (existingRole) {
          await this.callbacks.onUpdateRole(existingRole.id, {
            name: nameInput.value.trim(),
            description: descInput.value.trim(),
            permissions: permStrings,
          });
        } else {
          await this.callbacks.onCreateRole({
            name: nameInput.value.trim(),
            description: descInput.value.trim(),
            permissions: permStrings,
          });
        }
        this.isCreating = false;
        this.render();
      } catch {
        if (errorEl && errorEl.isConnected) {
          errorEl.textContent = 'Failed to save role. Please try again.';
        }
      }
    });

    actionsBar.appendChild(cancelBtn);
    actionsBar.appendChild(saveBtn);
    editor.appendChild(actionsBar);

    return editor;
  }

  private async handleDeleteRole(roleId: Uuid): Promise<void> {
    const role = this.options.roles.find(r => r.id === roleId);
    if (!role) return;

    // Simple confirmation via DOM
    const confirmed = window.confirm(`Are you sure you want to delete the role "${role.name}"? Members with this role will need to be reassigned.`);
    if (!confirmed) return;

    try {
      await this.callbacks.onDeleteRole(roleId);
      this.selectedRoleId = null;
      this.options.roles = this.options.roles.filter(r => r.id !== roleId);
      this.render();
    } catch {
      // Error handling - show notification
    }
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  public getElement(): HTMLElement {
    return this.container;
  }

  public destroy(): void {
    this.permissionMatrix?.destroy();
    this.container.innerHTML = '';
  }
}
