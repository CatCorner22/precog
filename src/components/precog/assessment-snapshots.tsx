import { useCallback, useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Archive, Clock3, Download, RefreshCw, Save, Scale, Trash2, X } from "lucide-react";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { usePractice } from "@/lib/precog/practice-context";
import {
  createAssessmentSnapshot,
  deleteAssessmentSnapshot,
  getAssessmentSnapshot,
  listAssessmentSnapshots,
  type AssessmentSnapshotSummary,
} from "@/lib/precog/snapshots";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { buildAssignments } from "@/lib/precog/sod/detect";
import { applyAssignmentsToPeople } from "@/lib/precog/sod/apply-assignments";
import { resolveTemplate } from "@/lib/precog/active-template";
import { useTemplate } from "@/lib/precog/use-template";
import { DEFAULT_VALUE_CASE, normalizeValueCase } from "@/lib/precog/value-case";
import { normalizeValueEvidence } from "@/lib/precog/value-evidence";
import {
  compareAssessmentStates,
  createSnapshotComparisonReport,
} from "@/lib/precog/snapshot-comparison";
import { formatUsd } from "@/lib/utils";
import { readValueProof, writeValueProof } from "@/lib/precog/value-proof-store";

export function AssessmentSnapshots() {
  const { profile, replaceProfile } = usePractice();
  const businessId = profile.businessId ?? "biz_default";
  const tpl = useTemplate();
  const { user, isPending } = useCurrentUserState();
  const [title, setTitle] = useState("");
  const [items, setItems] = useState<AssessmentSnapshotSummary[]>([]);
  // A save, restore, compare or delete in flight; listing has its own flag so
  // a refresh never reads as "Saving…" or disables the Save button.
  const [busy, setBusy] = useState(false);
  const [listing, setListing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [comparison, setComparison] = useState<{
    title: string;
    createdAt: string;
    result: ReturnType<typeof compareAssessmentStates>;
  } | null>(null);

  // Keyed on the id: the user object is rebuilt on every render, and a
  // dependency on it re-requested the list without end.
  const userId = user?.id;
  const refresh = useCallback(async () => {
    if (!userId) return;
    setListing(true);
    setError(null);
    try {
      setItems(await listAssessmentSnapshots());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load snapshots");
    } finally {
      setListing(false);
    }
  }, [userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function save() {
    if (!user) return;
    setBusy(true);
    setError(null);
    try {
      let valueCase;
      let valueEvidence;
      // The map lives on the profile's people; capture it as the engines read it.
      const powerMap = buildAssignments(tpl);
      // This business's value proof. Unreadable or blocked storage leaves it
      // out rather than failing the whole snapshot.
      const stored = readValueProof(businessId);
      if (stored.valueCase && typeof stored.valueCase === "object") {
        valueCase = normalizeValueCase(stored.valueCase as Partial<typeof DEFAULT_VALUE_CASE>);
      }
      if (stored.evidence !== undefined) valueEvidence = normalizeValueEvidence(stored.evidence);
      await createAssessmentSnapshot({
        data: {
          title: title.trim() || `${profile.practiceName} assessment`,
          profile,
          powerMap,
          valueCase,
          valueEvidence,
        },
      });
      setTitle("");
      setBusy(false);
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save snapshot");
      setBusy(false);
    }
  }

  async function restore(id: string) {
    if (
      !window.confirm(
        "Restore this assessment? Your current unsaved profile, responsibility map, and value proof will be replaced.",
      )
    )
      return;
    setBusy(true);
    setError(null);
    try {
      const snapshot = await getAssessmentSnapshot({ data: { id } });
      if (!snapshot) throw new Error("Snapshot no longer exists");
      // Older snapshots carried the map beside the profile; write it onto the
      // restored people so the register and every conflict view agree.
      replaceProfile(
        snapshot.powerMap
          ? {
              ...snapshot.profile,
              customPeople: applyAssignmentsToPeople(
                resolveTemplate(snapshot.profile).people,
                snapshot.powerMap,
              ),
            }
          : snapshot.profile,
      );
      const restoredValueCase = snapshot.valueCase ?? DEFAULT_VALUE_CASE;
      const restoredEvidence = snapshot.valueEvidence ?? [];
      // The Value proof tab takes the restored figures from this event even
      // when the browser refuses to store them.
      writeValueProof(businessId, { valueCase: restoredValueCase, evidence: restoredEvidence });
      window.dispatchEvent(
        new CustomEvent("precog:value-proof-restored", {
          detail: { valueCase: restoredValueCase, evidence: restoredEvidence },
        }),
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not restore snapshot");
    } finally {
      setBusy(false);
    }
  }

  async function compare(id: string) {
    setBusy(true);
    setError(null);
    try {
      const snapshot = await getAssessmentSnapshot({ data: { id } });
      if (!snapshot) throw new Error("Snapshot no longer exists");
      const currentMap = buildAssignments(tpl);
      const stored = readValueProof(businessId);
      const currentValue =
        stored.valueCase && typeof stored.valueCase === "object"
          ? normalizeValueCase(stored.valueCase as Partial<typeof DEFAULT_VALUE_CASE>)
          : DEFAULT_VALUE_CASE;
      const currentEvidence = normalizeValueEvidence(stored.evidence);
      setComparison({
        title: snapshot.title,
        createdAt: snapshot.createdAt,
        result: compareAssessmentStates(
          {
            profile,
            powerMap: currentMap,
            valueCase: currentValue,
            evidence: currentEvidence,
            asOf: new Date(),
          },
          {
            profile: snapshot.profile,
            powerMap: snapshot.powerMap ?? buildAssignments(resolveTemplate(snapshot.profile)),
            valueCase: snapshot.valueCase ?? DEFAULT_VALUE_CASE,
            evidence: snapshot.valueEvidence ?? [],
            asOf: new Date(snapshot.createdAt),
          },
        ),
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not compare snapshot");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!window.confirm("Delete this snapshot permanently?")) return;
    setBusy(true);
    setError(null);
    try {
      await deleteAssessmentSnapshot({ data: { id } });
      setItems((current) => current.filter((item) => item.id !== id));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not delete snapshot");
    } finally {
      setBusy(false);
    }
  }

  function exportComparison() {
    if (!comparison) return;
    const report = createSnapshotComparisonReport(
      comparison.title,
      comparison.createdAt,
      comparison.result,
    );
    const url = URL.createObjectURL(new Blob([report], { type: "text/markdown;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `precog-assessment-comparison-${new Date().toISOString().slice(0, 10)}.md`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      <section className="matrix-grid rounded-2xl border border-border bg-surface p-6">
        <Badge variant="accent">Versioned assessments</Badge>
        <h2 className="mt-3 flex items-center gap-2 text-xl font-semibold tracking-tight">
          <Archive className="size-5 text-primary" />
          Preserve the decision record
        </h2>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          Save an immutable point-in-time copy of the practice profile, controls, variables,
          decision journal, responsibility map, and value evidence. Snapshots are private to your
          signed-in account. Restoring an older snapshot without a saved map or value proof resets
          those workspaces to safe defaults rather than mixing them with newer work.
        </p>
      </section>

      {isPending ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted">Checking your account…</CardContent>
        </Card>
      ) : !user ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Sign in to preserve assessments</CardTitle>
            <CardDescription>
              Your local working profile remains available without an account.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link
              to="/login"
              className="inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-fg"
            >
              Sign in
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Create snapshot</CardTitle>
              <CardDescription>
                Includes the current profile, decision journal, responsibility map, and value proof.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <label className="block text-sm">
                <span className="text-muted">Snapshot title</span>
                <input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  maxLength={120}
                  placeholder={`${profile.practiceName} · quarterly review`}
                  className="mt-1 w-full rounded-lg border border-border bg-elevated px-3 py-2"
                />
              </label>
              <div className="rounded-lg border border-border bg-elevated p-3 text-xs text-muted">
                <p>{profile.practiceName}</p>
                <p className="mt-1">
                  {profile.decisions.length} logged decision(s) · profile updated{" "}
                  {new Date(profile.updatedAt).toLocaleDateString()}
                </p>
              </div>
              <Button onClick={save} disabled={busy}>
                <Save className="size-4" /> {busy ? "Saving…" : "Save snapshot"}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-start justify-between gap-3">
              <div>
                <CardTitle className="text-base">Snapshot history</CardTitle>
                <CardDescription>Newest first · up to 50 assessments</CardDescription>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => void refresh()}
                disabled={busy || listing}
                aria-label="Refresh snapshots"
              >
                <RefreshCw className={`size-3.5 ${listing ? "animate-spin" : ""}`} />
              </Button>
            </CardHeader>
            <CardContent className="space-y-2">
              {comparison && (
                <div className="rounded-xl border border-primary/30 bg-primary/5 p-3">
                  <div className="flex items-center justify-between">
                    <p className="flex items-center gap-2 text-sm font-semibold">
                      <Scale className="size-4 text-primary" />
                      Change since “{comparison.title}”
                    </p>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={exportComparison}
                        aria-label="Export comparison"
                        className="rounded p-1 text-muted hover:text-fg"
                      >
                        <Download className="size-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setComparison(null)}
                        aria-label="Close comparison"
                        className="rounded p-1 text-muted hover:text-fg"
                      >
                        <X className="size-4" />
                      </button>
                    </div>
                  </div>
                  <p className="mt-1 text-[11px] text-subtle">
                    Comparing the current workspace with the assessment saved{" "}
                    {new Date(comparison.createdAt).toLocaleString()}.
                  </p>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
                    <CompareMetric
                      label="Team size"
                      value={signed(comparison.result.teamSizeDelta)}
                    />
                    <CompareMetric
                      label="Risk inputs changed"
                      value={String(comparison.result.riskChanges)}
                    />
                    <CompareMetric label="Duty grants" value={String(comparison.result.grants)} />
                    <CompareMetric
                      label="Duty revocations"
                      value={String(comparison.result.revocations)}
                    />
                    <CompareMetric
                      label="People added / removed"
                      value={`${comparison.result.hires} / ${comparison.result.removals}`}
                    />
                    <CompareMetric
                      label="Net observed value"
                      value={
                        comparison.result.netObservedValueDelta === null
                          ? "Not yet observed"
                          : signedMoney(comparison.result.netObservedValueDelta)
                      }
                    />
                    <CompareMetric
                      label="Verified evidence"
                      value={signed(comparison.result.verifiedEvidenceDelta)}
                    />
                    <CompareMetric
                      label="Evidence readiness"
                      value={`${signed(comparison.result.evidenceReadinessDelta)} pts`}
                    />
                    <CompareMetric
                      label="Verified recoveries"
                      value={signedMoney(comparison.result.verifiedRecoveryDelta)}
                    />
                  </div>
                  {comparison.result.assignmentChanges.length > 0 && (
                    <div className="mt-3 border-t border-primary/20 pt-3">
                      <p className="text-[11px] font-medium uppercase tracking-wider text-subtle">
                        Responsibility changes
                      </p>
                      <div className="mt-2 space-y-1.5">
                        {comparison.result.assignmentChanges.slice(0, 6).map((change) => (
                          <div
                            key={change.id}
                            className="flex items-center justify-between gap-3 text-xs"
                          >
                            <span className="min-w-0 truncate text-muted">
                              {change.personName} · {change.dutyLabel ?? change.role}
                            </span>
                            <Badge
                              variant={
                                change.kind === "duty_granted" || change.kind === "person_added"
                                  ? "primary"
                                  : "default"
                              }
                            >
                              {change.kind.replaceAll("_", " ")}
                            </Badge>
                          </div>
                        ))}
                      </div>
                      {comparison.result.assignmentChanges.length > 6 && (
                        <p className="mt-2 text-[11px] text-subtle">
                          +{comparison.result.assignmentChanges.length - 6} additional changes
                        </p>
                      )}
                    </div>
                  )}
                  {comparison.result.riskVariableChanges.length > 0 && (
                    <div className="mt-3 border-t border-primary/20 pt-3">
                      <p className="text-[11px] font-medium uppercase tracking-wider text-subtle">
                        Risk-input changes
                      </p>
                      <div className="mt-2 space-y-1.5">
                        {comparison.result.riskVariableChanges.slice(0, 6).map((change) => (
                          <div
                            key={change.key}
                            className="flex items-center justify-between gap-3 text-xs"
                          >
                            <span className="text-muted">{humanize(change.key)}</span>
                            <span className="tabular text-fg">
                              {displayValue(change.before)} → {displayValue(change.after)}
                            </span>
                          </div>
                        ))}
                      </div>
                      {comparison.result.riskVariableChanges.length > 6 && (
                        <p className="mt-2 text-[11px] text-subtle">
                          +{comparison.result.riskVariableChanges.length - 6} additional changes
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}
              {error && (
                <p className="rounded-lg border border-danger/30 bg-danger/10 p-3 text-sm text-danger">
                  {error}
                </p>
              )}
              {!listing && items.length === 0 && (
                <p className="text-sm text-muted">No saved assessments yet.</p>
              )}
              {items.map((item) => (
                <div key={item.id} className="rounded-xl border border-border bg-elevated p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{item.title}</p>
                      <p className="mt-1 flex items-center gap-1 text-xs text-muted">
                        <Clock3 className="size-3" /> {new Date(item.createdAt).toLocaleString()}
                      </p>
                      <p className="mt-1 text-[11px] text-subtle">
                        Model {item.modelVersion} · corpus {item.corpusVersion}
                      </p>
                      {item.includesPowerMap && <Badge className="mt-2">Power map included</Badge>}
                      {item.includesValueProof && (
                        <Badge className="mt-2 ml-1">Value proof included</Badge>
                      )}
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => void compare(item.id)}
                        disabled={busy}
                      >
                        Compare
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => void restore(item.id)}
                        disabled={busy}
                      >
                        Restore
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => void remove(item.id)}
                        disabled={busy}
                        aria-label={`Delete ${item.title}`}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

function signed(value: number) {
  return value > 0 ? `+${value}` : String(value);
}
function signedMoney(value: number) {
  return `${value > 0 ? "+" : ""}${formatUsd(value)}`;
}
function CompareMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-bg p-2">
      <p className="text-subtle">{label}</p>
      <p className="mt-1 font-semibold tabular text-fg">{value}</p>
    </div>
  );
}
function humanize(value: string) {
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replaceAll("_", " ")
    .replace(/^./, (letter) => letter.toUpperCase());
}
function displayValue(value: unknown) {
  return typeof value === "boolean"
    ? value
      ? "Yes"
      : "No"
    : typeof value === "number"
      ? value.toLocaleString()
      : String(value);
}
