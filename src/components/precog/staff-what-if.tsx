import { OWN_TEAM_MAX } from "@/lib/precog/onboarding/own-team";
import type { StaffComposition } from "@/lib/precog/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LabelledRange } from "./labelled-range";
import { whatIfDiffers } from "./scenario-page";

/** The what-if staffing and what the card may do with it. */
export interface StaffWhatIf {
  staff: StaffComposition;
  saved: StaffComposition;
  /**
   * An owner's own team derives its sole-owner count from the knowledge
   * register, so the count is not offered as a what-if there.
   */
  ownBusiness: boolean;
  onChange: (next: StaffComposition) => void;
  onApply: () => void;
  onReset: () => void;
}

/**
 * Staffing the owner can try on the scenario page. Nothing here is saved:
 * the figures on this page follow the sliders, and the business profile, the
 * Dashboard and every other screen keep the saved staffing until the owner
 * chooses "Apply to my business".
 */
export function StaffWhatIfCard({
  staff,
  saved,
  ownBusiness,
  onChange,
  onApply,
  onReset,
  className,
}: StaffWhatIf & { className?: string }) {
  const changed = whatIfDiffers(saved, staff);
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="text-base">Try different staffing</CardTitle>
        <CardDescription>
          Only the figures on this page follow these settings. Your business keeps its saved
          staffing until you choose &ldquo;Apply to my business&rdquo;.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <LabelledRange
          label="Team size"
          value={staff.teamSize}
          min={1}
          max={Math.max(OWN_TEAM_MAX, staff.teamSize)}
          onChange={(v) => onChange({ ...staff, teamSize: v })}
        />
        {!ownBusiness && (
          <LabelledRange
            label="Things only one person knows how to do"
            value={staff.soleOwnerKnowledgeCount}
            min={0}
            max={Math.max(30, staff.soleOwnerKnowledgeCount)}
            onChange={(v) => onChange({ ...staff, soleOwnerKnowledgeCount: v })}
          />
        )}
        <LabelledRange
          label="Segregation score"
          value={staff.segregationScore}
          min={0}
          max={100}
          onChange={(v) => onChange({ ...staff, segregationScore: v })}
        />
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={staff.dualControlPayments}
            onChange={(e) => onChange({ ...staff, dualControlPayments: e.target.checked })}
            className="size-4 accent-[var(--color-primary)]"
          />
          Dual release on payments
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={staff.independentBankRec}
            onChange={(e) => onChange({ ...staff, independentBankRec: e.target.checked })}
            className="size-4 accent-[var(--color-primary)]"
          />
          Independent bank reconciliation
        </label>
        {changed ? (
          <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
            <p className="w-full text-xs text-warn">
              Trying staffing that differs from your saved settings.
            </p>
            <Button size="sm" onClick={onApply}>
              Apply to my business
            </Button>
            <Button size="sm" variant="secondary" onClick={onReset}>
              Back to my saved staffing
            </Button>
          </div>
        ) : (
          <p className="text-xs text-subtle">Showing your saved staffing.</p>
        )}
      </CardContent>
    </Card>
  );
}
