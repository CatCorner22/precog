import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { TERMS, type Term } from "./terms";

const ROOT = fileURLToPath(new URL("../../..", import.meta.url));
const SCANNED = ["src/components", "src/routes"];

/**
 * Where a retired name may stay. Each entry says why; keep the list short and
 * remove an entry once its reason is gone.
 */
const EXCLUDED_FILES: Record<string, string> = {
  // Legal text changes in the owner's own legal pull request, not in a lint.
  "src/routes/privacy.tsx": "legal text, owner's legal PR",
  "src/routes/terms.tsx": "legal text, owner's legal PR",
  // Reads files saved before the rename, so it names the old wording on
  // purpose. It sits outside the scanned folders; it is listed so that
  // widening the scan does not flag it.
  "src/lib/precog/sod/model-io.ts": "legacy saved-file check",
};

/**
 * Declarations whose strings are printed on the locked report layouts 1 and
 * 2. A locked report reads the same today as when it was printed, so these
 * keep the wording of their day. DECISION_KIND_LABEL_PRINTED_V1 lives in
 * src/lib/precog/practice-profile.ts, outside the scanned folders; it is
 * listed so that widening the scan, or moving it, does not flag it.
 */
const EXCLUDED_DECLARATIONS = new Set(["DECISION_KIND_LABEL_PRINTED_V1"]);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(entry.name) && !/\.test\./.test(entry.name) ? [path] : [];
  });
}

/**
 * The text a file can put on screen: its string literals, template pieces
 * and JSX text, without comments, with runs of whitespace closed up so JSX
 * text that wraps across lines still matches.
 */
function visibleStrings(path: string): string[] {
  const source = ts.createSourceFile(
    path,
    readFileSync(path, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const out: string[] = [];
  const visit = (node: ts.Node): void => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      EXCLUDED_DECLARATIONS.has(node.name.text)
    ) {
      return;
    }
    if (
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isTemplateHead(node) ||
      ts.isTemplateMiddle(node) ||
      ts.isTemplateTail(node)
    ) {
      out.push(node.text.replace(/\s+/g, " "));
    } else if (ts.isJsxText(node)) {
      out.push(node.text.replace(/\s+/g, " "));
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return out;
}

const RETIRED = Object.entries(TERMS as Record<string, Term>).flatMap(([id, term]) =>
  term.retired.map((name) => ({ id, name, now: term.plain })),
);

describe("retired names stay off the screens", () => {
  it("has retired names to look for", () => {
    expect(RETIRED.length).toBeGreaterThan(0);
  });

  it("lists only exclusions that still exist", () => {
    for (const file of Object.keys(EXCLUDED_FILES)) {
      expect(existsSync(join(ROOT, file)), file).toBe(true);
    }
    const profile = readFileSync(join(ROOT, "src/lib/precog/practice-profile.ts"), "utf8");
    for (const name of EXCLUDED_DECLARATIONS) expect(profile).toContain(`const ${name}`);
  });

  const files = SCANNED.flatMap((dir) => sourceFiles(join(ROOT, dir)))
    .map((path) => ({ path, file: relative(ROOT, path).split("\\").join("/") }))
    .filter(({ file }) => !(file in EXCLUDED_FILES));

  it.each(RETIRED)("no screen says $name (now $now)", ({ name }) => {
    const found = files.flatMap(({ path, file }) =>
      visibleStrings(path)
        .filter((text) => text.includes(name))
        .map((text) => `${file}: ${text.trim().slice(0, 120)}`),
    );
    expect(found).toEqual([]);
  });

  it("reads JSX text and strings, not comments", () => {
    const sample = join(ROOT, "src/components/precog/monthly-review.tsx");
    const strings = visibleStrings(sample).join(" ");
    // The file's doc comment says "The monthly checks"; the scan does not see it.
    expect(readFileSync(sample, "utf8")).toContain("The monthly checks");
    expect(strings).not.toContain("The monthly checks");
  });
});
