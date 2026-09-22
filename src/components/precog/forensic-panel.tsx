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
import { parseTransactionsCsv } from "@/lib/precog/stats/transactions-csv";

function severityVariant(severity: Severity): "danger" | "warn" | "default" {
  return severity === "review" ? "danger" : severity === "watch" ? "warn" : "default";
}

function parsePastedAmounts(value: string): { transactions: Transaction[]; issues: string[] } {
  const trimmed = value.trim();
  if (!trimmed) return { transactions: [], issues: [] };
  const firstLine = trimmed.split(/\r?\n/, 1)[0].toLowerCase();
  if (firstLine.includes("date") && firstLine.includes("amount")) {
    return parseTransactionsCsv(trimmed);
  }
  const today = new Date().toISOString().slice(0, 10);
  const transactions: Transaction[] = [];
  const issues: string[] = [];
  trimmed.split(/\r?\n/).forEach((line, index) => {
    const source = line.trim();
    if (!source) return;
    const negative = source.startsWith("(") && source.endsWith(")");
    const amount = Number(
      (negative ? source.slice(1, -1) : source).replaceAll("$", "").replaceAll(",", ""),
    );
    if (!Number.isFinite(amount)) {
      if (issues.length < 20) issues.push(`Line ${index + 1}: invalid amount`);
      return;
    }
    transactions.push({
      id: `pasted-${index + 1}`,
      date: today,
      amount: negative ? -Math.abs(amount) : amount,
    });
  });
  return { transactions, issues };
}

export function ForensicPanel() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [paste, setPaste] = useState("");
  const [issues, setIssues] = useState<string[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);
  const report = useMemo(() => runForensicSuite(transactions), [transactions]);
  const first = report.benfordFirst;

  function loadDemo() {
    setTransactions(demoTransactions());
    setIssues([]);
  }

  async function loadFile(file: File) {
    const result = parseTransactionsCsv(await file.text());
    setTransactions(result.transactions);
    setIssues(result.issues);
  }

  function screenPaste() {
    const result = parsePastedAmounts(paste);
    setTransactions(result.transactions);
    setIssues(result.issues);
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
              Load demo day sheet
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
          <CardDescription>{report.n} transaction records loaded</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {first ? (
            <>
              <div className="flex flex-wrap gap-3 text-sm">
                <span>Conformity: {first.conformity}</span>
                <span>MAD: {first.mad.toFixed(4)}</span>
                <span>χ²: {first.chiSquare.toFixed(2)}</span>
              </div>
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted">Benford first-digit comparison</p>
                {first.digits.map((digit, index) => {
                  const observed = first.observed[index];
                  const expected = first.expected[index];
                  const max = Math.max(observed, expected, 0.01);
                  return (
                    <div key={digit} className="grid grid-cols-[1.5rem_1fr] gap-2 text-xs">
                      <span className="pt-1 text-subtle">{digit}</span>
                      <div className="space-y-1">
                        <div className="h-2 rounded bg-elevated">
                          <div
                            className="h-2 rounded bg-primary"
                            style={{ width: `${(observed / max) * 100}%` }}
                          />
                        </div>
                        <div className="h-2 rounded bg-elevated">
                          <div
                            className="h-2 rounded bg-muted/60"
                            style={{ width: `${(expected / max) * 100}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div className="flex gap-3 text-[11px] text-subtle">
                  <span>
                    <i className="mr-1 inline-block size-2 rounded-full bg-primary" />
                    Observed
                  </span>
                  <span>
                    <i className="mr-1 inline-block size-2 rounded-full bg-muted/60" />
                    Expected
                  </span>
                </div>
              </div>
            </>
          ) : (
            <p className="text-sm text-muted">
              Load a demo day sheet or transaction data to calculate the screen.
            </p>
          )}
        </CardContent>
      </Card>

      {report.findings.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Patterns to discuss</CardTitle>
            <CardDescription>
              These results are prompts for process review, not conclusions.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {report.findings.map((finding) => (
              <div
                key={finding.id}
                className="rounded-lg border border-border bg-elevated px-3 py-3"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={severityVariant(finding.severity)}>{finding.severity}</Badge>
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
