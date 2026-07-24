/**
 * Folder Permissions Display Component
 * 
 * Shows folder access control information and permissions
 * for the current user and folder context.
 * 
 * Validates: Requirements 4.5 (folder permissions and access control display)
 */

import type { FolderDto, MemberDto } from '@streetstudio/shared';
import { logger } from '../../app/client-logger.js';

export interface FolderPermission {
  action: string;
  allowed: boolean;
  reason?: string;
}

export interface FolderPermissionsConfig {
  folder: FolderDto;
  currentUser: MemberDto;
  permissions: FolderPermission[];
}

export class FolderPermissions {
  private container: HTMLElement | null = null;
  private config: FolderPermissionsConfig;
  
  constructor(config: FolderPermissionsConfig) {
    this.config = config;
  }

  public getElement(): HTMLElement {
    if (!this.container) {
      this.container = this.createContainer();
    }
    return this.container;
  }

  private createContainer(): HTMLElement {
    const container = document.createElement('div');
    container.className = 'folder-permissions bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-4';
    
    this.renderPermissions();
    return container;
  }

  private renderPermissions(): void {
    if (!this.container) return;

    const permissionGroups = this.groupPermissions();
    
    const html = `
      <div class="flex items-start justify-between mb-4">
        <div>
          <h4 class="text-sm font-semibold text-gray-900 dark:text-white flex items-center">
            <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                    d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/>
            </svg>
            Folder Permissions
          </h4>
          <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Your access level for "${this.config.folder.name}"
          </p>
        </div>
        
        <button class="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                data-toggle-details>
          Show Details
        </button>
      </div>

      <!-- Permission summary -->
      <div class="permission-summary mb-4">
        ${this.renderPermissionSummary(permissionGroups)}
      </div>

      <!-- Detailed permissions (hidden by default) -->
      <div class="permission-details hidden" data-permission-details>
        ${this.renderDetailedPermissions(permissionGroups)}
      </div>

      <!-- Permission context -->
      <div class="permission-context mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
        ${this.renderPermissionContext()}
      </div>
    `;

    this.container.innerHTML = html;
    this.attachEventListeners();
  }

  private groupPermissions(): Record<string, FolderPermission[]> {
    return {
      read: this.config.permissions.filter(p => p.action.startsWith('read') || p.action === 'view'),
      write: this.config.permissions.filter(p => 
        p.action.startsWith('create') || 
        p.action.startsWith('edit') || 
        p.action.startsWith('upload') ||
        p.action === 'rename'
      ),
      manage: this.config.permissions.filter(p => 
        p.action.startsWith('delete') || 
        p.action.startsWith('manage') ||
        p.action === 'permissions'
      )
    };
  }

  private renderPermissionSummary(groups: Record<string, FolderPermission[]>): string {
    const accessLevel = this.determineAccessLevel(groups);
    const accessColor = this.getAccessLevelColor(accessLevel);
    
    return `
      <div class="flex items-center space-x-4">
        <div class="flex items-center">
          <div class="w-3 h-3 rounded-full ${accessColor} mr-2"></div>
          <span class="text-sm font-medium text-gray-900 dark:text-white">
            ${accessLevel} Access
          </span>
        </div>
        
        <div class="flex items-center space-x-3 text-xs">
          ${this.renderPermissionBadge('Read', groups.read)}
          ${this.renderPermissionBadge('Write', groups.write)}
          ${this.renderPermissionBadge('Manage', groups.manage)}
        </div>
      </div>
    `;
  }

  private renderPermissionBadge(label: string, permissions: FolderPermission[]): string {
    const hasAnyPermission = permissions.some(p => p.allowed);
    const allPermissions = permissions.every(p => p.allowed);
    
    let badgeClass = 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400';
    let icon = 'M6 18L18 6M6 6l12 12'; // X icon
    
    if (allPermissions) {
      badgeClass = 'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300';
      icon = 'M5 13l4 4L19 7'; // Check icon
    } else if (hasAnyPermission) {
      badgeClass = 'bg-yellow-100 dark:bg-yellow-900 text-yellow-700 dark:text-yellow-300';
      icon = 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.664-.833-2.464 0L4.35 16.5c-.77.833.192 2.5 1.732 2.5z'; // Warning icon
    }
    
    return `
      <div class="flex items-center px-2 py-1 rounded ${badgeClass}">
        <svg class="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="${icon}"/>
        </svg>
        <span>${label}</span>
      </div>
    `;
  }

  private renderDetailedPermissions(groups: Record<string, FolderPermission[]>): string {
    const sections = [
      { title: 'Read Permissions', permissions: groups.read, color: 'blue' },
      { title: 'Write Permissions', permissions: groups.write, color: 'green' },
      { title: 'Management Permissions', permissions: groups.manage, color: 'red' }
    ];

    return sections.map(section => `
      <div class="permission-section mb-4 last:mb-0">
        <h5 class="text-sm font-medium text-gray-900 dark:text-white mb-2 flex items-center">
          <div class="w-2 h-2 rounded-full bg-${section.color}-500 mr-2"></div>
          ${section.title}
        </h5>
        
        <div class="space-y-1">
          ${section.permissions.map(permission => `
            <div class="flex items-center justify-between py-1">
              <div class="flex items-center">
                <svg class="w-4 h-4 mr-2 ${permission.allowed ? 'text-green-500' : 'text-red-500'}" 
                     fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                        d="${permission.allowed ? 'M5 13l4 4L19 7' : 'M6 18L18 6M6 6l12 12'}"/>
                </svg>
                <span class="text-sm text-gray-700 dark:text-gray-300 capitalize">
                  ${permission.action.replace(/[_-]/g, ' ')}
                </span>
              </div>
              
              ${permission.reason ? `
                <span class="text-xs text-gray-500 dark:text-gray-400" title="${permission.reason}">
                  <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                          d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                  </svg>
                </span>
              ` : ''}
            </div>
          `).join('')}
        </div>
      </div>
    `).join('');
  }

  private renderPermissionContext(): string {
    const folderInfo = [
      { label: 'Folder Level', value: `${this.config.folder.depth + 1} of 10` },
      { label: 'Project', value: 'Inherited from project permissions' },
      { label: 'Role', value: this.config.currentUser.role || 'Member' }
    ];

    return `
      <div class="text-xs">
        <h6 class="text-gray-500 dark:text-gray-400 uppercase tracking-wider font-semibold mb-2">
          Permission Context
        </h6>
        
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
          ${folderInfo.map(info => `
            <div class="flex justify-between sm:flex-col">
              <span class="text-gray-500 dark:text-gray-400">${info.label}:</span>
              <span class="text-gray-700 dark:text-gray-300 font-medium">${info.value}</span>
            </div>
          `).join('')}
        </div>
        
        <p class="text-gray-500 dark:text-gray-400 mt-3 text-xs">
          Permissions are inherited from your organization role and project access level.
          Contact your administrator to modify access.
        </p>
      </div>
    `;
  }

  private determineAccessLevel(groups: Record<string, FolderPermission[]>): string {
    const hasManage = groups.manage.some(p => p.allowed);
    const hasWrite = groups.write.some(p => p.allowed);
    const hasRead = groups.read.some(p => p.allowed);

    if (hasManage) return 'Full';
    if (hasWrite) return 'Editor';
    if (hasRead) return 'Viewer';
    return 'No';
  }

  private getAccessLevelColor(level: string): string {
    switch (level) {
      case 'Full': return 'bg-green-500';
      case 'Editor': return 'bg-blue-500';
      case 'Viewer': return 'bg-yellow-500';
      default: return 'bg-red-500';
    }
  }

  private attachEventListeners(): void {
    if (!this.container) return;

    const toggleButton = this.container.querySelector('[data-toggle-details]');
    const detailsSection = this.container.querySelector('[data-permission-details]');

    toggleButton?.addEventListener('click', () => {
      const isHidden = detailsSection?.classList.contains('hidden');
      
      if (isHidden) {
        detailsSection?.classList.remove('hidden');
        toggleButton.textContent = 'Hide Details';
      } else {
        detailsSection?.classList.add('hidden');
        toggleButton.textContent = 'Show Details';
      }

      logger.debug('Permission details toggled', { 
        expanded: isHidden,
        folder: this.config.folder.name,
        feature: 'folder-permissions' 
      });
    });
  }

  // Public methods
  public updatePermissions(newPermissions: FolderPermission[]): void {
    this.config.permissions = newPermissions;
    this.renderPermissions();
  }

  public updateFolder(newFolder: FolderDto): void {
    this.config.folder = newFolder;
    this.renderPermissions();
  }

  public hasPermission(action: string): boolean {
    return this.config.permissions.some(p => p.action === action && p.allowed);
  }

  public getPermissionReason(action: string): string | undefined {
    const permission = this.config.permissions.find(p => p.action === action);
    return permission?.reason;
  }
}