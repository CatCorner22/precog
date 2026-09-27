import { describe, expect, it } from "vitest";
import { getIndustryTemplate } from "../templates";
import type { ProcessNode } from "../types";
import { suggestControlForProcess, suggestOwnerForProcess } from "./quick-fix";

const tpl = getIndustryTemplate("dental");

function process(overrides: Partial<ProcessNode>): ProcessNode {
  return {
    id: "proc-new",
    name: "New process",
    layer: "process",
    description: "",
    dependencies: [],
    controlIds: [],
    ...overrides,
  };
}

describe("suggestControlForProcess", () => {
  it("proposes nothing when no control shares a word with the process", () => {
    const onboarding = process({
      name: "Staff onboarding",
      description: "New hires sign forms",
      risks: [
        { id: "r1", title: "Ghost hire", kind: "fraud", severity: 4, likelihood: 2, note: "" },
      ],
    });
    expect(suggestControlForProcess(onboarding, tpl.controls)).toBeNull();
  });

  it("proposes a control that names what the process handles", () => {
    const cash = process({ name: "Cash handling & deposits", description: "Daily cash deposit" });
    const pick = suggestControlForProcess(cash, tpl.controls);
    expect(pick?.name.toLowerCase()).toMatch(/cash|deposit/);
  });

  it("never proposes a control the process already has", () => {
    const cash = process({ name: "Cash handling & deposits", description: "Daily cash deposit" });
    const first = suggestControlForProcess(cash, tpl.controls);
    const next = suggestControlForProcess({ ...cash, controlIds: [first!.id] }, tpl.controls);
    expect(next?.id).not.toBe(first?.id);
  });
});

describe("suggestOwnerForProcess", () => {
  const target = tpl.processes.find((p) => p.id === "proc-cash")!;

  it("passes over someone who is leaving for the next best person", () => {
    const first = suggestOwnerForProcess(tpl, target, tpl.processes, tpl.people)!;
    const people = tpl.people.map((p) => (p.id === first.id ? { ...p, lastDay: "2026-10-01" } : p));
    const next = suggestOwnerForProcess(tpl, target, tpl.processes, people);
    expect(next).not.toBeNull();
    expect(next!.id).not.toBe(first.id);
  });

  it("still proposes a leaver when nobody else is active", () => {
    const people = tpl.people.map((p, i) =>
      i === 0 ? { ...p, lastDay: "2026-10-01" } : { ...p, active: false },
    );
    expect(suggestOwnerForProcess(tpl, target, tpl.processes, people)?.id).toBe(people[0].id);
  });
});
