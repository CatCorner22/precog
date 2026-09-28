import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * The app's text says what it means: "must" for a requirement, "may" for a
 * choice, "if" for a condition, "we recommend" for a recommendation. "Should"
 * can be read as any of them, so no text a user sees contains it. This reads
 * every string and JSX text in the app (never comments, never tests).
 *
 * The exempt strings never reach a screen.
 */
const EXEMPT: Record<string, string> = {
  "src/lib/precog/builder/review-server.ts": "the instructions sent to Grok",
  "src/lib/precog/llm/tools.ts": "tool descriptions written for Grok",
  "src/lib/precog/rag/retrieve.ts": "the list of words search ignores",
};

const ROOT = join(__dirname, "../../..");
const SHOULD = /\bshould(?:n't)?\b/i;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) && !name.endsWith(".gen.ts")
      ? [path]
      : [];
  });
}

function textsWithShould(path: string): string[] {
  const file = ts.createSourceFile(
    path,
    readFileSync(path, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const found: string[] = [];
  const visit = (node: ts.Node) => {
    const text =
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isJsxText(node) ||
      ts.isTemplateHead(node) ||
      ts.isTemplateMiddle(node) ||
      ts.isTemplateTail(node)
        ? node.text
        : null;
    if (text && SHOULD.test(text)) {
      const { line } = file.getLineAndCharacterOfPosition(node.getStart());
      found.push(`${relative(ROOT, path)}:${line + 1}: ${text.trim().slice(0, 80)}`);
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return found;
}

describe("the app's own words", () => {
  it('never say "should" where a user can read it', () => {
    const offenders = sourceFiles(join(ROOT, "src"))
      .filter((path) => !(relative(ROOT, path) in EXEMPT))
      .flatMap(textsWithShould);
    expect(offenders).toEqual([]);
  });

  it("keeps each exemption to a file that exists", () => {
    for (const path of Object.keys(EXEMPT)) expect(statSync(join(ROOT, path)).isFile()).toBe(true);
  });
});
