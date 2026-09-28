import { describe, expect, it } from "vitest";
import { newProcedure, newStep, verifyProcedure } from "./lifecycle";
import { procedureRecommendations } from "./quality";
import type { Place, Procedure } from "./types";

const TODAY = "2026-10-01";
const software: Place = { id: "qbo", kind: "software", name: "QuickBooks Online" };

/** A procedure that follows every practice the check looks for. */
function exemplary(extra: Partial<Procedure> = {}): Procedure {
  return verifyProcedure(
    newProcedure(
      {
        industry: "general",
        title: "Release the weekly vendor payments",
        placeId: "qbo",
        module: "Expenses › Pay bills",
        purpose: "Pays approved bills on time. Done when every approved bill shows Paid.",
        trigger: "Every Thursday by noon",
        prerequisites: ["Bookkeeper sign-in to QuickBooks Online"],
        ownerPersonId: "p1",
        backupPersonIds: ["p2"],
        reviewerPersonId: "p3",
        dutyIds: ["release_payment"],
        steps: [
          newStep("Open Expenses and choose Pay bills."),
          {
            ...newStep("Tick only the bills marked Approved."),
            caution: "Never pay a bill without approval.",
          },
          { ...newStep("Click Schedule payments."), imageIds: ["img_a"] },
        ],
        ...extra,
      },
      TODAY,
    ),
    "p3",
    TODAY,
  );
}

const ids = (p: Procedure, place: Place | null = software) =>
  procedureRecommendations(p, { place, today: TODAY }).map((r) => r.id.split(":")[0]);

describe("the best-practice check", () => {
  it("has nothing to say about a procedure that follows every practice", () => {
    expect(procedureRecommendations(exemplary(), { place: software, today: TODAY })).toEqual([]);
  });

  it("asks for steps first, and nothing else, when there are none", () => {
    expect(ids(exemplary({ steps: [] }))).toEqual(["steps"]);
  });

  it("names each missing piece of a procedure", () => {
    const bare = exemplary({
      purpose: undefined,
      trigger: undefined,
      placeId: undefined,
      module: undefined,
      prerequisites: [],
      ownerPersonId: undefined,
      backupPersonIds: [],
    });
    expect(ids(bare, null).sort()).toEqual(["backup", "owner", "purpose", "trigger", "where"]);
    expect(ids(exemplary({ prerequisites: [] }))).toEqual(["prerequisites"]);
  });

  it("asks for a caution where money moves, a second checker, and a screenshot", () => {
    const risky = exemplary({
      steps: [
        newStep("Open Pay bills."),
        newStep("Tick the approved bills."),
        newStep("Click Schedule."),
      ],
      reviewerPersonId: "p1",
    });
    expect(ids(risky).sort()).toEqual(["caution", "pictures", "reviewer"]);
    const signedOut = procedureRecommendations(risky, {
      place: software,
      today: TODAY,
      canAddPictures: false,
    });
    expect(signedOut.map((r) => r.id)).not.toContain("pictures");
  });

  it("puts writing errors first, then other fixes, then improvements", () => {
    const recs = procedureRecommendations(
      exemplary({ backupPersonIds: [], purpose: undefined, ownerPersonId: undefined }),
      { place: software, today: TODAY },
    );
    expect(recs.map((r) => [r.id, r.level, Boolean(r.blocksVerification)])).toEqual([
      ["purpose", "fix", true],
      ["backup", "fix", false],
      ["owner", "improve", false],
    ]);
    expect(recs[0].standard).toBe("completeness");
    expect(recs[1].standard).toBeUndefined();
  });

  it("flags a written secret, drafted steps, and a check that has lapsed or is missing", () => {
    expect(ids(exemplary({ steps: [newStep("Sign in with password: Summer2026!")] }))).toContain(
      "secret",
    );
    const drafted = exemplary();
    drafted.steps = [{ ...drafted.steps[0], aiDrafted: true }, ...drafted.steps.slice(1)];
    expect(ids(drafted)).toContain("ai-draft");
    const lapsed = procedureRecommendations(exemplary(), { place: software, today: "2027-06-01" });
    expect(lapsed.find((r) => r.id === "verify")?.level).toBe("fix");
    const unchecked = { ...exemplary(), verifiedAt: undefined };
    expect(ids(unchecked)).toContain("verify");
  });
});

describe("the writing screen inside the check", () => {
  it("carries each step's writing issues, numbered as the procedure shows it", () => {
    const p = exemplary({
      steps: [newStep("Open Pay bills."), newStep(""), newStep("The bills are ticked.")],
    });
    const recs = procedureRecommendations(p, { place: software, today: TODAY });
    const verb = recs.find((r) => r.id.startsWith("verb"));
    expect(verb).toMatchObject({ step: 2, standard: "active-voice", blocksVerification: true });
  });
});
