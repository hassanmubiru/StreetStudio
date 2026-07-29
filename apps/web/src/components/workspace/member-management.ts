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

  private renderMembersTable(members: OrganizationMember[]): string {
    if (members.length === 0) {
      return `
        <div class="text-center py-12 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
          <svg class="w-12 h-12 text-gray-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"/>
          </svg>
          <p class="text-gray-500 dark:text-gray-400">No members found</p>
        </div>
      `;
    }

    const sortIcon = this.sortDirection === 'asc' ? '↑' : '↓';
    const memberRows = members.map(member => this.renderMemberRow(member)).join('');

    return `
      <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden" data-members-table>
        <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700" role="table" aria-label="Organization members">
          <thead class="bg-gray-50 dark:bg-gray-900">
            <tr>
              <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer" data-sort="name">
                Member ${this.sortField === 'name' ? sortIcon : ''}
              </th>
              <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer" data-sort="role">
                Role ${this.sortField === 'role' ? sortIcon : ''}
              </th>
              <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer" data-sort="activity">
                Last Activity ${this.sortField === 'activity' ? sortIcon : ''}
              </th>
              <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Status
              </th>
              <th scope="col" class="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-200 dark:divide-gray-700">
            ${memberRows}
          </tbody>
        </table>
      </div>
    `;
  }

  private renderMemberRow(member: OrganizationMember): string {
    const isCurrentUser = member.id === this.config.currentUserId;
    const statusBadge = this.getStatusBadge(member.status);
    const initials = this.getInitials(member.displayName);

    return `
      <tr data-member-id="${member.id}" class="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
        <td class="px-6 py-4 whitespace-nowrap">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center flex-shrink-0">
              ${member.avatarUrl
                ? `<img src="${member.avatarUrl}" alt="${member.displayName}" class="w-10 h-10 rounded-full object-cover"/>`
                : `<span class="text-sm font-medium text-blue-700 dark:text-blue-300">${initials}</span>`
              }
            </div>
            <div>
              <button
                data-action="view-profile"
                data-member-id="${member.id}"
                class="text-sm font-medium text-gray-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 transition-colors text-left"
              >
                ${member.displayName}${isCurrentUser ? ' <span class="text-xs text-gray-400">(you)</span>' : ''}
              </button>
              <p class="text-sm text-gray-500 dark:text-gray-400">${member.email}</p>
            </div>
          </div>
        </td>
        <td class="px-6 py-4 whitespace-nowrap">
          <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200" data-member-role="${member.id}">
            ${member.role}
          </span>
        </td>
        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400" data-member-activity="${member.id}">
          ${this.formatRelativeTime(member.lastActivity)}
        </td>
        <td class="px-6 py-4 whitespace-nowrap">
          ${statusBadge}
        </td>
        <td class="px-6 py-4 whitespace-nowrap text-right text-sm">
          ${isCurrentUser ? '' : `
            <button
              data-action="remove-member"
              data-member-id="${member.id}"
              data-member-name="${member.displayName}"
              class="text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 font-medium transition-colors"
              aria-label="Remove ${member.displayName}"
            >
              Remove
            </button>
          `}
        </td>
      </tr>
    `;
  }

  private renderInvitationModal(): string {
    const roleOptions = this.roles.map(role => 
      `<option value="${role.id}">${role.name}</option>`
    ).join('');

    return `
      <div class="fixed inset-0 bg-black/50" data-modal-backdrop></div>
      <div class="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4 p-6" role="dialog" aria-labelledby="invite-modal-title" aria-modal="true">
        <h2 id="invite-modal-title" class="text-lg font-semibold text-gray-900 dark:text-white mb-4">Invite New Member</h2>
        <form data-invitation-form class="space-y-4">
          <div>
            <label for="invite-email" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Email Address
            </label>
            <input
              id="invite-email"
              type="email"
              name="email"
              required
              placeholder="colleague@company.com"
              class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              aria-describedby="invite-email-error"
            />
            <p id="invite-email-error" class="hidden text-sm text-red-600 dark:text-red-400 mt-1" data-field-error="email"></p>
          </div>
          <div>
            <label for="invite-role" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Role
            </label>
            <select
              id="invite-role"
              name="roleId"
              required
              class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">Select a role...</option>
              ${roleOptions}
            </select>
          </div>
          <div>
            <label for="invite-message" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Welcome Message (optional)
            </label>
            <textarea
              id="invite-message"
              name="message"
              rows="3"
              placeholder="Add a personal note to the invitation..."
              class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
            ></textarea>
          </div>
          <div class="flex justify-end gap-3 pt-2">
            <button
              type="button"
              data-action="cancel-invite"
              class="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              class="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors disabled:opacity-50"
              data-submit-invite
            >
              Send Invitation
            </button>
          </div>
        </form>
      </div>
    `;
  }

  private renderRemovalModal(): string {
    const memberOptions = this.members
      .filter(m => m.id !== this.config.currentUserId)
      .map(m => `<option value="${m.id}">${m.displayName}</option>`)
      .join('');

    return `
      <div class="fixed inset-0 bg-black/50" data-modal-backdrop></div>
      <div class="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4 p-6" role="dialog" aria-labelledby="removal-modal-title" aria-modal="true">
        <h2 id="removal-modal-title" class="text-lg font-semibold text-gray-900 dark:text-white mb-2">Remove Member</h2>
        <p class="text-sm text-gray-600 dark:text-gray-400 mb-4" data-removal-description>
          Are you sure you want to remove this member from the organization?
        </p>
        <form data-removal-form class="space-y-4">
          <input type="hidden" name="memberId" data-removal-member-id />
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Content Handling
            </label>
            <div class="space-y-2">
              <label class="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="contentHandling" value="retain" checked class="text-blue-600 focus:ring-blue-500" />
                <span class="text-sm text-gray-700 dark:text-gray-300">Keep their content in the organization</span>
              </label>
              <label class="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="contentHandling" value="transfer" class="text-blue-600 focus:ring-blue-500" />
                <span class="text-sm text-gray-700 dark:text-gray-300">Transfer content to another member</span>
              </label>
            </div>
          </div>
          <div class="hidden" data-transfer-target-section>
            <label for="transfer-target" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Transfer to
            </label>
            <select
              id="transfer-target"
              name="transferTo"
              class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">Select a member...</option>
              ${memberOptions}
            </select>
          </div>
          <div class="flex justify-end gap-3 pt-2 border-t border-gray-200 dark:border-gray-700 mt-4">
            <button
              type="button"
              data-action="cancel-removal"
              class="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              class="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 transition-colors"
              data-confirm-removal
            >
              Remove Member
            </button>
          </div>
        </form>
      </div>
    `;
  }

  private setupEventListeners(): void {
    this.element.addEventListener('click', (event) => {
      const target = event.target as HTMLElement;
      const action = target.closest('[data-action]')?.getAttribute('data-action');

      switch (action) {
        case 'invite-member':
          this.showInvitationModal();
          break;
        case 'cancel-invite':
          this.hideInvitationModal();
          break;
        case 'remove-member':
          const memberId = target.closest('[data-member-id]')?.getAttribute('data-member-id');
          const memberName = target.closest('[data-member-name]')?.getAttribute('data-member-name');
          if (memberId) this.showRemovalModal(memberId as Uuid, memberName || '');
          break;
        case 'cancel-removal':
          this.hideRemovalModal();
          break;
        case 'view-profile':
          const profileId = target.closest('[data-member-id]')?.getAttribute('data-member-id');
          if (profileId && this.config.onNavigateToProfile) {
            this.config.onNavigateToProfile(profileId as Uuid);
          }
          break;
        case 'revoke-invitation':
          const invitationId = target.closest('[data-invitation-id]')?.getAttribute('data-invitation-id');
          if (invitationId) this.revokeInvitation(invitationId as Uuid);
          break;
      }
    });

    // Search input
    const searchInput = this.element.querySelector('[data-field="member-search"]');
    searchInput?.addEventListener('input', (event) => {
      this.searchQuery = (event.target as HTMLInputElement).value;
      this.updateMembersList();
    });

    // Sort columns
    this.element.addEventListener('click', (event) => {
      const sortCol = (event.target as HTMLElement).closest('[data-sort]');
      if (sortCol) {
        const field = sortCol.getAttribute('data-sort') as 'name' | 'role' | 'activity';
        if (this.sortField === field) {
          this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
        } else {
          this.sortField = field;
          this.sortDirection = 'asc';
        }
        this.updateMembersList();
      }
    });

    // Invitation form submit
    const invitationForm = this.element.querySelector('[data-invitation-form]');
    invitationForm?.addEventListener('submit', (event) => {
      event.preventDefault();
      this.handleInvitationSubmit();
    });

    // Removal form submit
    const removalForm = this.element.querySelector('[data-removal-form]');
    removalForm?.addEventListener('submit', (event) => {
      event.preventDefault();
      this.handleRemovalSubmit();
    });

    // Content handling radio buttons
    this.element.addEventListener('change', (event) => {
      const target = event.target as HTMLInputElement;
      if (target.name === 'contentHandling') {
        const transferSection = this.element.querySelector('[data-transfer-target-section]');
        if (target.value === 'transfer') {
          transferSection?.classList.remove('hidden');
        } else {
          transferSection?.classList.add('hidden');
        }
      }
    });
  }

  private showInvitationModal(): void {
    const modal = this.element.querySelector('[data-invitation-modal]');
    modal?.classList.remove('hidden');
    const emailInput = modal?.querySelector('#invite-email') as HTMLInputElement;
    emailInput?.focus();
  }

  private hideInvitationModal(): void {
    const modal = this.element.querySelector('[data-invitation-modal]');
    modal?.classList.add('hidden');
    const form = modal?.querySelector('form') as HTMLFormElement;
    form?.reset();
    // Clear error messages
    const errors = modal?.querySelectorAll('[data-field-error]');
    errors?.forEach(el => el.classList.add('hidden'));
  }

  private showRemovalModal(memberId: Uuid, memberName: string): void {
    const modal = this.element.querySelector('[data-removal-modal]');
    modal?.classList.remove('hidden');
    const hiddenInput = modal?.querySelector('[data-removal-member-id]') as HTMLInputElement;
    if (hiddenInput) hiddenInput.value = memberId;
    const description = modal?.querySelector('[data-removal-description]');
    if (description) {
      description.textContent = `Are you sure you want to remove "${memberName}" from the organization? This action cannot be undone.`;
    }
  }

  private hideRemovalModal(): void {
    const modal = this.element.querySelector('[data-removal-modal]');
    modal?.classList.add('hidden');
    const form = modal?.querySelector('form') as HTMLFormElement;
    form?.reset();
    const transferSection = this.element.querySelector('[data-transfer-target-section]');
    transferSection?.classList.add('hidden');
  }
