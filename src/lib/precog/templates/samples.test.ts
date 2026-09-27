import { describe, expect, it } from "vitest";
import { getBaseTemplate } from "../active-template";
import { CASE_LIBRARY, sectorsForIndustry } from "../evidence";
import { INDUSTRIES, industryHasOwner } from "../industry";
import { matchJobTitle } from "../onboarding/job-catalog";
import { STRONG_LEVELS } from "../continuity/coverage";
import { deriveStaffFromTeam } from "../sod/derive-staff";
import { detectSodConflicts } from "../sod/detect";
import { soleOwnerId } from "../sod/owner-role";
import { CONFLICT_RULES } from "../sod/conflict-rules";
import { scenarioCases } from "./index";

const findings = (id: Parameters<typeof getBaseTemplate>[0]) =>
  detectSodConflicts(getBaseTemplate(id)).conflicts.map((c) => `${c.role}: ${c.ruleId}`);

describe("every sample's links resolve inside its own template", () => {
  for (const { id } of INDUSTRIES) {
    it(`${id}: risks, scenarios and knowledge point at things that exist`, () => {
      const tpl = getBaseTemplate(id);
      const controls = new Set(tpl.controls.map((c) => c.id));
      const scenarios = new Set(tpl.scenarios.map((s) => s.id));
      const knowledge = new Set(tpl.knowledge.map((k) => k.id));
      const processes = new Set(tpl.processes.map((p) => p.id));
      const people = new Set(tpl.people.map((p) => p.id));
      for (const p of tpl.processes) {
        for (const c of p.controlIds) expect(controls.has(c), `${p.id} ${c}`).toBe(true);
        for (const d of p.dependencies) expect(processes.has(d), `${p.id} ${d}`).toBe(true);
        for (const o of p.ownerPersonIds ?? []) expect(people.has(o), `${p.id} ${o}`).toBe(true);
        for (const r of p.risks ?? []) {
          if (r.linkedControlId) expect(controls.has(r.linkedControlId), r.id).toBe(true);
          if (r.linkedScenarioId) expect(scenarios.has(r.linkedScenarioId), r.id).toBe(true);
          if (r.linkedKnowledgeId) expect(knowledge.has(r.linkedKnowledgeId), r.id).toBe(true);
        }
      }
      for (const s of tpl.scenarios) {
        if (s.controlId) expect(controls.has(s.controlId), s.id).toBe(true);
        if (s.knowledgeId) expect(knowledge.has(s.knowledgeId), s.id).toBe(true);
      }
      for (const k of tpl.knowledge) {
        for (const p of k.linkedProcessIds) expect(processes.has(p), `${k.id} ${p}`).toBe(true);
      }
      for (const person of tpl.people) {
        expect(tpl.roleTemplates[person.role], person.role).toBeDefined();
      }
      expect(new Set(tpl.scenarios.map((s) => s.id)).size).toBe(tpl.scenarios.length);
      expect(new Set(tpl.controls.map((c) => c.id)).size).toBe(tpl.controls.length);
    });
  }
});

describe("every sample's figures and claims agree with its own team", () => {
  for (const { id } of INDUSTRIES) {
    it(`${id}: team figures are the ones its people give`, () => {
      const tpl = getBaseTemplate(id);
      const derived = deriveStaffFromTeam(tpl, tpl.staffComposition);
      const tenures = tpl.people.map((p) => p.tenureYears ?? 0);
      const mean = tenures.reduce((a, b) => a + b, 0) / tenures.length;
      expect(tpl.staffComposition.teamSize).toBe(tpl.people.length);
      expect(tpl.staffComposition.avgTenureYears).toBe(Math.round(mean * 10) / 10);
      expect(tpl.staffComposition.segregationScore).toBe(derived.segregationScore);
      expect(tpl.staffComposition.soleOwnerKnowledgeCount).toBe(derived.soleOwnerKnowledgeCount);
    });

    it(`${id}: a control a duty pair covers is segregated exactly when nobody holds the pair`, () => {
      const tpl = getBaseTemplate(id);
      const conflicts = detectSodConflicts(tpl).conflicts.filter((c) => !c.ownerHeld);
      for (const control of tpl.controls) {
        const open = conflicts.filter((c) => c.linkedControlId === control.id);
        if (open.length) expect(control.segregated, control.id).toBe(false);
      }
      // Payroll entry and release sit with one manager in every sample.
      expect(tpl.controls.find((c) => c.id === "c-payroll")?.segregated).toBe(false);
    });

    it(`${id}: names no second signer as in place while payments need one person`, () => {
      const tpl = getBaseTemplate(id);
      expect(tpl.staffComposition.dualControlPayments).toBe(false);
      const claimed = tpl.controls
        .flatMap((c) => c.compensatingControls)
        .filter((text) => /dual release|two signatures|second signer/i.test(text));
      expect(claimed).toEqual([]);
    });

    it(`${id}: never offers the person who holds a pair as its compensating check`, () => {
      const tpl = getBaseTemplate(id);
      const conflicts = detectSodConflicts(tpl).conflicts.filter((c) => !c.ownerHeld);
      const selfChecks = tpl.controls.flatMap((control) =>
        control.compensatingControls.filter((text) =>
          conflicts.some(
            (c) =>
              c.linkedControlId === control.id &&
              text.toLowerCase().startsWith(c.role.toLowerCase()),
          ),
        ),
      );
      expect(selfChecks).toEqual([]);
    });

    it(`${id}: someone posts payments and reconciles the bank, as its cash scenario says`, () => {
      expect(findings(id).some((f) => f.endsWith(": rule-cash-rec"))).toBe(true);
    });

    it(`${id}: whoever a scenario or risk calls the sole expert is the only strong holder`, () => {
      const tpl = getBaseTemplate(id);
      const strong = (knowledgeId: string) =>
        tpl.relations.filter((r) => r.knowledgeId === knowledgeId && STRONG_LEVELS.has(r.level));
      const claims = [
        ...tpl.scenarios.map((s) => ({ id: s.id, text: s.description, k: s.knowledgeId })),
        ...tpl.processes.flatMap((p) =>
          (p.risks ?? []).map((r) => ({ id: r.id, text: r.note ?? "", k: r.linkedKnowledgeId })),
        ),
      ].filter((c) => c.k && /\bsole\b|\bonly (the )?[a-z ]+ knows\b/i.test(c.text));
      for (const claim of claims) expect(strong(claim.k!).length, claim.id).toBe(1);
    });
  }

  // Construction's write-off scenario is reworded separately; its register
  // has nobody who can post and approve a write-off.
  for (const id of [
    "dental",
    "retail",
    "professional_services",
    "restaurant",
    "nonprofit",
    "general",
  ] as const) {
    it(`${id}: every fraud scenario tied to a duty control has someone holding that control's pair`, () => {
      const tpl = getBaseTemplate(id);
      const open = new Set(
        detectSodConflicts(tpl)
          .conflicts.filter((c) => !c.ownerHeld)
          .map((c) => c.linkedControlId),
      );
      const linked = new Set(CONFLICT_RULES.map((r) => r.linkedControlId));
      const unsupported = tpl.scenarios
        .filter((s) => s.controlId && linked.has(s.controlId) && !open.has(s.controlId))
        .map((s) => s.id);
      expect(unsupported).toEqual([]);
    });
  }

  it("files the retail sample's receiving under a receiving control, not receivables", () => {
    const tpl = getBaseTemplate("retail");
    expect(tpl.processes.find((p) => p.id === "proc-inventory")?.controlIds).toEqual([
      "c-inventory",
    ]);
    expect(tpl.controls.find((c) => c.id === "c-ap")?.segregated).toBe(false);
  });

  it("keeps receivables controls out of the restaurant", () => {
    const ids = getBaseTemplate("restaurant").controls.map((c) => c.id);
    expect(ids).not.toContain("c-ar");
    expect(ids).not.toContain("c-sod-ar");
  });

  it("links every key-person scenario from a risk on the map", () => {
    for (const { id } of INDUSTRIES) {
      const tpl = getBaseTemplate(id);
      const linked = new Set(
        tpl.processes.flatMap((p) => (p.risks ?? []).map((r) => r.linkedScenarioId)),
      );
      for (const s of tpl.scenarios.filter((x) => x.knowledgeId && !x.controlId)) {
        expect(linked.has(s.id), `${id} ${s.id}`).toBe(true);
      }
    }
  });
});

describe("every sample's scenarios", () => {
  const KEY_PERSON = new Set(["sc-key-person-leaves", "sc-front-desk-leaves"]);
  for (const { id } of INDUSTRIES) {
    it(`${id}: puts a prosecuted case beside every scenario but a key person leaving`, () => {
      const bare = getBaseTemplate(id)
        .scenarios.filter((s) => !KEY_PERSON.has(s.id))
        .filter((s) => scenarioCases(s).length === 0)
        .map((s) => s.id);
      expect(bare).toEqual([]);
    });
  }

  it("leads the drug-diversion scenario with the case it names", () => {
    const diversion = getBaseTemplate("dental").scenarios.find(
      (s) => s.id === "sc-drug-diversion",
    )!;
    expect(scenarioCases(diversion)[0]?.id).toBe("case-littleton-oral-surgery-fentanyl");
  });
});

describe("construction sample", () => {
  it("has the office concentration and field gaps contractors really have", () => {
    const hits = findings("construction");
    expect(hits).toEqual(
      expect.arrayContaining([
        "Office Manager: rule-vendor-create-pay",
        "Office Manager: rule-invoice-pay",
        "Office Manager: rule-release-rec",
        "Payroll Administrator: rule-payroll-master-run",
        "Superintendent: rule-order-receive",
      ]),
    );
  });

  it("carries the fictitious-subcontractor, change-order, materials and field-time scenarios", () => {
    const ids = getBaseTemplate("construction").scenarios.map((s) => s.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        "sc-fictitious-sub",
        "sc-change-order-kickback",
        "sc-material-theft",
        "sc-field-time-padding",
      ]),
    );
  });

  it("reads contractor titles as their seats", () => {
    expect(matchJobTitle("Superintendent", "construction")?.entry.id).toBe("foreman");
    expect(matchJobTitle("Super", "construction")?.entry.id).toBe("foreman");
    expect(matchJobTitle("Crew Lead", "construction")?.entry.id).toBe("foreman");
    const pm = matchJobTitle("Project Manager", "construction");
    expect(pm?.entitlements).toEqual(
      expect.arrayContaining(["approve_invoices", "order_supplies"]),
    );
    // Elsewhere a project manager keeps the catalog's reading.
    expect(matchJobTitle("Project Manager", "general")?.entitlements).toEqual([
      "view_reports_only",
    ]);
  });

  it("counts construction and trades cases as its own line of business", () => {
    expect(sectorsForIndustry("construction")).toEqual(["construction", "trades"]);
    expect(CASE_LIBRARY.some((c) => c.sector === "construction")).toBe(true);
  });
});

describe("nonprofit sample", () => {
  it("has no owner, so the executive director's conflicts count", () => {
    const tpl = getBaseTemplate("nonprofit");
    expect(industryHasOwner("nonprofit")).toBe(false);
    expect(soleOwnerId(tpl.people)).toBeNull();
    const report = detectSodConflicts(tpl);
    expect(report.summary.ownerHeld).toBe(0);
    expect(findings("nonprofit")).toEqual(
      expect.arrayContaining([
        "Executive Director: rule-vendor-approve-pay",
        "Finance & Operations Manager: rule-vendor-create-pay",
        "Finance & Operations Manager: rule-release-rec",
        "Development Director: rule-collect-post",
        "Program Director: rule-order-receive",
      ]),
    );
  });

  it("words its controls for the executive director and treasurer, not an owner", () => {
    const tpl = getBaseTemplate("nonprofit");
    const text = JSON.stringify([tpl.controls, tpl.scenarios, tpl.processes]);
    expect(text).not.toMatch(/\bowner\b/i);
  });

  it("reads nonprofit titles as their seats", () => {
    expect(matchJobTitle("Treasurer", "nonprofit")?.entry.id).toBe("board-treasurer");
    expect(matchJobTitle("President & CEO", "nonprofit")?.entry.id).toBe("executive-director");
    expect(matchJobTitle("Program Manager", "nonprofit")?.entry.id).toBe("program-director");
    expect(matchJobTitle("Program Director", "general")?.entry.id).toBe("program-director");
    expect(matchJobTitle("Development Director", "nonprofit")?.entitlements).toContain(
      "post_payments",
    );
  });
});

describe("each industry's own processes, controls and scenarios", () => {
  it("gives the professional-services sample a three-way trust reconciliation", () => {
    const tpl = getBaseTemplate("professional_services");
    expect(tpl.processes.some((p) => p.id === "proc-trust-rec")).toBe(true);
    expect(tpl.controls.map((c) => c.id)).toEqual(
      expect.arrayContaining(["c-trust-rec", "c-trust-disb"]),
    );
    expect(tpl.scenarios.some((s) => s.id === "sc-trust-misappropriation")).toBe(true);
  });

  it("gives the restaurant sample sales tax and tip pool controls and scenarios", () => {
    const tpl = getBaseTemplate("restaurant");
    expect(tpl.processes.map((p) => p.id)).toEqual(
      expect.arrayContaining(["proc-tips", "proc-salestax"]),
    );
    expect(tpl.scenarios.map((s) => s.id)).toEqual(
      expect.arrayContaining(["sc-salestax-unremitted", "sc-tip-pool-manipulation"]),
    );
  });

  it("gives the dental, medical and veterinary sample a controlled-drug log and diversion scenario", () => {
    const tpl = getBaseTemplate("dental");
    expect(tpl.processes.some((p) => p.id === "proc-controlled")).toBe(true);
    expect(tpl.controls.some((c) => c.id === "c-controlled")).toBe(true);
    expect(tpl.scenarios.some((s) => s.id === "sc-drug-diversion")).toBe(true);
  });
});
