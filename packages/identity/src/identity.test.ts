import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { hashPassword, verifyPassword } from "./password.js";
import { normalizeEmail, assertPasswordPolicy, MemberStateError, Member } from "./domain/member.js";

describe("password hashing (Argon2id)", () => {
  it("verifies a correct password and rejects a wrong one", async () => {
    const hash = await hashPassword("correct horse battery staple");
    expect(hash).toMatch(/^\$argon2id\$/);
    expect(await verifyPassword(hash, "correct horse battery staple")).toBe(true);
    expect(await verifyPassword(hash, "wrong password")).toBe(false);
  });

  it("produces distinct hashes for the same password (random salt)", async () => {
    const [a, b] = await Promise.all([hashPassword("same-password-123"), hashPassword("same-password-123")]);
    expect(a).not.toBe(b);
    expect(await verifyPassword(a, "same-password-123")).toBe(true);
    expect(await verifyPassword(b, "same-password-123")).toBe(true);
  });

  it("verifyPassword never throws on a malformed hash", async () => {
    expect(await verifyPassword("not-a-hash", "whatever")).toBe(false);
  });
});

describe("member domain validation", () => {
  it("normalizes and validates emails", () => {
    expect(normalizeEmail("  User@Example.COM ")).toBe("user@example.com");
    expect(() => normalizeEmail("not-an-email")).toThrow(MemberStateError);
    expect(() => normalizeEmail("a@b")).toThrow(MemberStateError);
  });

  it("enforces the minimum password policy", () => {
    expect(() => assertPasswordPolicy("short")).toThrow(MemberStateError);
    expect(() => assertPasswordPolicy("longenough1")).not.toThrow();
  });

  it("a member view never exposes the password hash", () => {
    const m = Member.create({
      id: "11111111-1111-1111-1111-111111111111",
      email: "a@b.co",
      passwordHash: "$argon2id$secret",
      createdAt: "2026-01-01T00:00:00.000Z" as never,
    });
    const view = m.toView() as Record<string, unknown>;
    expect(view["passwordHash"]).toBeUndefined();
    expect(view["email"]).toBe("a@b.co");
  });

  it("property: any valid email normalizes to lowercase and round-trips", () => {
    const local = fc.stringMatching(/^[a-z0-9]{1,12}$/);
    fc.assert(
      fc.property(local, local, (user, domain) => {
        const email = `${user}@${domain}.com`;
        expect(normalizeEmail(email.toUpperCase())).toBe(email);
      }),
    );
  });
});
