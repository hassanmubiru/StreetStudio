/**
 * Permission Matrix Component
 *
 * Displays a visual grid of permissions by resource/action for roles.
 * Users can toggle individual permissions in custom role configurations.
 *
 * Requirements: 8.3, 8.4
 */

export type Uuid = string;

/** A resource category in the permission system */
export interface PermissionResource {
  id: string;
  name: string;
  description: string;
}

/** An action that can be performed on a resource */
export interface PermissionAction {
  id: string;
  name: string;
  description: string;
}

/** A permission entry combining resource and action */
export interface PermissionEntry {
  resourceId: string;
  actionId: string;
  granted: boolean;
  inherited?: boolean;
  overridden?: boolean;
}

/** Options for the permission matrix component */
export interface PermissionMatrixOptions {
  resources: PermissionResource[];
  actions: PermissionAction[];
  permissions: PermissionEntry[];
  readOnly?: boolean;
  showInheritance?: boolean;
}

export interface PermissionMatrixCallbacks {
  onPermissionToggle: (resourceId: string, actionId: string, granted: boolean) => void;
}

/** Default resource categories for StreetStudio */
export const DEFAULT_RESOURCES: PermissionResource[] = [
  { id: 'projects', name: 'Projects', description: 'Project management' },
  { id: 'videos', name: 'Videos', description: 'Video content' },
  { id: 'recordings', name: 'Recordings', description: 'Recording sessions' },
  { id: 'comments', name: 'Comments', description: 'Comments and discussions' },
  { id: 'members', name: 'Members', description: 'Organization members' },
  { id: 'teams', name: 'Teams', description: 'Team management' },
  { id: 'settings', name: 'Settings', description: 'Organization settings' },
  { id: 'billing', name: 'Billing', description: 'Billing and subscriptions' },
];

/** Default actions available per resource */
export const DEFAULT_ACTIONS: PermissionAction[] = [
  { id: 'view', name: 'View', description: 'View resource' },
  { id: 'create', name: 'Create', description: 'Create new resource' },
  { id: 'edit', name: 'Edit', description: 'Edit existing resource' },
  { id: 'delete', name: 'Delete', description: 'Delete resource' },
  { id: 'manage', name: 'Manage', description: 'Full management access' },
];

/**
 * Builds a lookup key for a permission entry
 */
export function getPermissionKey(resourceId: string, actionId: string): string {
  return `${resourceId}:${actionId}`;
}

/**
 * Builds a map of permission keys to granted state
 */
export function buildPermissionMap(permissions: PermissionEntry[]): Map<string, PermissionEntry> {
  const map = new Map<string, PermissionEntry>();
  for (const perm of permissions) {
    map.set(getPermissionKey(perm.resourceId, perm.actionId), perm);
  }
  return map;
}

/**
 * Counts granted permissions in a set
 */
export function countGrantedPermissions(permissions: PermissionEntry[]): number {
  return permissions.filter(p => p.granted).length;
}

/**
 * Checks if all permissions for a given resource are granted
 */
export function isResourceFullyGranted(
  permissions: PermissionEntry[],
  resourceId: string,
  actions: PermissionAction[]
): boolean {
  return actions.every(action => {
    const entry = permissions.find(p => p.resourceId === resourceId && p.actionId === action.id);
    return entry?.granted === true;
  });
}

/**
 * Checks if all permissions for a given action across all resources are granted
 */
export function isActionFullyGranted(
  permissions: PermissionEntry[],
  actionId: string,
  resources: PermissionResource[]
): boolean {
  return resources.every(resource => {
    const entry = permissions.find(p => p.resourceId === resource.id && p.actionId === actionId);
    return entry?.granted === true;
  });
}

/**
 * Permission Matrix UI Component
 *
 * Renders a grid showing resources as rows and actions as columns.
 * Each cell is a toggle checkbox showing grant/deny state.
 */
export class PermissionMatrix {
  private container: HTMLElement;
  private options: PermissionMatrixOptions;
  private callbacks: PermissionMatrixCallbacks;
  private permissionMap: Map<string, PermissionEntry>;

  constructor(
    container: HTMLElement,
    options: PermissionMatrixOptions,
    callbacks: PermissionMatrixCallbacks
  ) {
    this.container = container;
    this.options = options;
    this.callbacks = callbacks;
    this.permissionMap = buildPermissionMap(options.permissions);
    this.render();
  }

  public updatePermissions(permissions: PermissionEntry[]): void {
    this.options.permissions = permissions;
    this.permissionMap = buildPermissionMap(permissions);
    this.render();
  }

  public getPermissions(): PermissionEntry[] {
    return [...this.options.permissions];
  }

  public getGrantedCount(): number {
    return countGrantedPermissions(this.options.permissions);
  }

  public getTotalCount(): number {
    return this.options.resources.length * this.options.actions.length;
  }

  private render(): void {
    this.container.innerHTML = '';
    this.container.setAttribute('role', 'grid');
    this.container.setAttribute('aria-label', 'Permission matrix');
    this.container.className = 'permission-matrix';

    // Header row
    const headerRow = document.createElement('div');
    headerRow.setAttribute('role', 'row');
    headerRow.className = 'permission-matrix-header';

    // Empty corner cell
    const cornerCell = document.createElement('div');
    cornerCell.setAttribute('role', 'columnheader');
    cornerCell.className = 'permission-matrix-corner';
    cornerCell.textContent = 'Resource / Action';
    headerRow.appendChild(cornerCell);

    // Action headers
    for (const action of this.options.actions) {
      const headerCell = document.createElement('div');
      headerCell.setAttribute('role', 'columnheader');
      headerCell.className = 'permission-matrix-col-header';
      headerCell.textContent = action.name;
      headerCell.title = action.description;
      headerRow.appendChild(headerCell);
    }

    this.container.appendChild(headerRow);

    // Resource rows
    for (const resource of this.options.resources) {
      const row = document.createElement('div');
      row.setAttribute('role', 'row');
      row.className = 'permission-matrix-row';

      // Resource label
      const rowHeader = document.createElement('div');
      rowHeader.setAttribute('role', 'rowheader');
      rowHeader.className = 'permission-matrix-row-header';
      rowHeader.textContent = resource.name;
      rowHeader.title = resource.description;
      row.appendChild(rowHeader);

      // Permission cells
      for (const action of this.options.actions) {
        const cell = this.createPermissionCell(resource, action);
        row.appendChild(cell);
      }

      this.container.appendChild(row);
    }

    // Summary row
    const summary = document.createElement('div');
    summary.className = 'permission-matrix-summary';
    summary.setAttribute('aria-live', 'polite');
    summary.textContent = `${this.getGrantedCount()} of ${this.getTotalCount()} permissions granted`;
    this.container.appendChild(summary);
  }

  private createPermissionCell(resource: PermissionResource, action: PermissionAction): HTMLElement {
    const cell = document.createElement('div');
    cell.setAttribute('role', 'gridcell');
    cell.className = 'permission-matrix-cell';

    const key = getPermissionKey(resource.id, action.id);
    const entry = this.permissionMap.get(key);
    const isGranted = entry?.granted ?? false;
    const isInherited = entry?.inherited ?? false;
    const isOverridden = entry?.overridden ?? false;

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = isGranted;
    checkbox.disabled = this.options.readOnly === true;
    checkbox.className = 'permission-checkbox';
    checkbox.setAttribute('aria-label', `${action.name} ${resource.name}`);
    checkbox.dataset.resourceId = resource.id;
    checkbox.dataset.actionId = action.id;

    if (isInherited && this.options.showInheritance) {
      checkbox.classList.add('inherited');
      checkbox.title = 'Inherited from parent role';
    }

    if (isOverridden && this.options.showInheritance) {
      checkbox.classList.add('overridden');
      checkbox.title = 'Overridden from inherited permission';
    }

    checkbox.addEventListener('change', () => {
      this.callbacks.onPermissionToggle(resource.id, action.id, checkbox.checked);
    });

    cell.appendChild(checkbox);
    return cell;
  }

  public getElement(): HTMLElement {
    return this.container;
  }

  public destroy(): void {
    this.container.innerHTML = '';
  }
}
