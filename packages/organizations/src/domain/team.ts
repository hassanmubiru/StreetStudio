/**
 * Team domain model — the rich `Team` aggregate and its business
 * invariants. Pure domain logic: no framework dependencies, no I/O.
 * Business rules about team creation and membership live here.
 */
import type { Uuid } from "@streetstudio/shared";

/** Maximum length of a Team name */
export const MAX_TEAM_NAME_LENGTH = 200;

/** Persistent shape of a team */
export interface TeamProps {
  readonly id: Uuid;
  readonly organizationId: Uuid;
  readonly name: string;
}

/** Persistent shape of a team membership */
export interface TeamMembershipProps {
  readonly teamId: Uuid;
  readonly memberId: Uuid;
}

/** Domain error for team-specific business rule violations */
export class TeamDomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TeamDomainError";
  }
}

/**
 * Team aggregate root. Instances are immutable — state changes
 * return a new `Team` and never mutate the receiver. Enforces
 * all team-specific business invariants.
 */
export class Team {
  private constructor(private readonly props: TeamProps) {}

  /** Rehydrate from persisted props (no validation - assume valid) */
  static fromProps(props: TeamProps): Team {
    return new Team(props);
  }

  /**
   * Create a new team with validated name.
   * Validates name is 1-200 characters after trimming.
   */
  static create(input: {
    id: Uuid;
    organizationId: Uuid;
    name: string;
  }): Team {
    const name = input.name.trim();
    
    if (name.length === 0) {
      throw new TeamDomainError("Team name must not be empty.");
    }
    
    if (name.length > MAX_TEAM_NAME_LENGTH) {
      throw new TeamDomainError(
        `Team name must be at most ${MAX_TEAM_NAME_LENGTH} characters.`
      );
    }

    return new Team({
      id: input.id,
      organizationId: input.organizationId,
      name,
    });
  }

  // Getters
  get id(): Uuid { return this.props.id; }
  get organizationId(): Uuid { return this.props.organizationId; }
  get name(): string { return this.props.name; }

  /** Serialize to the persistent/wire shape */
  toProps(): TeamProps {
    return { ...this.props };
  }
}

/**
 * Team membership value object. Immutable association between
 * a team and a member.
 */
export class TeamMembership {
  private constructor(private readonly props: TeamMembershipProps) {}

  /** Create from props (no validation - assume valid) */
  static fromProps(props: TeamMembershipProps): TeamMembership {
    return new TeamMembership(props);
  }

  /** Create a new team membership */
  static create(teamId: Uuid, memberId: Uuid): TeamMembership {
    return new TeamMembership({ teamId, memberId });
  }

  // Getters
  get teamId(): Uuid { return this.props.teamId; }
  get memberId(): Uuid { return this.props.memberId; }

  /** Check if this membership is for the given member */
  isForMember(memberId: Uuid): boolean {
    return this.props.memberId === memberId;
  }

  /** Serialize to the persistent/wire shape */
  toProps(): TeamMembershipProps {
    return { ...this.props };
  }
}