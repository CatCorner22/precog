import { describe, expect, it } from "vitest";
import { newProcedure, newStep, verifyProcedure } from "./lifecycle";
import { procedureRecommendations, stepRecommendations } from "./quality";
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
        purpose: "Pays approved bills on time; done when every approved bill shows Paid.",
        trigger: "Every Thursday by noon",
        prerequisites: ["Bookkeeper login to QuickBooks Online"],
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

  it("puts fixes before improvements", () => {
    const recs = procedureRecommendations(exemplary({ backupPersonIds: [], purpose: undefined }), {
      place: software,
      today: TODAY,
    });
    expect(recs.map((r) => r.level)).toEqual(["fix", "improve"]);
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

describe("the check on each step", () => {
  const titles = (text: string) =>
    stepRecommendations(newStep(text), 1).map((r) => r.id.split(":")[0]);

  it("asks for an instruction instead of a description", () => {
    expect(titles("The drawer is counted by the closer.")).toEqual(["verb"]);
    expect(titles("Deposit is made at noon.")).toEqual(["verb"]);
    expect(titles("Count the drawer.")).toEqual([]);
    expect(titles("Make sure the bag is sealed.")).toEqual([]);
    expect(titles("If the total is off, call the owner.")).toEqual([]);
  });

  it("asks for one action per step, but not for an abbreviation or a condition", () => {
    expect(titles("Count the drawer, then seal the bag.")).toEqual(["one-action"]);
    expect(titles("Count the drawer. Seal the bag.")).toEqual(["one-action"]);
    expect(titles("Call Dr. Patel for approval.")).toEqual([]);
    expect(titles("If the deposit is over $10,000 then file a CTR.")).toEqual([]);
  });

  it("asks to replace vague words and shorten long steps", () => {
    expect(titles("Fill in the form, etc.")).toEqual(["vague"]);
    expect(stepRecommendations(newStep("Fill in the form, etc."), 2)[0].title).toBe(
      "Replace “etc.” with exactly what to do.",
    );
    expect(titles(`Open the ${"very ".repeat(45)}long report.`)).toEqual(["long"]);
  });

  it("numbers each step as the procedure shows it", () => {
    const p = exemplary({
      steps: [newStep("Open Pay bills."), newStep(""), newStep("The bills are ticked.")],
    });
    const verb = procedureRecommendations(p, { place: software, today: TODAY }).find((r) =>
      r.id.startsWith("verb"),
    );
    expect(verb?.step).toBe(2);
  });
});
