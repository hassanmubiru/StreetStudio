/**
 * Permission Inheritance Component
 *
 * Displays and manages permission inheritance chains between roles
 * and teams, allowing admins to configure override behavior.
 *
 * Requirements: 8.3, 8.5
 */

import {
  type PermissionEntry,
  type PermissionResource,
  type PermissionAction,
  getPermissionKey,
  DEFAULT_RESOURCES,
  DEFAULT_ACTIONS,
} from './permission-matrix.js';

export type Uuid = string;

/** Represents a permission source in the inheritance chain */
export interface PermissionSource {
  type: 'role' | 'team' | 'direct';
  id: Uuid;
  name: string;
  priority: number; // Higher priority overrides lower
}

/** A resolved permission with its inheritance chain */
export interface ResolvedPermission {
  resourceId: string;
  actionId: string;
  granted: boolean;
  source: PermissionSource;
  inheritedFrom?: PermissionSource[];
  isOverridden: boolean;
}

/** Override configuration for a specific permission */
export interface PermissionOverride {
  resourceId: string;
  actionId: string;
  granted: boolean;
  sourceType: 'role' | 'team' | 'direct';
  sourceId: Uuid;
}

/** Options for the permission inheritance component */
export interface PermissionInheritanceOptions {
  memberId: Uuid;
  memberName: string;
  sources: PermissionSource[];
  permissionsBySource: Map<Uuid, string[]>; // sourceId -> permission strings
  overrides: PermissionOverride[];
  resources?: PermissionResource[];
  actions?: PermissionAction[];
  isAdmin: boolean;
}

/** Callbacks for permission inheritance operations */
export interface PermissionInheritanceCallbacks {
  onAddOverride: (override: PermissionOverride) => Promise<boolean>;
  onRemoveOverride: (resourceId: string, actionId: string) => Promise<boolean>;
  onChangeSourcePriority: (sourceId: Uuid, newPriority: number) => Promise<boolean>;
}

/**
 * Resolves the effective permissions for a member considering all sources and overrides.
 * Higher priority sources take precedence. Direct overrides have highest priority.
 */
export function resolvePermissions(
  sources: PermissionSource[],
  permissionsBySource: Map<Uuid, string[]>,
  overrides: PermissionOverride[],
  resources: PermissionResource[],
  actions: PermissionAction[]
): ResolvedPermission[] {
  const resolved: ResolvedPermission[] = [];
  const sortedSources = [...sources].sort((a, b) => b.priority - a.priority);

  for (const resource of resources) {
    for (const action of actions) {
      const key = getPermissionKey(resource.id, action.id);

      // Check for direct override first
      const override = overrides.find(
        o => o.resourceId === resource.id && o.actionId === action.id
      );

      if (override) {
        // Direct override has highest priority
        const inheritedFrom = sortedSources
          .filter(s => {
            const perms = permissionsBySource.get(s.id) ?? [];
            return perms.includes(key);
          })
          .map(s => ({ ...s }));

        resolved.push({
          resourceId: resource.id,
          actionId: action.id,
          granted: override.granted,
          source: {
            type: 'direct',
            id: 'direct',
            name: 'Direct Override',
            priority: Infinity,
          },
          inheritedFrom,
          isOverridden: true,
        });
        continue;
      }

      // Find the highest priority source that grants this permission
      let effectiveSource: PermissionSource | null = null;
      const inheritedFrom: PermissionSource[] = [];

      for (const source of sortedSources) {
        const perms = permissionsBySource.get(source.id) ?? [];
        if (perms.includes(key)) {
          if (!effectiveSource) {
            effectiveSource = source;
          }
          inheritedFrom.push(source);
        }
      }

      resolved.push({
        resourceId: resource.id,
        actionId: action.id,
        granted: effectiveSource !== null,
        source: effectiveSource ?? {
          type: 'role',
          id: 'none',
          name: 'None',
          priority: 0,
        },
        inheritedFrom: inheritedFrom.length > 0 ? inheritedFrom : undefined,
        isOverridden: false,
      });
    }
  }

  return resolved;
}

/**
 * Gets the effective permission for a specific resource/action
 */
export function getEffectivePermission(
  resolved: ResolvedPermission[],
  resourceId: string,
  actionId: string
): ResolvedPermission | undefined {
  return resolved.find(r => r.resourceId === resourceId && r.actionId === actionId);
}

/**
 * Counts overridden permissions
 */
export function countOverrides(resolved: ResolvedPermission[]): number {
  return resolved.filter(r => r.isOverridden).length;
}

/**
 * Gets all permissions from a specific source
 */
export function getPermissionsFromSource(
  resolved: ResolvedPermission[],
  sourceId: Uuid
): ResolvedPermission[] {
  return resolved.filter(r => r.source.id === sourceId || r.inheritedFrom?.some(s => s.id === sourceId));
}

/**
 * Permission Inheritance UI Component
 *
 * Shows where permissions come from, with the ability to add
 * overrides for specific permission/resource combinations.
 */
export class PermissionInheritance {
  private container: HTMLElement;
  private options: PermissionInheritanceOptions;
  private callbacks: PermissionInheritanceCallbacks;
  private resolvedPermissions: ResolvedPermission[] = [];
  private resources: PermissionResource[];
  private actions: PermissionAction[];
  private expandedResource: string | null = null;

  constructor(
    container: HTMLElement,
    options: PermissionInheritanceOptions,
    callbacks: PermissionInheritanceCallbacks
  ) {
    this.container = container;
    this.options = options;
    this.callbacks = callbacks;
    this.resources = options.resources ?? DEFAULT_RESOURCES;
    this.actions = options.actions ?? DEFAULT_ACTIONS;
    this.resolve();
    this.render();
  }

  public updateOptions(options: Partial<PermissionInheritanceOptions>): void {
    Object.assign(this.options, options);
    this.resolve();
    this.render();
  }

  public getResolvedPermissions(): ResolvedPermission[] {
    return [...this.resolvedPermissions];
  }

  public getOverrideCount(): number {
    return countOverrides(this.resolvedPermissions);
  }

  private resolve(): void {
    this.resolvedPermissions = resolvePermissions(
      this.options.sources,
      this.options.permissionsBySource,
      this.options.overrides,
      this.resources,
      this.actions
    );
  }

  private render(): void {
    this.container.innerHTML = '';
    this.container.className = 'permission-inheritance';
    this.container.setAttribute('role', 'region');
    this.container.setAttribute('aria-label', `Permission inheritance for ${this.options.memberName}`);

    // Header
    const header = document.createElement('div');
    header.className = 'permission-inheritance-header';
    header.innerHTML = `
      <h3 class="permission-inheritance-title">Effective Permissions</h3>
      <p class="permission-inheritance-subtitle">for ${this.escapeHtml(this.options.memberName)}</p>
    `;
    this.container.appendChild(header);

    // Source chain display
    const sourceChain = this.renderSourceChain();
    this.container.appendChild(sourceChain);

    // Resolved permission display
    const permissionDisplay = this.renderResolvedPermissions();
    this.container.appendChild(permissionDisplay);

    // Override summary
    const overrideCount = this.getOverrideCount();
    if (overrideCount > 0) {
      const overrideSummary = document.createElement('div');
      overrideSummary.className = 'permission-override-summary';
      overrideSummary.setAttribute('aria-live', 'polite');
      overrideSummary.textContent = `${overrideCount} permission${overrideCount !== 1 ? 's' : ''} overridden`;
      this.container.appendChild(overrideSummary);
    }
  }

  private renderSourceChain(): HTMLElement {
    const section = document.createElement('div');
    section.className = 'permission-source-chain';
    section.setAttribute('role', 'list');
    section.setAttribute('aria-label', 'Permission sources (highest priority first)');

    const sortedSources = [...this.options.sources].sort((a, b) => b.priority - a.priority);

    for (const source of sortedSources) {
      const item = document.createElement('div');
      item.className = 'permission-source-item';
      item.setAttribute('role', 'listitem');

      const typeIcon = source.type === 'role' ? '👤' : source.type === 'team' ? '👥' : '⚡';
      const permCount = (this.options.permissionsBySource.get(source.id) ?? []).length;

      item.innerHTML = `
        <span class="source-icon">${typeIcon}</span>
        <div class="source-info">
          <span class="source-name">${this.escapeHtml(source.name)}</span>
          <span class="source-type">${source.type}</span>
          <span class="source-perm-count">${permCount} permissions</span>
        </div>
        <span class="source-priority">Priority: ${source.priority}</span>
      `;

      section.appendChild(item);
    }

    return section;
  }

  private renderResolvedPermissions(): HTMLElement {
    const section = document.createElement('div');
    section.className = 'permission-resolved-list';

    for (const resource of this.resources) {
      const resourceGroup = document.createElement('div');
      resourceGroup.className = 'permission-resource-group';
      const isExpanded = this.expandedResource === resource.id;

      // Resource header (collapsible)
      const resourceHeader = document.createElement('button');
      resourceHeader.className = 'permission-resource-header';
      resourceHeader.setAttribute('aria-expanded', isExpanded.toString());
      resourceHeader.setAttribute('aria-controls', `perms-${resource.id}`);

      const resourcePerms = this.resolvedPermissions.filter(r => r.resourceId === resource.id);
      const grantedCount = resourcePerms.filter(r => r.granted).length;
      const overriddenCount = resourcePerms.filter(r => r.isOverridden).length;

      resourceHeader.innerHTML = `
        <span class="resource-expand-icon">${isExpanded ? '▼' : '▶'}</span>
        <span class="resource-name">${this.escapeHtml(resource.name)}</span>
        <span class="resource-granted-count">${grantedCount}/${this.actions.length}</span>
        ${overriddenCount > 0 ? `<span class="resource-override-badge">${overriddenCount} override${overriddenCount !== 1 ? 's' : ''}</span>` : ''}
      `;

      resourceHeader.addEventListener('click', () => {
        this.expandedResource = isExpanded ? null : resource.id;
        this.render();
      });

      resourceGroup.appendChild(resourceHeader);

      // Permission details (visible when expanded)
      if (isExpanded) {
        const details = document.createElement('div');
        details.id = `perms-${resource.id}`;
        details.className = 'permission-resource-details';
        details.setAttribute('role', 'list');

        for (const action of this.actions) {
          const resolved = this.resolvedPermissions.find(
            r => r.resourceId === resource.id && r.actionId === action.id
          );
          if (!resolved) continue;

          const permItem = document.createElement('div');
          permItem.className = `permission-resolved-item ${resolved.granted ? 'granted' : 'denied'}`;
          permItem.setAttribute('role', 'listitem');

          permItem.innerHTML = `
            <span class="perm-status-icon">${resolved.granted ? '✓' : '✗'}</span>
            <span class="perm-action-name">${this.escapeHtml(action.name)}</span>
            <span class="perm-source-label">${this.escapeHtml(resolved.source.name)}</span>
            ${resolved.isOverridden ? '<span class="perm-override-indicator">Override</span>' : ''}
          `;

          // Override control for admins
          if (this.options.isAdmin) {
            const overrideBtn = document.createElement('button');
            overrideBtn.className = 'perm-override-btn';
            overrideBtn.textContent = resolved.isOverridden ? 'Remove Override' : 'Override';
            overrideBtn.setAttribute(
              'aria-label',
              resolved.isOverridden
                ? `Remove override for ${action.name} ${resource.name}`
                : `Override ${action.name} ${resource.name}`
            );
            overrideBtn.addEventListener('click', () => {
              if (resolved.isOverridden) {
                this.callbacks.onRemoveOverride(resource.id, action.id);
              } else {
                this.callbacks.onAddOverride({
                  resourceId: resource.id,
                  actionId: action.id,
                  granted: !resolved.granted,
                  sourceType: 'direct',
                  sourceId: 'direct',
                });
              }
            });
            permItem.appendChild(overrideBtn);
          }

          details.appendChild(permItem);
        }

        resourceGroup.appendChild(details);
      }

      section.appendChild(resourceGroup);
    }

    return section;
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
    this.container.innerHTML = '';
  }
}
