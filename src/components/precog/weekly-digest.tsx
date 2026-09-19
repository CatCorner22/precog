import { useMemo, useState } from "react";
import { toast } from "sonner";
import { usePractice } from "@/lib/precog/practice-context";
import { useTemplate } from "@/lib/precog/use-template";
import { buildDigest, mailtoHref } from "@/lib/precog/builder/digest";
import { collectDueItems } from "@/lib/precog/builder/due";
import { summarizeEffectiveness } from "@/lib/precog/builder/effectiveness";
import { busFactor, rankDepartureRisk } from "@/lib/precog/builder/departure";
import { buildProcessMapGraph, computeMapHealth, validateProcessMap } from "@/lib/precog/process-graph";
import { buildWeeklyActions } from "@/components/precog/weekly-action-plan";
import { buildInsuranceReport } from "@/lib/precog/insurance/model";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Copy, Mail, Newspaper } from "lucide-react";

/** One-click weekly summary the owner can email themselves, a partner, or an advisor. */
export function WeeklyDigestCard() {
  const { profile, mapCustomized, templateRevision } = usePractice();
  const tpl = useTemplate();
  const [preview, setPreview] = useState(false);

  const digest = useMemo(() => {
    const { snapshots } = buildProcessMapGraph(profile.staff);
    const issues = validateProcessMap(tpl.processes, tpl.people, new Set(tpl.controls.map((c) => c.id)), profile.mapLayout ?? {});
    const health = computeMapHealth(snapshots, issues, { customized: mapCustomized });
    const history = profile.mapHealthHistory ?? [];
    const previousHealth = history.length >= 2 ? history[history.length - 2].score : null;
    const due = collectDueItems(tpl.processes, tpl.people, profile);
    const actions = buildWeeklyActions({ staff: profile.staff, dualRelease: profile.dualRelease, mapSnapshots: snapshots });
    const effectiveness = summarizeEffectiveness(tpl.controls, tpl.processes);
    const impacts = rankDepartureRisk(tpl.processes, tpl.people, profile.staff);
    return buildDigest({
      businessName: profile.practiceName,
      health,
      previousHealth,
      due,
      actions,
      effectiveness,
      busFactorAtRisk: busFactor(impacts),
      insurance: (() => {
        const r = buildInsuranceReport({
          profile: profile.insurance!,
          staff: profile.staff,
          riskVariables: profile.riskVariables,
          dualRelease: profile.dualRelease,
          processes: tpl.processes,
          controls: tpl.controls,
        });
        const top = r.moves.find((m) => m.premiumDelta > 0);
        return {
          totalMid: r.totalMid,
          overallReadiness: r.overallReadiness,
          topMove: top ? { title: top.title, premiumDelta: top.premiumDelta } : undefined,
          declined: r.coverage.filter((c) => c.status === "likely_declined").map((c) => c.label),
        };
      })(),
      teamSize: tpl.people.filter((p) => p.active).length,
      appUrl: typeof window !== "undefined" ? window.location.origin : undefined,
    });
  }, [profile, tpl.processes, tpl.people, tpl.controls, mapCustomized, templateRevision]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(`${digest.subject}\n\n${digest.body}`);
      toast.success("Digest copied", { description: "Paste it into email, Slack, or your notes." });
    } catch {
      setPreview(true);
      toast("Clipboard blocked — copy from the preview below");
    }
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Newspaper className="size-4 text-primary" />
          Weekly digest
        </CardTitle>
        <CardDescription>
          Health, what's due, top moves, control effectiveness, and bus factor — in one plain-text
          note you can send to yourself, a partner, or your advisor.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="rounded-md border border-border bg-elevated px-2.5 py-1.5 text-xs text-fg">{digest.subject}</p>
        <div className="flex flex-wrap gap-2">
          <a
            href={mailtoHref(digest.subject, digest.body)}
            className="inline-flex h-8 items-center gap-2 rounded-md bg-primary px-3 text-xs font-medium text-primary-fg hover:bg-primary/90"
          >
            <Mail className="size-3.5" /> Email it
          </a>
          <Button size="sm" variant="secondary" onClick={() => void copy()}>
            <Copy className="size-3.5" /> Copy
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setPreview((v) => !v)}>
            {preview ? "Hide preview" : "Preview"}
          </Button>
        </div>
        {preview && (
          <pre className="max-h-72 overflow-auto rounded-md border border-border bg-panel p-3 text-[11px] leading-relaxed whitespace-pre-wrap text-fg/90">
            {digest.body}
          </pre>
        )}
      </CardContent>
    </Card>
  );
}
