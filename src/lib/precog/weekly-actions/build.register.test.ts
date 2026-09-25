import { describe, expect, it } from "vitest";
import { resolveTemplate } from "@/lib/precog/active-template";
import { buildOwnTeam, ownBusinessProfile } from "@/lib/precog/onboarding/own-team";
import { defaultProfile } from "@/lib/precog/practice-profile";
import { buildWeeklyActions } from "./build";

const people = buildOwnTeam([
  { name: "Ana Ruiz", role: "Owner", duties: ["approve_payroll"] },
  { name: "Ben Ochoa", role: "Office Manager", duties: ["post_payments", "bank_reconcile"] },
]);

function actionsFor(profile: ReturnType<typeof ownBusinessProfile>) {
  const tpl = resolveTemplate(profile);
  return buildWeeklyActions({
    tpl,
    staff: { ...profile.staff, independentBankRec: true, dualControlPayments: true },
    dualRelease: profile.dualRelease,
    today: "2026-09-23",
    trackFreshness: true,
  });
}

describe("weekly plan on a register nobody has filled in", () => {
  it("asks the owner to mark who can do the starter items instead of scoring them as gaps", () => {
    const profile = ownBusinessProfile(defaultProfile(), { practiceName: "Ruiz Dental", people });
    const actions = actionsFor(profile);
    const ids = actions.map((a) => a.id);
    expect(ids).toContain("register-start");
    expect(ids.some((id) => id.startsWith("spof-") || id.startsWith("docs-"))).toBe(false);
    expect(ids).not.toContain("confirm-register");
    const start = actions.find((a) => a.id === "register-start")!;
    expect(start.title).toMatch(/^Mark who can do each of the \d+ things/);
    expect(start.tab).toBe("knowledge");
  });

  it("asks for a list when the register is empty", () => {
    const profile = ownBusinessProfile(defaultProfile(), { practiceName: "Ruiz Dental", people });
    const actions = actionsFor({ ...profile, customKnowledge: [] });
    expect(actions.find((a) => a.id === "register-start")?.title).toBe(
      "List the duties, tasks and know-how the business runs on",
    );
  });

  it("scores the register normally once one person is marked on one item", () => {
    const profile = ownBusinessProfile(defaultProfile(), { practiceName: "Ruiz Dental", people });
    const first = resolveTemplate(profile).knowledge.find((k) => k.criticality === "critical")!;
    const actions = actionsFor({
      ...profile,
      customRelations: [{ personId: "own-2", knowledgeId: first.id, level: "expert" }],
    });
    const ids = actions.map((a) => a.id);
    expect(ids).not.toContain("register-start");
    expect(ids.some((id) => id.startsWith("spof-"))).toBe(true);
  });
});
