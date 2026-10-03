import { describe, expect, it } from "vitest";
import { defaultProfile, type DecisionEntry } from "../practice-profile";
import { buildReportModelForProfile, freezeReport, reviveReportModel } from "./stored-model";
import { findingResponses } from "./finding-responses";

const entry = (over: Partial<DecisionEntry>): DecisionEntry => ({
  id: "d",
  createdAt: "2026-09-01T12:00:00.000Z",
  subject: "A duty conflict",
  kind: "monitor",
  note: "",
  linkedTab: "sod",
  linkedIndustry: "dental",
  ...over,
});

// The dental sample: rule-admin-pay is Maya's medium finding with no control,
// rule-card-review her high finding answered by c-cards alone, and
// rule-vendor-create-pay her critical one answered by c-sod-ap alone.
const sod = buildReportModelForProfile(defaultProfile("dental"), "2026-09-26").sod.conflicts;
const byRule = (ruleId: string) => sod.filter((c) => c.ruleId === ruleId);

describe("findingResponses", () => {
  it("prints the newest decision linked to a finding's rule or control, with its review date while open", () => {
    const decisions = [
      entry({ id: "old", linkedId: "rule-admin-pay", kind: "monitor", createdAt: "2026-08-01" }),
      entry({ id: "new", linkedId: "rule-admin-pay", kind: "remediate", reviewBy: "2026-10-15" }),
      entry({ id: "ctl", linkedId: "c-cards", kind: "accept_residual", status: "closed" }),
    ];
    const { byConflict, notValid } = findingResponses(sod, decisions, "dental");
    const [adminPay] = byRule("rule-admin-pay");
    const [cards] = byRule("rule-card-review");
    expect(byConflict[adminPay!.id]).toEqual({ kind: "remediate", reviewBy: "2026-10-15" });
    // A closed decision still answers the finding; it has no review date left.
    expect(byConflict[cards!.id]).toEqual({ kind: "accept_residual" });
    expect(notValid).toEqual([]);
    // Every other finding has no decision.
    expect(Object.keys(byConflict)).toHaveLength(2);
  });

  it("follows a link only under its own industry", () => {
    const decisions = [entry({ linkedId: "rule-admin-pay", linkedIndustry: "restaurant" })];
    expect(findingResponses(sod, decisions, "dental").byConflict).toEqual({});
  });

  it("splits out not-valid judgements, which are not decisions about the finding", () => {
    const decisions = [
      entry({
        id: "nv-cards",
        linkedId: "rule-card-review",
        disposition: {
          verdict: "not_valid",
          reason: "controlled_elsewhere",
          note: "The outside bookkeeper reviews the card statement.",
          by: { userId: "u1", name: "Ada Park" },
          at: "2026-09-20",
        },
      }),
      entry({
        id: "nv-vendor",
        linkedId: "rule-vendor-create-pay",
        disposition: { verdict: "not_valid", reason: "rule_does_not_fit", at: "2026-09-21" },
      }),
    ];
    const { byConflict, notValid } = findingResponses(sod, decisions, "dental");
    expect(byConflict).toEqual({});
    expect(notValid).toEqual([
      {
        conflictId: byRule("rule-vendor-create-pay")[0]!.id,
        critical: true,
        reason: "rule_does_not_fit",
        at: "2026-09-21",
      },
      {
        conflictId: byRule("rule-card-review")[0]!.id,
        critical: false,
        reason: "controlled_elsewhere",
        note: "The outside bookkeeper reviews the card statement.",
        byName: "Ada Park",
        at: "2026-09-20",
      },
    ]);
  });

  it("is stored with a locked version and revives as it was", () => {
    const profile = {
      ...defaultProfile("dental"),
      decisions: [entry({ linkedId: "rule-admin-pay", kind: "insure", reviewBy: "2026-11-01" })],
    };
    const frozen = freezeReport(profile, "2026-09-26");
    expect(frozen.model?.responses?.byConflict).toEqual({
      [byRule("rule-admin-pay")[0]!.id]: { kind: "insure", reviewBy: "2026-11-01" },
    });
    // A model stored under layouts 1 and 2 has none and revives with none.
    const { responses: _r, ...older } = frozen.model!;
    expect(reviveReportModel(older).responses).toEqual({ byConflict: {}, notValid: [] });
  });
});
