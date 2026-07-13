# scripts/

Repository automation and developer helper scripts.

| Script      | Purpose                                                                 |
| ----------- | ----------------------------------------------------------------------- |
| `check.sh`  | Full local verification gate (build → graph:check → boundary:check → tests). Mirrors CI. |

## Conventions

- Scripts are POSIX/bash and resolve the repo root from their own location, so
  they can be run from any directory.
- Prefer adding thin wrappers here over duplicating logic; the underlying work
  lives in `package.json` scripts and the `packages/config` tooling.
- Anything wired into CI (`.github/workflows/ci.yml`) should also be runnable
  locally from here.
