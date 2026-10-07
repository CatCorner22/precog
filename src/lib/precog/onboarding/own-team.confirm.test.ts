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
// including reconcile bank and set up suppliers. An owner who did not untick
// them would have saved a wrong map.
const ruth = (): OwnTeamRow =>
  titleTicksFor({ name: "Ruth", role: "Bookkeeper", duties: [] }, "restaurant", UNANSWERED);

const duties = (row: OwnTeamRow) =>
  (buildOwnTeam([row], "restaurant", UNANSWERED)[0].entitlements ?? []).filter(
    (d) => d !== "view_reports_only",
  );

describe("a duty a job title suggests counts only once the owner keeps it", () => {
  it("leaves Bookkeeper's suggested duties out of the built team until they are kept", () => {
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
    expect(duties(row)).toEqual([]);

    const kept = keepDuties(row, unconfirmedDuties(row, "restaurant", UNANSWERED));
    expect(unconfirmedDuties(kept, "restaurant", UNANSWERED)).toEqual([]);
    expect(duties(kept).sort()).toEqual([...row.duties].sort());
    // Kept by the owner, so the duties are no longer a guess from the title.
    expect(buildOwnTeam([kept], "restaurant")[0].dutiesFromTitle).toBeUndefined();
  });

  it("drops a suggested duty the owner removes, and keeps the rest once kept", () => {
    const removed = toggleDutyByHand(ruth(), "bank_reconcile");
    const waiting = unconfirmedDuties(removed, "restaurant", UNANSWERED);
    expect(waiting).not.toContain("bank_reconcile");
    expect(waiting).toHaveLength(7);
    const decided = keepDuties(removed, waiting);
    expect(duties(decided)).not.toContain("bank_reconcile");
    expect(duties(decided)).toContain("release_payment");
    expect(duties(decided)).toHaveLength(7);
  });

  it("keeps one duty at a time: only kept duties count", () => {
    const row = keepDuties(ruth(), ["enter_invoices"]);
    expect(duties(row)).toEqual(["enter_invoices"]);
    expect(unconfirmedDuties(row, "restaurant", UNANSWERED)).not.toContain("enter_invoices");
  });

  it("lists a suggested duty with no grid column among those waiting", () => {
    const waiting = unconfirmedDuties(ruth(), "restaurant", UNANSWERED);
    expect(waiting).toContain("post_journal_entries");
    expect(waiting).toContain("review_card_statement");
  });

  it("counts a duty ticked by hand at once, even one the title suggested", () => {
    const handTicked = toggleDutyByHand(ruth(), "approve_writeoffs");
    expect(duties(handTicked)).toEqual(["approve_writeoffs"]);
    // Unticked, then ticked again by hand: the owner's own entry.
    const again = toggleDutyByHand(toggleDutyByHand(ruth(), "enter_invoices"), "enter_invoices");
    expect(duties(again)).toEqual(["enter_invoices"]);
    // A row with no title has nothing to confirm.
    const plain: OwnTeamRow = { name: "Gina", role: "Manager", duties: ["approve_vendor"] };
    expect(unconfirmedDuties(plain, "restaurant")).toEqual([]);
    expect(buildOwnTeam([plain], "restaurant")[0].entitlements).toContain("approve_vendor");
  });

  it("keeps the old title's guesses waiting after the title is retyped by hand", () => {
    const touched = toggleDutyByHand(ruth(), "create_vendor");
    const retyped = { ...touched, role: "Office Assistant" };
    expect(unconfirmedDuties(retyped, "restaurant", UNANSWERED)).toHaveLength(7);
    expect(duties(retyped)).toEqual([]);
  });

  it("forgets what was kept when a new title ticks its own suggestion", () => {
    const kept = keepDuties(ruth(), ["release_payment"]);
    const cashier = titleTicksFor({ ...kept, role: "Cashier" }, "restaurant", UNANSWERED);
    expect(cashier.keptDuties).toBeUndefined();
    expect(duties(cashier)).toEqual([]);
    expect(cashier.duties).toEqual(suggestedDuties("Cashier", false, "restaurant"));
  });

  it("leaves duties the answers hide out of the review; they never count", () => {
    const outside = { ...UNANSWERED, bankRec: "outside" as const };
    const [row] = fitDutiesToAnswers([ruth()], outside, "restaurant");
    expect(unconfirmedDuties(row, "restaurant", outside)).not.toContain("bank_reconcile");
  });
});

describe("the grid ticks only what the owner chose", () => {
  it("shows none of a job title's suggestions ticked until each is kept", () => {
    expect(chosenDuties(ruth(), "restaurant")).toEqual([]);
    const kept = keepDuties(ruth(), ["release_payment"]);
    expect(chosenDuties(kept, "restaurant")).toEqual(["release_payment"]);
  });

  it("keeps a suggested duty the owner ticks by hand, and unticks a chosen one", () => {
    const ticked = tickDutyByHand(ruth(), "bank_reconcile", "restaurant");
    expect(chosenDuties(ticked, "restaurant")).toEqual(["bank_reconcile"]);
    expect(duties(ticked)).toEqual(["bank_reconcile"]);
    const unticked = tickDutyByHand(ticked, "bank_reconcile", "restaurant");
    expect(unticked.duties).not.toContain("bank_reconcile");
    // A duty no title suggested is ticked by hand as before.
    const extra = tickDutyByHand(ruth(), "approve_writeoffs", "restaurant");
    expect(chosenDuties(extra, "restaurant")).toEqual(["approve_writeoffs"]);
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
