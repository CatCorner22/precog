import { describe, expect, it } from "vitest";
import { newProcedure, newStep } from "./lifecycle";
import type { Procedure } from "./types";
import {
  findPassive,
  screenProcedureWriting,
  stepWritingIssues,
  verificationBlockers,
} from "./writing";

const TODAY = "2026-10-01";

/** A procedure written to every standard the screen applies. */
function wellWritten(extra: Partial<Procedure> = {}): Procedure {
  return newProcedure(
    {
      industry: "general",
      title: "Release the weekly vendor payments",
      placeId: "qbo",
      module: "Expenses › Pay bills",
      purpose: "Pays approved bills on time. Done when every approved bill shows Paid.",
      trigger: "Every Thursday by noon",
      prerequisites: ["Bookkeeper sign-in to QuickBooks Online"],
      steps: [
        newStep("Sign in to QuickBooks Online."),
        newStep("Open Expenses and choose Pay bills."),
        {
          ...newStep("Tick only the bills marked Approved."),
          caution: "Never pay a bill that nobody approved.",
        },
        newStep("Click Schedule payments."),
      ],
      ...extra,
    },
    TODAY,
  );
}

const ids = (p: Procedure) => screenProcedureWriting(p).map((i) => i.id.split(":")[0]);
const stepIds = (text: string, caution?: string) =>
  stepWritingIssues({ ...newStep(text), ...(caution ? { caution } : {}) }, 1).map(
    (i) => i.id.split(":")[0],
  );

describe("the writing screen", () => {
  it("finds nothing in a procedure written to every standard", () => {
    expect(screenProcedureWriting(wellWritten())).toEqual([]);
    expect(verificationBlockers(wellWritten())).toEqual([]);
  });

  it("gives the same answer for the same text every time", () => {
    const p = wellWritten({ steps: [newStep("The bag is sealed, then counted.")] });
    expect(screenProcedureWriting(p)).toEqual(screenProcedureWriting(p));
  });

  describe("completeness", () => {
    it("requires steps, a purpose with what done looks like, when, and where", () => {
      expect(ids(wellWritten({ steps: [] }))).toContain("steps");
      expect(ids(wellWritten({ purpose: undefined }))).toContain("purpose");
      expect(ids(wellWritten({ purpose: "Pays approved bills on time." }))).toContain("done");
      expect(ids(wellWritten({ trigger: undefined }))).toContain("trigger");
      expect(ids(wellWritten({ trigger: undefined, cadence: "weekly" }))).not.toContain("trigger");
      expect(ids(wellWritten({ placeId: undefined, module: undefined }))).toContain("where");
    });

    it("requires an instruction in a step that has only a caution or a picture", () => {
      expect(
        ids(wellWritten({ steps: [{ ...newStep(""), caution: "Mind the drawer." }] })),
      ).toContain("instruction");
    });

    it("advises listing what is needed first on software, without blocking", () => {
      const issues = screenProcedureWriting(wellWritten({ prerequisites: [] }), {
        place: { id: "qbo", kind: "software", name: "QuickBooks Online" },
      });
      expect(issues).toEqual([expect.objectContaining({ id: "prerequisites", blocking: false })]);
    });
  });

  describe("active voice", () => {
    it("requires each step to start with what to do", () => {
      expect(stepIds("The drawer is counted by the closer.")).toEqual(
        expect.arrayContaining(["verb", "passive"]),
      );
      expect(stepIds("Count the drawer.")).toEqual([]);
      expect(stepIds("If the total is off, call the owner.")).toEqual([]);
    });

    it("finds the passive anywhere, including irregular verbs and a caution", () => {
      expect(findPassive("Send it before it is released.")).toBe("is released");
      expect(findPassive("Check the bill has already been paid.")).toBe("been paid");
      expect(findPassive("Deposit is made at noon.")).toBe("is made");
      expect(findPassive("Make sure the bag is not sealed.")).toBe("is not sealed");
      expect(stepIds("Count the drawer.", "Cash must be kept in the safe.")).toEqual([
        "caution-passive",
      ]);
      expect(ids(wellWritten({ purpose: "Done when every bill is paid." }))).toContain("passive");
    });

    it("does not call a state or a colour the passive", () => {
      expect(findPassive("Check that the safe is locked.")).toBeNull();
      expect(findPassive("Skip it if the bank is closed.")).toBeNull();
      expect(findPassive("Stop if the light is red.")).toBeNull();
    });
  });

  describe("clarity", () => {
    it("refuses should, shall, and/or and vague words", () => {
      expect(stepIds("You should count the drawer.")).toContain("modal");
      expect(stepIds("Count the drawer; it shall balance.")).toContain("modal");
      expect(stepIds("Call the owner and/or the bookkeeper.")).toContain("and-or");
      expect(stepIds("Fill in the form, etc.")).toContain("vague");
      expect(ids(wellWritten({ title: "What staff should do at close" }))).toContain("modal");
    });

    it("says which word to replace, and with what", () => {
      const [issue] = stepWritingIssues(newStep("Count the drawer as needed."), 3);
      expect(issue).toMatchObject({
        step: 3,
        standard: "clarity",
        blocking: true,
        title: "Replace “as needed” with exactly what to do.",
      });
      const [modal] = stepWritingIssues(newStep("Count it before you should leave."), 1);
      expect(modal.title).toBe(
        "Replace “should” with “must” for a requirement or “may” for a choice, or state the condition with “if”.",
      );
    });

    it("requires one action per step, but not for an abbreviation or a condition", () => {
      expect(stepIds("Count the drawer, then seal the bag.")).toEqual(["one-action"]);
      expect(stepIds("Count the drawer. Seal the bag.")).toEqual(["one-action"]);
      expect(stepIds("Call Dr. Patel for approval.")).toEqual([]);
      expect(stepIds("If the deposit is over $10,000 then file a CTR.")).toEqual([]);
    });

    it("advises, without blocking, on long steps, Latin abbreviations and double negatives", () => {
      const advice = (text: string) =>
        stepWritingIssues(newStep(text), 1).map((i) => [i.id.split(":")[0], i.blocking]);
      expect(advice(`Open the ${"very ".repeat(45)}long report.`)).toEqual([["long", false]]);
      expect(advice("Pick a report, e.g. the aging report.")).toEqual([["latin", false]]);
      expect(advice("Expect a short count, which is not unusual.")).toEqual([
        ["double-negative", false],
      ]);
    });
  });

  describe("consistency", () => {
    it("refuses two words for one thing anywhere in the procedure", () => {
      const p = wellWritten({
        steps: [newStep("Log in to QuickBooks Online."), newStep("Sign in to the bank.")],
      });
      const issue = screenProcedureWriting(p).find((i) => i.id.startsWith("terms:"));
      expect(issue).toMatchObject({
        standard: "consistency",
        blocking: true,
        title: "Use one term for signing in; it says “log in” and “sign in”.",
      });
      expect(ids(wellWritten({ prerequisites: ["Bookkeeper login"] }))).toContain("terms");
    });

    it("advises ending every step the same way", () => {
      const p = wellWritten({ steps: [newStep("Open Pay bills."), newStep("Click Schedule")] });
      expect(screenProcedureWriting(p)).toEqual([
        expect.objectContaining({ id: "punctuation", blocking: false }),
      ]);
    });
  });

  it("lists errors before advice, and names the field or step", () => {
    const p = wellWritten({
      trigger: "When the bills are approved",
      steps: [newStep("Open Pay bills."), newStep(`Click ${"the ".repeat(60)}button.`)],
    });
    const issues = screenProcedureWriting(p);
    expect(issues.map((i) => i.blocking)).toEqual([true, false]);
    expect(issues[0].title).toBe("In when to do it: rewrite “are approved” to say who does it.");
    expect(issues[1].step).toBe(2);
  });
});
