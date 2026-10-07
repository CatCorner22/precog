import { describe, expect, it } from "vitest";
import { CONTROL_CATALOG, controlForIndustry } from "./evidence/controls";
import { INDUSTRIES } from "./industry";
import {
  ifYouCannotSeparateFor,
  libraryRows,
  procedureFromLibrary,
  RECOMMENDED_PROCEDURES,
  recommendationFor,
} from "./procedures/library";
import {
  conflictProcedureLink,
  libraryIdsForRule,
  RULE_PROCEDURE,
} from "./procedures/rule-procedures";
import { getIndustryTemplate } from "./templates";
import { getIndustryCopy } from "./templates/industry-copy";

/**
 * A nonprofit belongs to no one and runs no till: "owner", "till" and "sales
 * report" read to its director as "not built for us" (the Priya walkthrough).
 */
const NOT_FOR_A_NONPROFIT = /\bowner\b|\btill\b|\bsales report\b/i;

const nonprofit = getIndustryTemplate("nonprofit");
const rows = libraryRows(nonprofit, [], "nonprofit");
const shownIds = (industry: (typeof INDUSTRIES)[number]["id"]) =>
  libraryRows(getIndustryTemplate(industry), [], industry).map((r) => r.recommendation.id);

describe("the words a nonprofit is shown", () => {
  it("names no owner, till or sales report in any recommended procedure", () => {
    for (const row of rows) {
      const r = row.recommendation;
      const text = [
        r.title,
        r.purpose,
        r.trigger,
        ...r.prerequisites,
        ...r.steps.flatMap((s) => [s.text, s.caution ?? ""]),
        ifYouCannotSeparateFor(r, "nonprofit") ?? "",
        ...(r.evidenceToKeep ?? []),
      ];
      for (const line of text) expect(line, r.id).not.toMatch(NOT_FOR_A_NONPROFIT);
    }
  });

  it("names no owner, till or sales report in any control label", () => {
    for (const control of Object.values(CONTROL_CATALOG)) {
      expect(controlForIndustry(control, "nonprofit").label, control.id).not.toMatch(
        NOT_FOR_A_NONPROFIT,
      );
    }
  });

  it("names no owner, till or sales report in its industry copy", () => {
    const copy = getIndustryCopy("nonprofit");
    const text = [
      ...Object.values(copy.sodExamples),
      ...Object.values(copy.layerCopy).flat(),
      copy.dualReleaseSeed.exceptionLabel,
      ...copy.pioneerPrompts,
    ];
    for (const line of text) expect(line).not.toMatch(NOT_FOR_A_NONPROFIT);
  });

  it("gives each owner control a board member or the executive director instead", () => {
    const owners = Object.values(CONTROL_CATALOG).filter((c) => /\bowner\b/i.test(c.label));
    expect(owners.map((c) => c.id).sort()).toEqual(
      [
        "card-statement-line-review",
        "expected-receipts-vs-deposits",
        "new-payee-review",
        "owner-opens-bank-statement",
        "payroll-register-review",
        "recovery-copy-out-of-reach",
      ].sort(),
    );
    for (const c of owners) {
      expect(controlForIndustry(c, "nonprofit").label, c.id).toMatch(
        /board member|executive director/,
      );
      // Every other line of business keeps the owner's label.
      expect(controlForIndustry(c, "dental").label, c.id).toBe(c.label);
    }
  });

  it("words the cash deposit for donations and event receipts", () => {
    const deposit = rows.find((r) => r.recommendation.id === "lib-cash-deposit")!.recommendation;
    expect(deposit.title).toBe("Deposit donations and event receipts");
    expect(deposit.purpose).toContain("donations and event receipts");
    expect(deposit.steps.map((s) => s.text).join(" ")).not.toMatch(/\bdrawer\b/i);
    // A started procedure keeps the nonprofit words.
    const row = rows.find((r) => r.recommendation.id === "lib-cash-deposit")!;
    expect(procedureFromLibrary(row, "nonprofit", "2026-10-01").title).toBe(
      "Deposit donations and event receipts",
    );
    // A conflict card links to it in the same words.
    expect(conflictProcedureLink("rule-collect-post", [], [], "nonprofit")?.title).toBe(
      "Deposit donations and event receipts",
    );
    expect(conflictProcedureLink("rule-collect-post", [], [], "retail")?.title).toBe(
      "Make the daily cash deposit",
    );
    // Every other line of business reads the shared words.
    const general = RECOMMENDED_PROCEDURES.find((r) => r.id === "lib-cash-deposit")!;
    expect(recommendationFor(general, "general")).toBe(general);
    expect(recommendationFor(general, "retail").title).toBe("Make the daily cash deposit");
  });
});

describe("procedures for mailed checks and the cash drawer", () => {
  it("shows a nonprofit the mailed checks and never the drawer close", () => {
    expect(shownIds("nonprofit")).toContain("lib-mailed-checks");
    expect(shownIds("nonprofit")).not.toContain("lib-drawer-close");
  });

  it("shows every other line of business both", () => {
    for (const { id } of INDUSTRIES) {
      if (id === "nonprofit") continue;
      expect(shownIds(id), id).toContain("lib-mailed-checks");
      expect(shownIds(id), id).toContain("lib-drawer-close");
    }
  });

  it("puts the mailed checks with the nonprofit's gift processing", () => {
    const row = rows.find((r) => r.recommendation.id === "lib-mailed-checks")!;
    expect(
      row.knowledgeIds.map((id) => nonprofit.knowledge.find((k) => k.id === id)?.name),
    ).toEqual(["Gift processing & donor database"]);
    expect(row.recommendation.title).toBe("Log mailed donation checks on arrival");
  });

  it("has two people open the mail and log each check before the deposit", () => {
    const mail = RECOMMENDED_PROCEDURES.find((r) => r.id === "lib-mailed-checks")!;
    const steps = mail.steps.map((s) => s.text);
    expect(steps[0]).toBe("Open the mail with a second person present.");
    const logged = steps.findIndex((s) => /check log/.test(s));
    const handed = steps.findIndex((s) => /prepares the deposit/.test(s));
    expect(logged).toBeGreaterThan(0);
    expect(handed).toBeGreaterThan(logged);
  });

  it("counts the drawer blind, compares it with the register and has a second person sign", () => {
    const drawer = RECOMMENDED_PROCEDURES.find((r) => r.id === "lib-drawer-close")!;
    const words = drawer.steps.map((s) => `${s.text} ${s.caution ?? ""}`).join(" ");
    expect(words).toMatch(/register total/);
    expect(words).toMatch(/second person/);
    expect(words).toMatch(/sign the count sheet/);
  });

  it("leads the cash pairs to them, keeping each conflict card's own link", () => {
    expect(libraryIdsForRule("rule-collect-post")).toEqual([
      "lib-cash-deposit",
      "lib-mailed-checks",
      "lib-drawer-close",
    ]);
    expect(libraryIdsForRule("rule-deposit-post")).toEqual([
      "lib-cash-deposit",
      "lib-mailed-checks",
    ]);
    expect(libraryIdsForRule("rule-custody-rec")).toEqual(["lib-bank-rec", "lib-mailed-checks"]);
    expect(libraryIdsForRule("rule-cash-void")).toEqual(["lib-refund-review", "lib-drawer-close"]);
    expect(libraryIdsForRule("rule-cash-refund")).toEqual([
      "lib-refund-review",
      "lib-drawer-close",
    ]);
    expect(RULE_PROCEDURE["rule-collect-post"].primary).toBe("lib-cash-deposit");
  });
});
