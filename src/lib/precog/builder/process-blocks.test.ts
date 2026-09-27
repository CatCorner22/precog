import { describe, expect, it } from "vitest";
import type { ProcessNode } from "../types";
import { blocksForIndustry, instantiateBlock, processToSavedBlock } from "./process-blocks";

const clinical: ProcessNode = {
  id: "proc-clinical",
  name: "Clinical delivery",
  layer: "process",
  description: "Chairside care",
  dependencies: ["proc-schedule"],
  controlIds: ["c-clinical"],
  ownerPersonIds: ["own-2"],
  risks: [
    { id: "r1", title: "A", kind: "control", severity: 3, likelihood: 3, note: "" },
    { id: "r2", title: "B", kind: "control", severity: 3, likelihood: 3, note: "" },
    { id: "r3", title: "C", kind: "fraud", severity: 3, likelihood: 3, note: "" },
  ],
  evidence: [
    {
      id: "e1",
      label: "Owner review",
      frequency: "monthly",
      lastDoneAt: "2026-09-01T00:00:00Z",
      reviewerPersonId: "own-1",
      note: "Checked the August batch",
    },
  ],
};

describe("processToSavedBlock and instantiateBlock", () => {
  it("inserts a saved process unowned, unwired and never reviewed", () => {
    const saved = processToSavedBlock(clinical);
    const inserted = instantiateBlock(saved, new Set([clinical.id]));
    expect(inserted.ownerPersonIds).toEqual([]);
    expect(inserted.dependencies).toEqual([]);
    expect(inserted.controlIds).toEqual(["c-clinical"]);
    expect(inserted.evidence).toEqual([
      { id: expect.any(String), label: "Owner review", frequency: "monthly" },
    ]);
    expect(inserted.evidence?.[0].id).not.toBe("e1");
    expect(inserted.evidence).not.toBe(saved.template.evidence);
  });

  it("gives every nested item a fresh id, unique within the block", () => {
    const saved = processToSavedBlock(clinical);
    for (let i = 0; i < 200; i += 1) {
      const ids = (instantiateBlock(saved, new Set()).risks ?? []).map((r) => r.id);
      expect(new Set(ids).size).toBe(ids.length);
      expect(ids).not.toContain("r1");
    }
  });

  it("gives a second copy of a block its own process id", () => {
    const [block] = blocksForIndustry("dental");
    const first = instantiateBlock(block, new Set());
    const second = instantiateBlock(block, new Set([first.id]));
    expect(second.id).not.toBe(first.id);
  });
});

describe("built-in blocks", () => {
  it("start every idea in the backlog and never name the app", () => {
    for (const block of blocksForIndustry("general")) {
      for (const idea of block.template.ideas ?? []) {
        expect(idea.status).toBe("backlog");
        expect(`${idea.title} ${idea.note}`).not.toMatch(/Precog|simulator/i);
      }
    }
  });
});
