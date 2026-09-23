import { useState } from "react";

import { usePractice } from "@/lib/precog/practice-context";
import { useTemplate } from "@/lib/precog/use-template";
import type { ProcessNode } from "@/lib/precog/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import { cn } from "@/lib/utils";
import { AlertTriangle, Lightbulb } from "lucide-react";

import { industryMeta } from "@/lib/precog/industry";
import { suggestForProcess } from "@/lib/precog/builder/suggest-server";
import type { SuggestionResult } from "@/lib/precog/builder/suggest";
import { Loader2, Sparkles } from "lucide-react";

import { uid, labelCls } from "@/components/precog/builder/form-shared";
export function SuggestPanel({
  process,
  onChange,
}: {
  process: ProcessNode;
  onChange: (patch: Partial<ProcessNode>) => void;
}) {
  const tpl = useTemplate();
  const { profile } = usePractice();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SuggestionResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setLoading(true);
    setError(null);
    try {
      const res = await suggestForProcess({
        data: {
          processName: process.name,
          description: process.description,
          industryLabel: industryMeta(profile.industry).label,
          existingRiskTitles: (process.risks ?? []).map((r) => r.title),
          existingIdeaTitles: (process.ideas ?? []).map((i) => i.title),
          availableControls: tpl.controls.map((c) => ({ id: c.id, name: c.name })),
          ownerRoles: (process.ownerPersonIds ?? [])
            .map((id) => tpl.people.find((p) => p.id === id)?.role)
            .filter((r): r is string => Boolean(r)),
        },
      });
      setResult(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Suggestion failed");
    } finally {
      setLoading(false);
    }
  }

  const existingRisk = new Set((process.risks ?? []).map((r) => r.title.toLowerCase()));
  const existingIdea = new Set((process.ideas ?? []).map((i) => i.title.toLowerCase()));

  return (
    <div className="space-y-2 rounded-lg border border-dashed border-accent/40 bg-accent/5 p-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className={cn(labelCls, "flex items-center gap-1")}>
          <Sparkles className="size-3 text-accent" />
          Suggest risks & controls
        </span>
        <Button size="sm" variant="secondary" onClick={run} disabled={loading}>
          {loading ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Sparkles className="size-3.5" />
          )}
          {result ? "Again" : "Suggest"}
        </Button>
      </div>
      {!result && !loading && (
        <p className="text-xs text-muted">
          Get starter risks, improvement ideas, and matching controls for this process based on its
          name and description.
        </p>
      )}
      {error && <p className="text-xs text-danger">{error}</p>}
      {result && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-subtle">
            <Badge variant={result.source === "grok" ? "accent" : "default"}>
              {result.source === "grok" ? `Grok · ${result.model ?? ""}` : "Rule-based"}
            </Badge>
            <span>{result.rationale}</span>
          </div>
          {result.risks.length > 0 && (
            <ul className="space-y-1">
              {result.risks.map((r) => {
                const added = existingRisk.has(r.title.toLowerCase());
                return (
                  <li
                    key={r.title}
                    className="flex items-start gap-2 rounded-md border border-border bg-elevated px-2 py-1.5 text-xs"
                  >
                    <AlertTriangle className="mt-0.5 size-3 shrink-0 text-danger" />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-fg">{r.title}</p>
                      <p className="text-subtle">
                        {r.kind} · S{r.severity}×L{r.likelihood}
                        {r.note ? ` · ${r.note}` : ""}
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={added}
                      onClick={() =>
                        onChange({ risks: [...(process.risks ?? []), { ...r, id: uid("r") }] })
                      }
                      className="text-xs font-medium text-primary hover:underline disabled:text-subtle disabled:no-underline"
                    >
                      {added ? "Added" : "Add"}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {result.ideas.length > 0 && (
            <ul className="space-y-1">
              {result.ideas.map((i) => {
                const added = existingIdea.has(i.title.toLowerCase());
                return (
                  <li
                    key={i.title}
                    className="flex items-start gap-2 rounded-md border border-border bg-elevated px-2 py-1.5 text-xs"
                  >
                    <Lightbulb className="mt-0.5 size-3 shrink-0 text-warn" />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-fg">{i.title}</p>
                      <p className="text-subtle">
                        {i.category} · {i.effort} effort · {i.impact} impact
                        {i.note ? ` · ${i.note}` : ""}
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={added}
                      onClick={() =>
                        onChange({ ideas: [...(process.ideas ?? []), { ...i, id: uid("i") }] })
                      }
                      className="text-xs font-medium text-primary hover:underline disabled:text-subtle disabled:no-underline"
                    >
                      {added ? "Added" : "Add"}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {result.controlIds.length > 0 && (
            <div className="flex flex-wrap items-center gap-1 text-xs">
              <span className="text-subtle">Link controls:</span>
              {result.controlIds.map((cid) => {
                const c = tpl.controls.find((x) => x.id === cid);
                if (!c) return null;
                const on = process.controlIds.includes(cid);
                return (
                  <button
                    key={cid}
                    type="button"
                    disabled={on}
                    onClick={() => onChange({ controlIds: [...process.controlIds, cid] })}
                    className={cn(
                      "rounded-md border px-2 py-0.5",
                      on
                        ? "border-primary/40 bg-primary/10 text-subtle"
                        : "border-border bg-elevated text-muted hover:text-fg",
                    )}
                  >
                    {on ? "✓ " : "+ "}
                    {c.name}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
