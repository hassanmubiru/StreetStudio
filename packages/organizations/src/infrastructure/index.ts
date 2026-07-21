/**
 * Organizations infrastructure layer exports.
 * 
 * Contains concrete implementations of ports (adapters), database access,
 * external service integrations, and framework-specific code.
 */

export {
  ensureOrganizationsSchema,
  postgresOrgStore,
  ORGANIZATIONS_TABLE_DDL,
} from "./postgres-org-store.js";