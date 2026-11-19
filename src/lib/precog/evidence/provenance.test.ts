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

  it("map exactly the duty-family pairings the detector can emit", () => {
    const emitted = new Set<string>();
    for (const [from, row] of Object.entries(FAMILY_CONFLICT_MATRIX)) {
      for (const [to, conflicts] of Object.entries(row)) {
        if (!conflicts) continue;
        const key = [from, to].sort().join("-");
        emitted.add(key);
        expect(FAMILY_SCHEMES[key]?.length ?? 0, `family pairing ${key}`).toBeGreaterThan(0);
      }
    }
    for (const key of Object.keys(FAMILY_SCHEMES)) {
      expect(emitted.has(key), `${key} is never emitted`).toBe(true);
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
  const controls = [
    "iia-three-lines",
    "control-prevent-detect",
    "control-hard-soft",
    "deficiency-severity",
    "cycle-revenue-completeness",
    "cycle-close-estimates",
    "cycle-it-report-quality",
    "fraud-receipts-schemes",
    "fraud-warning-signs-context",
  ];
  const methods = [
    "analytics-reconciliation-passes",
    "analytics-duplicate-tiers",
    "analytics-benford-limits",
    "analytics-splitting-limits",
    "analytics-number-sequences",
    "analytics-suspense-aging",
  ];
  it("traces new control guidance to primary publishers, not the source compilation", () => {
    const hosts = new Set([
      "www.theiia.org",
      "www.gao.gov",
      "www.coso.org",
      "pcaobus.org",
      "www.acfe.com",
    ]);
    for (const id of controls) {
      const chunk = KNOWLEDGE_CORPUS.find((c) => c.id === id)!;
      expect(chunk, id).toBeDefined();
      expect(chunk.basis.kind, id).toBe("cited");
      if (chunk.basis.kind !== "cited") continue;
      expect(hosts.has(new URL(chunk.basis.url).hostname), id).toBe(true);
      expect(chunk.basis.publisher, id).toBeTruthy();
      expect(chunk.basis.document, id).toBeTruthy();
      expect(chunk.basis.document, id).not.toContain("Knowledge Base");
    }
  });
  it("keeps analytics methodology distinct from cited requirements and follows product wording", () => {
    for (const id of methods) {
      const chunk = KNOWLEDGE_CORPUS.find((c) => c.id === id)!;
      expect(chunk.basis.kind, id).toBe("practice");
      if (chunk.basis.kind === "practice") expect(chunk.basis.note, id).toBeTruthy();
    }
    for (const id of [...controls, ...methods]) {
      const chunk = KNOWLEDGE_CORPUS.find((c) => c.id === id)!;
      expect(`${chunk.title} ${chunk.text}`, id).not.toMatch(
        /\bshould\b|e\.g\.|the app\b|\bbackup\b/i,
      );
      expect(chunk.industry, id).toBeUndefined();
    }
  });
  it("adds only missing topics and preserves the established framework and cycle chunks", () => {
    for (const id of [
      "coso-17-principles",
      "green-book-documentation",
      "vendor-master",
      "smb-bank-rec-owner",
      "payroll-change-controls",
      "logical-access-leavers",
      "system-change-management",
    ])
      expect(KNOWLEDGE_CORPUS.filter((c) => c.id === id)).toHaveLength(1);
    expect(KNOWLEDGE_CORPUS.find((c) => c.id === "sod-small-team-practice")?.text).toContain(
      "comparable coverage and precision",
    );
    expect(KNOWLEDGE_CORPUS.find((c) => c.id === "deficiency-severity")?.text).toContain(
      "do not make these ICFR determinations",
    );
    expect(KNOWLEDGE_CORPUS.find((c) => c.id === "analytics-suspense-aging")?.text).toContain(
      "not the account's current balance",
    );
  });
  it("declares a basis on every chunk, cites only real cases, and links over https", () => {
    for (const chunk of KNOWLEDGE_CORPUS) {
      expect(chunk.basis, chunk.id).toBeTruthy();
      if (chunk.basis.kind === "cited") expect(chunk.basis.url, chunk.id).toMatch(/^https:\/\//);
      for (const id of chunk.caseIds ?? [])
        expect(CASE_IDS.has(id), `${chunk.id} cites ${id}`).toBe(true);
    }
  });
});
