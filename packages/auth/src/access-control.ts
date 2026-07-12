/**
 * RBAC Evaluator (deny-by-default).
 *
 * Implements the design's "RBAC Evaluator" section and Requirement 16. The
 * evaluator answers a single question — "may this principal perform this action
 * on this resource?" — and mutates role assignments, always within the scope of
 * the Organization that OWNS the resource:
 *
 *  - {@link RbacAccessControl.can} is deny-by-default. A request is permitted
 *    only when the requesting Member has a Membership in the Organization that
 *    owns the target resource AND that Membership's Role grants the requested
 *    action. Every other case — no owning organization, no membership in that
 *    organization, an unresolved role, or a role that lacks the action — denies
 *    (R16.1, R16.3). Because the decision is made strictly in the owning
 *    organization's scope, a Role granted in one organization is never applied
 *    in another: permissions never leak across organizations (R16.4).
 *
 *  - {@link RbacAccessControl.assignRole} is permission-gated and
 *    membership-checked. A caller lacking role-management permission in the
 *    target organization is denied with `AUTHORIZATION_DENIED` and no
 *    assignment is made (R16.5). Assigning a Role to someone who is not a
 *    Member of the organization is rejected with no assignment made (R16.6).
 *    Once applied, the new Role governs subsequent {@link RbacAccessControl.can}
 *    decisions for that Member in that organization (R16.2, R26.3).
 *
 * Persistence is reached only through the narrow {@link RbacStore} port, which
 * keeps the evaluator decoupled from the concrete database layer and trivially
 * unit-testable with in-memory fakes. The default production adapter
 * ({@link repositoryRbacStore}) is backed by the tenant-scoped Membership and
 * Role repositories exposed by `@streetstudio/database`; those repositories
 * constrain every read/write to a single organization, reinforcing the
 * no-cross-organization-leak guarantee at the storage boundary.
 */
import type {
  MembershipRecord,
  Repositories,
  RoleRecord,
} from "@streetstudio/database";
import { AppError } from "@streetstudio/shared";
import type { Uuid } from "@streetstudio/shared";
import type { AuthContext } from "./service.js";

/** A permission token that a Role may grant. Free-form by design. */
export type Action = string;

/** The human-facing name of a Role within an organization. */
export type RoleName = string;

/**
 * A reference to the resource an action targets. The only field the evaluator
 * requires is the id of the Organization that OWNS the resource, because every
 * authorization decision is made in that owning scope (R16.1, R16.4). The
 * optional `type`/`id` are carried for callers and auditing and do not affect
 * the decision.
 */
export interface ResourceRef {
  /** The Organization that owns the target resource. */
  readonly organizationId: Uuid;
  /** Optional resource kind (e.g. "project", "video"). */
  readonly type?: string;
  /** Optional resource identifier. */
  readonly id?: Uuid;
}

/**
 * The RBAC evaluation surface (design "RBAC Evaluator"). Deny-by-default:
 * {@link AccessControl.can} returns `true` only for explicitly granted actions.
 */
export interface AccessControl {
  /**
   * Whether `ctx` may perform `action` on `resource`, evaluated in the
   * organization that owns the resource. Never throws for a denial — it simply
   * resolves `false` (R16.1, R16.3, R16.4).
   */
  can(
    ctx: AuthContext,
    action: Action,
    resource: ResourceRef,
  ): Promise<boolean>;

  /**
   * Assign (or change) `member`'s Role within `orgId` to the Role named `role`.
   * Permission-gated and membership-checked (R16.2, R16.5, R16.6, R26.3).
   */
  assignRole(
    actor: AuthContext,
    orgId: Uuid,
    member: Uuid,
    role: RoleName,
  ): Promise<void>;
}

/**
 * The default action a Role must grant for its holder to manage role
 * assignments within an organization. Callers seeding an Administrator Role
 * should include this permission; it can be overridden via
 * {@link AccessControlDeps.roleManagementPermission}.
 */
export const ROLE_MANAGEMENT_PERMISSION: Action = "org:manage_roles";

/**
 * Persistence port for RBAC. Deliberately narrow: the evaluator resolves a
 * Member's Membership and Role within a single organization and reassigns a
 * Membership's Role. Every method is organization-scoped so no query can reach
 * across tenants.
 */
export interface RbacStore {
  /** The Member's Membership in `organizationId`, or null when not a member. */
  findMembership(
    organizationId: Uuid,
    memberId: Uuid,
  ): Promise<MembershipRecord | null>;
  /** A Role by id within `organizationId`, or null when absent. */
  findRoleById(
    organizationId: Uuid,
    roleId: Uuid,
  ): Promise<RoleRecord | null>;
  /** A Role by name within `organizationId`, or null when absent. */
  findRoleByName(
    organizationId: Uuid,
    name: RoleName,
  ): Promise<RoleRecord | null>;
  /** Point `membership` at `roleId`, retaining its other fields. */
  setMembershipRole(
    membership: MembershipRecord,
    roleId: Uuid,
  ): Promise<void>;
}

/** Dependencies required to construct an {@link RbacAccessControl}. */
export interface AccessControlDeps {
  /** RBAC persistence port. */
  readonly store: RbacStore;
  /**
   * Action a caller's Role must grant to assign/change Roles. Defaults to
   * {@link ROLE_MANAGEMENT_PERMISSION}.
   */
  readonly roleManagementPermission?: Action;
}

/**
 * Deny-by-default RBAC evaluator. See the module doc for the exact semantics of
 * {@link RbacAccessControl.can} and {@link RbacAccessControl.assignRole}.
 */
export class RbacAccessControl implements AccessControl {
  private readonly store: RbacStore;
  private readonly roleManagementPermission: Action;

  constructor(deps: AccessControlDeps) {
    this.store = deps.store;
    this.roleManagementPermission =
      deps.roleManagementPermission ?? ROLE_MANAGEMENT_PERMISSION;
  }

  /**
   * Deny-by-default authorization check evaluated in the owning organization's
   * scope. Permits only when the requesting Member holds a Membership in the
   * owning Organization whose Role grants `action` (R16.1, R16.3, R16.4).
   */
  async can(
    ctx: AuthContext,
    action: Action,
    resource: ResourceRef,
  ): Promise<boolean> {
    const organizationId = resource.organizationId;
    if (!organizationId || !ctx.memberId) {
      return false;
    }

    // Scope the decision to the organization that OWNS the resource. Any role
    // the member may hold in *other* organizations is never consulted here, so
    // permissions cannot leak across organizations (R16.4).
    const membership = await this.store.findMembership(
      organizationId,
      ctx.memberId,
    );
    if (!membership) {
      return false;
    }

    const role = await this.store.findRoleById(
      organizationId,
      membership.roleId,
    );
    if (!role) {
      return false;
    }

    return role.permissions.includes(action);
  }

  /**
   * Assign or change `member`'s Role within `orgId`.
   *
   * The operation is permission-gated: `actor` must hold the role-management
   * permission in `orgId`, evaluated by {@link can} in that same scope; a caller
   * without it is denied with `AUTHORIZATION_DENIED` and nothing is changed
   * (R16.5). It is membership-checked: `member` must already belong to `orgId`,
   * otherwise the request is rejected and no assignment is made (R16.6). The
   * named Role must exist within `orgId` (Roles are organization-scoped, R16.4).
   * On success the Membership is repointed at the new Role, and that Role
   * governs subsequent {@link can} decisions for the Member in this scope
   * (R16.2, R26.3).
   */
  async assignRole(
    actor: AuthContext,
    orgId: Uuid,
    member: Uuid,
    role: RoleName,
  ): Promise<void> {
    // R16.5 — permission gate. Evaluated in the target organization's scope.
    const permitted = await this.can(actor, this.roleManagementPermission, {
      organizationId: orgId,
    });
    if (!permitted) {
      throw new AppError("AUTHORIZATION_DENIED");
    }

    // R16.6 — membership check. The target must belong to the organization.
    const membership = await this.store.findMembership(orgId, member);
    if (!membership) {
      throw new AppError("VALIDATION_FAILED");
    }

    // Roles are scoped to their organization; the named Role must exist here.
    const targetRole = await this.store.findRoleByName(orgId, role);
    if (!targetRole) {
      throw new AppError("NOT_FOUND");
    }

    // R16.2 / R26.3 — apply; subsequent decisions reflect the new Role.
    await this.store.setMembershipRole(membership, targetRole.id);
  }
}

/**
 * Default {@link RbacStore} backed by the tenant-scoped Membership and Role
 * repositories.
 *
 * The Membership repository is keyed by its own id, so member lookup filters
 * the organization's memberships by `memberId`. The repository exposes no
 * in-place update, so {@link RbacStore.setMembershipRole} reassigns a Role by
 * deleting and re-inserting the Membership with the new `roleId`, preserving its
 * identity and other fields (the same soft-update pattern used by the API-key
 * store).
 */
export function repositoryRbacStore(
  repositories: Pick<Repositories, "memberships" | "roles">,
): RbacStore {
  const { memberships, roles } = repositories;
  return {
    async findMembership(
      organizationId: Uuid,
      memberId: Uuid,
    ): Promise<MembershipRecord | null> {
      const all = await memberships.listByOrganization(organizationId);
      return all.find((m) => m.memberId === memberId) ?? null;
    },
    findRoleById(
      organizationId: Uuid,
      roleId: Uuid,
    ): Promise<RoleRecord | null> {
      return roles.findById(organizationId, roleId);
    },
    async findRoleByName(
      organizationId: Uuid,
      name: RoleName,
    ): Promise<RoleRecord | null> {
      const all = await roles.listByOrganization(organizationId);
      return all.find((r) => r.name === name) ?? null;
    },
    async setMembershipRole(
      membership: MembershipRecord,
      roleId: Uuid,
    ): Promise<void> {
      await memberships.deleteById(membership.organizationId, membership.id);
      await memberships.insert({ ...membership, roleId });
    },
  };
}
