import { useMemo, useRef, useState } from "react";
import { Sigma, Upload } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { demoTransactions } from "@/lib/precog/stats/demo-transactions";
import {
  FORENSIC_DISCLAIMER,
  runForensicSuite,
  type Transaction,
  type Severity,
} from "@/lib/precog/stats/forensic-suite";
import {
  CONFORMITY_LABEL,
  SEVERITY_LABEL,
  benfordRows,
  screenFindings,
} from "@/lib/precog/stats/forensic-display";
import { parsePastedAmounts } from "@/lib/precog/stats/pasted-amounts";
import { parseTransactionsCsv } from "@/lib/precog/stats/transactions-csv";

/** Where the screened records came from; the demo must never pass for the owner's data. */
type Source = "demo" | "file" | "paste";

export function ForensicPanel() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [source, setSource] = useState<Source | null>(null);
  const [undated, setUndated] = useState(false);
  const [paste, setPaste] = useState("");
  const [issues, setIssues] = useState<string[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);
  const report = useMemo(() => runForensicSuite(transactions), [transactions]);
  const findings = screenFindings(report, undated);
  const first = report.benfordFirst;

  function show(next: Source, result: { transactions: Transaction[]; issues: string[] }) {
    setTransactions(result.transactions);
    setIssues(result.issues);
    setSource(next);
    setUndated(false);
  }

  function loadDemo() {
    show("demo", { transactions: demoTransactions(), issues: [] });
  }

  async function loadFile(file: File) {
    try {
      show("file", parseTransactionsCsv(await file.text()));
    } catch {
      setIssues([`Could not read ${file.name}. Check the file still exists and try again.`]);
    }
  }

  function screenPaste() {
    const result = parsePastedAmounts(paste);
    show("paste", result);
    setUndated(result.undated);
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="accent">Forensic screen</Badge>
            <Badge variant="primary">Runs locally · educational</Badge>
          </div>
          <CardTitle className="mt-2 flex items-center gap-2">
            <Sigma className="size-5 text-primary" />
            Transaction pattern screen
          </CardTitle>
          <CardDescription>{FORENSIC_DISCLAIMER}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="secondary" onClick={loadDemo}>
              Load sample data
            </Button>
            <Button size="sm" variant="outline" onClick={() => fileInput.current?.click()}>
              <Upload className="size-3.5" />
              Import CSV
            </Button>
            <input
              ref={fileInput}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void loadFile(file);
                event.target.value = "";
              }}
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="forensic-paste" className="text-xs font-medium text-muted">
              Paste payment or deposit amounts, or a transaction CSV
            </label>
            <p className="text-xs text-subtle">
              Paste what was received or banked, not the fee schedule: set prices do not follow the
              digit pattern the screen compares against. A CSV with a kind column is screened by
              kind.
            </p>
            <textarea
              id="forensic-paste"
              value={paste}
              onChange={(event) => setPaste(event.target.value)}
              placeholder={"One amount per line, e.g.\n125.00\n(40.00)"}
              className="min-h-24 w-full rounded-lg border border-border bg-elevated px-3 py-2 text-sm"
            />
            <Button size="sm" variant="outline" onClick={screenPaste}>
              Screen pasted data
            </Button>
          </div>
          {issues.length > 0 && (
            <ul className="space-y-1 text-xs text-warn">
              {issues.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Screen summary</CardTitle>
          <CardDescription>
            {source === "demo"
              ? `Sample data: 60 generated days from a dental office (${report.n} records), not your records.`
              : `${report.n} transaction records loaded`}
          </CardDescription>
          {undated && report.n > 0 && (
            <p className="text-xs text-subtle">
              Pasted amounts carry no dates, so the repeated-transaction check did not run.
            </p>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {first ? (
            <>
              <p className="text-sm">
                Fit to Benford&apos;s law: {CONFORMITY_LABEL[first.conformity]} (mean absolute
                deviation {first.mad.toFixed(3)}; cutoffs per Nigrini 2012)
              </p>
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted">
                  Share of amounts by first digit, observed against expected
                </p>
                {benfordRows(first).map((row) => (
                  <div key={row.digit} className="grid grid-cols-[1.5rem_1fr_7rem] gap-2 text-xs">
                    <span className="pt-1 text-subtle">{row.digit}</span>
                    <div className="space-y-1">
                      <div className="h-2 rounded bg-elevated">
                        <div
                          className="h-2 rounded bg-primary"
                          style={{ width: `${row.observedWidth}%` }}
                        />
                      </div>
                      <div className="h-2 rounded bg-elevated">
                        <div
                          className="h-2 rounded bg-muted/60"
                          style={{ width: `${row.expectedWidth}%` }}
                        />
                      </div>
                    </div>
                    <span className="text-right tabular-nums text-subtle">
                      {row.observedPct.toFixed(1)}% vs {row.expectedPct.toFixed(1)}%
                    </span>
                  </div>
                ))}
                <div className="flex gap-3 text-xs text-subtle">
                  <span>
                    <i className="mr-1 inline-block size-2 rounded-full bg-primary" />
                    Observed
                  </span>
                  <span>
                    <i className="mr-1 inline-block size-2 rounded-full bg-muted/60" />
                    Expected (Benford&apos;s law: log10(1 + 1/d))
                  </span>
                </div>
              </div>
            </>
          ) : (
            <p className="text-sm text-muted">
              Load sample data or your own transaction data to run the screen.
            </p>
          )}
        </CardContent>
      </Card>

      {findings.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Patterns to discuss</CardTitle>
            <CardDescription>
              These results are prompts for process review, not conclusions.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {findings.map((finding) => (
              <div
                key={finding.id}
                className="rounded-lg border border-border bg-elevated px-3 py-3"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={SEVERITY_VARIANT[finding.severity]}>
                    {SEVERITY_LABEL[finding.severity]}
                  </Badge>
                  <span className="font-medium">{finding.title}</span>
                </div>
                <p className="mt-1 text-sm text-muted">{finding.summary}</p>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-subtle">
                  {finding.detail.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
                {finding.examples.length > 0 && (
                  <p className="mt-2 text-xs text-subtle">
                    Example records: {finding.examples.join(", ")}
                  </p>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

const SEVERITY_VARIANT: Record<Severity, "danger" | "warn" | "default"> = {
  review: "danger",
  watch: "warn",
  info: "default",
};
