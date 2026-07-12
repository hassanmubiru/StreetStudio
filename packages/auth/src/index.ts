/**
 * @streetstudio/auth
 *
 * Public entry point for authentication, sessions, RBAC evaluation, and API
 * keys. Authentication/authorization primitives are built on StreetJS public
 * entry points.
 */
import type { RepositoryContext } from "@streetstudio/database";

export const DOMAIN = "Authentication, sessions, RBAC, and API keys." as const;

/** Placeholder authenticated request context. */
export interface AuthContext {
  readonly memberId: string;
  readonly organizationId: string;
}

/** Convenience alias tying auth flows to the database repository context. */
export type AuthRepositoryContext = RepositoryContext;
