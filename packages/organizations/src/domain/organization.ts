/**
 * Organization domain model — the rich `Organization` aggregate and its
 * business invariants. Pure domain logic: no framework dependencies, no I/O.
 * Business rules about organization creation, settings validation, and
 * membership management live here.
 */
import { AppError } from "@streetstudio/shared";
import type { Uuid, IsoTimestamp } from "@streetstudio/shared";

/** Maximum length of an Organization name (Requirements 4.1, 4.7). */
export const MAX_ORG_NAME_LENGTH = 200;

/** Organization settings payload - free-form JSON object */
export type OrgSettings = Record<string, unknown>;

/** Persistent shape of an organization (matches database table columns) */
export interface OrganizationProps {
  readonly id: Uuid;
  readonly name: string;
  readonly settings: OrgSettings;
  readonly createdAt: IsoTimestamp;
}

/** Domain error for organization-specific business rule violations */
export class OrganizationDomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OrganizationDomainError";
  }
}

/**
 * Organization aggregate root. Instances are immutable — state changes
 * return a new `Organization` and never mutate the receiver. Enforces
 * all organization-specific business invariants.
 */
export class Organization {
  private constructor(private readonly props: OrganizationProps) {}

  /** Rehydrate from persisted props (no validation - assume valid) */
  static fromProps(props: OrganizationProps): Organization {
    return new Organization(props);
  }

  /**
   * Create a new organization with validated name.
   * Validates name is 1-200 characters after trimming.
   */
  static create(input: {
    id: Uuid;
    name: string;
    createdAt: IsoTimestamp;
    settings?: OrgSettings;
  }): Organization {
    const name = input.name.trim();
    
    if (name.length === 0) {
      throw new OrganizationDomainError("Organization name must not be empty.");
    }
    
    if (name.length > MAX_ORG_NAME_LENGTH) {
      throw new OrganizationDomainError(
        `Organization name must be at most ${MAX_ORG_NAME_LENGTH} characters.`
      );
    }

    return new Organization({
      id: input.id,
      name,
      settings: input.settings ?? {},
      createdAt: input.createdAt,
    });
  }

  // Getters
  get id(): Uuid { return this.props.id; }
  get name(): string { return this.props.name; }
  get settings(): OrgSettings { return this.props.settings; }
  get createdAt(): IsoTimestamp { return this.props.createdAt; }

  /**
   * Update organization settings with validation.
   * Both the patch and resulting merged settings must be valid JSON objects.
   */
  updateSettings(
    patch: OrgSettings, 
    validator: (settings: OrgSettings) => boolean = isValidOrgSettings
  ): Organization {
    // Validate the patch itself
    if (!validator(patch)) {
      throw new OrganizationDomainError("Invalid settings patch provided.");
    }

    // Merge and validate the result
    const newSettings: OrgSettings = { ...this.props.settings, ...patch };
    if (!validator(newSettings)) {
      throw new OrganizationDomainError("Merged settings would be invalid.");
    }

    return new Organization({
      ...this.props,
      settings: newSettings,
    });
  }

  /** Serialize to the persistent/wire shape */
  toProps(): OrganizationProps {
    return { ...this.props };
  }
}

/**
 * Default structural validator for Organization settings. Accepts a plain,
 * JSON-serializable object and rejects everything else — non-objects, arrays,
 * and objects carrying values that do not survive a JSON round-trip.
 */
export function isValidOrgSettings(settings: unknown): settings is OrgSettings {
  if (
    typeof settings !== "object" ||
    settings === null ||
    Array.isArray(settings)
  ) {
    return false;
  }

  let serialized: string | undefined;
  try {
    serialized = JSON.stringify(settings);
  } catch {
    return false; // cyclic or otherwise non-serializable
  }

  if (serialized === undefined) return false;

  // Ensure no keys are dropped during JSON round-trip
  const roundTripped = JSON.parse(serialized) as Record<string, unknown>;
  return (
    Object.keys(roundTripped).length ===
    Object.keys(settings as Record<string, unknown>).length
  );
}