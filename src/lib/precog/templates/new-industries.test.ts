import { describe, expect, it } from "vitest";
import { getBaseTemplate } from "../active-template";
import { CASE_LIBRARY, sectorsForIndustry } from "../evidence";
import { INDUSTRIES, industryHasOwner } from "../industry";
import { matchJobTitle } from "../onboarding/job-catalog";
import {
  buildOwnTeam,
  firstRowForIndustry,
  leaderRow,
  ownerRow,
  pasteSummary,
  rowFromImportedPerson,
  rowsForJobTitle,
  rowsKeptForAdding,
  type OwnTeamRow,
} from "../onboarding/own-team";
import { initialSetup } from "../onboarding/setup-draft";
import { detectSodConflicts } from "../sod/detect";
import { soleOwnerId } from "../sod/owner-role";
import { jobCatalogEntry } from "../onboarding/job-catalog";

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

describe("the setup grid's first row in a nonprofit", () => {
  const fresh = (): OwnTeamRow[] => [
    { ...ownerRow(), rowId: "r1" },
    { name: "", role: "", duties: [] },
  ];

  it("starts with the executive director, who owns nothing", () => {
    const rows = firstRowForIndustry(fresh(), "nonprofit");
    expect(rows[0]).toMatchObject({ role: "Executive Director", owner: false, rowId: "r1" });
    expect(rows[0].duties).toEqual(expect.arrayContaining(["approve_payroll", "sign_checks"]));
    // Switching back to a business with an owner restores the Owner row.
    expect(firstRowForIndustry(rows, "retail")[0]).toMatchObject({ role: "Owner", owner: true });
    expect(leaderRow("dental")).toEqual(ownerRow());
  });

  it("leaves a first row the owner has named or changed alone", () => {
    const named = [{ ...ownerRow(), name: "Ana" }];
    expect(firstRowForIndustry(named, "nonprofit")).toBe(named);
    const retitled = [{ ...ownerRow(), role: "Founder" }];
    expect(firstRowForIndustry(retitled, "nonprofit")).toBe(retitled);
  });

  it("starts a fresh nonprofit setup with the executive director row", () => {
    const start = initialSetup(
      null,
      { businessId: "b1", industry: "nonprofit", typedName: "Riverside Food Bank" },
      fresh,
    );
    expect(start.draft.rows[0].role).toBe("Executive Director");
  });

  it("lets a pasted executive director take the place of the empty row", () => {
    const rows = firstRowForIndustry(fresh(), "nonprofit");
    const kept = rowsKeptForAdding(rows, false, false);
    expect(kept.ownerRow).toBe("leader-kept");
    expect(kept.kept.map((r) => r.role)).toEqual(["Executive Director"]);
    const replaced = rowsKeptForAdding(rows, false, true);
    expect(replaced.ownerRow).toBe("leader-replaced");
    expect(replaced.kept).toEqual([]);
    const note = pasteSummary({
      added: 1,
      matched: 0,
      notAdded: 0,
      dropped: 0,
      recognised: 1,
      partial: 0,
      unmatched: 0,
      inactiveNames: [],
      ownerRow: "leader-replaced",
      onLeaveNames: [],
    }).note;
    expect(note).toContain("takes the place of the empty Executive Director row");
    expect(note).not.toContain("Owner row");
  });

  it("marks nobody as owner, whatever the title says", () => {
    const person = { id: "x", name: "Ana", role: "President & CEO", active: true };
    expect(rowFromImportedPerson(person, "nonprofit").owner).toBe(false);
    expect(rowFromImportedPerson(person, "general")).not.toHaveProperty("owner");
    const board = rowsForJobTitle(jobCatalogEntry("executive-director")!, 1, 0, "nonprofit");
    expect(board[0].owner).toBe(false);
    const team = buildOwnTeam(
      [{ name: "Ana", role: "CEO", duties: ["approve_payroll"], owner: true }],
      "nonprofit",
    );
    expect(team[0].owner).toBe(false);
    expect(
      buildOwnTeam([{ name: "Ana", role: "CEO", duties: ["approve_payroll"] }], "general")[0].owner,
    ).toBe(true);
  });
});

describe("added coverage in existing samples", () => {
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
