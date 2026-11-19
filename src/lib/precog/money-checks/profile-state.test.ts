import { describe, expect, it } from "vitest";
import {
  defaultProfile,
  hasUserWork,
  normalizeProfile,
  parseStoredProfile,
  writePortfolioEntry,
} from "../practice-profile";
import { profileReducer } from "../profile-reducer";
import { LocalProfileStore } from "../save-conflict";
import { validateProfileInput } from "../profile-input";
import { parseSaveBusinessRequest } from "../profile-requests";
import { mergeProfile } from "../profile-merge";
import { buildReportModelForProfile } from "../report/stored-model";
import { applyRun } from "./ledger";
import type { MoneyFinding } from "./detect";
import type { Cents } from "./parse";
import {
  normalizeMoneyChecks,
  withChannelSignoff,
  withFindingExplanation,
  withMoneyRun,
  withReconciliationSignoff,
} from "./profile-state";

const today = "2026-11-19";
const finding: MoneyFinding = {
  id: "unmatched_bank_line:R1",
  check: "unmatched_bank_line",
  level: "watch",
  sentence: "A bank line has no match.",
  amountCents: 100 as Cents,
  dates: { effective: today },
  sourceRows: { bank: [1], books: [] },
};
const result = { findings: [finding], skipped: [] };
const reconciliation = {
  month: "2026-10",
  preparedBy: "p1",
  signedBy: "p2",
  signedOn: "2026-11-01",
};
const channel = {
  month: "2026-10",
  channel: "ach" as const,
  note: "Reviewed the ACH releases",
  by: "p1",
  on: today,
};
const state = () => ({
  ledger: applyRun([], result, today),
  reconciliationSignoffs: [reconciliation],
  channelSignoffs: [channel],
});

describe("money-check profile state", () => {
  it("normalizes old and malformed input without throwing or adding an absent field", () => {
    for (const value of [undefined, null, [], "bad", 1])
      expect(normalizeMoneyChecks(value)).toBeUndefined();
    expect(normalizeMoneyChecks({ ledger: "bad", reconciliationSignoffs: null })).toEqual({
      ledger: [],
      reconciliationSignoffs: [],
      channelSignoffs: [],
    });
    const row = state().ledger[0];
    const bad = [
      null,
      2,
      {},
      { ...row, check: "critical" },
      { ...row, level: "critical" },
      { ...row, firstSeen: "2026-02-30" },
      { ...row, lastSeen: "2026-01-01" },
      { ...row, reopenCount: -1 },
      { ...row, status: "closed" },
    ];
    expect(
      normalizeMoneyChecks({ ledger: [...bad, { ...row, reopenCount: undefined }, row] })?.ledger,
    ).toEqual([row]);
    expect(normalizeProfile(defaultProfile("general"), { today })).not.toHaveProperty(
      "moneyChecks",
    );
    expect(
      normalizeProfile({ ...defaultProfile("general"), moneyChecks: null as never }, { today }),
    ).not.toHaveProperty("moneyChecks");
  });
  it("validates signing fields, trims notes, and drops invalid rows and extra raw data", () => {
    const dirty = {
      ...state(),
      bank: [{ description: "PRIVATE CSV" }],
      books: [{ description: "PRIVATE CSV" }],
      ledger: [
        {
          ...state().ledger[0],
          sourceRows: { bank: [{ memo: "PRIVATE CSV" }] },
          explained: { note: " too short ", on: today },
        },
      ],
      reconciliationSignoffs: [
        reconciliation,
        { ...reconciliation, month: "2026-13" },
        { ...reconciliation, month: "2026-09", signedOn: "bad" },
      ],
      channelSignoffs: [
        { ...channel, note: `  ${channel.note}  ` },
        { ...channel, channel: "unknown" },
        { ...channel, note: "123456789" },
        { ...channel, by: "" },
        { ...channel, on: "bad" },
      ],
    };
    expect(normalizeMoneyChecks(dirty)).toEqual(state());
    expect(JSON.stringify(normalizeMoneyChecks(dirty))).not.toContain("PRIVATE CSV");
    const unsigned = { ...reconciliation, signedBy: "", signedOn: "" };
    expect(
      normalizeMoneyChecks({ reconciliationSignoffs: [unsigned] })?.reconciliationSignoffs,
    ).toEqual([unsigned]);
  });
  it("round-trips through browser JSON and server save/load normalization without raw rows", () => {
    const base = defaultProfile("general");
    const dirty = {
      ...base,
      moneyChecks: { ...state(), bank: ["PRIVATE CSV"], books: ["PRIVATE CSV"] },
    };
    const checked = validateProfileInput(dirty);
    expect(checked.json).not.toContain("PRIVATE CSV");
    expect(parseStoredProfile(checked.json).moneyChecks).toEqual(state());
    const saved = parseSaveBusinessRequest({ expectedAccountId: "u1", profile: dirty });
    expect(saved.json).not.toContain("PRIVATE CSV");
    expect(
      mergeProfile(
        {
          name: saved.profile.practiceName,
          industry: saved.profile.industry,
          profile: JSON.parse(saved.json),
        },
        today,
      ).moneyChecks,
    ).toEqual(state());
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        values.set(key, value);
      },
      removeItem: (key: string) => {
        values.delete(key);
      },
    };
    expect(writePortfolioEntry(dirty, storage)).toBe("saved");
    const local = new LocalProfileStore(
      () => storage,
      () => "test-revision",
    );
    expect(local.write(dirty).kind).toBe("saved");
    expect([...values.values()].join()).not.toContain("PRIVATE CSV");
    expect(normalizeProfile(JSON.parse(checked.json), { today }).moneyChecks).toEqual(state());
    const explained = withFindingExplanation(
      withMoneyRun(base, result, today),
      finding.id,
      "Reviewed this bank line",
      today,
    );
    const closed = withMoneyRun(explained, { findings: [], skipped: [] }, "2026-11-20");
    expect(
      normalizeProfile(JSON.parse(validateProfileInput(closed).json), { today: "2026-11-20" })
        .moneyChecks,
    ).toEqual(closed.moneyChecks);
  });
  it("uses the reducer's updater pattern for runs, explanations and replacement sign-offs", () => {
    const base = { ...defaultProfile("general"), updatedAt: "2000-01-01T00:00:00.000Z" };
    let profile = profileReducer(base, (p) => withMoneyRun(p, result, today));
    expect(profile.moneyChecks?.lastRun).toBe(today);
    expect(profile.updatedAt).not.toBe(base.updatedAt);
    profile = profileReducer(profile, (p) =>
      withFindingExplanation(p, finding.id, "  Reviewed this bank line  ", today),
    );
    profile = profileReducer(profile, (p) => withReconciliationSignoff(p, reconciliation));
    profile = profileReducer(profile, (p) => withChannelSignoff(p, channel));
    profile = profileReducer(profile, (p) =>
      withChannelSignoff(p, { ...channel, note: "A replacement review note" }),
    );
    expect(profile.moneyChecks?.ledger[0].explained?.note).toBe("Reviewed this bank line");
    expect(profile.moneyChecks?.reconciliationSignoffs).toEqual([reconciliation]);
    expect(profile.moneyChecks?.channelSignoffs).toHaveLength(1);
    expect(profile.moneyChecks?.channelSignoffs[0].note).toBe("A replacement review note");
    expect(base).not.toHaveProperty("moneyChecks");
    expect(() => withChannelSignoff(base, { ...channel, note: "123456789" })).toThrow();
    expect(
      withChannelSignoff(base, { ...channel, note: " 1234567890 " }).moneyChecks?.channelSignoffs[0]
        .note,
    ).toBe("1234567890");
    expect(() => withReconciliationSignoff(base, { ...reconciliation, month: "bad" })).toThrow();
  });
  it("does not move any existing profile field or printed report model", () => {
    const base = defaultProfile("dental");
    const before = buildReportModelForProfile(base, today);
    const enriched = withChannelSignoff(withMoneyRun(base, result, today), channel);
    expect(hasUserWork(base)).toBe(false);
    expect(hasUserWork(enriched)).toBe(true);
    const { moneyChecks: _money, ...rest } = enriched;
    expect(rest).toEqual(base);
    expect(buildReportModelForProfile(enriched, today)).toEqual(before);
    const normalized = normalizeProfile(enriched, { today });
    const { moneyChecks: _loadedMoney, ...loadedRest } = normalized;
    expect(loadedRest).toEqual(normalizeProfile(base, { today }));
  });
});
