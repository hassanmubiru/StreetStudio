/**
 * Organizations presentation DTOs.
 * 
 * Data Transfer Objects for API requests and responses.
 * These are the contracts exposed to clients and other services.
 */
import type { Uuid, IsoTimestamp, InvitationStatus } from "@streetstudio/shared";
import type { OrgSettings } from "../domain/index.js";

// Request DTOs
export interface CreateOrganizationRequest {
  readonly name: string;
}

export interface UpdateOrganizationSettingsRequest {
  readonly settings: OrgSettings;
}

export interface CreateInvitationRequest {
  readonly email: string;
}

export interface AcceptInvitationRequest {
  readonly token: string;
}

export interface CreateTeamRequest {
  readonly name: string;
}

export interface AssignToTeamRequest {
  readonly memberId: Uuid;
}

export interface RemoveMemberRequest {
  readonly memberId: Uuid;
}

// Response DTOs
export interface OrganizationDto {
  readonly id: Uuid;
  readonly name: string;
  readonly settings: OrgSettings;
  readonly createdAt: IsoTimestamp;
}

export interface InvitationDto {
  readonly id: Uuid;
  readonly organizationId: Uuid;
  readonly email: string;
  readonly token: string;
  readonly status: InvitationStatus;
  readonly createdAt: IsoTimestamp;
  readonly expiresAt: IsoTimestamp;
}

export interface TeamDto {
  readonly id: Uuid;
  readonly organizationId: Uuid;
  readonly name: string;
}

export interface MembershipDto {
  readonly id: Uuid;
  readonly organizationId: Uuid;
  readonly memberId: Uuid;
  readonly roleId: Uuid;
  readonly createdAt: IsoTimestamp;
}

export interface TeamMembershipDto {
  readonly teamId: Uuid;
  readonly memberId: Uuid;
}

// List response DTOs
export interface OrganizationListResponse {
  readonly organizations: OrganizationDto[];
  readonly total: number;
}

export interface InvitationListResponse {
  readonly invitations: InvitationDto[];
  readonly total: number;
}

export interface TeamListResponse {
  readonly teams: TeamDto[];
  readonly total: number;
}

export interface MembershipListResponse {
  readonly memberships: MembershipDto[];
  readonly total: number;
}