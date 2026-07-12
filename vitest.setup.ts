import * as fc from "fast-check";

// Property-based tests run a minimum of 100 iterations across the monorepo.
fc.configureGlobal({ numRuns: 100 });
