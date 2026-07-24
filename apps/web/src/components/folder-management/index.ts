/**
 * Folder Management Components
 * 
 * Comprehensive folder management system providing:
 * - Hierarchical folder creation, renaming, and deletion
 * - Visual hierarchy indicators with expand/collapse functionality  
 * - Folder permissions and access control display
 * - Navigation breadcrumbs and quick access
 * - Support for nesting up to 10 levels deep
 * 
 * Validates: Requirements 4.5
 */

export { FolderManager } from './folder-manager.js';
export type { FolderManagerConfig, ExtendedFolderDto } from './folder-manager.js';

export { FolderBreadcrumbs } from './folder-breadcrumbs.js';
export type { BreadcrumbItem, FolderBreadcrumbsConfig } from './folder-breadcrumbs.js';

export { FolderPermissions } from './folder-permissions.js';
export type { FolderPermission, FolderPermissionsConfig } from './folder-permissions.js';