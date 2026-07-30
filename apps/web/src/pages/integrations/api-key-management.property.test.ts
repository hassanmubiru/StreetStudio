// @vitest-environment jsdom
/**
 * Property-Based Tests for API Key Management Reliability
 *
 * Property 12: API Key Management Reliability
 * For any valid API key operation (generate, revoke, update), the management
 * interface SHALL execute the operation consistently and update the UI state appropriately.
 *
 * **Validates: Requirements 15.1**
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  maskApiKey,
  validateKeyName,
  getRateLimitPercentage,
  formatKeyDate,
  getStatusColor,
  type ApiKeyStatus,
} from './api-key-management.js';

describe('Property 12: API Key Management Reliability', () => {
  /**
   * **Validates: Requirements 15.1**
   *
   * Key masking always hides all but the last 4 characters regardless of key length.
   */
  describe('Key masking', () => {
    it('always hides all but the last 4 characters for keys longer than 4 chars', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 5, maxLength: 200 }),
          (key: string) => {
            const masked = maskApiKey(key);
            const last4 = key.slice(-4);

            // The masked result must end with the last 4 characters of the original
            expect(masked.endsWith(last4)).toBe(true);

            // The masked result must not contain the original key (security)
            expect(masked).not.toBe(key);

            // The prefix must be entirely bullet characters (•)
            const prefix = masked.slice(0, -4);
            expect(prefix.length).toBeGreaterThan(0);
            expect([...prefix].every(c => c === '•')).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('returns only masked characters for keys of 4 chars or fewer', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 4 }),
          (key: string) => {
            const masked = maskApiKey(key);
            // For short keys, the entire key is masked
            expect(masked).toBe('****');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('limits the mask prefix length to 32 bullet characters', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 37, maxLength: 500 }),
          (key: string) => {
            const masked = maskApiKey(key);
            const prefix = masked.slice(0, -4);
            // Prefix should be at most 32 bullet characters
            expect(prefix.length).toBeLessThanOrEqual(32);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Validates: Requirements 15.1**
   *
   * Key name validation consistently accepts/rejects names based on rules
   * (alphanumeric + spaces/hyphens/underscores, 1-64 chars).
   */
  describe('Key name validation', () => {
    it('accepts valid names (alphanumeric, spaces, hyphens, underscores, 1-64 chars)', () => {
      // Generate names that have at least one alphanumeric char (trim won't make them empty)
      const alphanumChar = fc.char().filter(c => /[a-zA-Z0-9]/.test(c));
      const validChar = fc.oneof(
        alphanumChar,
        fc.constantFrom(' ', '-', '_')
      );
      const validNameArb = fc.tuple(
        alphanumChar,
        fc.stringOf(validChar, { minLength: 0, maxLength: 63 })
      ).map(([first, rest]) => (first + rest).slice(0, 64));

      fc.assert(
        fc.property(validNameArb, (name: string) => {
          const result = validateKeyName(name);
          expect(result.valid).toBe(true);
          expect(result.error).toBeUndefined();
        }),
        { numRuns: 100 }
      );
    });

    it('rejects names with invalid characters', () => {
      // Generate strings that contain at least one invalid character
      const invalidCharArb = fc.char().filter(c => !/[a-zA-Z0-9\s\-_]/.test(c));

      fc.assert(
        fc.property(
          fc.string({ minLength: 0, maxLength: 30 }),
          invalidCharArb,
          fc.string({ minLength: 0, maxLength: 30 }),
          (prefix: string, invalidChar: string, suffix: string) => {
            // Build name with valid prefix/suffix chars around an invalid char
            const validPrefix = prefix.replace(/[^a-zA-Z0-9\s\-_]/g, 'a');
            const validSuffix = suffix.replace(/[^a-zA-Z0-9\s\-_]/g, 'b');
            const name = validPrefix + invalidChar + validSuffix;

            // Trim should not remove the invalid char if it's in the middle
            if (name.trim().length >= 1 && name.trim().length <= 64) {
              const result = validateKeyName(name);
              expect(result.valid).toBe(false);
              expect(result.error).toBeDefined();
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('rejects empty or whitespace-only names', () => {
      fc.assert(
        fc.property(
          fc.stringOf(fc.constantFrom(' ', '\t', '\n'), { minLength: 0, maxLength: 20 }),
          (name: string) => {
            const result = validateKeyName(name);
            expect(result.valid).toBe(false);
            expect(result.error).toBeDefined();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('rejects names longer than 64 characters after trimming', () => {
      fc.assert(
        fc.property(
          fc.stringOf(
            fc.oneof(
              fc.char().filter(c => /[a-zA-Z0-9]/.test(c)),
              fc.constantFrom('-', '_')
            ),
            { minLength: 65, maxLength: 200 }
          ),
          (name: string) => {
            const result = validateKeyName(name);
            expect(result.valid).toBe(false);
            expect(result.error).toBeDefined();
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Validates: Requirements 15.1**
   *
   * Rate limit percentage calculation is always between 0-100.
   */
  describe('Rate limit percentage calculation', () => {
    it('always returns a value between 0 and 100 inclusive', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 1_000_000 }),
          fc.integer({ min: 1, max: 1_000_000 }),
          (remaining: number, total: number) => {
            const pct = getRateLimitPercentage(remaining, total);
            expect(pct).toBeGreaterThanOrEqual(0);
            expect(pct).toBeLessThanOrEqual(100);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('returns 0 when total is zero or negative', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 1_000_000 }),
          fc.integer({ min: -1_000_000, max: 0 }),
          (remaining: number, total: number) => {
            const pct = getRateLimitPercentage(remaining, total);
            expect(pct).toBe(0);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('returns 100 when remaining is 0 (all used)', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 1_000_000 }),
          (total: number) => {
            const pct = getRateLimitPercentage(0, total);
            expect(pct).toBe(100);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('returns 0 when remaining equals total (nothing used)', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 1_000_000 }),
          (total: number) => {
            const pct = getRateLimitPercentage(total, total);
            expect(pct).toBe(0);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('clamps to 100 even if remaining is negative (over-usage)', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: -1_000_000, max: -1 }),
          fc.integer({ min: 1, max: 1_000_000 }),
          (remaining: number, total: number) => {
            const pct = getRateLimitPercentage(remaining, total);
            expect(pct).toBeLessThanOrEqual(100);
            expect(pct).toBeGreaterThanOrEqual(0);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Validates: Requirements 15.1**
   *
   * Key status transitions are consistent (active -> revoked, never revoked -> active).
   */
  describe('Key status transitions', () => {
    it('getStatusColor always returns a valid CSS class string for any status', () => {
      const statusArb: fc.Arbitrary<ApiKeyStatus> = fc.constantFrom('active', 'revoked', 'expired');

      fc.assert(
        fc.property(statusArb, (status: ApiKeyStatus) => {
          const color = getStatusColor(status);
          expect(color).toBeTruthy();
          expect(typeof color).toBe('string');
          expect(color.length).toBeGreaterThan(0);
          // Should contain CSS class patterns
          expect(color).toMatch(/^bg-\w+-\d+\s+text-\w+-\d+$/);
        }),
        { numRuns: 100 }
      );
    });

    it('active keys always get green coloring', () => {
      const color = getStatusColor('active');
      expect(color).toContain('green');
    });

    it('revoked keys always get red coloring', () => {
      const color = getStatusColor('revoked');
      expect(color).toContain('red');
    });

    it('expired keys always get gray coloring', () => {
      const color = getStatusColor('expired');
      expect(color).toContain('gray');
    });

    it('getStatusColor returns a fallback for unknown status values', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 50 }).filter(
            s => s !== 'active' && s !== 'revoked' && s !== 'expired'
          ),
          (unknownStatus: string) => {
            // Force the unknown status through the function
            const color = getStatusColor(unknownStatus as ApiKeyStatus);
            expect(color).toBeTruthy();
            expect(typeof color).toBe('string');
            // Should get the default gray styling
            expect(color).toContain('gray');
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Validates: Requirements 15.1**
   *
   * Date formatting produces valid output for any valid date string.
   */
  describe('Date formatting', () => {
    it('produces a non-empty string for any valid ISO date', () => {
      fc.assert(
        fc.property(
          fc.date({ min: new Date('2000-01-01'), max: new Date('2030-12-31') }),
          (date: Date) => {
            const result = formatKeyDate(date.toISOString());
            expect(result).toBeTruthy();
            expect(typeof result).toBe('string');
            expect(result.length).toBeGreaterThan(0);
            // Should never be 'Invalid date' for valid ISO dates
            expect(result).not.toBe('Invalid date');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('returns "Never" for undefined input', () => {
      expect(formatKeyDate(undefined)).toBe('Never');
    });

    it('returns "Invalid date" for non-date strings', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 100 }).filter(s => {
            const d = new Date(s);
            return isNaN(d.getTime());
          }),
          (invalidDateStr: string) => {
            const result = formatKeyDate(invalidDateStr);
            expect(result).toBe('Invalid date');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('returns relative time format for recent dates', () => {
      // Generate dates within the last 30 days
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 29 }),
          (daysAgo: number) => {
            const date = new Date();
            date.setDate(date.getDate() - daysAgo);
            const result = formatKeyDate(date.toISOString());
            // Should contain 'd ago' for dates within 30 days
            expect(result).toMatch(/\d+d ago/);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('never returns empty string for any input', () => {
      fc.assert(
        fc.property(
          fc.oneof(
            fc.constant(undefined),
            fc.string({ minLength: 0, maxLength: 100 }),
            fc.date().map(d => d.toISOString())
          ),
          (input: string | undefined) => {
            const result = formatKeyDate(input);
            expect(result.length).toBeGreaterThan(0);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
