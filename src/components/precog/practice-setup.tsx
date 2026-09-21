import { toast } from "sonner";
import { useState, type ReactNode } from "react";
import { usePractice } from "@/lib/precog/practice-context";
import { INDUSTRIES, industryMeta, type IndustryId } from "@/lib/precog/industry";
import {
  describeEnteredWork,
  enteredWork,
  hasEnteredWork,
  listEnteredWork,
} from "@/lib/precog/industry-switch";
import { getIndustryTemplate } from "@/lib/precog/templates";
import { SyncStatusBadge } from "@/components/precog/sync-status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Settings2, ShieldCheck } from "lucide-react";

/** Business profile editor — feeds staff into residual scores, scenarios, and Pioneer. */
export function PracticeSetup({ onOpenDualRelease }: { onOpenDualRelease?: () => void }) {
  const {
    profile,
    setPracticeName,
    setIndustry,
    setStaff,
    setDualRelease,
    resetSegregationToDerived,
    resetProfile,
    createBusiness,
  } = usePractice();
  const s = profile.staff;
  const [pendingChoice, setPendingIndustry] = useState<IndustryId | null>(null);
  const pendingIndustry = pendingChoice === profile.industry ? null : pendingChoice;
  const work = enteredWork(profile);
  const entered = listEnteredWork(describeEnteredWork(work));

  function loadTemplate(next: IndustryId) {
    setIndustry(next);
    setPendingIndustry(null);
    const tpl = getIndustryTemplate(next);
    toast.success(`Loaded ${industryMeta(next).label} template`, {
      description: `${tpl.processes.length} processes · ${tpl.people.length} people · ${tpl.scenarios.length} scenarios`,
    });
  }

  function addBusiness(next: IndustryId) {
    const kept = profile.practiceName;
    createBusiness(next);
    setPendingIndustry(null);
    toast.success(`Added ${industryMeta(next).demoName}`, {
      description: `${kept} is saved in your businesses — switch back from the header any time.`,
    });
  }
  const segregationNote = profile.customPeople ? (
    profile.staff.segregationSource === "manual" ? (
      <>
        Manual override —{" "}
        <button
          type="button"
          onClick={resetSegregationToDerived}
          className="text-primary underline hover:text-fg"
        >
          use score derived from your team
        </button>
      </>
    ) : (
      `Derived from your team's duties (${s.segregationScore}/100). Moving the slider overrides it.`
    )
  ) : (
    "Estimate — import or edit your team in the Map Builder to derive this."
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
          Industry sets the demo template (process map, knowledge graph, scenarios). Team size and
          control posture drive residual scores and your AI advisor. Sign in to sync across devices.
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
        {pendingIndustry && (
          <div
            role="group"
            aria-label="Confirm industry change"
            className={
              hasEnteredWork(work)
                ? "space-y-2 rounded-lg border border-warn/40 bg-warn/5 p-3 text-sm"
                : "space-y-2 rounded-lg border border-border bg-elevated/60 p-3 text-sm"
            }
          >
            {hasEnteredWork(work) ? (
              <>
                <p>
                  <span className="font-medium">
                    {profile.practiceName} has {entered} entered here.
                  </span>{" "}
                  Loading the {industryMeta(pendingIndustry).label} demo replaces all of it with
                  demo people and processes. Your decision log is kept.
                </p>
                <p className="text-muted">
                  Running more than one kind of business? Keep {profile.practiceName} as it is
                  and add the new one alongside it.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => addBusiness(pendingIndustry)}>
                    Keep {profile.practiceName} and add a{" "}
                    {industryMeta(pendingIndustry).label} business
                  </Button>
                  <Button size="sm" variant="danger" onClick={() => loadTemplate(pendingIndustry)}>
                    Replace with the demo
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setPendingIndustry(null)}>
                    Cancel
                  </Button>
                </div>
              </>
            ) : (
              <>
                <p>
                  Load the {industryMeta(pendingIndustry).label} demo? This swaps in that
                  industry's processes, people, scenarios and staff defaults. Your decision log is
                  kept.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => loadTemplate(pendingIndustry)}>
                    Load the {industryMeta(pendingIndustry).label} demo
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setPendingIndustry(null)}>
                    Cancel
                  </Button>
                </div>
              </>
            )}
          </div>
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
          <Slider
            label="Team size"
            value={s.teamSize}
            min={2}
            max={20}
            onChange={(v) => setStaff({ ...s, teamSize: v })}
          />
          <Slider
            label="Segregation score"
            value={s.segregationScore}
            min={0}
            max={100}
            onChange={(v) => setStaff({ ...s, segregationScore: v })}
            note={segregationNote}
          />
          <Slider
            label="Sole-owner knowledge items"
            value={s.soleOwnerKnowledgeCount}
            min={0}
            max={8}
            onChange={(v) => setStaff({ ...s, soleOwnerKnowledgeCount: v })}
          />
          <Slider
            label="Avg tenure (years)"
            value={Math.round(s.avgTenureYears * 10) / 10}
            min={0}
            max={15}
            step={0.5}
            onChange={(v) => setStaff({ ...s, avgTenureYears: v })}
          />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={s.dualControlPayments || profile.dualRelease.enabled}
            onChange={(e) => {
              const on = e.target.checked;
              setStaff({ ...s, dualControlPayments: on });
              setDualRelease({ ...profile.dualRelease, enabled: on });
            }}
            className="size-4 accent-[var(--color-primary)]"
          />
          Dual control / dual release (master)
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
        <Button
          size="sm"
          variant="secondary"
          onClick={() => {
            const lost = [entered, profile.decisions.length ? "your decision log" : ""].filter(
              Boolean,
            );
            if (
              lost.length &&
              !window.confirm(
                `Reset ${profile.practiceName} to the demo? This discards ${lost.join(" and ")}.`,
              )
            )
              return;
            resetProfile();
          }}
        >
          Reset to demo defaults
        </Button>
      </CardContent>
    </Card>
  );
}

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
  return (
    <label className="block text-sm">
      <span className="flex justify-between text-muted">
        <span>{label}</span>
        <span className="tabular text-fg">{value}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 w-full accent-[var(--color-primary)]"
      />
      {note && <span className="mt-1 block text-xs text-subtle">{note}</span>}
    </label>
  );
}
