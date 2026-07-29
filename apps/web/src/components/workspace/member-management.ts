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
