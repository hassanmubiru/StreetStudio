import { describe, it, expect } from "vitest";
import {
  AppError,
  ERROR_CATALOG,
  ERROR_CODES,
  getErrorDefinition,
  isErrorCode,
  toErrorDto,
  type ErrorCategory,
  type ErrorCode,
} from "./index.js";

const VALID_CATEGORIES: ReadonlySet<ErrorCategory> = new Set([
  "validation",
  "authentication",
  "authorization",
  "not_found",
  "gone",
  "conflict",
  "rate_limit",
  "capability_unavailable",
  "upload",
  "boundary",
]);

describe("error catalog integrity", () => {
  it("keys each entry by its own code", () => {
    for (const code of ERROR_CODES) {
      expect(ERROR_CATALOG[code].code).toBe(code);
    }
  });

  it("assigns a valid category and HTTP status to every code", () => {
    for (const code of ERROR_CODES) {
      const def = ERROR_CATALOG[code];
      expect(VALID_CATEGORIES.has(def.category)).toBe(true);
      expect(def.status).toBeGreaterThanOrEqual(400);
      expect(def.status).toBeLessThan(600);
    }
  });

  it("provides a non-empty message for every code", () => {
    for (const code of ERROR_CODES) {
      expect(ERROR_CATALOG[code].message.length).toBeGreaterThan(0);
    }
  });

  it("is frozen (immutable)", () => {
    expect(Object.isFrozen(ERROR_CATALOG)).toBe(true);
  });

  it("includes the specifically referenced codes", () => {
    const required: ErrorCode[] = [
      "AI_UNAVAILABLE",
      "BILLING_NOT_CONFIGURED",
      "STORAGE_ERROR",
      "DISALLOWED_STREETJS_IMPORT",
      "DISALLOWED_INTERNAL_IMPORT",
      "DISALLOWED_AI_VENDOR",
    ];
    for (const code of required) {
      expect(ERROR_CODES).toContain(code);
    }
  });

  it("covers all nine taxonomy categories", () => {
    const used = new Set(ERROR_CODES.map((c) => ERROR_CATALOG[c].category));
    for (const category of VALID_CATEGORIES) {
      expect(used.has(category)).toBe(true);
    }
  });
});

describe("non-disclosing messages", () => {
  it("uses an identical message for the uniform authentication failure", () => {
    // R3.3/R3.8: must not reveal which credential was wrong or if an account exists.
    expect(ERROR_CATALOG.AUTHENTICATION_FAILED.message).toBe(
      "Authentication failed."
    );
    expect(ERROR_CATALOG.REGISTRATION_FAILED.message).not.toMatch(/email|exist/i);
  });

  it("does not leak internals in any message", () => {
    for (const code of ERROR_CODES) {
      const message = ERROR_CATALOG[code].message;
      expect(message).not.toMatch(/password|stack|sql|token value/i);
    }
  });
});

describe("isErrorCode", () => {
  it("recognizes known codes and rejects unknown values", () => {
    expect(isErrorCode("VALIDATION_FAILED")).toBe(true);
    expect(isErrorCode("NOPE")).toBe(false);
    expect(isErrorCode(42)).toBe(false);
    expect(isErrorCode(undefined)).toBe(false);
  });
});

describe("getErrorDefinition", () => {
  it("returns the catalog entry for a code", () => {
    expect(getErrorDefinition("RATE_LIMITED")).toBe(ERROR_CATALOG.RATE_LIMITED);
  });
});

describe("AppError", () => {
  it("carries code, category, status, and catalog message", () => {
    const err = new AppError("AUTHORIZATION_DENIED");
    expect(err).toBeInstanceOf(Error);
    expect(err.code).toBe("AUTHORIZATION_DENIED");
    expect(err.category).toBe("authorization");
    expect(err.status).toBe(403);
    expect(err.message).toBe(ERROR_CATALOG.AUTHORIZATION_DENIED.message);
  });

  it("serializes to an ErrorDto without exposing the cause", () => {
    const secret = new Error("db password=hunter2");
    const err = new AppError("STORAGE_ERROR", { cause: secret });
    const dto = err.toDto();
    expect(dto).toEqual({
      code: "STORAGE_ERROR",
      category: "capability_unavailable",
      status: 502,
      message: ERROR_CATALOG.STORAGE_ERROR.message,
    });
    expect(JSON.stringify(dto)).not.toContain("hunter2");
  });

  it("includes details and retryAfterSeconds when provided", () => {
    const dto = new AppError("RATE_LIMITED", {
      retryAfterSeconds: 30,
      details: { field: "requests" },
    }).toDto();
    expect(dto.retryAfterSeconds).toBe(30);
    expect(dto.details).toEqual({ field: "requests" });
  });
});

describe("toErrorDto", () => {
  it("builds a DTO directly from a code", () => {
    expect(toErrorDto("NOT_FOUND")).toEqual({
      code: "NOT_FOUND",
      category: "not_found",
      status: 404,
      message: ERROR_CATALOG.NOT_FOUND.message,
    });
  });
});
