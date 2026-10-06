import { CheckCircle2, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { ReleaseEvaluation } from "@/lib/precog/controls/dual-release";
import { cn, formatUsdTyped } from "@/lib/utils";
import { exceptionActionLabel, RELEASE_STATUS_LABEL } from "./dual-release-constants";

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
        <Badge variant={ok ? "ok" : "danger"}>{RELEASE_STATUS_LABEL[result.status]}</Badge>
        <span className="text-xs text-muted">
          {formatUsdTyped(result.amountUsd)} ·{" "}
          {result.dualWaived ? (
            <span className="text-danger">waiver: no second signer needed at any amount</span>
          ) : result.dualForced ? (
            <span>two signers needed at every amount</span>
          ) : (
            <>
              two signers needed above {formatUsdTyped(result.thresholdUsd)}
              {result.thresholdUsd === 0 && <span className="text-subtle"> (every amount)</span>}
            </>
          )}
          {(result.dualWaived ||
            result.dualForced ||
            result.baseThresholdUsd !== result.thresholdUsd) && (
            <span className="text-subtle">
              {" "}
              (channel threshold {formatUsdTyped(result.baseThresholdUsd)})
            </span>
          )}
        </span>
      </div>
      {result.appliedException && (
        <p className="mt-2 rounded-md border border-warn/30 bg-warn/10 px-2 py-1 text-xs text-fg">
          Exception: <strong>{result.appliedException.label}</strong> (
          {exceptionActionLabel(result.appliedException.action).toLowerCase()})
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
