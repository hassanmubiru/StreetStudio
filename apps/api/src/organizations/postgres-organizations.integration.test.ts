/**
 * Integration test for the Organizations domain repointing (ADR-0021, step 3).
 *
 * Proves that `assemblePostgresOrganizations` builds a real `OrgService` over
 * the canonical `@streetstudio/database` repository layer (singular,
 * FK-constrained `organization`/`member`/`role`/`membership`/`team`/`invitation`
 * tables), not the standalone direct-`PgPool` `postgresOrgStore` from the
 * original de-seam. DB-gated like the other repointing tests.
 */
import { testDbUrl } from "@streetstudio/database/testing";
import { PgPool } from "@streetjs/postgres";
import { newUuid } from "@streetstudio/database";
import type { AuthContext } from "@streetstudio/auth";
import {
  ensureCanonicalSchema,
  assemblePostgresRepositories,
} from "../persistence/postgres-database.js";
import { assemblePostgresOrganizations } from "./postgres-organizations.js";

/**
 * DB-gated integration test: Organizations repointing.
 * 
 * Runs when `STREETSTUDIO_IT_DATABASE_URL` is set; skips otherwise.
 * Proves organizations operations flow through the canonical repository layer.
 */
describe("Organizations postgres repointing", () => {
  const pool = new PgPool(testDbUrl());
  
  beforeAll(async () => {
    if (!pool.databaseUrl) return;
    await pool.initialize();
    await ensureCanonicalSchema(pool);
  });

  afterAll(async () => {
    if (pool.databaseUrl) await pool.end();
  });

  // Skip if no test database URL
  beforeEach(() => {
    if (!pool.databaseUrl) {
      console.log("Skipping: no STREETSTUDIO_IT_DATABASE_URL");
      return;
    }
  });

  it("creates organizations through the canonical repository layer", async () => {
    if (!pool.databaseUrl) return;
    
    const repos = assemblePostgresRepositories(pool);
    
    // Create a member first (FK constraint requirement)
    const memberId = newUuid();
    await repos.members.insert({
      id: memberId,
      email: `org-test-${memberId}@example.com`,
      passwordHash: null,
      createdAt: new Date(),
    });

    // Mock access control that allows everything for this test
    const allowAll = {
      can: async () => true,
      assignRole: async () => {},
    };

    const svc = assemblePostgresOrganizations(pool, allowAll);
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
    if (!pool.databaseUrl) return;

    const allowAll = { can: async () => true, assignRole: async () => {} };
    const svc = assemblePostgresOrganizations(pool, allowAll);
    
    // Try to create organization with non-existent member
    const fakeActor: AuthContext = { memberId: newUuid(), organizationId: null };
    
    // This should fail due to FK constraint on member.id
    await expect(
      svc.createOrg(fakeActor, { name: "Should Fail" })
    ).rejects.toBeTruthy();
  });
});