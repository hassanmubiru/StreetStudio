/**
 * Organization Switcher Component
 * 
 * Provides organization switching with permission-based filtering, member display, 
 * and activity tracking. Updates all navigation elements and reloads dashboard content.
 */

import type { OrganizationDto, MemberDto, Uuid } from '@streetstudio/shared';
import { logger } from '../../client-logger';
import { getAuthStore } from '../../../stores/auth-store';
import { getWorkspaceStore } from '../../../stores/workspace-store';

export interface OrganizationSwitcherOptions {
  onOrganizationChange: (organizationId: Uuid) => void;
  onCreateOrganization: () => void;
  onManageOrganizations: () => void;
  showCreateOption?: boolean;
  showManageOption?: boolean;
}

export interface UserOrganization extends OrganizationDto {
  role: string;
  permissions: string[];
  memberCount: number;
  lastActivity?: string;
  canSwitch: boolean;
}

export class OrganizationSwitcher {
  private container: HTMLElement;
  private options: OrganizationSwitcherOptions;
  private currentUser?: MemberDto;
  private currentOrganization?: OrganizationDto;
  private availableOrganizations: UserOrganization[] = [];
  private isOpen = false;
  private isLoading = false;

  constructor(container: HTMLElement, options: OrganizationSwitcherOptions) {
    this.container = container;
    this.options = options;
  }

  /**
   * Initialize organization switcher
   */
  public initialize(): void {
    this.loadUserContext();
    this.render();
    this.setupEventListeners();
    this.loadAvailableOrganizations();
  }

  /**
   * Update user and organization context
   */
  public updateContext(user: MemberDto, organization?: OrganizationDto): void {
    this.currentUser = user;
    this.currentOrganization = organization;
    this.loadAvailableOrganizations();
    this.render();
  }

  /**
   * Load user context from stores
   */
  private loadUserContext(): void {
    try {
      const authStore = getAuthStore();
      const authState = authStore.getState();
      
      this.currentUser = authState.currentUser;
      this.currentOrganization = authState.currentOrganization;
    } catch (error) {
      logger.warn('Failed to load user context for organization switcher', { error });
    }
  }

  /**
   * Load available organizations with permission filtering
   */
  private async loadAvailableOrganizations(): Promise<void> {
    if (!this.currentUser) {
      return;
    }

    this.isLoading = true;
    this.render();

    try {
      // Mock API call - replace with actual API integration
      const organizations = await this.fetchUserOrganizations(this.currentUser.id);
      
      // Filter organizations based on user permissions
      this.availableOrganizations = organizations.filter(org => org.canSwitch);
      
      logger.debug('Loaded available organizations', {
        count: this.availableOrganizations.length,
        current: this.currentOrganization?.id
      });
      
    } catch (error) {
      logger.error('Failed to load user organizations', { error });
      this.availableOrganizations = [];
    } finally {
      this.isLoading = false;
      this.render();
    }
  }

  /**
   * Fetch user organizations from API (mock implementation)
   */
  private async fetchUserOrganizations(userId: Uuid): Promise<UserOrganization[]> {
    // Mock implementation - replace with actual API call
    return new Promise((resolve) => {
      setTimeout(() => {
        const mockOrganizations: UserOrganization[] = [
          {
            id: 'org-1' as Uuid,
            name: 'Acme Corp',
            description: 'Main organization',
            createdAt: '2024-01-01T00:00:00Z',
            updatedAt: '2024-01-01T00:00:00Z',
            role: 'admin',
            permissions: ['read', 'write', 'admin'],
            memberCount: 25,
            lastActivity: '2024-01-15T10:30:00Z',
            canSwitch: true
          },
          {
            id: 'org-2' as Uuid,
            name: 'Development Team',
            description: 'Development workspace',
            createdAt: '2024-01-02T00:00:00Z',
            updatedAt: '2024-01-02T00:00:00Z',
            role: 'member',
            permissions: ['read', 'write'],
            memberCount: 8,
            lastActivity: '2024-01-14T16:45:00Z',
            canSwitch: true
          },
          {
            id: 'org-3' as Uuid,
            name: 'Client Projects',
            description: 'External client work',
            createdAt: '2024-01-03T00:00:00Z',
            updatedAt: '2024-01-03T00:00:00Z',
            role: 'viewer',
            permissions: ['read'],
            memberCount: 12,
            lastActivity: '2024-01-10T09:15:00Z',
            canSwitch: true
          }
        ];
        resolve(mockOrganizations);
      }, 500);
    });
  }

  /**
   * Render the organization switcher
   */
  private render(): void {
    if (!this.currentOrganization) {
      this.container.innerHTML = '';
      return;
    }

    this.container.innerHTML = `
      <div class="ml-6 relative">
        <button
          type="button"
          class="max-w-xs bg-white dark:bg-gray-800 flex items-center text-sm rounded-full focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors duration-200 px-3 py-2"
          id="org-switcher-button"
          aria-expanded="${this.isOpen}"
          aria-haspopup="true"
          aria-label="Switch organization"
        >
          <div class="flex items-center">
            <!-- Organization avatar -->
            <div class="h-8 w-8 rounded-full ${this.getOrganizationColor(this.currentOrganization.id)} flex items-center justify-center">
              <span class="text-sm font-medium text-white">
                ${this.currentOrganization.name.charAt(0).toUpperCase()}
              </span>
            </div>
            
            <!-- Organization name and info -->
            <div class="ml-3 text-left hidden sm:block">
              <p class="text-sm font-medium text-gray-700 dark:text-gray-300 truncate max-w-32">
                ${this.currentOrganization.name}
              </p>
              <p class="text-xs text-gray-500 dark:text-gray-400">
                ${this.getCurrentUserRole()}
              </p>
            </div>
            
            <!-- Dropdown arrow -->
            <svg class="ml-2 h-4 w-4 text-gray-400 transition-transform duration-200 ${this.isOpen ? 'rotate-180' : ''}" 
                 xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
              <path fill-rule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clip-rule="evenodd" />
            </svg>
          </div>
        </button>

        <!-- Organization dropdown -->
        <div
          class="${this.isOpen ? 'opacity-100 scale-100' : 'opacity-0 scale-95 pointer-events-none'} origin-top-left absolute left-0 mt-2 w-80 rounded-lg shadow-xl bg-white dark:bg-gray-800 ring-1 ring-black ring-opacity-5 focus:outline-none z-50 transition-all duration-200"
          role="menu"
          aria-orientation="vertical"
          aria-labelledby="org-switcher-button"
          id="org-switcher-menu"
        >
          <!-- Header -->
          <div class="px-4 py-3 border-b border-gray-100 dark:border-gray-700">
            <p class="text-sm font-medium text-gray-900 dark:text-gray-100">
              Switch Organization
            </p>
            <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Select an organization to switch your workspace context
            </p>
          </div>

          ${this.renderOrganizationList()}
          ${this.renderActionButtons()}
        </div>
      </div>
    `;

    this.updateAriaAttributes();
  }

  /**
   * Render organization list
   */
  private renderOrganizationList(): string {
    if (this.isLoading) {
      return `
        <div class="px-4 py-6">
          <div class="flex items-center justify-center">
            <svg class="animate-spin h-5 w-5 text-gray-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <span class="ml-2 text-sm text-gray-500 dark:text-gray-400">Loading organizations...</span>
          </div>
        </div>
      `;
    }

    if (this.availableOrganizations.length === 0) {
      return `
        <div class="px-4 py-6 text-center">
          <p class="text-sm text-gray-500 dark:text-gray-400">No organizations available</p>
        </div>
      `;
    }

    const currentOrg = this.availableOrganizations.find(org => org.id === this.currentOrganization?.id);
    const otherOrgs = this.availableOrganizations.filter(org => org.id !== this.currentOrganization?.id);

    return `
      <div class="max-h-64 overflow-y-auto">
        ${currentOrg ? this.renderCurrentOrganization(currentOrg) : ''}
        ${otherOrgs.length > 0 ? this.renderOtherOrganizations(otherOrgs) : ''}
      </div>
    `;
  }

  /**
   * Render current organization
   */
  private renderCurrentOrganization(org: UserOrganization): string {
    return `
      <div class="px-4 py-3 bg-blue-50 dark:bg-blue-900/20 border-l-4 border-blue-500">
        <div class="flex items-center justify-between">
          <div class="flex items-center min-w-0 flex-1">
            <div class="h-10 w-10 rounded-lg ${this.getOrganizationColor(org.id)} flex items-center justify-center">
              <span class="text-base font-medium text-white">
                ${org.name.charAt(0).toUpperCase()}
              </span>
            </div>
            <div class="ml-3 min-w-0 flex-1">
              <p class="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                ${org.name}
              </p>
              <div class="flex items-center mt-1">
                <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${this.getRoleBadgeClass(org.role)}">
                  ${org.role}
                </span>
                <span class="ml-2 text-xs text-gray-500 dark:text-gray-400">
                  ${org.memberCount} members
                </span>
              </div>
            </div>
          </div>
          <div class="ml-3 flex-shrink-0">
            <svg class="h-5 w-5 text-blue-500" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
              <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
            </svg>
          </div>
        </div>
        ${org.description ? `
          <p class="text-xs text-gray-600 dark:text-gray-300 mt-1 ml-13">
            ${org.description}
          </p>
        ` : ''}
      </div>
    `;
  }

  /**
   * Render other organizations
   */
  private renderOtherOrganizations(organizations: UserOrganization[]): string {
    if (organizations.length === 0) {
      return '';
    }

    return `
      <div class="py-1">
        ${organizations.map(org => `
          <button
            type="button"
            class="w-full px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:bg-gray-50 dark:focus:bg-gray-700 transition-colors duration-150"
            role="menuitem"
            data-organization-id="${org.id}"
            data-action="switch-organization"
          >
            <div class="flex items-center">
              <div class="h-10 w-10 rounded-lg ${this.getOrganizationColor(org.id)} flex items-center justify-center">
                <span class="text-base font-medium text-white">
                  ${org.name.charAt(0).toUpperCase()}
                </span>
              </div>
              <div class="ml-3 min-w-0 flex-1">
                <p class="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                  ${org.name}
                </p>
                <div class="flex items-center mt-1">
                  <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${this.getRoleBadgeClass(org.role)}">
                    ${org.role}
                  </span>
                  <span class="ml-2 text-xs text-gray-500 dark:text-gray-400">
                    ${org.memberCount} members
                  </span>
                  ${org.lastActivity ? `
                    <span class="ml-2 text-xs text-gray-500 dark:text-gray-400">
                      • ${this.formatLastActivity(org.lastActivity)}
                    </span>
                  ` : ''}
                </div>
                ${org.description ? `
                  <p class="text-xs text-gray-500 dark:text-gray-400 mt-1 truncate">
                    ${org.description}
                  </p>
                ` : ''}
              </div>
            </div>
          </button>
        `).join('')}
      </div>
    `;
  }

  /**
   * Render action buttons
   */
  private renderActionButtons(): string {
    const showCreate = this.options.showCreateOption !== false;
    const showManage = this.options.showManageOption !== false;

    if (!showCreate && !showManage) {
      return '';
    }

    return `
      <div class="border-t border-gray-100 dark:border-gray-700 py-1">
        ${showCreate ? `
          <button
            type="button"
            class="w-full px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:bg-gray-50 dark:focus:bg-gray-700 transition-colors duration-150"
            role="menuitem"
            data-action="create-organization"
          >
            <div class="flex items-center">
              <div class="h-10 w-10 rounded-lg bg-gray-200 dark:bg-gray-600 flex items-center justify-center">
                <svg class="h-5 w-5 text-gray-500 dark:text-gray-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
              </div>
              <div class="ml-3">
                <p class="text-sm font-medium text-gray-900 dark:text-gray-100">
                  Create organization
                </p>
                <p class="text-xs text-gray-500 dark:text-gray-400">
                  Start a new workspace for your team
                </p>
              </div>
            </div>
          </button>
        ` : ''}
        
        ${showManage ? `
          <button
            type="button"
            class="w-full px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:bg-gray-50 dark:focus:bg-gray-700 transition-colors duration-150"
            role="menuitem"
            data-action="manage-organizations"
          >
            <div class="flex items-center">
              <div class="h-10 w-10 rounded-lg bg-gray-200 dark:bg-gray-600 flex items-center justify-center">
                <svg class="h-5 w-5 text-gray-500 dark:text-gray-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <div class="ml-3">
                <p class="text-sm font-medium text-gray-900 dark:text-gray-100">
                  Manage organizations
                </p>
                <p class="text-xs text-gray-500 dark:text-gray-400">
                  View and manage your organization memberships
                </p>
              </div>
            </div>
          </button>
        ` : ''}
      </div>
    `;
  }

  /**
   * Setup event listeners
   */
  private setupEventListeners(): void {
    // Switcher toggle
    const switcherButton = this.container.querySelector('#org-switcher-button');
    switcherButton?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggle();
    });

    // Organization selection
    this.container.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      const button = target.closest('[data-action]') as HTMLElement;
      
      if (!button) return;

      const action = button.dataset.action;
      const organizationId = button.dataset.organizationId;

      switch (action) {
        case 'switch-organization':
          if (organizationId) {
            this.switchToOrganization(organizationId as Uuid);
          }
          break;
        case 'create-organization':
          this.options.onCreateOrganization();
          this.close();
          break;
        case 'manage-organizations':
          this.options.onManageOrganizations();
          this.close();
          break;
      }
    });

    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (!target.closest('#org-switcher-button') && !target.closest('#org-switcher-menu')) {
        this.close();
      }
    });

    // Keyboard navigation
    this.container.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.close();
        const button = this.container.querySelector('#org-switcher-button') as HTMLElement;
        button?.focus();
      }
    });
  }

  /**
   * Toggle dropdown visibility
   */
  public toggle(): void {
    if (this.isOpen) {
      this.close();
    } else {
      this.open();
    }
  }

  /**
   * Open dropdown
   */
  public open(): void {
    this.isOpen = true;
    this.render();
    
    // Focus first menu item for accessibility
    setTimeout(() => {
      const firstItem = this.container.querySelector('[role="menuitem"]') as HTMLElement;
      firstItem?.focus();
    }, 100);
  }

  /**
   * Close dropdown
   */
  public close(): void {
    if (this.isOpen) {
      this.isOpen = false;
      this.render();
    }
  }

  /**
   * Switch to organization
   */
  private async switchToOrganization(organizationId: Uuid): Promise<void> {
    this.close();
    
    logger.info('Switching to organization', { organizationId });
    
    try {
      // Update workspace store first
      const workspaceStore = getWorkspaceStore();
      workspaceStore.clear(); // Clear current workspace state
      
      // Notify parent component
      this.options.onOrganizationChange(organizationId);
      
      // Update current organization in auth store
      const authStore = getAuthStore();
      const targetOrg = this.availableOrganizations.find(org => org.id === organizationId);
      if (targetOrg) {
        authStore.setOrganization(targetOrg);
        this.currentOrganization = targetOrg;
        this.render();
      }
      
    } catch (error) {
      logger.error('Failed to switch organization', { error, organizationId });
      // Show error notification
      const event = new CustomEvent('notification:show', {
        detail: {
          type: 'error',
          message: 'Failed to switch organization. Please try again.',
          duration: 5000
        }
      });
      window.dispatchEvent(event);
    }
  }

  /**
   * Get current user role in organization
   */
  private getCurrentUserRole(): string {
    const currentOrg = this.availableOrganizations.find(org => org.id === this.currentOrganization?.id);
    return currentOrg?.role || 'member';
  }

  /**
   * Get organization color based on ID
   */
  private getOrganizationColor(orgId: Uuid): string {
    const colors = [
      'bg-blue-500',
      'bg-green-500',
      'bg-purple-500',
      'bg-pink-500',
      'bg-indigo-500',
      'bg-red-500',
      'bg-yellow-500',
      'bg-teal-500'
    ];
    
    // Simple hash function to consistently assign colors
    let hash = 0;
    for (let i = 0; i < orgId.length; i++) {
      hash = ((hash << 5) - hash + orgId.charCodeAt(i)) & 0xffffffff;
    }
    
    return colors[Math.abs(hash) % colors.length];
  }

  /**
   * Get role badge CSS class
   */
  private getRoleBadgeClass(role: string): string {
    switch (role) {
      case 'admin':
        return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
      case 'moderator':
        return 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200';
      case 'member':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
      case 'viewer':
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200';
    }
  }

  /**
   * Format last activity timestamp
   */
  private formatLastActivity(timestamp: string): string {
    const date = new Date(timestamp);
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diffInSeconds < 60) {
      return 'Just now';
    } else if (diffInSeconds < 3600) {
      const minutes = Math.floor(diffInSeconds / 60);
      return `${minutes}m ago`;
    } else if (diffInSeconds < 86400) {
      const hours = Math.floor(diffInSeconds / 3600);
      return `${hours}h ago`;
    } else if (diffInSeconds < 604800) {
      const days = Math.floor(diffInSeconds / 86400);
      return `${days}d ago`;
    } else {
      return date.toLocaleDateString();
    }
  }

  /**
   * Update ARIA attributes
   */
  private updateAriaAttributes(): void {
    const button = this.container.querySelector('#org-switcher-button');
    if (button) {
      button.setAttribute('aria-expanded', this.isOpen.toString());
    }
  }

  /**
   * Refresh organization list
   */
  public async refresh(): Promise<void> {
    await this.loadAvailableOrganizations();
  }

  /**
   * Clean up resources
   */
  public destroy(): void {
    this.container.innerHTML = '';
  }
}