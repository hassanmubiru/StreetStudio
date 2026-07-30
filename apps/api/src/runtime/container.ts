/**
 * Composition of the vertical-slice API service against real PostgreSQL.
 *
 * Wires the real domain services — {@link AuthService}, {@link OrgService}, and
 * the deny-by-default {@link RbacAccessControl} — onto pg-backed stores, then
 * registers a {@link ServiceInvocation} for each slice operation in a
 * {@link MapServiceContainer}. {@link createApiService} resolves a handler for
 * EVERY operation it is given and fails fast otherwise, so only the slice
 * operations are passed as the filtered catalog.
 *
 * The request lifecycle (rate limit → authenticate → validate → RBAC → service
 * → audit) is left fully intact: this module only supplies the collaborators it
 * expects (an {@link Authenticator}, an {@link AccessControl}, and an
 * {@link AuditSink}) plus the per-operation service handlers.
 */
import { AppError } from "@streetstudio/shared";
import type { PlatformConfig } from "@streetstudio/config";
import {
  createAuditLog,
  createRepositories,
  streetSqlClient,
} from "@streetstudio/database";
import type { MemberDto } from "@streetstudio/shared";
import {
  Argon2idPasswordHasher,
  AuthService,
  HmacAccessTokenIssuer,
  RbacAccessControl,
  repositoryAuthStores,
  repositoryMemberStore,
  repositoryRbacStore,
  type AuthContext,
} from "@streetstudio/auth";
import {
  OrgService,
  repositoryOrgStore,
  type OrganizationDto,
} from "@streetstudio/organizations";
import {
  ContentService,
  repositoryContentStore,
  type FolderRef,
} from "@streetstudio/projects";
import type { OrganizationRecord } from "@streetstudio/database";
import { isUuid } from "@streetstudio/database";
import type { Uuid } from "@streetstudio/shared";
import {
  createApiService,
  MapServiceContainer,
  type ApiService,
} from "../http/composition-root.js";
import type {
  ApiRequest,
  AuditEvent,
  AuditSink,
  Authenticator,
  RequestContext,
  ServiceInvocation,
} from "../http/lifecycle.js";
import { PUBLIC_OPERATIONS, type PublicOperation } from "../http/operations.js";
import type { AuthStatus } from "../security/auth-required.js";
import type { PgClient } from "./pg-client.js";

/** The operations wired by this slice (filtered catalog for createApiService). */
export const SLICE_OPERATION_IDS: readonly string[] = [
  "auth.register",
  "auth.login",
  "auth.logout",
  "auth.currentMember",
  "organizations.create",
  "organizations.list",
  // Content hierarchy — RBAC-gated create paths (proves the wildcard-admin
  // RBAC model end-to-end against the real ContentService).
  "projects.create",
  "folders.create",
];

/** The slice's subset of {@link PUBLIC_OPERATIONS}, preserving their metadata. */
export function sliceOperations(): readonly PublicOperation[] {
  const ids = new Set(SLICE_OPERATION_IDS);
  return PUBLIC_OPERATIONS.filter((op) => ids.has(op.id));
}

/** Read a required non-empty string field from a JSON request body. */
function requireStringField(body: unknown, field: string): string {
  if (
    typeof body !== "object" ||
    body === null ||
    typeof (body as Record<string, unknown>)[field] !== "string"
  ) {
    throw new AppError("VALIDATION_FAILED", {
      details: { field, reason: "must be a string" },
    });
  }
  return (body as Record<string, string>)[field] as string;
}

/** Read a required UUID field from a JSON request body (validated format). */
function requireUuidField(body: unknown, field: string): Uuid {
  const value = requireStringField(body, field);
  if (!isUuid(value)) {
    throw new AppError("VALIDATION_FAILED", {
      details: { field, reason: "must be a UUID" },
    });
  }
  return value as Uuid;
}

/** Optional string field from a JSON body, or undefined when absent/blank. */
function optionalStringField(body: unknown, field: string): string | undefined {
  if (typeof body !== "object" || body === null) {
    return undefined;
  }
  const value = (body as Record<string, unknown>)[field];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/**
 * The owning-organization scope for an RBAC operation, taken from the request
 * (the HTTP transport sets it from the `X-Organization-Id` header). Absence is
 * a client error rather than an authorization decision.
 */
function requireOrganizationId(context: RequestContext): Uuid {
  if (!context.organizationId) {
    throw new AppError("VALIDATION_FAILED", {
      details: { field: "organizationId", reason: "X-Organization-Id header is required" },
    });
  }
  return context.organizationId;
}

/** The authenticated principal, guaranteed present for authenticated ops. */
function requireAuth(context: RequestContext): AuthContext {
  if (!context.auth) {
    // The auth-required guard admits only authenticated principals here, so
    // this is defensive and should never fire for an authenticated operation.
    throw new AppError("AUTHENTICATION_REQUIRED");
  }
  return context.auth;
}

function toOrganizationDto(record: OrganizationRecord): OrganizationDto {
  return {
    id: record.id,
    name: record.name,
    settings: record.settings,
    createdAt: record.createdAt,
  };
}

function toMemberDto(record: {
  id: MemberDto["id"];
  email: string;
  createdAt: MemberDto["createdAt"];
}): MemberDto {
  return { id: record.id, email: record.email, createdAt: record.createdAt };
}

/** Everything the HTTP transport needs to serve the slice. */
export interface Runtime {
  readonly service: ApiService;
  readonly operations: readonly PublicOperation[];
}

/**
 * Build the slice runtime: construct the domain services on pg-backed stores,
 * register the slice handlers, and assemble the {@link ApiService}.
 */
export function buildRuntime(config: PlatformConfig, pg: PgClient): Runtime {
  // Single canonical schema (SCHEMA-DUP-01 reconciliation): every service is
  // wired to the database package's repository-backed store adapters over the
  // ONE migration-managed schema (`createRepositories` → member/organization/
  // role/membership/project/folder/... with full FK integrity), rather than the
  // per-package de-seam `postgres*Store` DDL (a parallel, FK-less table family).
  // This makes the append-only Audit Log's FK (`audit_entry.organization_id ->
  // organization`) valid and enforces tenant isolation at the storage layer.
  const sql = streetSqlClient(pg);
  const repositories = createRepositories(sql);

  // --- Domain services on the canonical repository-backed stores ---------
  const authService = new AuthService({
    stores: repositoryAuthStores(repositories),
    passwordHasher: new Argon2idPasswordHasher(),
    tokenIssuer: new HmacAccessTokenIssuer(config.jwtSecret),
  });
  const memberStore = repositoryMemberStore(repositories);
  const accessControl = new RbacAccessControl({
    store: repositoryRbacStore(repositories),
  });
  const orgService = new OrgService({ store: repositoryOrgStore(repositories) });
  // Content hierarchy service — its create paths gate on the same RBAC
  // evaluator, so the wildcard-admin model is exercised at both the HTTP
  // lifecycle layer and inside the domain service.
  const contentService = new ContentService({
    store: repositoryContentStore(repositories),
    access: accessControl,
  });

  // The append-only Audit Log is tenant-scoped (audit_entry.organization_id is
  // NOT NULL with an FK to the organization table). The slice's auditable
  // operations (auth.register/login/logout, organizations.create) carry no
  // request-level organization scope, so their success events have no tenant to
  // record against; the sink guards and skips those rather than failing the
  // request after the service has already committed. Org-scoped operations
  // added later record normally.
  // Append-only Audit Log (R28), authoritative on the unified canonical
  // schema: `audit_entry.organization_id -> organization` is now consistent
  // with where organizations actually live (AUDIT-SCHEMA-01 resolved by the
  // repository/migration reconciliation above), so org-scoped audit writes are
  // referentially valid. Events without an organization scope (e.g. bare
  // auth.register/login) have no tenant to record against and are skipped.
  const auditLog = createAuditLog(sql);
  const auditSink: AuditSink = {
    async record(event: AuditEvent): Promise<void> {
      if (!event.organizationId || !event.memberId) {
        return;
      }
      await auditLog.append({
        actor: event.memberId,
        action: `${event.operationId}:${event.outcome}`,
        targetId: event.memberId,
        orgId: event.organizationId,
      });
    },
  };

  // --- Bearer-token authenticator ----------------------------------------
  // Resolves a presented bearer token into an AuthContext via the real
  // AuthService; absence of a credential is "unauthenticated" (admitted only to
  // public operations by the auth-required guard) and a bad token is "invalid".
  const authenticator: Authenticator = {
    async authenticate(request: ApiRequest): Promise<AuthStatus> {
      if (!request.credential) {
        return { kind: "unauthenticated" };
      }
      try {
        const principal = await authService.verifyAccessToken(request.credential);
        return { kind: "authenticated", principal };
      } catch {
        return { kind: "invalid" };
      }
    },
  };

  // --- Slice service handlers --------------------------------------------
  const container = new MapServiceContainer();

  const register: ServiceInvocation<MemberDto> = async (request) => {
    const email = requireStringField(request.body, "email");
    const password = requireStringField(request.body, "password");
    return authService.register({ email, password });
  };

  const login: ServiceInvocation = async (request) => {
    const email = requireStringField(request.body, "email");
    const password = requireStringField(request.body, "password");
    return authService.login({ email, password });
  };

  const logout: ServiceInvocation = async (_request, context) => {
    const auth = requireAuth(context);
    if (auth.sessionId) {
      await authService.logout(auth.sessionId);
    }
    return { success: true };
  };

  const currentMember: ServiceInvocation<MemberDto> = async (_request, context) => {
    const auth = requireAuth(context);
    const member = await memberStore.findById(auth.memberId);
    if (!member) {
      throw new AppError("NOT_FOUND");
    }
    return toMemberDto(member);
  };

  const createOrganization: ServiceInvocation<OrganizationDto> = async (
    request,
    context,
  ) => {
    const auth = requireAuth(context);
    const name = requireStringField(request.body, "name");
    const created = await orgService.createOrg(auth, name);
    return toOrganizationDto(created);
  };

  // OrgService exposes no "list organizations for a member", so this reads the
  // member's organizations directly through the canonical membership/organization
  // tables (the same store of record repositoryOrgStore writes to). Real SQL, no fake.
  const listOrganizations: ServiceInvocation = async (_request, context) => {
    const auth = requireAuth(context);
    const result = await pg.query<{
      id: string;
      name: string;
      settings: string | Record<string, unknown> | null;
      created_at: string;
    }>(
      `SELECT o.id, o.name, o.settings, o.created_at
         FROM organization o
         JOIN membership m ON m.organization_id = o.id
        WHERE m.member_id = $1
        ORDER BY o.created_at ASC`,
      [auth.memberId],
    );
    const organizations: OrganizationDto[] = result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      settings:
        typeof row.settings === "string"
          ? (JSON.parse(row.settings) as Record<string, unknown>)
          : row.settings ?? {},
      createdAt: new Date(row.created_at).toISOString(),
    }));
    return { organizations, total: organizations.length };
  };

  // projects.create (RBAC: project:create) — scoped to X-Organization-Id.
  const createProject: ServiceInvocation = async (request, context) => {
    const auth = requireAuth(context);
    const orgId = requireOrganizationId(context);
    const name = requireStringField(request.body, "name");
    return contentService.createProject(auth, orgId, name);
  };

  // folders.create (RBAC: folder:create) — parent addresses a project (and
  // optionally a parent folder) within the owning organization.
  const createFolder: ServiceInvocation = async (request, context) => {
    const auth = requireAuth(context);
    const orgId = requireOrganizationId(context);
    const projectId = requireUuidField(request.body, "projectId");
    const name = requireStringField(request.body, "name");
    const folderIdRaw = optionalStringField(request.body, "folderId");
    if (folderIdRaw !== undefined && !isUuid(folderIdRaw)) {
      throw new AppError("VALIDATION_FAILED", {
        details: { field: "folderId", reason: "must be a UUID" },
      });
    }
    const parent: FolderRef =
      folderIdRaw !== undefined
        ? { organizationId: orgId, projectId, folderId: folderIdRaw as Uuid }
        : { organizationId: orgId, projectId };
    return contentService.createFolder(auth, parent, name);
  };

  container
    .register<ServiceInvocation>("auth.register", register)
    .register<ServiceInvocation>("auth.login", login)
    .register<ServiceInvocation>("auth.logout", logout)
    .register<ServiceInvocation>("auth.currentMember", currentMember)
    .register<ServiceInvocation>("organizations.create", createOrganization)
    .register<ServiceInvocation>("organizations.list", listOrganizations)
    .register<ServiceInvocation>("projects.create", createProject)
    .register<ServiceInvocation>("folders.create", createFolder);

  const operations = sliceOperations();
  const service = createApiService({
    container,
    authenticator,
    accessControl,
    auditSink,
    operations,
  });

  return { service, operations };
}
