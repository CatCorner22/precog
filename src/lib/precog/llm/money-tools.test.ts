import { describe, expect, it } from "vitest";
import { defaultProfile } from "../practice-profile";
import { normalizeMoneyChecks, withMoneyRun } from "../money-checks/profile-state";
import { LOOKBACK_DAYS, MATCH_DAYS, BANK_DUE_DAYS } from "../money-checks/detect";
import { moneyTools, moneyModelTools, moneyCheckKeys } from "./money-tools";
import { executeTool, planTools, TOOL_CATALOG } from "./tools";
import { parsePioneerInput } from "../public-inputs";
import { pioneerProfileFrom } from "../coach/pioneer-profile";

const today = "2026-11-19";
const base = () => defaultProfile("general");
const populated = () => {
  const profile = base();
  profile.moneyChecks = {
    lastRun: today,
    ledger: ["a", "b", "closed"].map((id) => ({
      id,
      check: "unmatched_bank_line",
      level: id === "a" ? "review" : "watch",
      sentence: "PRIVATE CSV",
      firstSeen: today,
      lastSeen: today,
      status: id === "closed" ? "closed" : "open",
      ...(id === "closed" ? { closedOn: today, closeReason: "resolved" } : {}),
      reopenCount: 0,
    })),
    skipped: [
      { check: "backdated_entry", missingColumn: "entry_date", reason: "No entry date column." },
    ],
    reconciliationSignoffs: [
      { month: "2026-10", preparedBy: "one", signedBy: "two", signedOn: "2026-11-01" },
    ],
    channelSignoffs: [
      { month: "2026-11", channel: "ach", note: "PRIVATE CSV", by: "one", on: today },
    ],
  };
  profile.dualRelease = {
    ...profile.dualRelease,
    enabled: true,
    rules: profile.dualRelease.rules.map((r) => ({
      ...r,
      enabled: r.channel === "ach" || r.channel === "check",
    })),
  };
  return profile;
};
describe("money tools", () => {
  it("validates argument schemas without accepting raw rows or malformed selectors", () => {
    const ctx = { profile: base(), today };
    for (const args of [null, [], { bank: [] }, { books: [] }])
      expect(() => moneyTools.money_checks_summary.run(args, ctx)).toThrow();
    for (const args of [{ key: 1 }, { key: " " }, { key: "duplicate_payment", rows: [] }])
      expect(() => moneyTools.explain_money_check.run(args, ctx)).toThrow();
    expect(() =>
      moneyTools.money_checks_summary.run({}, { ...ctx, today: "2026-02-30" }),
    ).toThrow();
  });
  it("states empty and legacy coverage plainly without inventing skipped checks", () => {
    expect(moneyTools.money_checks_summary.run({}, { profile: base(), today })).toMatchObject({
      ok: true,
      summary: expect.stringContaining("No money-check data"),
      data: {
        assessed: false,
        lastRun: null,
        skipped: null,
        byLevel: { info: 0, watch: 0, review: 0 },
      },
    });
    const profile = populated();
    const empty = {
      ...base(),
      moneyChecks: { ledger: [], reconciliationSignoffs: [], channelSignoffs: [] },
    };
    expect(moneyTools.money_checks_summary.run({}, { profile: empty, today })).toMatchObject({
      summary: expect.stringContaining("No money-check data"),
      data: { assessed: false, reconciliationGaps: [], channelGaps: [] },
    });
    delete profile.moneyChecks!.skipped;
    expect(moneyTools.money_checks_summary.run({}, { profile, today }).summary).toContain(
      "not recorded",
    );
  });
  it("counts only open findings, reports saved coverage and sign-off gaps, and remains read-only", () => {
    const profile = populated(),
      before = structuredClone(profile);
    const result = moneyTools.money_checks_summary.run({}, { profile, today });
    expect(result.data).toMatchObject({
      lastRun: today,
      byLevel: { review: 1, watch: 1, info: 0 },
      byCheck: { unmatched_bank_line: { review: 1, watch: 1, info: 0 } },
      skipped: profile.moneyChecks!.skipped,
      reconciliationGaps: [
        { month: "2026-09", reason: "missing" },
        { month: "2026-08", reason: "missing" },
      ],
      channelGaps: [{ month: "2026-11", channel: "check" }],
    });
    expect(JSON.stringify(result)).not.toContain("PRIVATE CSV");
    expect(profile).toEqual(before);
    profile.moneyChecks!.ledger.reverse();
    expect(moneyTools.money_checks_summary.run({}, { profile, today })).toEqual(result);
  });
  it("uses the detector's signing boundaries and current enabled channels only", () => {
    const profile = populated(),
      ctx = { profile, today };
    const sign = profile.moneyChecks!.reconciliationSignoffs[0];
    for (const [signedBy, signedOn, reason] of [
      ["one", "2026-11-01", "same-hands"],
      ["two", "2026-10-30", "before month-end"],
      ["two", "2026-12-01", "future-dated"],
      ["", "", "unsigned"],
    ]) {
      Object.assign(sign, { signedBy, signedOn });
      expect(JSON.stringify(moneyTools.money_checks_summary.run({}, ctx).data)).toContain(reason);
    }
    profile.dualRelease.enabled = false;
    expect(moneyTools.money_checks_summary.run({}, ctx).data).toMatchObject({ channelGaps: [] });
    Object.assign(sign, { month: "2026-09", signedBy: "two", signedOn: "2026-10-30" });
    expect(JSON.stringify(moneyTools.money_checks_summary.run({}, ctx).data)).not.toContain(
      "late sign-off",
    );
    sign.signedOn = "2026-10-31";
    expect(JSON.stringify(moneyTools.money_checks_summary.run({}, ctx).data)).toContain(
      "late sign-off",
    );
  });
  it("explains all known keys and saved ids using exact constants, not ledger sentences", () => {
    const profile = populated(),
      ctx = { profile, today },
      before = structuredClone(profile);
    for (const key of moneyCheckKeys)
      expect(moneyTools.explain_money_check.run({ key }, ctx)).toMatchObject({
        ok: true,
        summary: expect.stringContaining("advisory"),
      });
    const result = moneyTools.explain_money_check.run({ key: "a" }, ctx);
    expect(result).toEqual(moneyTools.explain_money_check.run({ key: "unmatched_bank_line" }, ctx));
    expect(result.data).toMatchObject({
      thresholds: { dueDays: BANK_DUE_DAYS, matchDays: MATCH_DAYS },
    });
    expect(moneyTools.explain_money_check.run({ key: "backdated_entry" }, ctx).data).toMatchObject({
      thresholds: { lookbackDays: LOOKBACK_DAYS },
    });
    expect(JSON.stringify(result)).not.toContain("PRIVATE CSV");
    expect(moneyTools.explain_money_check.run({ key: "unknown" }, ctx)).toMatchObject({
      ok: false,
      data: null,
    });
    expect(profile).toEqual(before);
  });
  it("registers both tools, exports model schemas and routes money questions deterministically", () => {
    const names = TOOL_CATALOG.map((t) => t.name);
    for (const tool of ["money_checks_summary", "explain_money_check"] as const) {
      expect(names.filter((n) => n === tool)).toHaveLength(1);
      expect(planTools("Explain the unmatched_bank_line money check")).toContain(tool);
      expect(
        moneyModelTools.find((m) => m.function.name === tool)?.function.parameters,
      ).toHaveProperty("type", "object");
    }
    const ctx = { profile: populated(), today, question: "Explain unmatched_bank_line" };
    expect(executeTool("explain_money_check", ctx)).toEqual(
      executeTool("explain_money_check", { ...ctx, moneyCheckInput: { key: "a" } }),
    );
    expect(executeTool("money_checks_summary", ctx)).toEqual(
      executeTool("money_checks_summary", ctx),
    );
  });
  it("persists only normalized skip metadata through the existing run updater", () => {
    const profile = withMoneyRun(
      base(),
      {
        findings: [],
        skipped: [{ check: "backdated_entry", missingColumn: "entry_date", sourceRow: 42 }],
      },
      today,
    );
    const normalized = normalizeMoneyChecks(JSON.parse(JSON.stringify(profile.moneyChecks)));
    expect(normalized?.skipped).toEqual([
      { check: "backdated_entry", missingColumn: "entry_date" },
    ]);
    expect(profile.moneyChecks?.skipped).toEqual(normalized?.skipped);
    expect(
      normalizeMoneyChecks({ skipped: [null, {}, { check: "invented", missingColumn: "x" }] })
        ?.skipped,
    ).toEqual([]);
  });
  it("preserves saved facts across Voyagers request validation and canonical profile builder", () => {
    const saved = populated();
    const request = parsePioneerInput({
      profile: {
        ...saved,
        moneyChecks: { ...saved.moneyChecks, bank: ["RAW BANK ROW"], books: ["RAW BOOKS ROW"] },
      },
      question: "Explain unmatched_bank_line",
      today,
    });
    const profile = pioneerProfileFrom(request.profile, today);
    expect(JSON.stringify(profile.moneyChecks)).not.toContain("RAW BANK ROW");
    expect(JSON.stringify(profile.moneyChecks)).not.toContain("RAW BOOKS ROW");
    expect(executeTool("money_checks_summary", { profile, today }).data).toMatchObject({
      lastRun: today,
      byLevel: { review: 1, watch: 1, info: 0 },
    });
    expect(
      executeTool("explain_money_check", { profile, today, question: request.question }),
    ).toMatchObject({ ok: true, data: { check: "unmatched_bank_line" } });
  });
});
