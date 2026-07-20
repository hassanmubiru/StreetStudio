import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { Recording, RecordingStateError, type Actor } from "./domain/recording.js";

const actor: Actor = {
  memberId: "11111111-1111-1111-1111-111111111111",
  organizationId: "22222222-2222-2222-2222-222222222222",
};
const other: Actor = {
  memberId: "33333333-3333-3333-3333-333333333333",
  organizationId: "22222222-2222-2222-2222-222222222222",
};
const NOW = "2026-01-01T00:00:00.000Z";
const LATER = "2026-01-02T00:00:00.000Z";

function draft(title = "Demo") {
  return Recording.createDraft({ id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", owner: actor, title, createdAt: NOW });
}

describe("Recording domain", () => {
  it("creates a draft owned by the actor's org", () => {
    const r = draft();
    expect(r.status).toBe("draft");
    expect(r.ownerId).toBe(actor.memberId);
    expect(r.organizationId).toBe(actor.organizationId);
  });

  it("trims the title and rejects empty/whitespace titles", () => {
    expect(draft("  Hello  ").title).toBe("Hello");
    expect(() => draft("   ")).toThrow(RecordingStateError);
    expect(() => draft("")).toThrow(RecordingStateError);
  });

  it("publishes a draft, then rejects re-publishing", () => {
    const published = draft().publish(LATER);
    expect(published.status).toBe("published");
    expect(() => published.publish(LATER)).toThrow(RecordingStateError);
  });

  it("archiving is terminal and blocks publish", () => {
    const archived = draft().archive(LATER);
    expect(archived.status).toBe("archived");
    expect(() => archived.archive(LATER)).toThrow(RecordingStateError);
    expect(() => archived.archive(LATER)).toThrow(/already archived/);
    expect(() => draft().archive(LATER).publish(LATER)).toThrow(RecordingStateError);
  });

  it("only the owner may edit; anyone in the org may view", () => {
    const r = draft();
    expect(r.canEdit(actor)).toBe(true);
    expect(r.canEdit(other)).toBe(false);
    expect(r.canView(other)).toBe(true);
    expect(r.canView({ ...other, organizationId: "99999999-9999-9999-9999-999999999999" })).toBe(false);
  });

  it("transitions never mutate the receiver (immutability)", () => {
    const d = draft();
    d.publish(LATER);
    expect(d.status).toBe("draft");
  });
});

describe("Recording properties", () => {
  const titleArb = fc.string({ minLength: 1, maxLength: 200 }).filter((s) => s.trim().length > 0);

  it("a freshly created recording is always an owned draft", () => {
    fc.assert(
      fc.property(titleArb, (title) => {
        const r = draft(title);
        expect(r.status).toBe("draft");
        expect(r.canEdit(actor)).toBe(true);
        expect(r.title).toBe(title.trim());
      }),
    );
  });

  it("archived is a terminal state for any prior transition", () => {
    fc.assert(
      fc.property(fc.boolean(), (publishFirst) => {
        let r = draft();
        if (publishFirst) r = r.publish(LATER);
        const archived = r.archive(LATER);
        expect(archived.status).toBe("archived");
        expect(archived.canEdit(actor)).toBe(false);
        expect(() => archived.publish(LATER)).toThrow(RecordingStateError);
      }),
    );
  });

  it("titles longer than the bound are always rejected", () => {
    fc.assert(
      fc.property(fc.string({ minLength: 201, maxLength: 400 }).filter((s) => s.trim().length > 200), (title) => {
        expect(() => draft(title)).toThrow(RecordingStateError);
      }),
    );
  });
});
