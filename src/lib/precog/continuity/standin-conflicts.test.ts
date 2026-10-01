import { describe, expect, it } from "vitest";
import { knowledgeItem, teamTemplate } from "@/test/fixtures";
import { defaultDualReleasePolicy } from "../controls/dual-release";
import { newProcedure, newStep } from "../procedures/lifecycle";
import { getIndustryTemplate } from "../templates";
import type { IndustryTemplate } from "../templates";
import { absenceImpact } from "./absence-impact";
import { leavers } from "./leavers";
import { standInConflictChecker } from "./standin-conflicts";

const TODAY = "2026-10-01";

// Rae reconciles the bank alone; Cass, who takes the cash, has the basics.
function team(withDee: boolean): IndustryTemplate {
  const base = teamTemplate(getIndustryTemplate("general"), [
    { name: "Cass Cashier", role: "Office Manager", duties: ["collect_cash"] },
    { name: "Rae Recorder", role: "Bookkeeper", duties: ["bank_reconcile"] },
    ...(withDee ? [{ name: "Dee Desk", role: "Receptionist", duties: ["view_reports_only"] }] : []),
  ]);
  return {
    ...base,
    knowledge: [knowledgeItem("bank", { name: "Bank reconciliation" })],
    relations: [
      { personId: "t2", knowledgeId: "bank", level: "expert" },
      { personId: "t1", knowledgeId: "bank", level: "basic" },
    ],
  };
}

const reconcile = newProcedure(
  {
    industry: "general",
    title: "Reconcile the bank",
    steps: [newStep("Open the bank feed.")],
    knowledgeIds: ["bank"],
    dutyIds: ["bank_reconcile"],
  },
  TODAY,
);

function checker(tpl: IndustryTemplate) {
  return standInConflictChecker({
    tpl,
    dualRelease: defaultDualReleasePolicy(tpl, tpl.staffComposition),
    staff: tpl.staffComposition,
    procedures: [reconcile],
  });
}

describe("stand-ins and duty conflicts", () => {
  it("prefers a stand-in whose cover creates no duty conflict", () => {
    const tpl = team(true);
    expect(absenceImpact(tpl, ["t2"])!.stops[0].standIn?.id).toBe("t1");
    const [stop] = absenceImpact(tpl, ["t2"], checker(tpl))!.stops;
    expect(stop.standIn?.id).toBe("t3");
    expect(stop.conflicts).toEqual([]);
  });

  it("keeps the only stand-in when every one conflicts, and warns", () => {
    const tpl = team(false);
    const [stop] = absenceImpact(tpl, ["t2"], checker(tpl))!.stops;
    expect(stop.standIn?.id).toBe("t1");
    expect(stop.conflicts.length).toBeGreaterThan(0);
    expect(stop.note).toBe(
      "Cass Cashier has the basics but nobody has written the steps down — expect mistakes. Covering this, Cass would both reconcile the bank account and take payment from customers, a duty conflict (cash custody + bank reconciliation).",
    );
  });

  it("carries the warning onto a leaver's hand-off", () => {
    const base = team(false);
    const tpl = {
      ...base,
      people: base.people.map((p) => (p.id === "t2" ? { ...p, lastDay: "2026-10-14" } : p)),
    };
    const [rae] = leavers(tpl, [], TODAY, checker(tpl));
    expect(rae.handover[0].successor?.id).toBe("t1");
    expect(rae.handover[0].conflicts.length).toBeGreaterThan(0);
  });

  it("raises nothing for an item whose procedures name no duties", () => {
    const tpl = team(true);
    const none = standInConflictChecker({
      tpl,
      dualRelease: defaultDualReleasePolicy(tpl, tpl.staffComposition),
      procedures: [{ ...reconcile, dutyIds: [] }],
    });
    expect(none("t1", "bank")).toEqual([]);
  });
});
