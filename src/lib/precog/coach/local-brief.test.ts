import { describe, expect, it } from "vitest";
import { buildOwnTeam, ownBusinessProfile } from "../onboarding/own-team";
import { defaultProfile } from "../practice-profile";
import { fallbackBrief, localBrief, openConflictsByPerson } from "./local-brief";
import { pioneerProfileFrom } from "./pioneer-profile";

const EMBEZZLEMENT = "What should I fix this week to reduce embezzlement risk?";
const SOD = "Where are my biggest SoD gaps right now?";

function clinic() {
  const people = buildOwnTeam([
    {
      name: "Ellen Marchetti",
      role: "Physician/Owner",
      duties: ["approve_payroll", "bank_reconcile"],
    },
    { name: "Grace Kim", role: "Bookkeeper", duties: ["create_vendor", "release_payment"] },
    { name: "Sofia Delgado", role: "Front Desk", duties: ["collect_cash", "post_payments"] },
    { name: "Rosa Alvarez", role: "Medical Assistant", duties: [] },
  ]);
  return pioneerProfileFrom(
    ownBusinessProfile(defaultProfile("dental"), { practiceName: "Northside", people }) as never,
  );
}

describe("local advisor brief", () => {
  it("leads an embezzlement question with this business's own conflicts, by person", () => {
    const profile = clinic();
    const { brief } = localBrief(EMBEZZLEMENT, { profile, question: EMBEZZLEMENT }, profile);
    expect(brief.decisions[0].action).toBe(
      "Give one of Grace Kim's duties to someone else: set up suppliers or release payments",
    );
    expect(brief.decisions.some((d) => d.action.startsWith("Owner opens the bank statement"))).toBe(
      true,
    );
    expect(brief.frontierNextMove).toBe(
      "This week: give one of Grace Kim's duties (set up suppliers or release payments) to someone else, and open the bank statement yourself before anyone else handles it.",
    );
    expect(brief.markdown).toContain("Sofia Delgado");
    expect(brief.markdown).not.toMatch(/deductible|policy limit/i);
    // The industry example's register and people never appear as this clinic's.
    expect(brief.markdown).not.toMatch(/Insurance denial appeals|Jordan|Maya Chen/);
  });

  it("never names an insurance lever while the policy figures are defaults", () => {
    const sample = pioneerProfileFrom(defaultProfile("dental") as never);
    const { brief } = localBrief(SOD, { profile: sample, question: SOD }, sample);
    const moves = [...brief.decisions.map((d) => d.action), brief.frontierNextMove].join(" ");
    expect(moves).not.toMatch(/deductible|policy limit|premium/i);
    expect(brief.markdown).toContain("## Your open duty conflicts");
    expect(brief.markdown).toContain("Maya Chen");
  });

  it("keeps owner-held pairs out of the conflicts it leads with", () => {
    const people = openConflictsByPerson(clinic());
    expect(people.map((p) => p.personName)).not.toContain("Ellen Marchetti");
    expect(people[0].personName).toBe("Grace Kim");
  });

  it("builds a brief from the team's conflicts when the full brief cannot be computed", () => {
    const brief = fallbackBrief(clinic(), EMBEZZLEMENT);
    expect(brief.chickenLittleWarnings[0]).toMatch(/^Part of the full brief could not be computed/);
    expect(brief.decisions.map((d) => d.action)).toContain(
      "Mark who can do each item on Who knows what",
    );
    expect(brief.markdown).toContain(
      "**Grace Kim** (Bookkeeper): set up suppliers and release payments (critical)",
    );
  });
});
