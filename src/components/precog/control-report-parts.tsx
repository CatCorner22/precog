import type { ContinuityCommitment } from "@/lib/precog/decisions/follow-through";
import { formatDay } from "@/lib/precog/dates";
import { firstName } from "@/lib/precog/text";

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6 break-inside-avoid">
      <h2 className="mb-2 border-b border-neutral-300 pb-1 text-sm font-semibold tracking-wide text-neutral-800 uppercase">
        {title}
      </h2>
      {children}
    </section>
  );
}

export function Kpi({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-lg border border-neutral-300 p-3">
      <p className="text-xs font-semibold tracking-wide text-neutral-500 uppercase">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular">{value}</p>
      <p className="text-xs text-neutral-600">{hint.charAt(0).toUpperCase() + hint.slice(1)}</p>
    </div>
  );
}

/** Marks a recommended step the business has already logged, so it reads as follow-up, not fresh advice. */
export function CommitmentTag({ c }: { c: ContinuityCommitment | undefined }) {
  if (!c) return null;
  const first = c.person ? firstName(c.person.name) : undefined;
  return (
    <span className={`ml-1 text-xs ${c.overdue ? "text-amber-700" : "text-neutral-500"}`}>
      {c.overdue
        ? `— review overdue since ${c.reviewBy ? formatDay(c.reviewBy) : "its review date"}: confirm whether it happened`
        : `— in progress${first && c.step === "cover" ? ` (${first})` : ""} since ${formatDay(c.decision.createdAt)}${c.reviewBy ? `, review ${formatDay(c.reviewBy)}` : ""}`}
    </span>
  );
}
