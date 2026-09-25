import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CASE_LIBRARY } from "./cases";
import { BENCHMARKS } from "./benchmarks";
import { FAMILY_SCHEMES, RULE_SCHEMES } from "./index";
import { CONFLICT_RULES, FAMILY_CONFLICT_MATRIX } from "../sod/conflict-rules";
import { DEFAULT_FRAUD_STATS } from "../templates/shared-controls";
import { KNOWLEDGE_CORPUS } from "../rag/corpus";

/**
 * Provenance rules for the evidence library and the retrieval corpus: every
 * figure traces to a source, every rule to a scheme, and no unsourceable
 * fraud rate comes back under another name.
 */
const RULE_IDS = new Set(CONFLICT_RULES.map((r) => r.id));
const CASE_IDS = new Set(CASE_LIBRARY.map((c) => c.id));

describe("case records", () => {
  it("explain a missing loss figure and state tenure as whole years the record supports", () => {
    for (const c of CASE_LIBRARY) {
      if (c.lossUsd === 0) expect(c.caveat, `${c.id} has no loss and no caveat`).toBeTruthy();
      if (c.tenureYearsStated !== undefined) {
        expect(Number.isInteger(c.tenureYearsStated), `${c.id} tenure`).toBe(true);
        expect(
          /hired|worked there from|(of|for) (more than |over )?(\d+|[a-z]+) years|years of tenure|long-?time employee/i.test(
            JSON.stringify(c),
          ),
          `${c.id} states tenure its account does not support`,
        ).toBe(true);
      }
    }
  });

  it("cite only rules the rulebook defines", () => {
    for (const c of CASE_LIBRARY) {
      for (const rule of c.sodRuleIds)
        expect(RULE_IDS.has(rule), `${c.id} cites ${rule}`).toBe(true);
    }
  });
});

describe("scheme maps", () => {
  it("map every rule to at least one scheme and name no unknown rule", () => {
    for (const rule of RULE_IDS) {
      expect(RULE_SCHEMES[rule]?.length ?? 0, `${rule} has no scheme`).toBeGreaterThan(0);
    }
    for (const rule of Object.keys(RULE_SCHEMES)) expect(RULE_IDS.has(rule), rule).toBe(true);
  });

  it("map every duty-family pairing the detector can emit", () => {
    for (const [from, row] of Object.entries(FAMILY_CONFLICT_MATRIX)) {
      for (const [to, conflicts] of Object.entries(row)) {
        if (!conflicts) continue;
        const key = [from, to].sort().join("-");
        expect(FAMILY_SCHEMES[key]?.length ?? 0, `family pairing ${key}`).toBeGreaterThan(0);
      }
    }
  });
});

describe("fraud statistics", () => {
  it("carry a source and never reintroduce an unsourceable fraud rate", () => {
    expect(DEFAULT_FRAUD_STATS.sourceUrl).toMatch(/^https:\/\//);
    const banned = [
      "industryEmbezzlementRate",
      "embezzlementRate",
      "fraudProbability",
      "annualFraudRate",
    ];
    for (const file of [
      "src/lib/precog/types.ts",
      "src/lib/precog/templates/shared-controls.ts",
      "src/lib/precog/engine.ts",
    ]) {
      const code = readFileSync(file, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/.*$/gm, "");
      for (const name of banned)
        expect(code.includes(name), `${file} declares ${name}`).toBe(false);
    }
  });

  it("keep every benchmark id unique and sourced over https", () => {
    expect(new Set(BENCHMARKS.map((b) => b.id)).size).toBe(BENCHMARKS.length);
    for (const b of BENCHMARKS) expect(b.source.url, b.id).toMatch(/^https:\/\//);
  });
});

describe("retrieval corpus", () => {
  it("declares a basis on every chunk, cites only real cases, and links over https", () => {
    for (const chunk of KNOWLEDGE_CORPUS) {
      expect(chunk.basis, chunk.id).toBeTruthy();
      if (chunk.basis.kind === "cited") expect(chunk.basis.url, chunk.id).toMatch(/^https:\/\//);
      for (const id of chunk.caseIds ?? [])
        expect(CASE_IDS.has(id), `${chunk.id} cites ${id}`).toBe(true);
    }
  });
});
