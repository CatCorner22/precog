import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { PRIORITY_BAND_LABEL, PRIORITY_BAND_LABEL_PRINTED_V4, RISK_SCALE } from "./bands";
import { bandForScore } from "./weights";

/**
 * Every band cutoff lives in scoring/bands.ts, so the same figure can never
 * be "weak" on one screen and "adequate" on another. This scan fails when a
 * cutoff is written anywhere else in src, in either of the two shapes one
 * takes:
 *
 * - a named table of numbers, `const SOME_BANDS = { hot: 70, warm: 45 }`
 *   (a name ending in BAND(S), SCALE, CUTOFF(S) or THRESHOLD(S));
 * - a chain that compares one value with two numbers in a row, for example
 *   `x >= 70 ? "ok" : x >= 40 ? "warn" : "danger"` or two `if (x >= 85)`
 *   lines in a row.
 *
 * Read the cutoff from bands.ts instead (HEALTH_SCALE, RISK_SCALE,
 * PRIORITY_SCALE, or a helper there such as healthTone or riskTone).
 */

const SRC = join(__dirname, "../../..");
const BANDS_FILE = "src/lib/precog/scoring/bands.ts";

/**
 * Files allowed to keep a cutoff for now, each with its reason. Keep this
 * short: an entry is a scale bands.ts does not list yet.
 */
const KNOWN: Record<string, string> = {
  // The pressure-index bands, computed but read by no screen; the one scale
  // bands.ts does not list.
  "src/lib/precog/ml/leading-indicators.ts": "PRESSURE_BANDS",
};

const TABLE = /\b[A-Z][A-Z0-9_]*(?:BANDS?|SCALE|CUTOFFS?|THRESHOLDS?)\s*=\s*\{[^}]*\b\d+\s*[,}]/g;
// A cutoff on a 0–100 figure has two digits; a count compared with 0 or 2 is not one.
const CHAIN = /([\w.]+)\s*>=\s*\d{2}\s*\?[^;]*?\1\s*>=\s*\d{2}\s*\?/gs;
const IF_CHAIN = /if \(([\w.]+)\s*>=\s*\d{2}\)[^\n]*\n\s*if \(\1\s*>=\s*\d{2}\)/g;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(entry.name) && !/\.test\.|\.gen\./.test(entry.name) ? [path] : [];
  });
}

/** `file:line: text` for every cutoff written outside bands.ts. */
export function cutoffsOutsideBands(files: { path: string; text: string }[]): string[] {
  const found: string[] = [];
  for (const { path, text } of files) {
    if (path === BANDS_FILE || KNOWN[path]) continue;
    for (const re of [TABLE, CHAIN, IF_CHAIN]) {
      for (const m of text.matchAll(re)) {
        const line = text.slice(0, m.index).split("\n").length;
        found.push(`${path}:${line}: ${m[0].replace(/\s+/g, " ").slice(0, 80)}`);
      }
    }
  }
  return found;
}

/**
 * Files that may still put an urgency word next to a residual count, each
 * with its reason. Keep this short.
 */
const RESIDUAL_URGENCY_KNOWN: Record<string, string> = {
  // Report layouts 1 to 5 print the words they printed when a version was locked.
  "src/components/precog/control-report.tsx": "locked report layouts",
};

const URGENCY = /\b(?:fix first|fix soon|worth doing)\b/i;
// A residual count or average (portfolioSummary's fields), or an urgency word named as a band.
const RESIDUAL_COUNT = /\b(?:criticalPath|actNow|mitigate|averageResidual)\b/;
const URGENCY_BAND = /\b(?:fix first|fix soon|worth doing)\W{0,2}\s+band\b/i;

/**
 * `file:line: text` for every line that names a residual count in the
 * priority list's urgency words ("Fix first", "Fix soon", "Worth doing").
 * The residual bands read Severe, High, Moderate and Low (RESIDUAL_BAND_LABEL).
 */
export function residualUrgencyWords(files: { path: string; text: string }[]): string[] {
  const found: string[] = [];
  for (const { path, text } of files) {
    if (RESIDUAL_URGENCY_KNOWN[path]) continue;
    text.split("\n").forEach((line, i) => {
      if (URGENCY.test(line) && (RESIDUAL_COUNT.test(line) || URGENCY_BAND.test(line))) {
        found.push(`${path}:${i + 1}: ${line.trim().slice(0, 80)}`);
      }
    });
  }
  return found;
}

describe("band cutoffs", () => {
  it("are written only in scoring/bands.ts", () => {
    const root = join(SRC, "..");
    const files = sourceFiles(SRC).map((path) => ({
      path: relative(root, path).split("\\").join("/"),
      text: readFileSync(path, "utf8"),
    }));
    expect(files.length).toBeGreaterThan(100);
    expect(cutoffsOutsideBands(files)).toEqual([]);
  });

  it("name the residual bands by risk left, and keep the urgency words for the priority list", () => {
    // "Fix first" has one meaning: the priority list's top band. The residual
    // index, on its own cutoffs, reads Severe, High, Moderate and Low.
    const residual = [RISK_SCALE.critical, RISK_SCALE.actNow, RISK_SCALE.mitigate, 0].map(
      (s) => bandForScore(s).label,
    );
    expect(residual).toEqual(["Severe", "High", "Moderate", "Low"]);
    const priority = [
      PRIORITY_BAND_LABEL.white_hot,
      PRIORITY_BAND_LABEL.critical,
      PRIORITY_BAND_LABEL.elevated,
      PRIORITY_BAND_LABEL.watch,
    ];
    expect(priority).toEqual(["Fix first", "Fix soon", "Worth doing", "Watch"]);
    for (const label of residual) expect(priority).not.toContain(label);
    const root = join(SRC, "..");
    // Only the words report layouts 1 to 4 printed (PRIORITY_BAND_LABEL_PRINTED_V4)
    // keep the retired names, so a version locked then prints as it did.
    const retired = sourceFiles(SRC)
      .filter((path) => /"(?:Top|High|Medium|Low) priority"/.test(readFileSync(path, "utf8")))
      .map((path) => relative(root, path));
    expect(retired).toEqual(["src/lib/precog/scoring/bands.ts"]);
    expect(Object.values(PRIORITY_BAND_LABEL_PRINTED_V4).slice(0, 4)).toEqual([
      "Top priority",
      "High priority",
      "Medium priority",
      "Low priority",
    ]);
  });

  it("never count residual risks in the priority list's urgency words", () => {
    const root = join(SRC, "..");
    const files = sourceFiles(SRC).map((path) => ({
      path: relative(root, path).split("\\").join("/"),
      text: readFileSync(path, "utf8"),
    }));
    expect(residualUrgencyWords(files)).toEqual([]);
    const flagged = (text: string) => residualUrgencyWords([{ path: "src/x.ts", text }]);
    expect(flagged('`${count(portfolio.criticalPath, "item")} to fix first`')).toHaveLength(1);
    expect(
      flagged("`${portfolio.actNow} to fix soon and ${portfolio.mitigate} worth doing`"),
    ).toHaveLength(1);
    expect(flagged('`${n} risks are in the "fix first" band.`')).toHaveLength(1);
    expect(flagged('`The average risk index is in the "fix soon" band.`')).toHaveLength(1);
    expect(flagged("`${fixFirst} are Fix first on the priority list`")).toEqual([]);
    expect(flagged("`${portfolio.criticalPath} ${RESIDUAL_BAND_LABEL.critical_path}`")).toEqual([]);
  });

  it("catches each shape a cutoff takes", () => {
    const flagged = (text: string) => cutoffsOutsideBands([{ path: "src/x.ts", text }]);
    expect(
      flagged("export const LOAD_BANDS = { overburdened: 70, elevated: 45 } as const;"),
    ).toHaveLength(1);
    expect(
      flagged('const tone = score >= 70 ? "ok" : score >= 40 ? "warn" : "danger";'),
    ).toHaveLength(1);
    expect(flagged("if (p >= 85) return a;\n  if (p >= 70) return b;")).toHaveLength(1);
    expect(flagged("const LOAD_BANDS = { overburdened: PRIORITY_SCALE.high };")).toEqual([]);
    expect(flagged('const tone = score >= HEALTH_SCALE.strong ? "ok" : "warn";')).toEqual([]);
  });
});
