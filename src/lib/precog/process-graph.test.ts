import { getIndustryTemplate } from "./templates";
import { describe, expect, it } from "vitest";
import { processNode } from "@/test/fixtures";
import { buildProcessMapGraph } from "./process-graph";
import { computeMapHealth, integrityHint } from "./process-health";
import { portfolioSummary } from "./scoring/residual-engine";
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
