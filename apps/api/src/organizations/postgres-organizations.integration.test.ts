/**
 * Integration test for the Organizations domain repointing (ADR-0021, step 3).
 *
 * Proves that `assemblePostgresOrganizations` builds a real `OrgService` over
 * the canonical `@streetstudio/database` repository layer (singular,
 * FK-constrained `organization`/`member`/`role`/`membership`/`team`/`invitation`
 * tables), not the standalone direct-`PgPool` `postgresOrgStore` from the
 * original de-seam. DB-gated like the other repointing tests.
 */
import { newUuid } from "@streetstudio/database";
import { PgPool } from "streetjs";
import type { AuthContext } from "@streetstudio/auth";
import {
  ensureCanonicalSchema,
  assemblePostgresRepositories,
} from "../persistence/postgres-database.js";
import { assemblePostgresOrganizations } from "./postgres-organizations.js";

const DATABASE_URL = process.env["STREETSTUDIO_IT_DATABASE_URL"];
const suite = DATABASE_URL ? describe : describe.skip;

/**
 * DB-gated integration test: Organizations repointing.
 * 
 * Runs when `STREETSTUDIO_IT_DATABASE_URL` is set; skips otherwise.
 * Proves organizations operations flow through the canonical repository layer.
 */
suite("Organizations postgres repointing", () => {
  let pool: PgPool;
  
  beforeAll(async () => {
    if (!DATABASE_URL) return;
    await pool.initialize();
    await ensureCanonicalSchema(pool);
  });

  afterAll(async () => {
    if (DATABASE_URL) await pool.end();
  });

  it("creates organizations through the canonical repository layer", async () => {
    
    const repos = assemblePostgresRepositories(pool);
    
    // Create a member first (FK constraint requirement)
    const memberId = newUuid();
    await repos.members.insert({
      id: memberId,
      email: `org-test-${memberId}@example.com`,
      passwordHash: null,
      createdAt: new Date(),
    });

    const svc = assemblePostgresOrganizations(pool);
    const actor: AuthContext = { memberId, organizationId: null };

    // Create an organization through the canonical layer
    const org = await svc.createOrg(actor, { name: "Test Organization" });

    // Verify it was persisted in the canonical organization table
    const savedOrg = await repos.organizations.findById(org.id);
    expect(savedOrg).toBeTruthy();
    expect(savedOrg?.name).toBe("Test Organization");
    
    // Verify the administrator role and membership were created
    const adminRole = await repos.roles.findByName(org.id, "Administrator");
    expect(adminRole).toBeTruthy();
    
    const membership = await repos.memberships.findByMemberAndOrg(memberId, org.id);
    expect(membership).toBeTruthy();
    expect(membership?.roleId).toBe(adminRole?.id);
  });

  it("enforces FK constraints via the canonical schema", async () => {

    const svc = assemblePostgresOrganizations(pool);
    
    // Try to create organization with non-existent member
    const fakeActor: AuthContext = { memberId: newUuid(), organizationId: null };
    
    // This should fail due to FK constraint on member.id
    await expect(
      svc.createOrg(fakeActor, { name: "Should Fail" })
    ).rejects.toBeTruthy();
  });
});