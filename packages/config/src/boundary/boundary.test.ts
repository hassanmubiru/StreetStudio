import { describe, it, expect } from "vitest";
import { extractImports } from "./imports.js";
import { classifyImport, defaultBoundaryConfig, packageNameOf, subpathOf } from "./rules.js";
import { analyzeFiles, type SourceFile } from "./analyzer.js";
import { BoundaryErrorCode, type PackageInfo } from "./types.js";

const ROOT = "/repo";

const corePkg: PackageInfo = {
  name: "@streetstudio/media",
  dir: "/repo/packages/media",
  entryPoints: [],
  isCore: true,
};
const otherPkg: PackageInfo = {
  name: "@streetstudio/auth",
  dir: "/repo/packages/auth",
  entryPoints: [],
  isCore: true,
};
const pkgWithSubEntry: PackageInfo = {
  name: "@streetstudio/ui",
  dir: "/repo/packages/ui",
  entryPoints: ["components"],
  isCore: true,
};
const aiPlugin: PackageInfo = {
  name: "@streetstudio/ai-openai",
  dir: "/repo/packages/plugins/ai-openai",
  entryPoints: [],
  isCore: false,
};

const packages = [corePkg, otherPkg, pkgWithSubEntry, aiPlugin];
const packagesByName = new Map(packages.map((p) => [p.name, p]));
const config = defaultBoundaryConfig(ROOT);

function classify(specifier: string, importingPackage: PackageInfo, file: string) {
  return classifyImport(
    { specifier, line: 1, kind: "import" },
    { importingFile: file, importingPackage, packagesByName, config }
  );
}

describe("extractImports", () => {
  it("captures static, side-effect, dynamic, export-from, and require specifiers", () => {
    const src = [
      `import a from "@streetstudio/shared";`,
      `import { b } from '@streetstudio/auth';`,
      `import "./side-effect.js";`,
      `export { c } from "@streetstudio/media";`,
      `const d = await import("@streetjs/core");`,
      `const e = require("node:path");`,
    ].join("\n");
    const specs = extractImports(src).map((r) => r.specifier).sort();
    expect(specs).toEqual(
      [
        "@streetstudio/shared",
        "@streetstudio/auth",
        "./side-effect.js",
        "@streetstudio/media",
        "@streetjs/core",
        "node:path",
      ].sort()
    );
  });

  it("ignores specifiers inside comments", () => {
    const src = [
      `// import x from "@should/ignore";`,
      `/* import y from "@also/ignore"; */`,
      `import real from "@streetstudio/shared";`,
    ].join("\n");
    const specs = extractImports(src).map((r) => r.specifier);
    expect(specs).toEqual(["@streetstudio/shared"]);
  });

  it("reports accurate line numbers", () => {
    const src = `\n\nimport a from "@streetstudio/shared";`;
    expect(extractImports(src)[0]?.line).toBe(3);
  });

  it("handles multi-line import statements", () => {
    const src = `import {\n  a,\n  b\n} from "@streetstudio/auth";`;
    const refs = extractImports(src);
    expect(refs.map((r) => r.specifier)).toEqual(["@streetstudio/auth"]);
  });
});

describe("packageNameOf / subpathOf", () => {
  it("parses scoped and unscoped specifiers", () => {
    expect(packageNameOf("@streetjs/core")).toBe("@streetjs/core");
    expect(packageNameOf("@streetjs/core/internal/x")).toBe("@streetjs/core");
    expect(packageNameOf("lodash")).toBe("lodash");
    expect(packageNameOf("lodash/fp")).toBe("lodash");
    expect(subpathOf("@streetjs/core", "@streetjs/core")).toBe("");
    expect(subpathOf("@streetjs/core/internal/x", "@streetjs/core")).toBe("internal/x");
  });
});

describe("StreetJS boundary", () => {
  it("allows the bare public entry point", () => {
    expect(classify("@streetjs/core", corePkg, "/repo/packages/media/src/a.ts")).toBeNull();
  });

  it("rejects deep imports into StreetJS internals", () => {
    const v = classify("@streetjs/core/dist/internal/router", corePkg, "/repo/packages/media/src/a.ts");
    expect(v?.code).toBe(BoundaryErrorCode.DISALLOWED_STREETJS_IMPORT);
  });

  it("rejects any @streetjs/* subpath even for unlisted packages", () => {
    const v = classify("@streetjs/queue/src/worker", corePkg, "/repo/packages/media/src/a.ts");
    expect(v?.code).toBe(BoundaryErrorCode.DISALLOWED_STREETJS_IMPORT);
  });

  it("rejects relative imports resolving into the StreetJS repo on disk", () => {
    // /repo/packages/media/src/a.ts + ../../../../StreetJS/src/x => /StreetJS/src/x
    const v = classify("../../../../StreetJS/src/router", corePkg, "/repo/packages/media/src/a.ts");
    expect(v?.code).toBe(BoundaryErrorCode.DISALLOWED_STREETJS_IMPORT);
  });
});

describe("package boundary", () => {
  it("allows importing another package via its bare entry point", () => {
    expect(classify("@streetstudio/auth", corePkg, "/repo/packages/media/src/a.ts")).toBeNull();
  });

  it("rejects deep imports into another package's internals", () => {
    const v = classify("@streetstudio/auth/src/secret", corePkg, "/repo/packages/media/src/a.ts");
    expect(v?.code).toBe(BoundaryErrorCode.DISALLOWED_INTERNAL_IMPORT);
  });

  it("allows a declared non-root entry point", () => {
    expect(classify("@streetstudio/ui/components", corePkg, "/repo/packages/media/src/a.ts")).toBeNull();
  });

  it("rejects an undeclared subpath even when another subpath is declared", () => {
    const v = classify("@streetstudio/ui/internal", corePkg, "/repo/packages/media/src/a.ts");
    expect(v?.code).toBe(BoundaryErrorCode.DISALLOWED_INTERNAL_IMPORT);
  });

  it("allows relative imports within the same package", () => {
    expect(classify("./helpers/x.js", corePkg, "/repo/packages/media/src/a.ts")).toBeNull();
  });

  it("rejects relative imports that escape into another package's internals", () => {
    const v = classify("../../auth/src/secret.js", corePkg, "/repo/packages/media/src/a.ts");
    expect(v?.code).toBe(BoundaryErrorCode.DISALLOWED_INTERNAL_IMPORT);
  });
});

describe("AI/billing vendor boundary", () => {
  it("rejects an AI vendor import in core code", () => {
    const v = classify("openai", corePkg, "/repo/packages/media/src/a.ts");
    expect(v?.code).toBe(BoundaryErrorCode.DISALLOWED_AI_VENDOR);
  });

  it("rejects a billing vendor import in core code", () => {
    const v = classify("stripe", corePkg, "/repo/packages/media/src/a.ts");
    expect(v?.code).toBe(BoundaryErrorCode.DISALLOWED_AI_VENDOR);
  });

  it("rejects a scoped vendor subpath in core code", () => {
    const v = classify("@anthropic-ai/sdk", corePkg, "/repo/packages/media/src/a.ts");
    expect(v?.code).toBe(BoundaryErrorCode.DISALLOWED_AI_VENDOR);
  });

  it("permits a vendor import inside an AI/billing plugin package", () => {
    expect(classify("openai", aiPlugin, "/repo/packages/plugins/ai-openai/src/a.ts")).toBeNull();
  });

  it("permits unrelated third-party dependencies in core", () => {
    expect(classify("zod", corePkg, "/repo/packages/media/src/a.ts")).toBeNull();
  });
});

describe("analyzeFiles", () => {
  it("collects violations across files and skips unknown files", () => {
    const files: SourceFile[] = [
      {
        path: "/repo/packages/media/src/clean.ts",
        content: `import { x } from "@streetstudio/auth";`,
      },
      {
        path: "/repo/packages/media/src/bad.ts",
        content: [
          `import a from "@streetjs/core/internal/x";`,
          `import b from "openai";`,
        ].join("\n"),
      },
      {
        // Not inside any known package — should be skipped.
        path: "/elsewhere/orphan.ts",
        content: `import a from "@streetjs/core/internal/x";`,
      },
    ];
    const result = analyzeFiles(files, packages, config);
    expect(result.filesScanned).toBe(2);
    const codes = result.violations.map((v) => v.code).sort();
    expect(codes).toEqual(
      [BoundaryErrorCode.DISALLOWED_STREETJS_IMPORT, BoundaryErrorCode.DISALLOWED_AI_VENDOR].sort()
    );
  });

  it("returns no violations for compliant files", () => {
    const files: SourceFile[] = [
      {
        path: "/repo/packages/media/src/ok.ts",
        content: [
          `import { a } from "@streetstudio/auth";`,
          `import { b } from "@streetjs/core";`,
          `import "./local.js";`,
        ].join("\n"),
      },
    ];
    expect(analyzeFiles(files, packages, config).violations).toEqual([]);
  });
});
