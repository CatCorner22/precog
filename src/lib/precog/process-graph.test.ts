import { getIndustryTemplate } from "./templates";
import { describe, expect, it } from "vitest";
import { processNode } from "@/test/fixtures";
import { buildProcessMapGraph } from "./process-graph";
import { computeMapHealth, integrityHint } from "./process-health";
import { portfolioSummary } from "./scoring/residual-engine";
import { DEFAULT_RISK_VARIABLES } from "./scoring/dynamic-variables";
import { DEFAULT_WEIGHTS } from "./scoring/weights";
import { resolveTemplate } from "./active-template";
import { validateProcessMap } from "./process-validation";
import type { Person } from "./types";

const people: Person[] = [
  { id: "a", name: "Ana", role: "Owner", active: true },
  { id: "d", name: "Dee", role: "Former staff", active: false, lastDay: "2025-01-31" },
];

describe("validateProcessMap owners", () => {
  it("distinguishes no owner, unknown owner, and owners who have all left", () => {
    const issues = validateProcessMap(
      [
        processNode("none", { ownerPersonIds: [] }),
        processNode("ghost", { ownerPersonIds: ["zz"] }),
        processNode("left", { ownerPersonIds: ["d"] }),
        processNode("mixed", { ownerPersonIds: ["d", "a"] }),
      ],
      people,
      new Set(),
    );
    const ids = issues.map((i) => i.id);
    expect(ids).toContain("owner-none");
    expect(ids).toContain("owner-ref-ghost-zz");
    expect(ids).toContain("owner-left-left");
    expect(ids.filter((id) => id.startsWith("owner-") && id.endsWith("mixed"))).toEqual([]);
    expect(issues.find((i) => i.id === "owner-left-left")?.message).toContain("Dee has left");
  });
});

describe("map health Integrity hint", () => {
  it("names the unowned processes that lowered Integrity instead of saying there are no issues", () => {
    const issues = validateProcessMap(
      [
        processNode("one", { ownerPersonIds: ["a"] }),
        processNode("two", { ownerPersonIds: [] }),
        processNode("three", { ownerPersonIds: [] }),
      ],
      people,
      new Set(),
    );
    const integrity = computeMapHealth([], issues).dimensions.find((d) => d.id === "integrity")!;
    expect(integrity.score).toBeLessThan(100);
    expect(integrity.hint).toBe("Lowered by 2 processes without an owner");
  });

  it("lists every kind of issue that cost points", () => {
    const issues = validateProcessMap(
      [
        processNode("one", { ownerPersonIds: ["zz"], controlIds: ["missing"] }),
        processNode("two", { ownerPersonIds: ["d"] }),
        processNode("three", { ownerPersonIds: [] }),
      ],
      people,
      new Set(),
    );
    expect(integrityHint(issues)).toBe(
      "Lowered by 1 broken link or cycle, 1 process without an owner, 1 process whose owner left and 1 reference to an unknown control",
    );
  });

  it("keeps the all-clear wording only when nothing cost points", () => {
    expect(integrityHint([])).toBe("No broken dependencies or cycles");
    expect(
      integrityHint([{ id: "record-x", severity: "info", message: "procedure not written" }]),
    ).toBe("No broken dependencies or cycles");
  });
});

describe("a process's residual", () => {
  it("comes from rows linked by id, never from a row that shares a word with its name", () => {
    const tpl = getIndustryTemplate("professional_services");
    const { snapshots } = buildProcessMapGraph(tpl, tpl.staffComposition);
    for (const snap of snapshots) {
      const linkedKnowledge = tpl.knowledge.some((k) =>
        k.linkedProcessIds.includes(snap.process.id),
      );
      if (snap.process.controlIds.length === 0 && !linkedKnowledge) {
        expect(snap.residualScore, snap.process.name).toBeNull();
      }
    }
  });

  it("is the worst row among its own controls", () => {
    const tpl = getIndustryTemplate("dental");
    const rows = new Map(
      portfolioSummary(tpl, tpl.staffComposition).all.map((r) => [r.id, r.residual]),
    );
    const { snapshots } = buildProcessMapGraph(tpl, tpl.staffComposition);
    const ap = snapshots.find((s) => s.process.controlIds.includes("c-sod-ap"))!;
    expect(ap.residualScore).toBeGreaterThanOrEqual(rows.get("ctrl-c-sod-ap")!);
  });

  it("reads the Residual page's rows when given the profile's scope", () => {
    // An owner's own team: a starter scenario counts once confirmed.
    const tpl = resolveTemplate({ industry: "dental", customPeople: people });
    const scope = {
      confirmedScenarioIds: new Set(tpl.scenarios.map((s) => s.id)),
      riskVariables: {
        ...DEFAULT_RISK_VARIABLES,
        dailyCashExposure: 7500,
        hasSecurityCameras: true,
        deductible: 25000,
      },
    };
    const rows = new Map(
      portfolioSummary(tpl, tpl.staffComposition, DEFAULT_WEIGHTS, scope).all.map((r) => [
        r.id,
        r.residual,
      ]),
    );
    const scoped = buildProcessMapGraph(tpl, tpl.staffComposition, {}, scope).snapshots;
    const unscoped = buildProcessMapGraph(tpl, tpl.staffComposition).snapshots;
    for (const snap of scoped) {
      const linked = [
        ...snap.process.controlIds.map((id) => `ctrl-${id}`),
        ...snap.knowledgeItems.map((k) => `know-${k.id}`),
        ...snap.linkedScenarios.map((s) => `scen-${s.id}`),
      ]
        .map((id) => rows.get(id))
        .filter((r): r is number => r !== undefined);
      expect(snap.residualScore).toBe(linked.length ? Math.max(...linked) : null);
    }
    expect(scoped.map((s) => s.residualScore)).not.toEqual(unscoped.map((s) => s.residualScore));
  });
});

describe("map health with no processes", () => {
  it("reports nothing to score instead of a phantom unowned process", () => {
    const h = computeMapHealth([], []);
    expect(h.processCount).toBe(0);
    expect(h.unownedProcesses).toBe(0);
    expect(h.bandLabel).toBe("Nothing to score");
    expect(h.dimensions.map((d) => d.hint).join(" ")).not.toMatch(/unowned|without controls/);
  });

  it("names the dimension that scored lowest in the summary", () => {
    const tpl = getIndustryTemplate("dental");
    const { snapshots } = buildProcessMapGraph(tpl, tpl.staffComposition);
    const h = computeMapHealth(snapshots, []);
    const lowest = [...h.dimensions].sort((a, b) => a.score - b.score)[0];
    expect(h.summary).toContain(`Lowest: ${lowest.label.toLowerCase()}`);
  });
});

describe("map completeness", () => {
  it("counts how far the map is filled in, never how risky it is", () => {
    const tpl = getIndustryTemplate("dental");
    const { snapshots } = buildProcessMapGraph(tpl, tpl.staffComposition);
    const base = computeMapHealth(snapshots, []);
    const hot = computeMapHealth(
      snapshots.map((s) => ({ ...s, heat: 100 })),
      [],
    );
    expect(hot.score).toBe(base.score);
    expect(hot.dimensions.map((d) => d.id)).toEqual([
      "integrity",
      "ownership",
      "controls",
      "documentation",
    ]);
    expect(base.dimensions.reduce((sum, d) => sum + d.weight, 0)).toBeCloseTo(1, 9);
  });
});
