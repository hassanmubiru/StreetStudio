/**
 * @streetstudio/shared/testing
 *
 * Reusable `fast-check` arbitraries (generators) shared across the StreetStudio
 * test suites. These constrain values to the domain input space described in
 * the design (length bounds, timestamp windows, chunk-size windows, byte
 * payloads, multi-organization resource graphs, and plugin sets with injected
 * failures) so property tests can explore meaningful edge cases without each
 * package re-deriving the same generators.
 *
 * This module lives on a dedicated `./testing` entry point so that runtime
 * code never pulls `fast-check` into a production bundle.
 */

import * as fc from "fast-check";

// ---------------------------------------------------------------------------
// Domain bounds
// ---------------------------------------------------------------------------

/**
 * Character-length bounds drawn from the design's data model. Every string
 * field in the domain is validated against one of these limits.
 */
export const LENGTH_BOUNDS = {
  /** Minimum non-empty length for any validated string. */
  MIN: 1,
  /** Organization name maximum. */
  ORG_NAME_MAX: 200,
  /** Project / folder name maximum. */
  CONTENT_NAME_MAX: 255,
  /** URL maximum (webhook target, documentation link). */
  URL_MAX: 2048,
  /** Comment / review-comment body maximum. */
  COMMENT_BODY_MAX: 5000,
  /** Summary body maximum. */
  SUMMARY_MAX: 10000,
  /** Developer-asset (code snippet / markdown) maximum. */
  DEVELOPER_ASSET_MAX: 100000,
} as const;

/** The ordered set of length boundaries the generators exercise. */
export const LENGTH_BOUNDARY_VALUES = [
  LENGTH_BOUNDS.MIN,
  LENGTH_BOUNDS.ORG_NAME_MAX,
  LENGTH_BOUNDS.CONTENT_NAME_MAX,
  LENGTH_BOUNDS.URL_MAX,
  LENGTH_BOUNDS.COMMENT_BODY_MAX,
  LENGTH_BOUNDS.SUMMARY_MAX,
  LENGTH_BOUNDS.DEVELOPER_ASSET_MAX,
] as const;

/** One mebibyte in bytes. */
export const ONE_MB = 1024 * 1024;
/** One hundred mebibytes in bytes — the maximum accepted upload chunk. */
export const HUNDRED_MB = 100 * ONE_MB;

// ---------------------------------------------------------------------------
// Low-level string helpers
// ---------------------------------------------------------------------------

const PRINTABLE_CHARS =
  "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 _-.";

/**
 * Generates a printable, non-empty string of an EXACT character length. Used to
 * hit boundary lengths precisely (e.g. exactly 200 or exactly 255 characters).
 */
export function stringOfLength(length: number): fc.Arbitrary<string> {
  if (length <= 0) return fc.constant("");
  return fc
    .array(fc.constantFrom(...PRINTABLE_CHARS.split("")), {
      minLength: length,
      maxLength: length,
    })
    .map((chars) => chars.join(""));
}

/**
 * Generates a printable string whose length is uniformly sampled from the
 * inclusive `[min, max]` range.
 */
export function stringInRange(min: number, max: number): fc.Arbitrary<string> {
  return fc
    .integer({ min, max })
    .chain((len) => stringOfLength(len));
}

/**
 * Generates strings that sit exactly on, just inside, and just outside a
 * `[min, max]` length window — the highest-signal cases for validators.
 */
export function boundaryString(
  min: number,
  max: number
): fc.Arbitrary<string> {
  const candidates = [
    Math.max(0, min - 1), // just below the minimum (usually invalid)
    min, // minimum accepted
    min + 1,
    max - 1,
    max, // maximum accepted
    max + 1, // just above the maximum (invalid)
  ].filter((n) => n >= 0);
  return fc
    .constantFrom(...candidates)
    .chain((len) => stringOfLength(len));
}

// ---------------------------------------------------------------------------
// Emails
// ---------------------------------------------------------------------------

/** A syntactically valid email address. */
export const emailArb: fc.Arbitrary<string> = fc
  .tuple(
    fc
      .array(fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz0123456789".split("")), {
        minLength: 1,
        maxLength: 20,
      })
      .map((c) => c.join("")),
    fc
      .array(fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz0123456789".split("")), {
        minLength: 1,
        maxLength: 15,
      })
      .map((c) => c.join("")),
    fc.constantFrom("com", "org", "io", "dev", "net", "co")
  )
  .map(([local, domain, tld]) => `${local}@${domain}.${tld}`);

/**
 * An email address of an EXACT total length, useful for exercising the address
 * length bounds. The local part is padded to reach the requested length.
 */
export function emailOfLength(totalLength: number): fc.Arbitrary<string> {
  // Reserve room for `@`, a single-char domain, `.` and a 3-char tld => 6 chars.
  const overhead = "@d.com".length;
  const localLen = Math.max(1, totalLength - overhead);
  return stringOfLength(localLen).map(
    (local) => `${local.replace(/[^a-zA-Z0-9]/g, "a")}@d.com`
  );
}

/** Malformed email strings for negative-path testing. */
export const invalidEmailArb: fc.Arbitrary<string> = fc.oneof(
  fc.constant(""),
  fc.constant("no-at-sign"),
  fc.constant("@nolocal.com"),
  fc.constant("nodomain@"),
  fc.constant("double@@at.com"),
  fc.constant("spaces in@email.com"),
  fc.constant("missing.tld@domain")
);

// ---------------------------------------------------------------------------
// Passwords
// ---------------------------------------------------------------------------

/** Password minimum length per the auth design. */
export const PASSWORD_MIN_LENGTH = 8;

/** A valid password (>= 8 characters). */
export const passwordArb: fc.Arbitrary<string> = stringInRange(
  PASSWORD_MIN_LENGTH,
  128
);

/** A password that is too short (0..7 characters) to be accepted. */
export const shortPasswordArb: fc.Arbitrary<string> = fc
  .integer({ min: 0, max: PASSWORD_MIN_LENGTH - 1 })
  .chain((len) => stringOfLength(len));

/** Valid and invalid passwords, tagged so tests can assert the expected outcome. */
export const passwordWithValidityArb: fc.Arbitrary<{
  password: string;
  valid: boolean;
}> = fc.oneof(
  passwordArb.map((password) => ({ password, valid: true })),
  shortPasswordArb.map((password) => ({ password, valid: false }))
);

// ---------------------------------------------------------------------------
// Names at length bounds
// ---------------------------------------------------------------------------

/** A valid organization name (1..200 chars). */
export const orgNameArb: fc.Arbitrary<string> = stringInRange(
  LENGTH_BOUNDS.MIN,
  LENGTH_BOUNDS.ORG_NAME_MAX
);

/** A valid project/folder/workspace name (1..255 chars). */
export const contentNameArb: fc.Arbitrary<string> = stringInRange(
  LENGTH_BOUNDS.MIN,
  LENGTH_BOUNDS.CONTENT_NAME_MAX
);

/** Organization names focused on the [1, 200] boundary (incl. out-of-range). */
export const orgNameBoundaryArb: fc.Arbitrary<string> = boundaryString(
  LENGTH_BOUNDS.MIN,
  LENGTH_BOUNDS.ORG_NAME_MAX
);

/** Content names focused on the [1, 255] boundary (incl. out-of-range). */
export const contentNameBoundaryArb: fc.Arbitrary<string> = boundaryString(
  LENGTH_BOUNDS.MIN,
  LENGTH_BOUNDS.CONTENT_NAME_MAX
);

/**
 * A generic bounded-text generator producing values on the canonical length
 * boundaries (1/200/255/2048/5000/10000/100000). The generated length is
 * returned alongside the string so tests can assert exact expectations.
 */
export const boundedTextAtCanonicalLengthArb: fc.Arbitrary<{
  length: number;
  text: string;
}> = fc
  .constantFrom(...LENGTH_BOUNDARY_VALUES)
  .chain((length) =>
    stringOfLength(length).map((text) => ({ length, text }))
  );

// ---------------------------------------------------------------------------
// Timestamps: around 0 and around a video duration
// ---------------------------------------------------------------------------

/** A plausible video duration in seconds (>= 1s, up to ~4 hours). */
export const durationSecondsArb: fc.Arbitrary<number> = fc.integer({
  min: 1,
  max: 4 * 60 * 60,
});

/**
 * A comment/playback timestamp together with the duration it is relative to,
 * plus a `valid` flag. Timestamps cluster around 0 and around `duration`
 * (the two validation boundaries: 0 <= timestamp <= duration).
 */
export const timestampWithinDurationArb: fc.Arbitrary<{
  duration: number;
  timestamp: number;
  valid: boolean;
}> = durationSecondsArb.chain((duration) => {
  const candidates = fc.oneof(
    fc.constant(-1), // just below 0 -> invalid
    fc.constant(0), // lower boundary -> valid
    fc.constant(1),
    fc.integer({ min: 0, max: duration }), // interior -> valid
    fc.constant(duration - 1),
    fc.constant(duration), // upper boundary -> valid
    fc.constant(duration + 1) // just above -> invalid
  );
  return candidates.map((timestamp) => ({
    duration,
    timestamp,
    valid: timestamp >= 0 && timestamp <= duration,
  }));
});

/**
 * Epoch-style timestamps clustered around 0 (the Unix epoch) — useful for
 * exercising time arithmetic at the origin — plus ordinary recent values.
 */
export const epochTimestampArb: fc.Arbitrary<number> = fc.oneof(
  fc.constant(0),
  fc.integer({ min: -1000, max: 1000 }),
  fc.integer({ min: 1_600_000_000_000, max: 1_800_000_000_000 })
);

// ---------------------------------------------------------------------------
// Chunk sizes and byte payloads
// ---------------------------------------------------------------------------

/**
 * Upload chunk sizes (in bytes) clustered around the 1 MB minimum and 100 MB
 * maximum, paired with a `valid` flag (1 MB <= size <= 100 MB).
 */
export const chunkSizeArb: fc.Arbitrary<{ size: number; valid: boolean }> =
  fc
    .oneof(
      fc.constant(0),
      fc.constant(ONE_MB - 1), // just below min -> invalid
      fc.constant(ONE_MB), // min -> valid
      fc.constant(ONE_MB + 1),
      fc.integer({ min: ONE_MB, max: HUNDRED_MB }), // interior -> valid
      fc.constant(HUNDRED_MB - 1),
      fc.constant(HUNDRED_MB), // max -> valid
      fc.constant(HUNDRED_MB + 1) // just above max -> invalid
    )
    .map((size) => ({ size, valid: size >= ONE_MB && size <= HUNDRED_MB }));

/**
 * A byte payload of a bounded size. Kept small by default so property runs stay
 * fast; callers can raise `maxLength` when they need larger buffers.
 */
export function bytePayloadArb(maxLength = 4096): fc.Arbitrary<Uint8Array> {
  return fc.uint8Array({ minLength: 0, maxLength });
}

/** Byte payloads focused on interesting sizes: empty, single byte, and larger. */
export const bytePayloadBoundaryArb: fc.Arbitrary<Uint8Array> = fc.oneof(
  fc.constant(new Uint8Array(0)),
  fc.uint8Array({ minLength: 1, maxLength: 1 }),
  fc.uint8Array({ minLength: 2, maxLength: 8192 })
);

/**
 * An ordered sequence of chunk descriptors for a single upload, each tagged
 * with its index and a valid in-range size. Models the ordered chunk stream the
 * UploadService assembles.
 */
export const orderedChunkSequenceArb: fc.Arbitrary<
  Array<{ index: number; size: number }>
> = fc
  .array(fc.integer({ min: ONE_MB, max: HUNDRED_MB }), {
    minLength: 1,
    maxLength: 8,
  })
  .map((sizes) => sizes.map((size, index) => ({ index, size })));

// ---------------------------------------------------------------------------
// Multi-organization resource graphs
// ---------------------------------------------------------------------------

export interface GenMember {
  id: string;
  email: string;
}

export interface GenVideo {
  id: string;
  title: string;
  durationSeconds: number;
}

export interface GenFolder {
  id: string;
  name: string;
  depth: number;
  videos: GenVideo[];
}

export interface GenProject {
  id: string;
  name: string;
  folders: GenFolder[];
}

export interface GenOrg {
  id: string;
  name: string;
  members: GenMember[];
  projects: GenProject[];
}

const memberArb: fc.Arbitrary<GenMember> = fc.record({
  id: fc.uuid(),
  email: emailArb,
});

const videoArb: fc.Arbitrary<GenVideo> = fc.record({
  id: fc.uuid(),
  title: contentNameArb,
  durationSeconds: durationSecondsArb,
});

const folderArb: fc.Arbitrary<GenFolder> = fc.record({
  id: fc.uuid(),
  name: contentNameArb,
  // Folder nesting is capped at depth 10 (levels 0..9).
  depth: fc.integer({ min: 0, max: 9 }),
  videos: fc.array(videoArb, { minLength: 0, maxLength: 4 }),
});

const projectArb: fc.Arbitrary<GenProject> = fc.record({
  id: fc.uuid(),
  name: contentNameArb,
  folders: fc.array(folderArb, { minLength: 0, maxLength: 3 }),
});

/** A single organization populated with members, projects, folders, and videos. */
export const orgArb: fc.Arbitrary<GenOrg> = fc.record({
  id: fc.uuid(),
  name: orgNameArb,
  members: fc.array(memberArb, { minLength: 1, maxLength: 5 }),
  projects: fc.array(projectArb, { minLength: 0, maxLength: 3 }),
});

/**
 * A multi-organization resource graph with globally-unique organization ids.
 * Enables cross-organization isolation properties (a resource in one org must
 * never be reachable from another).
 */
export const multiOrgGraphArb: fc.Arbitrary<GenOrg[]> = fc
  .array(orgArb, { minLength: 2, maxLength: 4 })
  .map((orgs) => {
    // Guarantee distinct organization ids even if fc.uuid collides (rare).
    const seen = new Set<string>();
    return orgs.map((org, i) => {
      let id = org.id;
      while (seen.has(id)) id = `${org.id}-${i}`;
      seen.add(id);
      return { ...org, id };
    });
  });

// ---------------------------------------------------------------------------
// Plugin sets with injected failures
// ---------------------------------------------------------------------------

/** How a generated plugin is configured to behave during load/activation. */
export type PluginFailureMode = "none" | "load" | "activate";

export interface GenPlugin {
  id: string;
  name: string;
  /** Simulated behavior: healthy, fails to load, or fails to activate. */
  failureMode: PluginFailureMode;
}

const pluginArb: fc.Arbitrary<GenPlugin> = fc.record({
  id: fc.uuid(),
  name: stringInRange(1, 40),
  failureMode: fc.constantFrom<PluginFailureMode>("none", "load", "activate"),
});

/**
 * A set of plugins with unique ids and at least one injected failure, so that
 * isolation properties (a failing plugin must not disrupt the others) always
 * have something to observe.
 */
export const pluginSetWithFailuresArb: fc.Arbitrary<GenPlugin[]> = fc
  .array(pluginArb, { minLength: 2, maxLength: 6 })
  .map((plugins) => {
    // De-duplicate ids.
    const seen = new Set<string>();
    const unique = plugins.map((p, i) => {
      let id = p.id;
      while (seen.has(id)) id = `${p.id}-${i}`;
      seen.add(id);
      return { ...p, id };
    });
    // Ensure at least one injected failure.
    if (unique.every((p) => p.failureMode === "none") && unique[0]) {
      unique[0] = { ...unique[0], failureMode: "load" };
    }
    return unique;
  });
