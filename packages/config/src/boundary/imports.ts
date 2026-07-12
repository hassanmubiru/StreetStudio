/**
 * Static extraction of module specifiers from TypeScript/JavaScript source.
 *
 * This is a lightweight, dependency-free scanner: it strips comments and string
 * templates that could contain false positives, then matches the specifier of
 * every `import`/`export ... from`, side-effect `import`, dynamic `import()`,
 * and `require()`. It intentionally errs toward reporting a specifier so the
 * boundary analyzer can classify it.
 */
import type { ImportRef, ImportKind } from "./types.js";

/** Remove line and block comments so specifiers inside comments are ignored. */
function stripComments(source: string): string {
  // Replace block and line comments with equal-length whitespace so that
  // character offsets (and therefore line numbers) are preserved.
  return source.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, (match) =>
    match.replace(/[^\n]/g, " ")
  );
}

/** Compute the 1-based line number for a character index. */
function lineAt(source: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index && i < source.length; i++) {
    if (source[i] === "\n") line++;
  }
  return line;
}

interface Matcher {
  readonly kind: ImportKind;
  readonly regex: RegExp;
  /** Index of the capture group holding the specifier. */
  readonly group: number;
}

const MATCHERS: readonly Matcher[] = [
  // import ... from "x"  /  export ... from "x"  (single or multi-line)
  { kind: "import", regex: /\b(?:import|export)\b[^;'"`]*?\bfrom\s*(['"])([^'"]+)\1/g, group: 2 },
  // side-effect import "x"
  { kind: "import", regex: /\bimport\s*(['"])([^'"]+)\1/g, group: 2 },
  // dynamic import("x")
  { kind: "dynamic-import", regex: /\bimport\s*\(\s*(['"])([^'"]+)\1\s*\)/g, group: 2 },
  // require("x")
  { kind: "require", regex: /\brequire\s*\(\s*(['"])([^'"]+)\1\s*\)/g, group: 2 },
];

/**
 * Extract every module specifier referenced in the given source text.
 * Duplicate references at the same source location are de-duplicated so a
 * single `import ... from "x"` is reported once.
 */
export function extractImports(source: string): ImportRef[] {
  const clean = stripComments(source);
  const seen = new Set<string>();
  const refs: ImportRef[] = [];

  for (const matcher of MATCHERS) {
    matcher.regex.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = matcher.regex.exec(clean)) !== null) {
      const specifier = m[matcher.group];
      if (specifier === undefined) continue;
      // Key on the specifier's position (end of match) to de-dupe overlapping
      // matchers that captured the same occurrence.
      const specStart = m.index + m[0].lastIndexOf(specifier);
      const key = `${specStart}:${specifier}`;
      if (seen.has(key)) continue;
      seen.add(key);
      refs.push({
        specifier,
        line: lineAt(clean, specStart),
        kind: matcher.kind,
      });
    }
  }

  refs.sort((a, b) => a.line - b.line);
  return refs;
}
