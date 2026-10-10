import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  confirmedControlIds,
  controlsInPlace,
  resolveTemplate,
} from "@/lib/precog/active-template";
import { resolveNavTarget } from "@/lib/precog/navigation";
import { defaultProfile } from "@/lib/precog/practice-profile";
import { ReadOnlyPracticeProvider } from "@/lib/precog/read-only-practice";
import type { ControlItem } from "@/lib/precog/types";
import {
  confirmControlEntry,
  inPlaceEntry,
  takeOffSetupControlPrompt,
} from "@/lib/precog/control-entries";
import { ownSetupProfile } from "@/lib/precog/business-lifecycle";
import { UNANSWERED } from "@/lib/precog/onboarding/setup-answers";
import type { PracticeProfile } from "@/lib/precog/practice-profile";
import { withDecision, withSetupControlWithdrawn } from "@/lib/precog/profile-actions";
import { SodControlsSection } from "./sod-controls-section";

const control: ControlItem = {
  id: "ctl-cash",
  name: "Cash handling split",
  description: "Two people count the drawer.",
  duties: [],
  segregated: false,
  compensatingControls: [],
  residualRiskAccepted: false,
};
const now = new Date(2026, 9, 2);

describe("the Controls view's Decisions log entries", () => {
  it('records a control in place under linkedTab "control-in-place", as before', () => {
    const entry = inPlaceEntry(control, "The CFO reviews each bank reconciliation", now);
    expect(entry).toEqual({
      subject: "In place: Cash handling split",
      kind: "monitor",
      note: "The CFO reviews each bank reconciliation",
      reviewBy: "2026-12-31",
      linkedTab: "control-in-place",
      linkedId: "ctl-cash",
    });
    // The engines still read it, and its "Open" button lands on Controls.
    expect(controlsInPlace([entry], "general")).toEqual({
      "ctl-cash": ["The CFO reviews each bank reconciliation"],
    });
    expect(resolveNavTarget(entry.linkedTab!, entry.linkedId)).toEqual({
      tab: "sod",
      item: "controls",
    });
  });

  it('confirms a sample control under linkedTab "control", as before', () => {
    const entry = confirmControlEntry({ ...control, starter: true }, now);
    expect(entry.linkedTab).toBe("control");
    expect(entry.linkedId).toBe("ctl-cash");
    expect(entry.reviewBy).toBe("2026-12-31");
    expect(confirmedControlIds([entry], "general")).toEqual(["ctl-cash"]);
    expect(resolveNavTarget(entry.linkedTab!)).toEqual({ tab: "sod", item: "controls" });
  });
});

describe("the Controls view", () => {
  it("lists every control in the template under its heading", () => {
    const profile = defaultProfile("general");
    const html = renderToStaticMarkup(
      <ReadOnlyPracticeProvider profile={profile}>
        <SodControlsSection />
      </ReadOnlyPracticeProvider>,
    );
    expect(html).toContain("<h2");
    expect(html).toContain("Controls");
    for (const c of resolveTemplate(profile).controls) {
      expect(html).toContain(c.name.replace(/&/g, "&amp;").replace(/'/g, "&#x27;"));
    }
  });
});

describe("the Controls view's credits from the setup answers", () => {
  const STATEMENT = "The owner opens and reads the bank statement each month (answered at setup).";
  // Bayside Dental: Lisa pays the bills and reconciles the bank; Dana said
  // at setup that she reads the statement.
  const bayside: PracticeProfile = ownSetupProfile({
    industry: "dental",
    practiceName: "Bayside Dental",
    people: [
      {
        id: "own-dana",
        name: "Dana Reyes",
        role: "Owner",
        active: true,
        owner: true,
        entitlements: ["approve_payroll", "sign_checks"],
      },
      {
        id: "own-lisa",
        name: "Lisa Park",
        role: "Office Manager",
        active: true,
        entitlements: ["release_payment", "bank_reconcile", "enter_invoices", "create_vendor"],
      },
    ],
    answers: { ...UNANSWERED, ownerReadsStatement: "yes" },
  });
  const page = (profile: PracticeProfile) =>
    renderToStaticMarkup(
      <ReadOnlyPracticeProvider profile={profile}>
        <SodControlsSection />
      </ReadOnlyPracticeProvider>,
    ).replace(/&#x27;/g, "'");
  const takeOff = (html: string) => html.match(/aria-label="Take it off: ([^"]*)"/g) ?? [];

  it("lists each setup credit with Take it off, not as a journal entry to remove", () => {
    const html = page(bayside);
    // Bill approval and cash handling each carry the statement credit.
    expect(takeOff(html)).toEqual([
      `aria-label="Take it off: ${STATEMENT}"`,
      `aria-label="Take it off: ${STATEMENT}"`,
    ]);
    expect(html).toContain(`Already in place: ${STATEMENT} <button`);
    expect(html).not.toContain("remove an entry there to take it off");
  });

  it("drops a credit the owner took off, and keeps the journal's own entries on their line", () => {
    const ap = resolveTemplate(bayside).controls.find((c) => c.id === "c-sod-ap")!;
    const taken = withDecision(
      withSetupControlWithdrawn(bayside, "ownerReadsStatement:c-sod-ap"),
      inPlaceEntry(ap, "Dana signs every bill over $500", now),
      "dec-1",
      now,
    );
    const html = page(taken);
    expect(takeOff(html)).toEqual([`aria-label="Take it off: ${STATEMENT}"`]);
    expect(html).toContain(
      "Already in place: Dana signs every bill over $500 (from your Decisions log; remove an entry there to take it off)",
    );
    expect(html).not.toContain(`${STATEMENT} (from your`);
  });

  it("asks before taking a credit off, with the one warning for what cannot be undone", () => {
    expect(takeOffSetupControlPrompt("Bill approval", STATEMENT)).toBe(
      `Take "${STATEMENT}" off Bill approval? Precog stops counting it as in place there. You cannot undo this.`,
    );
  });
});
