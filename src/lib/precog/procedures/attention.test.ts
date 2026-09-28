import { describe, expect, it } from "vitest";
import { knowledgeItem } from "@/test/fixtures";
import { resolveTemplate } from "../active-template";
import { buildSharePayload } from "../share/share-payload";
import { defaultProfile, type PracticeProfile } from "../practice-profile";
import { dueItemsFor } from "../reminders/due-items";
import type { Person } from "../types";
import { buildWeeklyActions } from "../weekly-actions/build";
import { procedureAttention, procedureSummary } from "./attention";
import { newProcedure, newStep, verifyProcedure } from "./lifecycle";
import { withProof } from "./proof";
import type { Procedure } from "./types";

const TODAY = "2026-10-01";
const knowledge = [
  knowledgeItem("deposit", { name: "Daily deposit" }),
  knowledgeItem("filing", { name: "Filing", criticality: "nice-to-have" }),
];

function written(extra: Partial<Procedure> = {}, createdOn = "2026-06-01"): Procedure {
  return newProcedure(
    {
      industry: "general",
      title: "Make the daily deposit",
      steps: [newStep("Count the drawer.")],
      knowledgeIds: ["deposit"],
      backupPersonIds: ["p2"],
      ...extra,
    },
    createdOn,
  );
}

describe("what needs attention", () => {
  it("names a verification that runs out within a week, or has run out", () => {
    const soon = verifyProcedure(written(), "owner", "2026-04-06"); // due 2026-10-03
    const later = verifyProcedure(written({ id: "later" }), "owner", "2026-09-01");
    const lapsed = verifyProcedure(written({ id: "lapsed" }), "owner", "2025-10-01");
    const got = procedureAttention([soon, later, lapsed], knowledge, "general", TODAY).reviewDue;
    expect(got.map((r) => [r.procedure.id, r.overdue])).toEqual([
      ["lapsed", true],
      [soon.id, false],
    ]);
  });

  it("names a critical procedure whose backups have not done it alone, 90 days after it was written", () => {
    const old = written({ id: "old" }, "2026-06-01");
    const fresh = written({ id: "fresh" }, "2026-09-20");
    const minor = written({ id: "minor", knowledgeIds: ["filing"] });
    const nobody = written({ id: "nobody", backupPersonIds: [] });
    const proven = withProof(written({ id: "proven" }), {
      personId: "p2",
      on: "2026-08-01",
      alone: true,
    });
    const helped = withProof(written({ id: "helped" }), {
      personId: "p2",
      on: "2026-08-01",
      alone: false,
    });
    const got = procedureAttention(
      [old, fresh, minor, nobody, proven, helped],
      knowledge,
      "general",
      TODAY,
    ).unproven;
    expect(got.map((u) => u.procedure.id).sort()).toEqual(["helped", "old"]);
    expect(got.every((u) => u.overdue)).toBe(true);
  });

  it("summarises coverage of critical work for the report", () => {
    const proven = withProof(verifyProcedure(written(), "owner", "2026-09-01"), {
      personId: "p2",
      on: "2026-09-10",
      alone: true,
    });
    expect(procedureSummary([proven], knowledge, "general", TODAY)).toEqual({
      written: 1,
      verified: 1,
      reviewOverdue: 0,
      criticalWithout: 0,
      criticalProven: 1,
      criticalTotal: 1,
    });
    expect(procedureSummary([], knowledge, "general", TODAY).criticalWithout).toBe(1);
  });
});

describe("procedures in reminders, the weekly plan and shared maps", () => {
  const people = [
    { id: "p1", name: "Ada Owner", role: "Owner", active: true, owner: true, entitlements: [] },
    { id: "p2", name: "Bea Books", role: "Bookkeeper", active: true, entitlements: [] },
  ] as unknown as Person[];
  const profile = (): PracticeProfile => ({
    ...defaultProfile("general"),
    practiceName: "Riverside Plumbing",
    customPeople: people,
    customKnowledge: knowledge,
    customRelations: [
      { personId: "p1", knowledgeId: "deposit", level: "expert" },
      { personId: "p2", knowledgeId: "deposit", level: "basic" },
    ],
    procedures: [written({ id: "deposit-proc" })],
  });

  it("reminds the owner to have a backup do the critical procedure alone", () => {
    const items = dueItemsFor(profile(), TODAY).filter((i) => i.key.startsWith("procedure-"));
    expect(items.map((i) => i.key)).toEqual(["procedure-unproven:deposit-proc"]);
    expect(items[0].title).toBe('Have a backup do "Make the daily deposit" alone');
    expect(items[0].detail).toContain("Bea Books has not yet done this critical task alone");
  });

  it("puts the unproven backup in the weekly plan with a link to the tab", () => {
    // A team with its controls in place, so the plan has room below the continuity items.
    const p = {
      ...profile(),
      customPeople: people.map((x) => ({ ...x, entitlements: ["view_reports_only"] })),
    };
    const tpl = resolveTemplate(p);
    const actions = buildWeeklyActions({
      tpl,
      staff: { ...p.staff, dualControlPayments: true, independentBankRec: true },
      dualRelease: p.dualRelease,
      today: TODAY,
      decisions: [],
      procedures: p.procedures,
    });
    const action = actions.find((a) => a.id === "procedure-unproven-deposit-proc");
    expect(action?.title).toBe('Have Bea do "Make the daily deposit" alone');
    expect(action?.tab).toBe("procedures");
  });

  it("never puts procedures, their titles or steps in a shared map", () => {
    const shared = JSON.stringify(buildSharePayload(profile(), [], undefined, true));
    expect(shared).not.toContain("Make the daily deposit");
    expect(shared).not.toContain("Count the drawer");
    expect(shared).not.toContain("procedures");
  });
});
