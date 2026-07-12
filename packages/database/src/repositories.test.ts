import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { InMemorySqlClient } from "./testing.js";
import { createRepositories, toColumnName, toFieldName } from "./repositories.js";
import { newUuid } from "./ids.js";
import type { MemberRecord, ProjectRecord } from "./records.js";

describe("column-name mapping", () => {
  it("round-trips camelCase <-> snake_case", () => {
    fc.assert(
      fc.property(
        fc.stringMatching(/^[a-z][a-zA-Z0-9]*$/),
        (field) => {
          // camel -> snake -> camel is identity for camelCase identifiers.
          return toFieldName(toColumnName(field)) === field;
        },
      ),
      { numRuns: 100 },
    );
  });

  it("maps known fields to expected columns", () => {
    expect(toColumnName("organizationId")).toBe("organization_id");
    expect(toColumnName("sourceObjectKey")).toBe("source_object_key");
    expect(toColumnName("prRef")).toBe("pr_ref");
    expect(toFieldName("organization_id")).toBe("organizationId");
    expect(toFieldName("source_object_key")).toBe("sourceObjectKey");
  });
});

describe("GlobalRepository", () => {
  it("inserts and retrieves a member by id", async () => {
    const repo = createRepositories(new InMemorySqlClient()).members;
    const member: MemberRecord = {
      id: newUuid(),
      email: "dev@example.com",
      passwordHash: "hash",
      createdAt: "2024-01-01T00:00:00.000Z",
    };
    await repo.insert(member);
    const found = await repo.findById(member.id);
    expect(found).toEqual(member);
  });

  it("returns null for an unknown id", async () => {
    const repo = createRepositories(new InMemorySqlClient()).members;
    expect(await repo.findById(newUuid())).toBeNull();
  });

  it("deletes by id", async () => {
    const repo = createRepositories(new InMemorySqlClient()).members;
    const member: MemberRecord = {
      id: newUuid(),
      email: "x@example.com",
      passwordHash: null,
      createdAt: "2024-01-01T00:00:00.000Z",
    };
    await repo.insert(member);
    await repo.deleteById(member.id);
    expect(await repo.findById(member.id)).toBeNull();
  });
});

describe("TenantRepository isolation", () => {
  const makeProject = (organizationId: string): ProjectRecord => ({
    id: newUuid(),
    organizationId,
    name: "Project",
    createdAt: "2024-01-01T00:00:00.000Z",
  });

  it("scopes findById to the owning organization", async () => {
    const repo = createRepositories(new InMemorySqlClient()).projects;
    const orgA = newUuid();
    const orgB = newUuid();
    const project = makeProject(orgA);
    await repo.insert(project);

    // Correct tenant can read it.
    expect(await repo.findById(orgA, project.id)).toEqual(project);
    // A different tenant cannot read it, even with the right id.
    expect(await repo.findById(orgB, project.id)).toBeNull();
  });

  it("lists only rows owned by the organization", async () => {
    const repo = createRepositories(new InMemorySqlClient()).projects;
    const orgA = newUuid();
    const orgB = newUuid();
    await repo.insert(makeProject(orgA));
    await repo.insert(makeProject(orgA));
    await repo.insert(makeProject(orgB));

    const listA = await repo.listByOrganization(orgA);
    expect(listA).toHaveLength(2);
    expect(listA.every((p) => p.organizationId === orgA)).toBe(true);
  });

  // Property: cross-tenant reads never succeed. For any two distinct
  // organization ids, a row written under one is never retrievable under the
  // other. **Validates: Requirements 2.5**
  it("never leaks rows across organizations", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.uuid(),
        async (orgA, orgB) => {
          fc.pre(orgA !== orgB);
          const repo = createRepositories(new InMemorySqlClient()).projects;
          const project = makeProject(orgA);
          await repo.insert(project);
          const leaked = await repo.findById(orgB, project.id);
          const owned = await repo.findById(orgA, project.id);
          return leaked === null && owned?.id === project.id;
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe("association-table repositories", () => {
  it("upserts notification preferences idempotently", async () => {
    const repo = createRepositories(
      new InMemorySqlClient(),
    ).notificationPreferences;
    const memberId = newUuid();
    await repo.upsert({ memberId, eventType: "comment", enabled: true });
    await repo.upsert({ memberId, eventType: "comment", enabled: false });
    const prefs = await repo.listByMember(memberId);
    expect(prefs).toHaveLength(1);
    expect(prefs[0]?.enabled).toBe(false);
  });

  it("stores and removes reactions by composite key", async () => {
    const repo = createRepositories(new InMemorySqlClient()).reactions;
    const targetId = newUuid();
    const memberId = newUuid();
    await repo.insert({ targetType: "video", targetId, memberId, type: "like" });
    expect(await repo.listByTarget("video", targetId)).toHaveLength(1);
    await repo.remove({ targetType: "video", targetId, memberId, type: "like" });
    expect(await repo.listByTarget("video", targetId)).toHaveLength(0);
  });
});
