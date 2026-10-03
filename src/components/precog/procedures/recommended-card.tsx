import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { LibraryRow } from "@/lib/precog/procedures/library";

/** How many recommendations that fit this business show before "Show all". */
const SHOWN = 6;

/**
 * Recommended procedures for this line of business (procedures/library.ts):
 * those that fit the team and the register first, each with why it matters,
 * what it would cover, its suggested steps, the evidence to keep, what to
 * do when one person has to do both halves of the work, and the guidance it
 * follows.
 * Starting one opens the editor with the steps marked as suggestions.
 */
export function RecommendedCard({
  rows,
  itemName,
  nameOf,
  disabled,
  onStart,
}: {
  rows: readonly LibraryRow[];
  itemName: (id: string) => string | undefined;
  nameOf: (id: string) => string | null;
  disabled: boolean;
  onStart: (row: LibraryRow) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  if (rows.length === 0) return null;
  const fitting = rows.filter((r) => r.fits);
  const shown = showAll ? rows : fitting.slice(0, SHOWN);
  const hidden = rows.length - shown.length;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recommended procedures</CardTitle>
        <CardDescription>
          Procedures we recommend for a business like yours, with suggested steps from recognized
          control practice. Each suggested step stays marked as a suggestion until you change it to
          match your business or verify the procedure.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {shown.length === 0 && (
          <p className="text-muted">None matches your team or register yet.</p>
        )}
        <ul className="space-y-3">
          {shown.map((row) => {
            const r = row.recommendation;
            const covers = row.knowledgeIds.map(itemName).filter(Boolean);
            const holders = row.heldBy.map(nameOf).filter(Boolean);
            return (
              <li key={r.id} className="rounded-lg border border-border p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 [overflow-wrap:anywhere]">
                    <p className="font-medium">{r.title}</p>
                    <p className="text-xs text-muted">{r.purpose}</p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 shrink-0 px-2 text-xs"
                    aria-label={`Start from the recommended procedure: ${r.title}`}
                    disabled={disabled}
                    onClick={() => onStart(row)}
                  >
                    Start from this
                  </Button>
                </div>
                {covers.length > 0 && (
                  <p className="mt-1 text-xs [overflow-wrap:anywhere]">
                    Covers on Who knows what: {covers.join(", ")}
                  </p>
                )}
                {covers.length === 0 && holders.length > 0 && (
                  <p className="mt-1 text-xs [overflow-wrap:anywhere]">
                    Duty held by {holders.join(", ")}
                  </p>
                )}
                <details className="mt-1 text-xs">
                  <summary className="cursor-pointer text-muted">
                    {r.steps.length} suggested steps
                    {r.evidenceToKeep?.length ? ", the evidence to keep" : ""} and the source
                  </summary>
                  <ol className="mt-1 list-decimal space-y-0.5 pl-5">
                    {r.steps.map((s) => (
                      <li key={s.text}>
                        {s.text}
                        {s.caution && <span className="block text-warn">Caution: {s.caution}</span>}
                      </li>
                    ))}
                  </ol>
                  {r.evidenceToKeep && r.evidenceToKeep.length > 0 && (
                    <>
                      <p className="mt-2 font-medium">Evidence to keep</p>
                      <ul className="mt-0.5 list-disc space-y-0.5 pl-5">
                        {r.evidenceToKeep.map((e) => (
                          <li key={e}>{e}</li>
                        ))}
                      </ul>
                    </>
                  )}
                  {r.ifYouCannotSeparate && (
                    <>
                      <p className="mt-2 font-medium">If you cannot separate this duty</p>
                      <p className="mt-0.5">{r.ifYouCannotSeparate}</p>
                    </>
                  )}
                  <p className="mt-1 text-muted">Source: {r.source}</p>
                </details>
              </li>
            );
          })}
        </ul>
        {(hidden > 0 || showAll) && (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs"
            aria-expanded={showAll}
            onClick={() => setShowAll((v) => !v)}
          >
            {showAll ? "Show only those that fit" : `Show all ${rows.length} recommendations`}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
