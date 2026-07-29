/**
 * Organization Management Components
 * Export all organization-related components and utilities
 */

export { PermissionMatrix, buildPermissionMap, getPermissionKey, countGrantedPermissions, isResourceFullyGranted, isActionFullyGranted, DEFAULT_RESOURCES, DEFAULT_ACTIONS } from './permission-matrix.js';
export type { PermissionResource, PermissionAction, PermissionEntry, PermissionMatrixOptions, PermissionMatrixCallbacks } from './permission-matrix.js';

export { RoleManagement, validateRoleName, rolePermissionsToEntries, entriesToPermissionStrings, BUILT_IN_ROLES } from './role-management.js';
export type { Role, RoleManagementCallbacks, RoleManagementOptions } from './role-management.js';

export { TeamManagement, validateTeamName, getTeamMembers, getAvailableMembers } from './team-management.js';
export type { Team, TeamMember, TeamManagementCallbacks, TeamManagementOptions } from './team-management.js';

export { PermissionInheritance, resolvePermissions, getEffectivePermission, countOverrides, getPermissionsFromSource } from './permission-inheritance.js';
export type { PermissionSource, ResolvedPermission, PermissionOverride, PermissionInheritanceOptions, PermissionInheritanceCallbacks } from './permission-inheritance.js';
