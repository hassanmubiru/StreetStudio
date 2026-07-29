/**
 * Member Management Component
 * 
 * Provides organization member management including member listing with roles
 * and activity, invitation form, member profiles, and removal with confirmation.
 * 
 * Validates: Requirements 8.1, 8.2, 8.8
 */

import type { MemberDto, OrganizationDto, RoleDto, InvitationDto, Uuid } from '@streetstudio/shared';
import { apiClient } from '../../services/api.js';
import { logger } from '../../app/client-logger.js';

export interface OrganizationMember {
  id: Uuid;
  email: string;
  displayName: string;
  avatarUrl?: string;
  role: string;
  roleId: Uuid;
  joinedAt: string;
  lastActivity: string;
  status: 'active' | 'inactive' | 'suspended';
}

export interface MemberInvitation {
  email: string;
  roleId: Uuid;
  message?: string;
}

export interface MemberRemovalOptions {
  transferContentTo?: Uuid;
  retainContent: boolean;
}

export interface MemberManagementConfig {
  organizationId: Uuid;
  currentUserId: Uuid;
  onMemberInvited?: (invitation: InvitationDto) => void;
  onMemberRemoved?: (memberId: Uuid) => void;
  onNavigateToProfile?: (memberId: Uuid) => void;
}

export class MemberManagement {
  private config: MemberManagementConfig;
  private element: HTMLElement;
  private members: OrganizationMember[] = [];
  private roles: RoleDto[] = [];
  private pendingInvitations: InvitationDto[] = [];
  private isLoading = false;
  private searchQuery = '';
  private sortField: 'name' | 'role' | 'activity' = 'name';
  private sortDirection: 'asc' | 'desc' = 'asc';

  constructor(config: MemberManagementConfig) {
    this.config = config;
    this.element = document.createElement('div');
    this.element.className = 'member-management';
    this.element.setAttribute('data-member-management', '');
  }

  public async getElement(): Promise<HTMLElement> {
    await this.loadData();
    this.render();
    this.setupEventListeners();
    return this.element;
  }

  private async loadData(): Promise<void> {
    this.isLoading = true;
    try {
      const [membersResponse, rolesResponse, invitationsResponse] = await Promise.all([
        apiClient.get<OrganizationMember[]>(
          `/organizations/${this.config.organizationId}/members`
        ),
        apiClient.get<RoleDto[]>(
          `/organizations/${this.config.organizationId}/roles`
        ),
        apiClient.get<InvitationDto[]>(
          `/organizations/${this.config.organizationId}/invitations`
        )
      ]);

      this.members = membersResponse.data;
      this.roles = rolesResponse.data;
      this.pendingInvitations = invitationsResponse.data.filter(
        inv => inv.status === 'pending'
      );
    } catch (error) {
      logger.error('Failed to load member data', { error });
      this.members = [];
      this.roles = [];
      this.pendingInvitations = [];
    } finally {
      this.isLoading = false;
    }
  }

  private render(): void {
    const filteredMembers = this.getFilteredMembers();

    this.element.innerHTML = `
      <div class="p-6 max-w-5xl mx-auto">
        <!-- Header -->
        <div class="flex items-center justify-between mb-6">
          <div>
            <h1 class="text-2xl font-bold text-gray-900 dark:text-white">Members</h1>
            <p class="text-sm text-gray-600 dark:text-gray-400 mt-1">
              Manage organization members, roles, and invitations
            </p>
          </div>
          <button
            data-action="invite-member"
            class="inline-flex items-center px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
            aria-label="Invite new member"
          >
            <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"/>
            </svg>
            Invite Member
          </button>
        </div>

        <!-- Search and Filter Bar -->
        <div class="flex items-center gap-4 mb-6">
          <div class="flex-1 relative">
            <input
              type="text"
              data-field="member-search"
              placeholder="Search members by name or email..."
              value="${this.searchQuery}"
              class="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              aria-label="Search members"
            />
            <svg class="absolute left-3 top-2.5 w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
            </svg>
          </div>
          <span class="text-sm text-gray-500 dark:text-gray-400" data-member-count>
            ${filteredMembers.length} member${filteredMembers.length !== 1 ? 's' : ''}
          </span>
        </div>

        <!-- Pending Invitations Section -->
        ${this.renderPendingInvitations()}

        <!-- Members Table -->
        ${this.renderMembersTable(filteredMembers)}
      </div>

      <!-- Invitation Modal (hidden by default) -->
      <div data-invitation-modal class="hidden fixed inset-0 z-50 flex items-center justify-center">
        ${this.renderInvitationModal()}
      </div>

      <!-- Removal Confirmation Modal (hidden by default) -->
      <div data-removal-modal class="hidden fixed inset-0 z-50 flex items-center justify-center">
        ${this.renderRemovalModal()}
      </div>
    `;
  }

  private renderPendingInvitations(): string {
    if (this.pendingInvitations.length === 0) return '';

    const invitationRows = this.pendingInvitations.map(inv => `
      <div class="flex items-center justify-between py-2 px-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-md" data-invitation-id="${inv.id}">
        <div class="flex items-center gap-3">
          <div class="w-8 h-8 bg-yellow-200 dark:bg-yellow-800 rounded-full flex items-center justify-center">
            <svg class="w-4 h-4 text-yellow-600 dark:text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
            </svg>
          </div>
          <div>
            <span class="text-sm font-medium text-gray-900 dark:text-white">${inv.email}</span>
            <span class="ml-2 text-xs text-yellow-600 dark:text-yellow-400 font-medium">Pending</span>
          </div>
        </div>
        <button
          data-action="revoke-invitation"
          data-invitation-id="${inv.id}"
          class="text-sm text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 font-medium"
          aria-label="Revoke invitation for ${inv.email}"
        >
          Revoke
        </button>
      </div>
    `).join('');

    return `
      <div class="mb-6" data-pending-invitations>
        <h2 class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
          Pending Invitations (${this.pendingInvitations.length})
        </h2>
        <div class="space-y-2">
          ${invitationRows}
        </div>
      </div>
    `;
  }
