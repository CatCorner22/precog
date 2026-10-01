import { toast } from "sonner";
import { useId, useState, type ReactNode } from "react";
import { usePractice, useTemplate } from "@/lib/precog/practice-context";
import { useTabName } from "@/lib/precog/presentation";
import { INDUSTRIES, industryMeta, type IndustryId } from "@/lib/precog/industry";
import { describeEnteredWork, enteredWork, hasEnteredWork } from "@/lib/precog/industry-switch";
import { getIndustryTemplate } from "@/lib/precog/templates";
import { registerAssessed } from "@/lib/precog/continuity/register-state";
import { OWN_TEAM_MAX } from "@/lib/precog/onboarding/own-team";
import { SyncStatusBadge } from "@/components/precog/sync-status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Settings2, ShieldCheck } from "lucide-react";
import { joinWithAnd } from "@/lib/precog/text";
import { DEFAULT_BUSINESS_ID } from "@/lib/precog/business-id";

/**
 * Business profile editor — feeds staff into residual scores, scenarios, and
 * Pioneer. On an own business the figures the team decides (team size, years
 * of service when hire dates are known, items only one person knows) are
 * shown, not set: the next team or register edit would put them back.
 */
export function PracticeSetup({ onOpenDualRelease }: { onOpenDualRelease?: () => void }) {
  const tabName = useTabName();
  const {
    profile,
    setPracticeName,
    setIndustry,
    setStaff,
    resetSegregationToDerived,
    resetProfile,
    createBusiness,
    setCustomProcesses,
    setMapLayout,
  } = usePractice();
  const template = useTemplate();
  const s = profile.staff;
  const ownTeam = Boolean(profile.customPeople);
  /** Keyed to the business it was made for, so switching businesses never carries a pending change across. */
  const businessKey = `${profile.businessId ?? DEFAULT_BUSINESS_ID}:${profile.industry}`;
  const [pendingChoice, setPendingChoice] = useState<{
    key: string;
    industry: IndustryId;
  } | null>(null);
  const pendingIndustry =
    pendingChoice &&
    pendingChoice.key === businessKey &&
    pendingChoice.industry !== profile.industry
      ? pendingChoice.industry
      : null;
  const setPendingIndustry = (industry: IndustryId | null) =>
    setPendingChoice(industry ? { key: businessKey, industry } : null);
  // Worked out only while an industry change waits for the owner, not on every keystroke.
  const work = pendingIndustry ? enteredWork(profile) : null;

  function loadSample(next: IndustryId) {
    setIndustry(next);
    setPendingIndustry(null);
    const tpl = getIndustryTemplate(next);
    toast.success(`Loaded the ${industryMeta(next).label} sample business`, {
      description: `${tpl.processes.length} processes · ${tpl.people.length} people · ${tpl.scenarios.length} scenarios`,
    });
  }

  async function addBusiness(next: IndustryId) {
    const kept = profile.practiceName;
    const result = await createBusiness(next);
    if (!result.ok) {
      toast.error("Could not add a business", { description: result.reason });
      return;
    }
    setPendingIndustry(null);
    toast.success(`Added ${industryMeta(next).demoName}`, {
      description: `Your businesses still list ${kept}. Switch back from the header any time.`,
    });
  }

  function resetToSample() {
    const lost = [
      joinWithAnd(describeEnteredWork(enteredWork(profile))),
      profile.decisions.length ? `your ${tabName("journal")}` : "",
    ].filter(Boolean);
    if (
      lost.length &&
      !window.confirm(
        `Reset ${profile.practiceName} to the sample business? This discards ${lost.join(" and ")}.`,
      )
    )
      return;
    resetProfile();
  }

  // Figures that are not facts about this business yet say so.
  const soleOwnerNote = registerAssessed(template)
    ? "From Who knows what: the critical items only one person holds."
    : "Not assessed yet: this figure comes from Who knows what once you mark someone there.";
  const tenureFromTeam =
    ownTeam && template.people.some((p) => p.active && typeof p.tenureYears === "number");
  const tenureNote = ownTeam
    ? tenureFromTeam
      ? "From the hire dates on your team."
      : "You have not entered hire dates for your team, so this is the sample business's figure."
    : undefined;
  const segregationNote = ownTeam ? (
    s.segregationSource === "manual" ? (
      <>
        You set this by hand.{" "}
        <button
          type="button"
          onClick={resetSegregationToDerived}
          className="text-primary underline hover:text-fg"
        >
          Use the score from your team's duties
        </button>
      </>
    ) : (
      `From your team's duties (${s.segregationScore}/100). Moving the slider sets it by hand.`
    )
  ) : (
    "An estimate for the sample team. Import or edit your team in the map builder to work it out from their duties."
  );

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Settings2 className="size-4 text-primary" />
            Business profile
          </CardTitle>
          <SyncStatusBadge />
        </div>
        <CardDescription>
          {ownTeam
            ? "Industry sets the sample process map, register and scenarios; your team and the duties you ticked drive the gaps and scores. Sign in to sync across devices."
            : "Industry loads the sample business (process map, register, scenarios). Team size and which controls run drive residual risk and Pioneer's briefs. Sign in to sync across devices."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <label className="block text-sm">
          <span className="text-muted">Industry</span>
          <select
            value={pendingIndustry ?? profile.industry}
            onChange={(e) => {
              const next = e.target.value as IndustryId;
              setPendingIndustry(next === profile.industry ? null : next);
            }}
            className="mt-1 w-full rounded-lg border border-border bg-elevated px-3 py-2 text-sm"
          >
            {INDUSTRIES.map((i) => (
              <option key={i.id} value={i.id}>
                {i.label}
              </option>
            ))}
          </select>
        </label>
        {pendingIndustry && work && (
          <IndustryChangeConfirm
            businessName={profile.practiceName}
            industryLabel={industryMeta(pendingIndustry).label}
            entered={hasEnteredWork(work) ? joinWithAnd(describeEnteredWork(work)) : null}
            onKeepAndAdd={() => void addBusiness(pendingIndustry)}
            onReplace={() => loadSample(pendingIndustry)}
            onCancel={() => setPendingIndustry(null)}
          />
        )}
        <label className="block text-sm">
          <span className="text-muted">Business name</span>
          <input
            value={profile.practiceName}
            onChange={(e) => setPracticeName(e.target.value)}
            className="mt-1 w-full rounded-lg border border-border bg-elevated px-3 py-2 text-sm"
          />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          {ownTeam ? (
            <Figure
              label="Team size"
              value={s.teamSize}
              note="From your team: the people marked as working here."
            />
          ) : (
            <Slider
              label="Team size"
              value={s.teamSize}
              min={1}
              max={OWN_TEAM_MAX}
              onChange={(v) => setStaff({ ...s, teamSize: v })}
            />
          )}
          <Slider
            label="Segregation score"
            value={s.segregationScore}
            min={0}
            max={100}
            onChange={(v) => setStaff({ ...s, segregationScore: v })}
            note={segregationNote}
          />
          <Figure
            label="Items only one person knows"
            value={s.soleOwnerKnowledgeCount}
            note={soleOwnerNote}
          />
          {tenureFromTeam ? (
            <Figure
              label="Average years of service"
              value={Math.round(s.avgTenureYears * 10) / 10}
              note={tenureNote}
            />
          ) : (
            <Slider
              label="Average years of service"
              value={Math.round(s.avgTenureYears * 10) / 10}
              min={0}
              max={15}
              step={0.5}
              onChange={(v) => setStaff({ ...s, avgTenureYears: v })}
              note={tenureNote}
            />
          )}
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={s.dualControlPayments}
            onChange={(e) => setStaff({ ...s, dualControlPayments: e.target.checked })}
            className="size-4 accent-[var(--color-primary)]"
          />
          Two people approve every payment (dual release)
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={s.independentBankRec}
            onChange={(e) => setStaff({ ...s, independentBankRec: e.target.checked })}
            className="size-4 accent-[var(--color-primary)]"
          />
          Independent bank reconciliation
        </label>
        {onOpenDualRelease && (
          <Button size="sm" variant="secondary" onClick={onOpenDualRelease}>
            <ShieldCheck className="size-3.5" />
            Configure dual-release thresholds
          </Button>
        )}
        {ownTeam ? (
          // An own business never goes back to the sample business from here.
          // Once the owner has edited the map, even by renaming a starter
          // process, this returns it to the starter map; their team, register
          // and journal stay.
          profile.customProcesses && (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                if (
                  !window.confirm(
                    "Go back to the sample process map? This discards your process map edits. Your team, register and journal stay.",
                  )
                )
                  return;
                setCustomProcesses(null);
                setMapLayout({});
                toast.success("Back to the sample process map");
              }}
            >
              Back to the sample process map
            </Button>
          )
        ) : (
          <Button size="sm" variant="secondary" onClick={resetToSample}>
            Reset to the sample business
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * The choice an industry change offers. With work entered it names what the
 * sample business would replace and offers to keep this business and add
 * the new one beside it.
 */
function IndustryChangeConfirm({
  businessName,
  industryLabel,
  entered,
  onKeepAndAdd,
  onReplace,
  onCancel,
}: {
  businessName: string;
  industryLabel: string;
  /** What would be lost, in words; null when nothing has been entered. */
  entered: string | null;
  onKeepAndAdd: () => void;
  onReplace: () => void;
  onCancel: () => void;
}) {
  const tabName = useTabName();
  if (!entered) {
    return (
      <div
        role="group"
        aria-label="Confirm industry change"
        className="space-y-2 rounded-lg border border-border bg-elevated/60 p-3 text-sm"
      >
        <p>
          Load the {industryLabel} sample business? This swaps in that industry's processes, people,
          scenarios and staff defaults. You keep your {tabName("journal")}.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={onReplace}>
            Load the {industryLabel} sample business
          </Button>
          <Button size="sm" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </div>
    );
  }
  return (
    <div
      role="group"
      aria-label="Confirm industry change"
      className="space-y-2 rounded-lg border border-warn/40 bg-warn/5 p-3 text-sm"
    >
      <p>
        <span className="font-medium">
          {businessName} has {entered} entered here.
        </span>{" "}
        Loading the {industryLabel} sample business replaces all of it with the sample's people and
        processes. You keep your {tabName("journal")}.
      </p>
      <p className="text-muted">
        Running more than one kind of business? Keep {businessName} as it is and add the new one
        alongside it.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={onKeepAndAdd}>
          Keep {businessName} and add a {industryLabel} business
        </Button>
        <Button size="sm" variant="danger" onClick={onReplace}>
          Replace with the sample business
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

/**
 * A range input named by its label alone; the note that explains the figure
 * (and may hold a button) sits beside the label, not inside it, and
 * describes the input.
 */
function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  note,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  note?: ReactNode;
}) {
  const id = useId();
  return (
    <div className="text-sm">
      <div className="flex justify-between text-muted">
        <label htmlFor={`${id}-input`}>{label}</label>
        <span className="tabular text-fg" aria-hidden="true">
          {value}
        </span>
      </div>
      <input
        id={`${id}-input`}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-describedby={note ? `${id}-note` : undefined}
        className="mt-1 w-full accent-[var(--color-primary)]"
      />
      {note && (
        <p id={`${id}-note`} className="mt-1 text-xs text-subtle">
          {note}
        </p>
      )}
    </div>
  );
}

/** A figure the business's own data decides, shown rather than set. */
function Figure({ label, value, note }: { label: string; value: number; note?: ReactNode }) {
  return (
    <div className="text-sm">
      <div className="flex justify-between text-muted">
        <span>{label}</span>
        <span className="tabular text-fg">{value}</span>
      </div>
      {note && <p className="mt-1 text-xs text-subtle">{note}</p>}
    </div>
  );
}
