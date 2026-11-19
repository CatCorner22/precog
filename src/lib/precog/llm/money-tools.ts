import { z } from "zod";
import { daysBetween, isCalendarDate, shiftDay } from "../dates";
import type { PracticeProfile } from "../practice-profile";
import { normalizeMoneyChecks } from "../money-checks/profile-state";
import {
  RECONCILIATION_MONTHS,
  RECONCILIATION_LATE_DAYS,
  DECISION_REVIEW_AFTER_DAYS,
} from "../money-checks/all-checks";
import {
  LOOKBACK_DAYS,
  MATCH_DAYS,
  BANK_DUE_DAYS,
  DEPOSIT_DUE_DAYS,
  BACKDATE_DAYS,
  BANK_WATCH_DAYS,
  BANK_REVIEW_AFTER_DAYS,
  DEPOSIT_REVIEW_AFTER_DAYS,
  BACKDATE_REVIEW_AFTER_DAYS,
  type CheckKey,
} from "../money-checks/detect";
import type { ToolOutput } from "./types";

interface Context {
  profile: PracticeProfile;
  today: string;
}
const advisory = "These checks are advisory. They describe lines, entries and months, not people.";
const checks = {
  unmatched_bank_line: {
    looksFor:
      "A bank line with no same-cent books match. Matching is one-to-one, nearest date first, with deterministic ties; aging has no lookback cap.",
    thresholds: {
      dueDays: BANK_DUE_DAYS,
      matchDays: MATCH_DAYS,
      watchDays: BANK_WATCH_DAYS,
      reviewAfterDays: BANK_REVIEW_AFTER_DAYS,
    },
    levels: `Info before ${BANK_WATCH_DAYS} days; Watch through ${BANK_REVIEW_AFTER_DAYS}; Review afterward.`,
  },
  deposit_not_banked: {
    looksFor: "A books deposit with no bank match, using the same one-to-one matcher.",
    thresholds: {
      dueDays: DEPOSIT_DUE_DAYS,
      matchDays: MATCH_DAYS,
      lookbackDays: LOOKBACK_DAYS,
      reviewAfterDays: DEPOSIT_REVIEW_AFTER_DAYS,
    },
    levels: `Watch through ${DEPOSIT_REVIEW_AFTER_DAYS} days; Review afterward.`,
  },
  duplicate_payment: {
    looksFor:
      "Later payment_received entries sharing account, cents and effective date, unless a reversal references any group member. Needs the account column.",
    thresholds: { lookbackDays: LOOKBACK_DAYS },
    levels: "Info for later entries in a group of two or more.",
  },
  backdated_entry: {
    looksFor:
      "An adjustment, write_off, refund or reversal entered after its effective date. Needs entry_date; the lookback uses entry date.",
    thresholds: {
      lagOverDays: BACKDATE_DAYS,
      lookbackDays: LOOKBACK_DAYS,
      reviewAfterDays: BACKDATE_REVIEW_AFTER_DAYS,
    },
    levels: `Watch through ${BACKDATE_REVIEW_AFTER_DAYS} days of lag; Review afterward.`,
  },
  closed_period_entry: {
    looksFor:
      "An entry effective on or before a close but entered afterward, without reverses. Needs entry_date and close dates; each entry uses its latest crossed close.",
    thresholds: { lookbackDays: LOOKBACK_DAYS },
    levels: "Watch for one entry behind a close; Review for two or more behind that same close.",
  },
  money_out_without_second: {
    looksFor:
      "A payment_out, refund, write_off or payroll entry above its effective channel limit, without a distinct second approval. Uses evaluateRelease and applicable exceptions. Missing or ambiguous team names are unknown, never guessed. Policy off or missing approval columns means skipped. Without channel, payment_out/refund use ACH, write_off uses writeoff and payroll uses payroll.",
    thresholds: {},
    levels:
      "Review. Limits come from the saved policy; an effective limit cannot be inferred without transaction context.",
  },
  sole_money_duty_holder: {
    looksFor:
      "Exactly one active holder of a duty classified as HardGate money_out or statutory_liability. No upload is needed; SoD and Coverage figures do not change.",
    thresholds: {},
    levels: "Watch for exactly one holder; zero or multiple holders do not meet this rule.",
  },
  decision_overdue: {
    looksFor:
      "An open decision past reviewBy. Decisions have no money category, so all open decisions use the existing due-date filter.",
    thresholds: { reviewAfterDays: DECISION_REVIEW_AFTER_DAYS },
    levels: `Watch through ${DECISION_REVIEW_AFTER_DAYS} days overdue; Review afterward.`,
  },
  weak_reconciliation: {
    looksFor:
      "A missing, unsigned, self-signed, future-dated, pre-month-end or late reconciliation sign-off in the last closed months.",
    thresholds: { months: RECONCILIATION_MONTHS, lateAfterDays: RECONCILIATION_LATE_DAYS },
    levels:
      "Watch for an isolated weak month; Review for each month in a run of two or more consecutive weak months.",
  },
} satisfies Record<CheckKey, { looksFor: string; thresholds: object; levels: string }>;
export const moneyCheckKeys = Object.keys(checks) as CheckKey[];
export const moneyToolInfo = {
  money_checks_summary: {
    description:
      "Saved money-check counts, last run, recorded skipped checks and sign-off gaps. Read-only; no raw bank or books rows.",
  },
  explain_money_check: {
    description:
      "Explain a money check by key or saved finding id: exact rule, named thresholds and advisory levels. With no key, lists available keys.",
  },
};
const levels = () => ({ info: 0, watch: 0, review: 0 });
function summary(_: object, { profile, today }: Context): ToolOutput {
  const state = normalizeMoneyChecks(profile.moneyChecks);
  const byLevel = levels();
  const byCheck = Object.fromEntries(moneyCheckKeys.map((key) => [key, levels()]));
  for (const row of state?.ledger ?? [])
    if (row.status === "open") {
      byLevel[row.level]++;
      byCheck[row.check][row.level]++;
    }
  const reconciliationGaps: { month: string; reason: string }[] = [];
  let cursor = `${today.slice(0, 7)}-01`;
  if (state)
    for (let i = 0; i < RECONCILIATION_MONTHS; i++) {
      const end = shiftDay(cursor, -1),
        month = end.slice(0, 7);
      const s = state.reconciliationSignoffs.find((r) => r.month === month);
      const reason = !s
        ? "missing"
        : !s.signedBy || !s.signedOn || s.signedOn > today
          ? "unsigned or future-dated"
          : s.preparedBy === s.signedBy
            ? "same-hands sign-off"
            : s.signedOn < end
              ? "signed before month-end"
              : daysBetween(end, s.signedOn)! > RECONCILIATION_LATE_DAYS
                ? "late sign-off"
                : undefined;
      if (reason) reconciliationGaps.push({ month, reason });
      cursor = `${month}-01`;
    }
  const month = today.slice(0, 7);
  const channelGaps =
    state && profile.dualRelease.enabled
      ? [...new Set(profile.dualRelease.rules.filter((r) => r.enabled).map((r) => r.channel))]
          .sort()
          .filter(
            (channel) =>
              !state.channelSignoffs.some(
                (s) => s.channel === channel && s.month === month && s.on <= today,
              ),
          )
          .map((channel) => ({ month, channel }))
      : [];
  return {
    ok: true,
    summary: `${state ? "Saved open money findings and sign-off gaps." : "No money-check data has been saved."} ${state?.skipped === undefined ? "Skipped-check coverage was not recorded." : "Skipped checks reflect the last saved run."} ${advisory}`,
    data: {
      assessed: Boolean(state),
      byLevel,
      byCheck,
      lastRun: state?.lastRun ?? null,
      skipped: state?.skipped ?? null,
      reconciliationGaps,
      channelGaps,
    },
  };
}
function explain({ key }: { key?: string }, { profile }: Context): ToolOutput {
  if (!key)
    return {
      ok: true,
      summary: `Choose a check key or a saved finding id. ${advisory}`,
      data: { keys: moneyCheckKeys },
    };
  const check =
    moneyCheckKeys.find((c) => c === key) ??
    normalizeMoneyChecks(profile.moneyChecks)?.ledger.find((r) => r.id === key)?.check;
  if (!check)
    return { ok: false, summary: "No money check or saved finding matches that key.", data: null };
  return {
    ok: true,
    summary: `${checks[check].looksFor} ${checks[check].levels} ${advisory}`,
    data: {
      check,
      ...checks[check],
      advisory,
      ...(check === "money_out_without_second"
        ? {
            policyEnabled: profile.dualRelease.enabled,
            baseLimits: profile.dualRelease.rules
              .filter((r) => r.enabled)
              .map((r) => ({ channel: r.channel, thresholdUsd: r.thresholdUsd }))
              .sort((a, b) => a.channel.localeCompare(b.channel)),
            exceptionsConfigured: profile.dualRelease.exceptions.some((e) => e.enabled),
          }
        : {}),
    },
  };
}
function checked<T extends z.ZodType>(
  schema: T,
  run: (args: z.output<T>, ctx: Context) => ToolOutput,
) {
  return {
    schema,
    run: (args: unknown, ctx: Context) => {
      if (!isCalendarDate(ctx.today)) throw new Error("Use a valid calendar date for today");
      return run(schema.parse(args), ctx);
    },
  };
}
export const moneyTools = {
  money_checks_summary: checked(z.object({}).strict(), summary),
  explain_money_check: checked(
    z.object({ key: z.string().trim().min(1).optional() }).strict(),
    explain,
  ),
};
export const moneyModelTools = (Object.keys(moneyTools) as (keyof typeof moneyTools)[]).map(
  (name) => ({
    type: "function",
    function: {
      name,
      description: moneyToolInfo[name].description,
      parameters: z.toJSONSchema(moneyTools[name].schema),
    },
  }),
);
export function moneyQuestionKey(
  question: string | undefined,
  profile: PracticeProfile,
): string | undefined {
  if (!question) return undefined;
  const candidates = [
    ...moneyCheckKeys,
    ...(profile.moneyChecks?.ledger.map((r) => r.id) ?? []),
  ].filter((key) => question.includes(key));
  const matched = new Set(
    candidates.map((key) =>
      moneyCheckKeys.includes(key as CheckKey)
        ? key
        : profile.moneyChecks!.ledger.find((r) => r.id === key)!.check,
    ),
  );
  return matched.size === 1 ? candidates[0] : undefined;
}
