# Examples

Runnable, copy-pasteable examples for building on StreetStudio. These illustrate
the public surfaces only — the REST/WebSocket API and the `@streetstudio/sdk`
client — never internal packages.

| Example                                  | What it shows                                              |
| ---------------------------------------- | ---------------------------------------------------------- |
| [`sdk-quickstart.md`](sdk-quickstart.md) | End-to-end journey via `@streetstudio/sdk`: register → org → project → upload → playback → comment → share → search → realtime |
| [`self-hosting.md`](self-hosting.md)     | Running StreetStudio locally with Docker Compose            |

## Conventions

- Examples target the **public API/SDK** exclusively (Requirement 20 parity), so
  anything shown here is reachable by any external integrator.
- Code blocks use TypeScript and the real `@streetstudio/sdk` client surface
  (`StreetStudioClient`). They are illustrative snippets, not part of the
  workspace build.
- Errors follow the shared taxonomy (`ErrorDto` / `AppError`); see
  [`../docs/API.md`](../docs/API.md) for the full error catalog.
