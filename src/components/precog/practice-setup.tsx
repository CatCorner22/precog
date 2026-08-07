import { usePractice } from "@/lib/precog/practice-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Settings2 } from "lucide-react";

/** Lightweight practice profile editor — feeds staff into residual & LLM tools. */
export function PracticeSetup() {
  const { profile, setPracticeName, setStaff, resetProfile } = usePractice();
  const s = profile.staff;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Settings2 className="size-4 text-primary" />
            Practice profile
          </CardTitle>
          <Badge variant="default">Saved on this device</Badge>
        </div>
        <CardDescription>
          Name and staff composition drive residual scores, Precog, and the Pioneer LLM tools.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <label className="block text-sm">
          <span className="text-muted">Practice name</span>
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
            checked={s.dualControlPayments}
            onChange={(e) =>
              setStaff({ ...s, dualControlPayments: e.target.checked })
            }
            className="size-4 accent-[var(--color-primary)]"
          />
          Dual control on payments
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={s.independentBankRec}
            onChange={(e) =>
              setStaff({ ...s, independentBankRec: e.target.checked })
            }
            className="size-4 accent-[var(--color-primary)]"
          />
          Independent bank reconciliation
        </label>
        <Button size="sm" variant="secondary" onClick={resetProfile}>
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
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block text-sm">
      <div className="mb-1 flex justify-between">
        <span className="text-muted">{label}</span>
        <span className="tabular font-medium">{value}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-[var(--color-primary)]"
      />
    </label>
  );
}
