import { usePractice } from "@/lib/precog/practice-context";
import { INDUSTRY_PACKS, packById } from "@/lib/precog/industries/packs";
import type { IndustryPackId } from "@/lib/precog/industries/types";
import { cn } from "@/lib/utils";

/**
 * Choosing a trade changes real behaviour, not just labels: it swaps the role
 * templates the conflict detector works from, the words used for each duty,
 * and which real cases the app shows. The conflict rules themselves stay
 * shared, because the underlying failure — one person holding both the money
 * and the record of it — does not vary by trade.
 */
export function IndustryPicker({ className }: { className?: string }) {
  const { profile, setIndustry } = usePractice();
  const active = packById(profile.industryId);

  return (
    <div className={cn("space-y-2", className)}>
      <label
        htmlFor="industry-picker"
        className="block text-xs font-semibold uppercase tracking-wide text-subtle"
      >
        What kind of business is this?
      </label>
      <select
        id="industry-picker"
        value={profile.industryId}
        onChange={(e) => setIndustry(e.target.value as IndustryPackId)}
        className="w-full rounded-lg border border-border bg-elevated px-3 py-2 text-sm text-fg"
      >
        {INDUSTRY_PACKS.map((p) => (
          <option key={p.id} value={p.id}>
            {p.label}
          </option>
        ))}
      </select>
      <p className="text-xs text-subtle">{active.blurb}</p>
    </div>
  );
}
