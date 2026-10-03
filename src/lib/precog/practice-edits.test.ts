import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import {
  defaultProfile,
  makeDecisionId,
  normalizeProfile,
  type PracticeProfile,
} from "./practice-profile";
import { makeProfileEdits, type ProfileEdits } from "./practice-edits";
import type { ProfileAction } from "./profile-reducer";
import { resolveTemplate } from "./active-template";
import { processesToEdit, replacesSampleTeam } from "./business-lifecycle";
import { newProcedure, newStep } from "./procedures/lifecycle";
import { PROCEDURE_LIMITS } from "./procedures/normalize";
import { localDateKey } from "./dates";
import type { AccessReconciliation } from "./firm/reconcile";
import type { Person } from "./types";
import {
  currentPeople,
  makeMapVersion,
  procedureFits,
  withAccessReconciliation,
  withDecision,
  withDecisionReview,
  withDualRelease,
  withIndustry,
  withIntegrationDriftSummary,
  withKnowledge,
  withLeaversConfirmed,
  withMapHealth,
  withMapLayout,
  withMapVersion,
  withMonthlyReviews,
  withoutDecision,
  withoutMapVersion,
  withoutProcedure,
  withPeople,
  withPlaces,
  withPlannedAbsences,
  withPracticeName,
  withProcedure,
  withProcedureProof,
  withProcedureVerified,
  withProcesses,
  withRelations,
  withReportSent,
  withRestoredVersion,
  withRiskVariables,
  withSavedBlocks,
  withStaff,
} from "./profile-actions";

vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn(), dismiss: vi.fn() }),
}));

const NOW = new Date("2026-10-01T15:00:00Z");
const TODAY = localDateKey(NOW);

/** A provider stand-in: records what each edit dispatches and which hooks it calls. */
function harness(base: PracticeProfile) {
  const dispatched: ProfileAction[] = [];
  const pushUndo = vi.fn();
  const clearHistory = vi.fn();
  const edits = makeProfileEdits({
    setProfile: (action) => void dispatched.push(action),
    profileRef: { current: base },
    pushUndo,
    clearHistory,
  });
  /** The last dispatched action applied to `base`, the way the reducer applies it. */
  const result = (): PracticeProfile => {
    const action = dispatched[dispatched.length - 1];
    if (typeof action === "function") return action(base);
    if (action && "derive" in action) return action.derive(base);
    if (action && ("load" in action || "adopt" in action)) throw new Error("not an edit");
    return action;
  };
  return { edits, dispatched, pushUndo, clearHistory, result };
}

const team: Person[] = [
  { id: "own_1", name: "Ana Ruiz", role: "Owner", owner: true, active: true },
  { id: "own_2", name: "Ben Shaw", role: "Office manager", active: true },
];

const procedure = newProcedure(
  {
    industry: "dental",
    title: "Reconcile the checking account",
    steps: [newStep("Open Banking.")],
  },
  TODAY,
);

const reconciliation: AccessReconciliation = {
  importedAt: NOW.toISOString(),
  source: "qbo" as AccessReconciliation["source"],
  users: [],
  vendors: [],
};

/**
 * Every edit once: how to call it, and the profile-actions call it stands for.
 * `base` is the profile the edit reads; the expectation is computed from the
 * same base under the same frozen clock.
 */
const CASES: Record<
  keyof ProfileEdits,
  {
    base?: (p: PracticeProfile) => PracticeProfile;
    run: (e: ProfileEdits) => unknown;
    expected: (
      p: PracticeProfile,
      dispatched: PracticeProfile,
      returned: unknown,
    ) => PracticeProfile;
  }
> = {
  setPracticeName: {
    run: (e) => e.setPracticeName("Ruiz Dental", undefined),
    expected: (p) => withPracticeName(p, "Ruiz Dental", undefined),
  },
  setIndustry: {
    run: (e) => e.setIndustry("retail"),
    expected: (p) => withIndustry(p, "retail"),
  },
  setStaff: {
    run: (e) => e.setStaff((s) => ({ ...s, teamSize: 9 })),
    expected: (p) => withStaff(p, { ...p.staff, teamSize: 9 }),
  },
  setRiskVariables: {
    run: (e) => e.setRiskVariables((v) => ({ ...v, hasDualControl: true })),
    expected: (p) => withRiskVariables(p, { ...p.riskVariables, hasDualControl: true }),
  },
  setDualRelease: {
    run: (e) => e.setDualRelease((d) => ({ ...d, enabled: true })),
    expected: (p) => withDualRelease(p, { ...p.dualRelease, enabled: true }, NOW),
  },
  addDecision: {
    run: (e) => e.addDecision({ subject: "Bank rec", kind: "monitor", note: "Watch it" }),
    expected: (p, dispatched) => {
      const minted = dispatched.decisions.find((d) => d.subject === "Bank rec");
      if (!minted) throw new Error("the decision was not added");
      return withDecision(
        p,
        { subject: "Bank rec", kind: "monitor", note: "Watch it" },
        minted.id,
        NOW,
      );
    },
  },
  removeDecision: {
    base: (p) => withDecision(p, { subject: "Old", kind: "monitor", note: "" }, "dec_old", NOW),
    run: (e) => e.removeDecision("dec_old"),
    expected: (p) => withoutDecision(p, "dec_old"),
  },
  reviewDecision: {
    base: (p) => withDecision(p, { subject: "Old", kind: "monitor", note: "" }, "dec_old", NOW),
    run: (e) => e.reviewDecision("dec_old", "still_open", "later"),
    expected: (p) => withDecisionReview(p, "dec_old", "still_open", "later", 90, NOW),
  },
  replaceProfile: {
    run: (e) => e.replaceProfile({ ...defaultProfile("retail"), practiceName: "Swapped" }),
    expected: () => normalizeProfile({ ...defaultProfile("retail"), practiceName: "Swapped" }),
  },
  setMonthlyReviews: {
    run: (e) =>
      e.setMonthlyReviews((list) => [
        ...list,
        {
          key: "bank_statement",
          period: "2026-09",
          result: "done",
          ownerName: "Ana",
          notes: "",
          recordedAt: NOW.toISOString(),
        },
      ]),
    expected: (p) =>
      withMonthlyReviews(p, [
        ...(p.monthlyReviews ?? []),
        {
          key: "bank_statement",
          period: "2026-09",
          result: "done",
          ownerName: "Ana",
          notes: "",
          recordedAt: NOW.toISOString(),
        },
      ]),
  },
  setAccessReconciliation: {
    run: (e) => e.setAccessReconciliation(reconciliation),
    expected: (p) => withAccessReconciliation(p, reconciliation),
  },
  setIntegrationDriftFromQbo: {
    run: (e) => e.setIntegrationDriftFromQbo(null),
    expected: (p) => withIntegrationDriftSummary(p, null),
  },
  markReportSent: {
    run: (e) => e.markReportSent(),
    expected: (p) => withReportSent(p, NOW),
  },
  resetProfile: {
    base: (p) => ({ ...withPracticeName(p, "Ruiz Dental"), businessId: "biz_1" }),
    run: (e) => e.resetProfile(),
    expected: (p) => ({ ...defaultProfile(p.industry), businessId: p.businessId }),
  },
  confirmLeaverAccess: {
    run: (e) => e.confirmLeaverAccess(["chk_1"]),
    expected: (p) => withLeaversConfirmed(p, ["chk_1"], TODAY),
  },
  setCustomProcesses: {
    run: (e) => e.setCustomProcesses((list) => list.slice(1)),
    expected: (p) => withProcesses(p, processesToEdit(p).slice(1)),
  },
  setCustomPeople: {
    run: (e) => e.setCustomPeople(team),
    expected: (p) => withPeople(p, team, TODAY),
  },
  setCustomKnowledge: {
    run: (e) => e.setCustomKnowledge((list) => list.slice(1)),
    expected: (p) => withKnowledge(p, resolveTemplate(p).knowledge.slice(1)),
  },
  setCustomRelations: {
    run: (e) => e.setCustomRelations((list) => list.slice(1)),
    expected: (p) => withRelations(p, resolveTemplate(p).relations.slice(1)),
  },
  setPlannedAbsences: {
    run: (e) =>
      e.setPlannedAbsences([
        { id: "abs_1", personId: "p1", industry: "dental", from: TODAY, to: TODAY },
      ]),
    expected: (p) =>
      withPlannedAbsences(p, [
        { id: "abs_1", personId: "p1", industry: "dental", from: TODAY, to: TODAY },
      ]),
  },
  setPlaces: {
    run: (e) => e.setPlaces([{ id: "pl_1", kind: "software", name: "QuickBooks Online" }]),
    expected: (p) => withPlaces(p, [{ id: "pl_1", kind: "software", name: "QuickBooks Online" }]),
  },
  saveProcedure: {
    run: (e) => e.saveProcedure(procedure),
    expected: (p) => withProcedure(p, procedure, TODAY),
  },
  verifyProcedure: {
    base: (p) => withProcedure(p, procedure, TODAY),
    run: (e) => e.verifyProcedure(procedure.id, "owner", null),
    expected: (p) => withProcedureVerified(p, procedure.id, "owner", TODAY, null),
  },
  removeProcedure: {
    base: (p) => withProcedure(p, procedure, TODAY),
    run: (e) => e.removeProcedure(procedure.id),
    expected: (p) => withoutProcedure(p, procedure.id),
  },
  recordProcedureProof: {
    base: (p) => withProcedure(p, procedure, TODAY),
    run: (e) => e.recordProcedureProof(procedure.id, { personId: "p2", on: TODAY, alone: true }),
    expected: (p) =>
      withProcedureProof(p, procedure.id, { personId: "p2", on: TODAY, alone: true }),
  },
  setMapLayout: {
    run: (e) => e.setMapLayout((layout) => ({ ...layout, n1: { x: 10, y: 20 } })),
    expected: (p) => withMapLayout(p, { ...(p.mapLayout ?? {}), n1: { x: 10, y: 20 } }),
  },
  setSavedProcessBlocks: {
    run: (e) => e.setSavedProcessBlocks([]),
    expected: (p) => withSavedBlocks(p, []),
  },
  recordMapHealth: {
    run: (e) => e.recordMapHealth(72),
    expected: (p) => withMapHealth(p, 72, NOW),
  },
  saveMapVersion: {
    run: (e) => e.saveMapVersion("Before the hire", 64),
    expected: (p, _dispatched, returned) =>
      withMapVersion(p, returned as ReturnType<typeof makeMapVersion>),
  },
  deleteMapVersion: {
    base: (p) => withMapVersion(p, { ...makeMapVersion(p, "Old", 50), id: "ver_old" }),
    run: (e) => e.deleteMapVersion("ver_old"),
    expected: (p) => withoutMapVersion(p, "ver_old"),
  },
  restoreMapVersion: {
    base: (p) => withMapVersion(p, { ...makeMapVersion(p, "Old", 50), id: "ver_old" }),
    run: (e) => e.restoreMapVersion("ver_old"),
    expected: (p) => {
      const v = p.mapVersions?.find((x) => x.id === "ver_old");
      if (!v) throw new Error("the version is missing");
      return withRestoredVersion(p, v, TODAY);
    },
  },
};

const EDIT_NAMES = Object.keys(CASES) as (keyof ProfileEdits)[];

/**
 * Some edits mint ids (`uid`) from `Math.random`. Replaying the same seeded
 * sequence for the edit and for its expectation makes the two mint the same
 * ids, so the deep-equal compares everything else.
 */
function seededRandom() {
  let seed = 1;
  const next = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
  return { next, reset: () => void (seed = 1) };
}

describe("makeProfileEdits", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    vi.mocked(toast).mockClear();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("returns the 31 edits of PracticeActions and nothing else", () => {
    const { edits } = harness(defaultProfile("dental"));
    expect(Object.keys(edits).sort()).toEqual([...EDIT_NAMES].sort());
    expect(EDIT_NAMES).toHaveLength(31);
  });

  it.each(EDIT_NAMES)("%s dispatches what its profile-actions function returns", (name) => {
    const c = CASES[name];
    const base = c.base ? c.base(defaultProfile("dental")) : defaultProfile("dental");
    const random = seededRandom();
    vi.spyOn(Math, "random").mockImplementation(random.next);
    const h = harness(base);
    const returned = c.run(h.edits);
    expect(h.dispatched).toHaveLength(1);
    const dispatched = h.result();
    random.reset();
    expect(dispatched).toEqual(c.expected(base, dispatched, returned));
  });

  it("pushes a map undo step from exactly the four map edits", () => {
    const pushers = EDIT_NAMES.filter((name) => {
      const c = CASES[name];
      const base = c.base ? c.base(defaultProfile("dental")) : defaultProfile("dental");
      const h = harness(base);
      c.run(h.edits);
      return h.pushUndo.mock.calls.length > 0;
    });
    expect(pushers.sort()).toEqual(
      ["setCustomPeople", "setCustomProcesses", "setMapLayout", "restoreMapVersion"].sort(),
    );
  });

  it("clears map history from exactly the three whole-business edits", () => {
    const clearers = EDIT_NAMES.filter((name) => {
      const c = CASES[name];
      const base = c.base ? c.base(defaultProfile("dental")) : defaultProfile("dental");
      const h = harness(base);
      c.run(h.edits);
      return h.clearHistory.mock.calls.length > 0;
    });
    expect(clearers.sort()).toEqual(["setIndustry", "replaceProfile", "resetProfile"].sort());
  });

  it("records map health as a derived change, not an owner's edit", () => {
    const h = harness(defaultProfile("dental"));
    h.edits.recordMapHealth(72);
    const action = h.dispatched[0];
    expect(typeof action).toBe("object");
    expect(action).toHaveProperty("derive");
  });

  it("replaces the whole profile with a value, not an updater", () => {
    const h = harness(defaultProfile("dental"));
    const next = defaultProfile("retail");
    h.edits.replaceProfile(next);
    expect(typeof h.dispatched[0]).toBe("object");
    expect(h.dispatched[0]).toEqual(normalizeProfile(next));
  });

  it("mints a fresh decision id outside the updater", () => {
    const h = harness(defaultProfile("dental"));
    h.edits.addDecision({ subject: "A", kind: "monitor", note: "" });
    const first = h.result().decisions.find((d) => d.subject === "A")?.id;
    expect(first).toMatch(/^dec_/);
    expect(first).not.toBe(makeDecisionId());
  });

  it("returns the saved map version and dispatches it", () => {
    const h = harness(defaultProfile("dental"));
    const version = h.edits.saveMapVersion("Before the hire", 64);
    expect(version.id).toMatch(/^ver_/);
    expect(version.name).toBe("Before the hire");
    expect(h.result().mapVersions?.[0]).toEqual(version);
  });

  it("restores nothing when the version id is unknown", () => {
    const h = harness(defaultProfile("dental"));
    h.edits.restoreMapVersion("ver_missing");
    expect(h.dispatched).toHaveLength(0);
    expect(h.pushUndo).not.toHaveBeenCalled();
  });

  it("confirms no leavers when given none", () => {
    const h = harness(defaultProfile("dental"));
    h.edits.confirmLeaverAccess([]);
    expect(h.dispatched).toHaveLength(0);
  });

  it("keeps the profile when the access reconciliation resolves to nothing", () => {
    const base = defaultProfile("dental");
    const h = harness(base);
    h.edits.setAccessReconciliation(undefined);
    expect(h.result()).toBe(base);
  });

  it("refuses a procedure that does not fit and saves nothing", () => {
    const full = Array.from({ length: PROCEDURE_LIMITS.procedures }, (_, i) =>
      newProcedure({ industry: "dental", title: `Procedure ${i + 1}` }, TODAY),
    );
    const base = { ...defaultProfile("dental"), procedures: full };
    expect(procedureFits(base, procedure, TODAY)).toBe(false);
    const h = harness(base);
    expect(h.edits.saveProcedure(procedure)).toBe(false);
    expect(h.dispatched).toHaveLength(0);
    const room = harness(defaultProfile("dental"));
    expect(room.edits.saveProcedure(procedure)).toBe(true);
    expect(room.dispatched).toHaveLength(1);
  });

  it("tells the owner once when their team replaces the sample's", () => {
    const base = defaultProfile("dental");
    expect(replacesSampleTeam(base, team)).toBe(true);
    const h = harness(base);
    h.edits.setCustomPeople(team);
    expect(toast).toHaveBeenCalledTimes(1);
    expect(vi.mocked(toast).mock.calls[0][0]).toBe("Your team replaced the sample team");

    vi.mocked(toast).mockClear();
    const own = withPeople(base, team, TODAY);
    const again = harness(own);
    again.edits.setCustomPeople((people) => [...people]);
    expect(replacesSampleTeam(own, currentPeople(own))).toBe(false);
    expect(toast).not.toHaveBeenCalled();
  });
});
