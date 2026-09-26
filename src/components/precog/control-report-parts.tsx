import { firstName } from "@/lib/precog/continuity/coverage";
import type { ContinuityCommitment } from "@/lib/precog/decisions/follow-through";

/** Marks a recommended step the owner has already logged in the Journal, so it reads as follow-up, not fresh advice. */
export function CommitmentTag({ c }: { c: ContinuityCommitment | undefined }) {
  if (!c) return null;
  const first = c.person ? firstName(c.person.name) : undefined;
  return (
    <span className={`ml-1 text-xs ${c.overdue ? "text-amber-700" : "text-neutral-500"}`}>
      {c.overdue
        ? `— review overdue since ${c.reviewBy}: did it happen? Close it in the Journal`
        : `— in progress${first && c.step === "cover" ? ` (${first})` : ""} since ${c.decision.createdAt.slice(0, 10)}${c.reviewBy ? `, review ${c.reviewBy}` : ""}`}
    </span>
  );
}

export function Kpi({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-lg border border-neutral-300 p-3">
      <p className="text-xs font-semibold tracking-wide text-neutral-500 uppercase">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular">{value}</p>
      <p className="text-xs text-neutral-600 capitalize">{hint}</p>
    </div>
  );
}

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
