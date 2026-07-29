/**
 * Unit tests for Role and Permission Management
 *
 * Tests permission matrix display, custom role configuration,
 * team management, and permission inheritance controls.
 *
 * Requirements: 8.3, 8.4, 8.5
 */

// @vitest-environment jsdom

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  PermissionMatrix,
  buildPermissionMap,
  getPermissionKey,
  countGrantedPermissions,
  isResourceFullyGranted,
  isActionFullyGranted,
  DEFAULT_RESOURCES,
  DEFAULT_ACTIONS,
} from './permission-matrix';
import type { PermissionEntry, PermissionMatrixCallbacks } from './permission-matrix';
import {
  RoleManagement,
  validateRoleName,
  rolePermissionsToEntries,
  entriesToPermissionStrings,
  BUILT_IN_ROLES,
} from './role-management';
import type { Role, RoleManagementCallbacks, RoleManagementOptions } from './role-management';
