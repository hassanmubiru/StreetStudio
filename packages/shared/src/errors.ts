/**
 * Shared error taxonomy for StreetStudio.
 *
 * A single, stable error taxonomy is shared across the REST API, the WebSocket
 * gateway, and the SDK so that error behavior is uniform on every surface
 * (Requirement 2.4). Each error has:
 *
 *  - a stable, machine-readable `code` that clients may branch on and that
 *    never changes once published,
 *  - a `category` that groups related codes,
 *  - an HTTP `status` used when the error is surfaced over REST, and
 *  - a non-disclosing, human-readable `message` that never reveals internal
 *    state, which credential was incorrect, whether an account/email/API key
 *    exists, or any other information useful to an attacker.
 *
 * Messages are intentionally generic. Callers that need to convey additional,
 * safe context may attach it via {@link ErrorDto.details}; the base `message`
 * must remain safe to expose to unauthenticated clients.
 */

/**
 * Broad grouping for an error code. Mirrors the taxonomy categories:
 * validation, authentication, authorization, not-found/gone, conflict,
 * rate-limit, capability-unavailable, upload, and boundary.
 */
export type ErrorCategory =
  | "validation"
  | "authentication"
  | "authorization"
  | "not_found"
  | "gone"
  | "conflict"
  | "rate_limit"
  | "capability_unavailable"
  | "upload"
  | "boundary";

/**
 * Stable, machine-readable error codes. These strings are part of the public
 * contract consumed by the SDK and external clients; they MUST NOT change.
 */
export type ErrorCode =
  // --- validation ---
  | "VALIDATION_FAILED"
  | "REGISTRATION_FAILED"
  | "CONFIGURATION_INVALID"
  | "STORAGE_CONFIG_INVALID"
  // --- authentication ---
  | "AUTHENTICATION_REQUIRED"
  | "AUTHENTICATION_FAILED"
  // --- authorization ---
  | "AUTHORIZATION_DENIED"
  // --- not found / gone ---
  | "NOT_FOUND"
  | "RESOURCE_GONE"
  | "SIGNED_TARGET_EXPIRED"
  | "SHARE_LINK_EXPIRED"
  | "INVITATION_INVALID"
  // --- conflict ---
  | "CONFLICT"
  | "VIDEO_NOT_READY"
  | "DEVELOPER_MODE_REQUIRED"
  // --- rate limit ---
  | "RATE_LIMITED"
  | "SHARE_LINK_LOCKED"
  // --- capability unavailable ---
  | "CAPABILITY_UNAVAILABLE"
  | "AI_UNAVAILABLE"
  | "BILLING_NOT_CONFIGURED"
  | "STORAGE_ERROR"
  // --- upload ---
  | "UPLOAD_CHUNK_SIZE_INVALID"
  | "UPLOAD_CHUNK_INVALID"
  | "UPLOAD_FAILED"
  | "UPLOAD_SESSION_EXPIRED"
  // --- boundary (build-time) ---
  | "DISALLOWED_STREETJS_IMPORT"
  | "DISALLOWED_INTERNAL_IMPORT"
  | "DISALLOWED_AI_VENDOR";

/** Immutable definition of a single error code. */
export interface ErrorDefinition {
  /** Stable machine-readable identifier. */
  readonly code: ErrorCode;
  /** Category the code belongs to. */
  readonly category: ErrorCategory;
  /** HTTP status used when surfaced over REST. */
  readonly status: number;
  /** Non-disclosing, human-readable message. */
  readonly message: string;
}

/**
 * The complete error catalog. Every {@link ErrorCode} has exactly one entry.
 * Messages are deliberately non-disclosing.
 */
export const ERROR_CATALOG: {
  readonly [K in ErrorCode]: ErrorDefinition;
} = Object.freeze({
  // --- validation (400) ---
  VALIDATION_FAILED: {
    code: "VALIDATION_FAILED",
    category: "validation",
    status: 400,
    message: "The request was invalid.",
  },
  REGISTRATION_FAILED: {
    // Uniform result for duplicate/invalid registration so the response never
    // reveals whether an email is already registered (R3.8).
    code: "REGISTRATION_FAILED",
    category: "validation",
    status: 400,
    message: "Registration could not be completed.",
  },
  CONFIGURATION_INVALID: {
    code: "CONFIGURATION_INVALID",
    category: "validation",
    status: 500,
    message: "The service configuration is invalid.",
  },
  STORAGE_CONFIG_INVALID: {
    code: "STORAGE_CONFIG_INVALID",
    category: "validation",
    status: 400,
    message: "The storage provider configuration is invalid.",
  },

  // --- authentication (401) ---
  AUTHENTICATION_REQUIRED: {
    code: "AUTHENTICATION_REQUIRED",
    category: "authentication",
    status: 401,
    message: "Authentication is required.",
  },
  AUTHENTICATION_FAILED: {
    // Uniform for wrong password, unknown email, expired/invalid token,
    // locked account, and invalid/revoked API key so nothing is disclosed
    // (R3.3, R3.7, R3.8, R18.5).
    code: "AUTHENTICATION_FAILED",
    category: "authentication",
    status: 401,
    message: "Authentication failed.",
  },

  // --- authorization (403) ---
  AUTHORIZATION_DENIED: {
    code: "AUTHORIZATION_DENIED",
    category: "authorization",
    status: 403,
    message: "Access is denied.",
  },

  // --- not found / gone ---
  NOT_FOUND: {
    // Also used where a resource exists but is not accessible to the caller,
    // to avoid disclosing existence (e.g. notifications, R12.6).
    code: "NOT_FOUND",
    category: "not_found",
    status: 404,
    message: "The requested resource was not found.",
  },
  RESOURCE_GONE: {
    code: "RESOURCE_GONE",
    category: "gone",
    status: 410,
    message: "The requested resource is no longer available.",
  },
  SIGNED_TARGET_EXPIRED: {
    code: "SIGNED_TARGET_EXPIRED",
    category: "gone",
    status: 410,
    message: "The upload target has expired.",
  },
  SHARE_LINK_EXPIRED: {
    code: "SHARE_LINK_EXPIRED",
    category: "gone",
    status: 410,
    message: "The share link is no longer valid.",
  },
  INVITATION_INVALID: {
    code: "INVITATION_INVALID",
    category: "gone",
    status: 410,
    message: "The invitation is no longer valid.",
  },

  // --- conflict (409) ---
  CONFLICT: {
    code: "CONFLICT",
    category: "conflict",
    status: 409,
    message: "The request conflicts with the current state.",
  },
  VIDEO_NOT_READY: {
    code: "VIDEO_NOT_READY",
    category: "conflict",
    status: 409,
    message: "The video is not available for playback.",
  },
  DEVELOPER_MODE_REQUIRED: {
    code: "DEVELOPER_MODE_REQUIRED",
    category: "conflict",
    status: 409,
    message: "Developer Mode is required for this action.",
  },

  // --- rate limit (429) ---
  RATE_LIMITED: {
    code: "RATE_LIMITED",
    category: "rate_limit",
    status: 429,
    message: "Too many requests. Please retry later.",
  },
  SHARE_LINK_LOCKED: {
    code: "SHARE_LINK_LOCKED",
    category: "rate_limit",
    status: 429,
    message: "The share link is temporarily locked. Please retry later.",
  },

  // --- capability unavailable ---
  CAPABILITY_UNAVAILABLE: {
    code: "CAPABILITY_UNAVAILABLE",
    category: "capability_unavailable",
    status: 503,
    message: "The requested capability is not available.",
  },
  AI_UNAVAILABLE: {
    code: "AI_UNAVAILABLE",
    category: "capability_unavailable",
    status: 503,
    message: "No AI provider is available for this capability.",
  },
  BILLING_NOT_CONFIGURED: {
    code: "BILLING_NOT_CONFIGURED",
    category: "capability_unavailable",
    status: 503,
    message: "Billing is not configured.",
  },
  STORAGE_ERROR: {
    code: "STORAGE_ERROR",
    category: "capability_unavailable",
    status: 502,
    message: "The storage provider could not complete the operation.",
  },

  // --- upload ---
  UPLOAD_CHUNK_SIZE_INVALID: {
    code: "UPLOAD_CHUNK_SIZE_INVALID",
    category: "upload",
    status: 400,
    message: "The upload chunk size is outside the accepted range.",
  },
  UPLOAD_CHUNK_INVALID: {
    code: "UPLOAD_CHUNK_INVALID",
    category: "upload",
    status: 422,
    message: "The upload chunk failed its integrity check.",
  },
  UPLOAD_FAILED: {
    code: "UPLOAD_FAILED",
    category: "upload",
    status: 422,
    message: "The upload could not be completed.",
  },
  UPLOAD_SESSION_EXPIRED: {
    code: "UPLOAD_SESSION_EXPIRED",
    category: "upload",
    status: 410,
    message: "The upload session has expired.",
  },

  // --- boundary (build-time; surfaced as internal errors if ever served) ---
  DISALLOWED_STREETJS_IMPORT: {
    code: "DISALLOWED_STREETJS_IMPORT",
    category: "boundary",
    status: 500,
    message: "A disallowed StreetJS import was detected.",
  },
  DISALLOWED_INTERNAL_IMPORT: {
    code: "DISALLOWED_INTERNAL_IMPORT",
    category: "boundary",
    status: 500,
    message: "A disallowed cross-package internal import was detected.",
  },
  DISALLOWED_AI_VENDOR: {
    code: "DISALLOWED_AI_VENDOR",
    category: "boundary",
    status: 500,
    message: "A disallowed AI/billing vendor reference was detected in core.",
  },
});

/** Every known error code, derived from the catalog. */
export const ERROR_CODES = Object.freeze(
  Object.keys(ERROR_CATALOG) as ErrorCode[]
);

/** Type guard: is the given value a known {@link ErrorCode}? */
export function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === "string" && value in ERROR_CATALOG;
}

/** Look up the immutable definition for an error code. */
export function getErrorDefinition(code: ErrorCode): ErrorDefinition {
  return ERROR_CATALOG[code];
}

/**
 * Serialized error shape returned over REST/WebSocket and consumed by the SDK.
 * This is the single wire representation for all StreetStudio errors.
 */
export interface ErrorDto {
  /** Stable machine-readable code. */
  code: ErrorCode;
  /** Category the code belongs to. */
  category: ErrorCategory;
  /** HTTP status associated with the error. */
  status: number;
  /** Non-disclosing human-readable message. */
  message: string;
  /**
   * Optional safe, structured context (e.g. which field failed validation).
   * MUST NOT contain information that discloses internal or security-sensitive
   * state.
   */
  details?: Record<string, unknown>;
  /**
   * For rate-limit errors, the number of seconds after which the client may
   * retry (R29.1).
   */
  retryAfterSeconds?: number;
}

/** Options for constructing an {@link AppError}. */
export interface AppErrorOptions {
  /** Safe, structured context attached to the error. */
  details?: Record<string, unknown>;
  /** Retry-after hint (seconds) for rate-limit style errors. */
  retryAfterSeconds?: number;
  /** Underlying cause, retained for server-side logging only. */
  cause?: unknown;
}

/**
 * Canonical error type thrown across StreetStudio packages. It carries the
 * stable code, category, and HTTP status from the catalog and serializes to
 * an {@link ErrorDto}. The public `message` is always the non-disclosing
 * catalog message; any sensitive `cause` is retained for logging only and is
 * never serialized.
 */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly category: ErrorCategory;
  readonly status: number;
  readonly details?: Record<string, unknown>;
  readonly retryAfterSeconds?: number;

  constructor(code: ErrorCode, options: AppErrorOptions = {}) {
    const def = ERROR_CATALOG[code];
    super(def.message, { cause: options.cause });
    this.name = "AppError";
    this.code = def.code;
    this.category = def.category;
    this.status = def.status;
    if (options.details !== undefined) {
      this.details = options.details;
    }
    if (options.retryAfterSeconds !== undefined) {
      this.retryAfterSeconds = options.retryAfterSeconds;
    }
    // Maintain a proper prototype chain when compiled to older targets.
    Object.setPrototypeOf(this, AppError.prototype);
  }

  /** Serialize to the wire representation. Sensitive `cause` is never included. */
  toDto(): ErrorDto {
    const dto: ErrorDto = {
      code: this.code,
      category: this.category,
      status: this.status,
      message: this.message,
    };
    if (this.details !== undefined) {
      dto.details = this.details;
    }
    if (this.retryAfterSeconds !== undefined) {
      dto.retryAfterSeconds = this.retryAfterSeconds;
    }
    return dto;
  }
}

/** Build an {@link ErrorDto} directly from a code without throwing. */
export function toErrorDto(
  code: ErrorCode,
  options: Pick<AppErrorOptions, "details" | "retryAfterSeconds"> = {}
): ErrorDto {
  return new AppError(code, options).toDto();
}
