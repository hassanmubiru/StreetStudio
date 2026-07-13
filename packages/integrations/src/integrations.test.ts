import { describe, it, expect } from "vitest";
import { AppError } from "@streetstudio/shared";
import {
  IntegrationRegistry,
  BUILT_IN_INTEGRATIONS,
  type IntegrationPlugin,
} from "./integrations.js";

/** Build a minimal integration plugin for tests. */
function integration(id: string, category: IntegrationPlugin["integration"]["category"]): IntegrationPlugin {
  return {
    id,
    type: "integration",
    integration: { provider: id.split(".").pop() ?? id, category },
    activate: () => [],
    deactivate: () => {},
  };
}

describe("IntegrationRegistry", () => {
  it("registers and looks up integration plugins", () => {
    const reg = new IntegrationRegistry();
    reg.register(integration("streetstudio.integration.slack", "chat"));
    expect(reg.has("streetstudio.integration.slack")).toBe(true);
    expect(reg.get("streetstudio.integration.slack")?.integration.provider).toBe("slack");
    expect(reg.list()).toHaveLength(1);
  });

  it("rejects duplicate ids with CONFLICT", () => {
    const reg = new IntegrationRegistry();
    reg.register(integration("dup", "chat"));
    const err = (() => {
      try {
        reg.register(integration("dup", "chat"));
        return undefined;
      } catch (e) {
        return e;
      }
    })();
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).code).toBe("CONFLICT");
  });

  it("rejects a non-integration plugin with VALIDATION_FAILED", () => {
    const reg = new IntegrationRegistry();
    const bogus = { id: "x", type: "storage", integration: { provider: "x", category: "chat" }, activate: () => [], deactivate: () => {} } as unknown as IntegrationPlugin;
    expect(() => reg.register(bogus)).toThrow(AppError);
  });

  it("groups by category and returns sorted ids", () => {
    const reg = new IntegrationRegistry();
    reg.register(integration("streetstudio.integration.github", "issue_tracker"));
    reg.register(integration("streetstudio.integration.slack", "chat"));
    reg.register(integration("streetstudio.integration.jira", "issue_tracker"));

    expect(reg.byCategory("issue_tracker").map((p) => p.id)).toEqual([
      "streetstudio.integration.github",
      "streetstudio.integration.jira",
    ]);
    expect(reg.ids()).toEqual([
      "streetstudio.integration.github",
      "streetstudio.integration.jira",
      "streetstudio.integration.slack",
    ]);
  });
});

describe("BUILT_IN_INTEGRATIONS catalog", () => {
  it("lists the eight first-party integrations with unique ids", () => {
    expect(BUILT_IN_INTEGRATIONS).toHaveLength(8);
    const ids = new Set(BUILT_IN_INTEGRATIONS.map((i) => i.id));
    expect(ids.size).toBe(8);
    for (const entry of BUILT_IN_INTEGRATIONS) {
      expect(entry.id.startsWith("streetstudio.integration.")).toBe(true);
    }
  });

  it("can seed a registry", () => {
    const reg = new IntegrationRegistry();
    for (const entry of BUILT_IN_INTEGRATIONS) {
      reg.register({
        id: entry.id,
        type: "integration",
        integration: { provider: entry.provider, category: entry.category },
        activate: () => [],
        deactivate: () => {},
      });
    }
    expect(reg.list()).toHaveLength(8);
    expect(reg.byCategory("chat").length).toBe(3);
  });
});
