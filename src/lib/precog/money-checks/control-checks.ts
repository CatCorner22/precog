import { evaluateRelease } from "../controls/dual-release-evaluate";
import type { DualReleasePolicy, ReleaseChannel } from "../controls/dual-release-policy";
import { isCalendarDate } from "../dates";
import { buildAssignments } from "../sod/assignments";
import { HARD_GATE_DUTIES } from "../sod/conflict-rules";
import type { IndustryTemplate } from "../templates";
import { sourceKey, sourceOrder, type MoneyFinding, type SkippedCheck } from "./detect";
import type { BooksRow, BooksType, MoneyImport } from "./import";
import { formatCents, parseCents, type Cents } from "./parse";

// Without a channel, payment_out/refund use ACH, write_off uses writeoff, and payroll uses payroll.
const CHANNELS: Partial<Record<BooksType, ReleaseChannel>> = {
  payment_out: "ach",
  refund: "ach",
  write_off: "writeoff",
  payroll: "payroll",
};
const RELEASE_CHANNELS: ReleaseChannel[] = [
  "ach",
  "check",
  "writeoff",
  "vendor_new",
  "deposit",
  "payroll",
];
const nameKey = (name: string) => name.toLowerCase().replace(/\s+/g, "");

export function runControlChecks({
  books,
  template,
  policy,
  today,
}: {
  books: MoneyImport<BooksRow>;
  template: IndustryTemplate;
  policy: DualReleasePolicy;
  today: string;
}): { findings: MoneyFinding[]; skipped: SkippedCheck[] } {
  if (!isCalendarDate(today)) throw new Error("Use a valid calendar date for today");
  const findings: MoneyFinding[] = [],
    skipped: SkippedCheck[] = [];
  const skip = (missingColumn: string, reason: string, sourceRow?: number) =>
    skipped.push({
      check: "money_out_without_second",
      missingColumn,
      reason,
      ...(sourceRow ? { sourceRow } : {}),
    });
  const person = (name: string) => {
    const matches = template.people.filter((p) => p.active && nameKey(p.name) === nameKey(name));
    return matches.length === 1 ? matches[0] : undefined;
  };
  const missing = (["entered_by", "approved_by"] as const).filter(
    (c) => !books.optionalColumns.includes(c),
  );
  if (!policy.enabled) skip("dual_release_policy", "Dual release policy is off.");
  else if (missing.length) missing.forEach((c) => skip(c, `The books file has no ${c} column.`));
  else {
    const counts = new Map<string, number>();
    for (const row of [...books.rows].sort(sourceOrder)) {
      if (!CHANNELS[row.type] || row.date > today || row.entryDate > today) continue;
      const identity = JSON.stringify([
        sourceKey(row),
        row.channel ?? "",
        row.entered_by ?? "",
        row.approved_by ?? "",
      ]);
      const occurrence = (counts.get(identity) ?? 0) + 1;
      counts.set(identity, occurrence);
      const rawChannel = row.channel
        ?.trim()
        .toLowerCase()
        .replace(/[\s-]+/g, "_");
      const channel = rawChannel || CHANNELS[row.type]!;
      if (!RELEASE_CHANNELS.includes(channel as ReleaseChannel)) {
        skip("channel", "Unknown release channel.", row.sourceRow);
        continue;
      }
      if (!policy.rules.some((r) => r.channel === channel && r.enabled)) {
        skip("dual_release_policy", `Dual release is off for ${channel}.`, row.sourceRow);
        continue;
      }
      const first = person(row.entered_by ?? "");
      const second = row.approved_by?.trim() ? person(row.approved_by) : undefined;
      if (!first) skip("entered_by", "Unknown or ambiguous team name.", row.sourceRow);
      if (row.approved_by?.trim() && !second)
        skip("approved_by", "Unknown or ambiguous team name.", row.sourceRow);
      if (!first || (row.approved_by?.trim() && !second)) continue;
      const magnitude = (row.amountCents < 0 ? -row.amountCents : row.amountCents) as Cents;
      const amountUsd = Number(formatCents(magnitude).replaceAll(",", "").slice(1));
      const roundtrip = parseCents(String(amountUsd));
      if (!("value" in roundtrip) || roundtrip.value !== magnitude) {
        skip("amount", "Amount cannot preserve cents in the release evaluator.", row.sourceRow);
        continue;
      }
      const evaluation = evaluateRelease(template, policy, {
        channel: channel as ReleaseChannel,
        amountUsd,
        initiatorPersonId: first.id,
        secondPersonId: second?.id,
        payee: row.account,
        asOfDate: row.date,
      });
      if (evaluation.dualRequired && (!second || second.id === first.id))
        findings.push({
          id: `money_out_without_second:${identity}:${occurrence}`,
          check: "money_out_without_second",
          level: "review",
          sentence: `A ${channel} entry dated ${row.date} for ${formatCents(row.amountCents)} has no distinct second approval under the dual-release policy.`,
          amountCents: row.amountCents,
          dates: { effective: row.date, entry: row.entryDate },
          sourceRows: { bank: [], books: [row.sourceRow] },
        });
    }
  }
  const assignments = buildAssignments(template);
  for (const duty of new Set(Object.values(HARD_GATE_DUTIES).flat())) {
    if (assignments.filter((a) => a.entitlements.includes(duty)).length === 1)
      findings.push({
        id: `sole_money_duty_holder:${duty}`,
        check: "sole_money_duty_holder",
        level: "watch",
        sentence: `The ${duty.replaceAll("_", " ")} duty has one active holder on the money-control map.`,
        amountCents: 0 as Cents,
        dates: { effective: today },
        sourceRows: { bank: [], books: [] },
      });
  }
  findings.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return { findings, skipped };
}
