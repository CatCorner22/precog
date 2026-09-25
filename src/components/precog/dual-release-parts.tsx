import { CheckCircle2, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type { ReleaseEvaluation } from "@/lib/precog/controls/dual-release";
import { cn, formatUsd } from "@/lib/utils";

export function DualReleaseMiniStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "danger" | "warn" | "ok" | "primary";
}) {
  return (
    <Card>
      <CardContent className="p-3">
        <Badge
          variant={
            tone === "danger"
              ? "danger"
              : tone === "warn"
                ? "warn"
                : tone === "ok"
                  ? "ok"
                  : "primary"
          }
        >
          {label}
        </Badge>
        <p className="mt-1 text-xl font-semibold tabular">{value}</p>
      </CardContent>
    </Card>
  );
}

export function DualReleaseEvalResult({ eval: result }: { eval: ReleaseEvaluation }) {
  const ok = result.ok;
  return (
    <div
      className={cn(
        "rounded-xl border px-3 py-3 text-sm",
        ok ? "border-ok/30 bg-ok/5" : "border-danger/30 bg-danger/5",
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        {ok ? (
          <CheckCircle2 className="size-4 text-ok" />
        ) : (
          <XCircle className="size-4 text-danger" />
        )}
        <Badge variant={ok ? "ok" : "danger"}>{result.status}</Badge>
        <span className="text-xs text-muted">
          {formatUsd(result.amountUsd)} ·{" "}
          {result.dualWaived ? (
            <span className="text-danger">
              dual waived — no second signer required at any amount
            </span>
          ) : result.dualForced ? (
            <span>dual required at every amount</span>
          ) : (
            <>
              effective {formatUsd(result.thresholdUsd)}
              {result.thresholdUsd === 0 && <span className="text-subtle"> (always dual)</span>}
            </>
          )}
          {(result.dualWaived ||
            result.dualForced ||
            result.baseThresholdUsd !== result.thresholdUsd) && (
            <span className="text-subtle"> (base {formatUsd(result.baseThresholdUsd)})</span>
          )}
        </span>
      </div>
      {result.appliedException && (
        <p className="mt-2 rounded-md border border-warn/30 bg-warn/10 px-2 py-1 text-xs text-fg">
          Exception: <strong>{result.appliedException.label}</strong> (
          {result.appliedException.action.replace("_", " ")})
          {result.appliedException.residualNote ? ` — ${result.appliedException.residualNote}` : ""}
        </p>
      )}
      <ul className="mt-2 space-y-1 text-xs text-muted">
        {result.reasons.map((r) => (
          <li key={r}>· {r}</li>
        ))}
      </ul>
      {result.nextSteps.length > 0 && (
        <ul className="mt-2 space-y-1 text-xs text-fg">
          {result.nextSteps.map((r) => (
            <li key={r}>→ {r}</li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-xs text-subtle">{result.controlCredit.note}</p>
    </div>
  );
}
