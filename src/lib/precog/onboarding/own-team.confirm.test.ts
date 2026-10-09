import { describe, expect, it } from "vitest";
import {
  buildOwnTeam,
  chosenDuties,
  fitDutiesToAnswers,
  keepDuties,
  suggestedDuties,
  tickDutyByHand,
  titleTicksFor,
  toggleDutyByHand,
  unconfirmedDuties,
  type OwnTeamRow,
} from "./own-team";
import { UNANSWERED } from "./setup-answers";

// Marco's walkthrough (2026-10-07): "Bookkeeper" ticked 8 duties for Ruth,
// including reconcile bank and set up suppliers. Those ticks count from the
// start, so "Show me my gaps" never waits on a second pass over them; the
// person carries the "from the job title" mark until the owner keeps the
// ticks or unticks the wrong ones, and Team and the findings say so.
const ruth = (): OwnTeamRow =>
  titleTicksFor({ name: "Ruth", role: "Bookkeeper", duties: [] }, "restaurant", UNANSWERED);

const duties = (row: OwnTeamRow) =>
  (buildOwnTeam([row], "restaurant", UNANSWERED)[0].entitlements ?? []).filter(
    (d) => d !== "view_reports_only",
  );

describe("a duty a job title ticks counts at once and carries the title mark until kept", () => {
  it("puts Bookkeeper's ticked duties on the built team, marked as from the title", () => {
    const row = ruth();
    expect(row.duties).toHaveLength(8);
    expect(unconfirmedDuties(row, "restaurant", UNANSWERED)).toEqual([
      "post_payments",
      "bank_reconcile",
      "enter_invoices",
      "create_vendor",
      "release_payment",
      "enter_payroll",
      "post_journal_entries",
      "review_card_statement",
    ]);
    expect(duties(row).sort()).toEqual([...row.duties].sort());
    expect(buildOwnTeam([row], "restaurant")[0].dutiesFromTitle).toBe(true);

    const kept = keepDuties(row, unconfirmedDuties(row, "restaurant", UNANSWERED));
    expect(unconfirmedDuties(kept, "restaurant", UNANSWERED)).toEqual([]);
    expect(duties(kept).sort()).toEqual([...row.duties].sort());
    // Kept by the owner, so the duties are no longer a guess from the title.
    expect(buildOwnTeam([kept], "restaurant")[0].dutiesFromTitle).toBeUndefined();
  });

  it("drops a ticked duty the owner unticks, and keeps the rest", () => {
    const removed = toggleDutyByHand(ruth(), "bank_reconcile");
    const waiting = unconfirmedDuties(removed, "restaurant", UNANSWERED);
    expect(waiting).not.toContain("bank_reconcile");
    expect(waiting).toHaveLength(7);
    expect(duties(removed)).not.toContain("bank_reconcile");
    expect(duties(removed)).toContain("release_payment");
    expect(duties(removed)).toHaveLength(7);
    // Still marked: seven ticks are the title's, not the owner's.
    expect(buildOwnTeam([removed], "restaurant")[0].dutiesFromTitle).toBe(true);
  });

  it("keeps one duty at a time: the mark stays while any tick is still the title's", () => {
    const row = keepDuties(ruth(), ["enter_invoices"]);
    expect(duties(row)).toHaveLength(8);
    expect(unconfirmedDuties(row, "restaurant", UNANSWERED)).not.toContain("enter_invoices");
    expect(buildOwnTeam([row], "restaurant")[0].dutiesFromTitle).toBe(true);
  });

  it("lists a ticked duty with no grid column among those from the title", () => {
    const waiting = unconfirmedDuties(ruth(), "restaurant", UNANSWERED);
    expect(waiting).toContain("post_journal_entries");
    expect(waiting).toContain("review_card_statement");
  });

  it("confirms a duty ticked by hand at once, even one the title had ticked", () => {
    const handTicked = toggleDutyByHand(ruth(), "approve_writeoffs");
    expect(duties(handTicked)).toContain("approve_writeoffs");
    expect(unconfirmedDuties(handTicked, "restaurant", UNANSWERED)).not.toContain(
      "approve_writeoffs",
    );
    // Unticked, then ticked again by hand: the owner's own entry.
    const again = toggleDutyByHand(toggleDutyByHand(ruth(), "enter_invoices"), "enter_invoices");
    expect(duties(again)).toContain("enter_invoices");
    expect(unconfirmedDuties(again, "restaurant", UNANSWERED)).not.toContain("enter_invoices");
    // A row with no catalog title has nothing from a title.
    const plain: OwnTeamRow = { name: "Gina", role: "Manager", duties: ["approve_vendor"] };
    expect(unconfirmedDuties(plain, "restaurant")).toEqual([]);
    const built = buildOwnTeam([plain], "restaurant")[0];
    expect(built.entitlements).toContain("approve_vendor");
    expect(built.dutiesFromTitle).toBeUndefined();
  });

  it("keeps the old title's ticks marked after the title is retyped by hand", () => {
    const touched = toggleDutyByHand(ruth(), "create_vendor");
    const retyped = { ...touched, role: "Office Assistant" };
    expect(unconfirmedDuties(retyped, "restaurant", UNANSWERED)).toHaveLength(7);
    expect(duties(retyped)).toHaveLength(7);
    expect(buildOwnTeam([retyped], "restaurant")[0].dutiesFromTitle).toBe(true);
  });

  it("forgets what was kept when a new title ticks its own duties", () => {
    const kept = keepDuties(ruth(), ["release_payment"]);
    const cashier = titleTicksFor({ ...kept, role: "Cashier" }, "restaurant", UNANSWERED);
    expect(cashier.keptDuties).toBeUndefined();
    expect(cashier.duties).toEqual(suggestedDuties("Cashier", false, "restaurant"));
    expect(duties(cashier).sort()).toEqual([...cashier.duties].sort());
  });

  it("leaves duties the answers hide out of the title's ticks; they never count", () => {
    const outside = { ...UNANSWERED, bankRec: "outside" as const };
    const [row] = fitDutiesToAnswers([ruth()], outside, "restaurant");
    expect(unconfirmedDuties(row, "restaurant", outside)).not.toContain("bank_reconcile");
    expect(buildOwnTeam([row], "restaurant", outside)[0].entitlements).not.toContain(
      "bank_reconcile",
    );
  });
});

describe("the grid ticks everything the row holds", () => {
  it("shows a job title's ticks as ticked from the start", () => {
    expect(chosenDuties(ruth(), "restaurant")).toEqual(ruth().duties);
    const kept = keepDuties(ruth(), ["release_payment"]);
    expect(chosenDuties(kept, "restaurant")).toEqual(ruth().duties);
  });

  it("unticks a title's tick like any other, and confirms a tick set by hand", () => {
    const unticked = tickDutyByHand(ruth(), "bank_reconcile", "restaurant");
    expect(chosenDuties(unticked, "restaurant")).not.toContain("bank_reconcile");
    expect(duties(unticked)).not.toContain("bank_reconcile");
    const back = tickDutyByHand(unticked, "bank_reconcile", "restaurant");
    expect(chosenDuties(back, "restaurant")).toContain("bank_reconcile");
    expect(unconfirmedDuties(back, "restaurant", UNANSWERED)).not.toContain("bank_reconcile");
    // A duty no title ticked is ticked by hand as before.
    const extra = tickDutyByHand(ruth(), "approve_writeoffs", "restaurant");
    expect(chosenDuties(extra, "restaurant")).toContain("approve_writeoffs");
  });
});

describe("unanswered money questions", () => {
  it("build the same team as Not sure", () => {
    const rows = [keepDuties(ruth(), ["release_payment", "enter_payroll", "bank_reconcile"])];
    const notSure = { ...UNANSWERED };
    for (const key of Object.keys(notSure) as (keyof typeof notSure)[]) {
      expect(notSure[key]).toBe("unsure");
    }
    expect(buildOwnTeam(fitDutiesToAnswers(rows, UNANSWERED, "restaurant"), "restaurant")).toEqual(
      buildOwnTeam(fitDutiesToAnswers(rows, notSure, "restaurant"), "restaurant"),
    );
  });
});
