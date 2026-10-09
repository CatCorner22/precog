import { describe, expect, it } from "vitest";
import { CASE_LIBRARY } from "@/lib/precog/evidence";
import { INDUSTRIES } from "@/lib/precog/industry";
import { suggestedDuties } from "@/lib/precog/onboarding/own-team";
import { UNANSWERED } from "@/lib/precog/onboarding/setup-answers";
import { ONE_PERSON_NOTE, onePersonNote } from "./industry-onboarding-helpers";
import { caseCoveragePhrase, titleTicksItems } from "./industry-onboarding-helpers";

const total = CASE_LIBRARY.length;
const inSectors = (...sectors: string[]) =>
  CASE_LIBRARY.filter((c) => sectors.includes(c.sector)).length;

describe("caseCoveragePhrase", () => {
  it("states a line of business's own count beside the whole library's, both from the library", () => {
    expect(caseCoveragePhrase("retail")).toBe(
      `${inSectors("retail")} prosecuted cases in retail, ${total} across all lines of business`,
    );
    expect(caseCoveragePhrase("construction")).toBe(
      `${inSectors("construction", "trades")} prosecuted cases in construction and the trades, ${total} across all lines of business`,
    );
    expect(caseCoveragePhrase("dental")).toBe(
      `${inSectors("dental", "medical", "veterinary")} prosecuted cases in dental, medical and veterinary practices, ${total} across all lines of business`,
    );
  });

  it("gives the general template the whole library", () => {
    expect(caseCoveragePhrase("general")).toBe(
      `${total} prosecuted cases across all lines of business`,
    );
  });

  it("never claims coverage for a line of business without saying the library total", () => {
    for (const ind of INDUSTRIES) {
      expect(caseCoveragePhrase(ind.id)).toMatch(
        new RegExp(`\\b${total} (prosecuted cases )?across all lines of business$`),
      );
      expect(caseCoveragePhrase(ind.id)).not.toContain("this line of business");
    }
  });
});

describe("setup leave confirms", () => {
  it("asks on Escape whenever typed work exists, and names the loss when storage is broken", async () => {
    const { leaveSetupConfirm } = await import("./industry-onboarding-helpers");
    expect(
      leaveSetupConfirm({
        typed: false,
        keepsNothing: true,
        draftSaved: false,
        returnsToName: "Ridgeview",
      }),
    ).toBeNull();
    expect(
      leaveSetupConfirm({
        typed: true,
        keepsNothing: false,
        draftSaved: true,
        returnsToName: "Ridgeview",
      }),
    ).toBe("Leave setup and go back to Ridgeview?");
    expect(
      leaveSetupConfirm({
        typed: true,
        keepsNothing: true,
        draftSaved: null,
        returnsToName: "Ridgeview",
      }),
    ).toBe("Leave setup and go back to Ridgeview? This browser will not keep what you typed.");
    expect(
      leaveSetupConfirm({
        typed: true,
        keepsNothing: false,
        draftSaved: false,
        returnsToName: "R",
      }),
    ).toContain("will not keep what you typed");
  });

  it("asks on Cancel only when leaving loses typed work", async () => {
    const { cancelSetupConfirm } = await import("./industry-onboarding-helpers");
    expect(cancelSetupConfirm({ typed: false, keepsNothing: true, draftSaved: false })).toBeNull();
    expect(cancelSetupConfirm({ typed: true, keepsNothing: false, draftSaved: true })).toBeNull();
    expect(cancelSetupConfirm({ typed: true, keepsNothing: false, draftSaved: null })).toBeNull();
    expect(cancelSetupConfirm({ typed: true, keepsNothing: true, draftSaved: null })).toBe(
      "Cancel setup? This browser will not keep what you typed.",
    );
    expect(cancelSetupConfirm({ typed: true, keepsNothing: false, draftSaved: false })).toBe(
      "Cancel setup? This browser will not keep what you typed.",
    );
  });
});

describe("titleTicksItems", () => {
  it("lists each named person whose job title suggested duties not yet decided, with those duties", () => {
    const answers = { ...UNANSWERED, bankRec: "outside" as const };
    const items = titleTicksItems(
      [
        {
          name: "",
          role: "Bookkeeper",
          duties: ["post_payments"],
          suggestedFor: "Bookkeeper",
          rowId: "a",
        },
        {
          name: " Lisa ",
          role: "Bookkeeper",
          duties: suggestedDuties("Bookkeeper", false, "dental", answers),
          suggestedFor: "Bookkeeper",
          keptDuties: ["release_payment"],
          rowId: "b",
        },
        { name: "Cal", role: "Front Desk", duties: ["post_payments"], rowId: "c" },
      ],
      "dental",
      answers,
    );
    expect(items).toEqual([
      {
        rowId: "b",
        who: "Lisa",
        role: "Bookkeeper",
        // Kept duties leave the list; duties with no grid column stay in it.
        duties: [
          "post_payments",
          "enter_invoices",
          "create_vendor",
          "enter_payroll",
          "post_journal_entries",
          "review_card_statement",
        ],
      },
    ]);
  });
});

describe("onePersonNote", () => {
  it("offers the one-person setup only while one person or nobody is named", () => {
    expect(onePersonNote(0)).toBe(ONE_PERSON_NOTE);
    expect(onePersonNote(1)).toBe(ONE_PERSON_NOTE);
    // Priya named four people and still read "sole-owner setup".
    expect(onePersonNote(4)).toBeNull();
  });
});
