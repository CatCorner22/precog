import { describe, expect, it } from "vitest";
import {
  CONTROL_IN_PLACE_TAB,
  controlsInPlace,
  getBaseTemplate,
  resolveTemplate,
} from "./active-template";
import { INDUSTRIES, type IndustryId } from "./industry";
import { controlOptions, detectSodConflicts } from "./sod/detect";

describe("resolveTemplate", () => {
  it("returns each industry's own template, unchanged", () => {
    for (const { id } of INDUSTRIES) {
      const tpl = resolveTemplate({ industry: id });
      const base = getBaseTemplate(id);
      expect(tpl.id).toBe(id);
      expect(tpl.people).toBe(base.people);
      expect(tpl.knowledge).toBe(base.knowledge);
      expect(tpl.relations).toBe(base.relations);
      expect(tpl.controls).toBe(base.controls);
      expect(tpl.scenarios).toBe(base.scenarios);
      expect(tpl.processes.map((p) => p.id)).toEqual(base.processes.map((p) => p.id));
    }
  });

  it("does not default to dental when the industry differs", () => {
    const retail = resolveTemplate({ industry: "retail" });
    const dental = getBaseTemplate("dental");
    expect(retail.id).toBe("retail");
    expect(retail.people.map((p) => p.name)).not.toContain("Maya Chen");
    expect(retail.knowledge.map((k) => k.id)).not.toEqual(dental.knowledge.map((k) => k.id));
  });

  it("replaces people and drops relations and process owners that point at removed people", () => {
    const base = getBaseTemplate("dental");
    const keep = base.people.slice(0, 2);
    const tpl = resolveTemplate({ industry: "dental", customPeople: keep });
    const ids = new Set(keep.map((p) => p.id));

    expect(tpl.people).toBe(keep);
    expect(tpl.relations.length).toBeLessThan(base.relations.length);
    expect(tpl.relations.every((r) => ids.has(r.personId))).toBe(true);
    for (const proc of tpl.processes) {
      expect((proc.ownerPersonIds ?? []).every((id) => ids.has(id))).toBe(true);
    }
  });

  it("clears the sample business's accepted residual risk for a business with its own people", () => {
    const base = getBaseTemplate("dental");
    expect(base.controls.some((c) => c.residualRiskAccepted)).toBe(true);
    const own = resolveTemplate({ industry: "dental", customPeople: base.people.slice(0, 2) });
    expect(own.controls.some((c) => c.residualRiskAccepted)).toBe(false);
    expect(base.controls.some((c) => c.compensatingControls.length > 0)).toBe(true);
    expect(own.controls.every((c) => c.compensatingControls.length === 0)).toBe(true);
    expect(own.controls.map((c) => c.id)).toEqual(base.controls.map((c) => c.id));
    expect(resolveTemplate({ industry: "dental" }).controls).toBe(base.controls);
  });

  it("writes an own business's segregated flags from its own team", () => {
    const clean = resolveTemplate({
      industry: "general",
      customPeople: [
        { id: "a", name: "Ana", role: "Owner", active: true, entitlements: ["approve_payroll"] },
        { id: "b", name: "Ben", role: "Bookkeeper", active: true, entitlements: ["post_payments"] },
      ],
    });
    expect(clean.controls.find((c) => c.id === "c-sod-cash")?.segregated).toBe(true);
    expect(clean.controls.find((c) => c.id === "c-sod-ap")?.segregated).toBe(true);
    const tangled = resolveTemplate({
      industry: "general",
      customPeople: [
        {
          id: "b",
          name: "Ben",
          role: "Bookkeeper",
          active: true,
          entitlements: ["post_payments", "bank_reconcile", "create_vendor", "release_payment"],
        },
      ],
    });
    expect(tangled.controls.find((c) => c.id === "c-sod-cash")?.segregated).toBe(false);
    expect(tangled.controls.find((c) => c.id === "c-sod-ap")?.segregated).toBe(false);
    // An owner holding the pair is not an employee gap.
    const owner = resolveTemplate({
      industry: "general",
      customPeople: [
        {
          id: "a",
          name: "Ana",
          role: "Owner",
          active: true,
          entitlements: ["post_payments", "bank_reconcile"],
        },
      ],
    });
    expect(owner.controls.find((c) => c.id === "c-sod-cash")?.segregated).toBe(true);
  });

  it("describes a rule-linked control from the pairs open on this team, not the sample's", () => {
    const tpl = resolveTemplate({
      industry: "general",
      customPeople: [
        { id: "a", name: "Ana", role: "Owner", active: true, entitlements: ["approve_payroll"] },
        {
          id: "c",
          name: "Carol Whitfield",
          role: "Controller",
          active: true,
          entitlements: ["sign_checks", "bank_reconcile"],
        },
        {
          id: "o",
          name: "Omar Okafor",
          role: "AR Clerk",
          active: true,
          entitlements: ["post_payments"],
        },
      ],
    });
    const cash = tpl.controls.find((c) => c.id === "c-sod-cash")!;
    expect(cash.segregated).toBe(false);
    expect(cash.description).toBe(
      "Open on your team: Carol Whitfield (check signing + bank reconciliation).",
    );
    expect(cash.description).not.toMatch(/posts payments and reconciles/);
    const ap = tpl.controls.find((c) => c.id === "c-sod-ap")!;
    expect(ap.description).toBe("Nobody on your team holds a pair of duties this control covers.");
  });

  it("marks controls no conflict rule covers as starters the owner has not confirmed", () => {
    const base = getBaseTemplate("retail");
    const own = resolveTemplate({ industry: "retail", customPeople: base.people.slice(0, 2) });
    for (const id of ["c-sod-ar", "c-ap", "c-ar"]) {
      expect(own.controls.find((c) => c.id === id)?.starter).toBe(true);
    }
    for (const id of ["c-cash", "c-sod-cash", "c-sod-billing", "c-sod-ap", "c-payroll"]) {
      expect(own.controls.find((c) => c.id === id)?.starter).toBeUndefined();
    }
    expect(base.controls.some((c) => c.starter)).toBe(false);
  });

  it("stops marking a starter control once the owner logs that it runs here", () => {
    const base = getBaseTemplate("retail");
    const people = base.people.slice(0, 2);
    const confirmed = resolveTemplate({
      industry: "retail",
      customPeople: people,
      decisions: [{ linkedTab: "control", linkedId: "c-ap", linkedIndustry: "retail" }],
    });
    expect(confirmed.controls.find((c) => c.id === "c-ap")?.starter).toBeUndefined();
    expect(confirmed.controls.find((c) => c.id === "c-ar")?.starter).toBe(true);
    // An entry logged under another industry does not confirm this one's control.
    const elsewhere = resolveTemplate({
      industry: "retail",
      customPeople: people,
      decisions: [{ linkedTab: "control", linkedId: "c-ap", linkedIndustry: "dental" }],
    });
    expect(elsewhere.controls.find((c) => c.id === "c-ap")?.starter).toBe(true);
  });

  it("does not leak overrides into later calls", () => {
    const base = getBaseTemplate("dental");
    resolveTemplate({ industry: "dental", customPeople: base.people.slice(0, 1) });
    const again = resolveTemplate({ industry: "dental" });
    expect(again.people).toBe(base.people);
    expect(again.relations).toBe(base.relations);
  });

  it("uses custom processes verbatim when provided", () => {
    const base = getBaseTemplate("retail");
    const custom = [{ ...base.processes[0], id: "proc-custom", name: "Custom step" }];
    const tpl = resolveTemplate({ industry: "retail", customProcesses: custom });
    expect(tpl.processes.map((p) => p.id)).toEqual(["proc-custom"]);
  });
});

describe("controls the owner already has", () => {
  const people = [
    {
      id: "own-1",
      name: "Erik Lindqvist",
      role: "Controller",
      active: true,
      entitlements: ["release_payment", "bank_reconcile"],
    },
    {
      id: "own-2",
      name: "Ana Ruiz",
      role: "Owner",
      active: true,
      entitlements: ["approve_payroll"],
    },
  ];
  const inPlace = (note: string, linkedIndustry: IndustryId = "general") => ({
    linkedTab: CONTROL_IN_PLACE_TAB,
    linkedId: "c-sod-cash",
    linkedIndustry,
    note,
  });
  const releaseRec = (tpl: ReturnType<typeof resolveTemplate>) =>
    detectSodConflicts(tpl, undefined, controlOptions(tpl)).conflicts.find(
      (c) => c.personId === "own-1" && c.ruleId === "rule-release-rec",
    )!;

  it("credits the CFO's review of each reconciliation on the controller's release + reconcile", () => {
    const without = resolveTemplate({ industry: "general", customPeople: people });
    const withReview = resolveTemplate({
      industry: "general",
      customPeople: people,
      decisions: [inPlace("The CFO reviews each bank reconciliation and its statement")],
    });
    expect(withReview.controls.find((c) => c.id === "c-sod-cash")?.compensatingControls).toEqual([
      "The CFO reviews each bank reconciliation and its statement",
    ]);
    const before = releaseRec(without);
    const after = releaseRec(withReview);
    expect(after.controlsInPlace).toContain(
      "The CFO reviews each bank reconciliation and its statement",
    );
    expect(after.score).toBeLessThan(before.score);
    // The gap stays open: the same person still holds both duties.
    expect(after.severity).toBe(before.severity);
  });

  it("ignores an empty note and an entry logged under another industry", () => {
    expect(controlsInPlace([inPlace("  ")], "general")).toEqual({});
    expect(controlsInPlace([inPlace("Review", "dental")], "general")).toEqual({});
  });

  it("leaves the sample business's own records alone", () => {
    const sample = resolveTemplate({ industry: "general", decisions: [inPlace("Anything")] });
    expect(sample.controls).toBe(getBaseTemplate("general").controls);
  });
});
