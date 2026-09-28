import { useEffect, useMemo, useRef, useState } from "react";
import {
  Building2,
  CheckCircle2,
  Download,
  ExternalLink,
  Laptop,
  ListChecks,
  Pencil,
  Plus,
  Printer,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { fieldCls } from "@/components/ui/field-classes";
import { formatDay, localDateKey } from "@/lib/precog/dates";
import { usePractice, usePracticeActions, useTemplate } from "@/lib/precog/practice-context";
import {
  aiDraftedSteps,
  isWrittenProcedure,
  shownSteps,
  newProcedure,
  PROCEDURE_STATUS_LABEL,
  procedureStatus,
  reviewByDate,
} from "@/lib/precog/procedures/lifecycle";
import { PROCEDURE_LIMITS } from "@/lib/precog/procedures/normalize";
import { placeSuggestions } from "@/lib/precog/procedures/places";
import { unwrittenProcedureRows } from "@/lib/precog/procedures/starter";
import type { Place, PlaceKind, Procedure, ProcedureStatus } from "@/lib/precog/procedures/types";
import { uid } from "@/lib/precog/text";
import { useToday } from "@/lib/use-today";
import { ProcedureEditor } from "./procedure-editor";
import { StoredPicture, type PictureAccess } from "./step-pictures";
import { ProofSection } from "./procedure-proof";
import { backupProofs, proofIsStale } from "@/lib/precog/procedures/proof";
import { isSampleBusiness } from "@/lib/precog/business-lifecycle";
import { DEFAULT_BUSINESS_ID } from "@/lib/precog/business-id";
import { useWorkspace } from "@/lib/precog/workspace-context";
import { useCurrentUser } from "@/lib/auth/use-current-user";
import { getFirm } from "@/lib/precog/firm/server";
import type { FirmRole } from "@/lib/precog/firm/store";
import { downloadText } from "@/lib/download";
import {
  exportFileName,
  procedureMarkdown,
  proceduresJson,
  proceduresMarkdown,
  type ExportContext,
} from "@/lib/precog/procedures/export";
import { FollowMode } from "./follow-mode";
import { ProcedurePrint } from "./procedure-print";

/** Ids of the elements focus returns to when the editor closes. */
const PROCEDURE_HEADING = "procedure-heading";
const NEW_PROCEDURE = "procedure-new";

type Filter = "all" | "review" | "no-backup" | "ai-draft" | "empty";

const STATUS_BADGE: Record<ProcedureStatus, "default" | "ok" | "warn" | "danger"> = {
  empty: "default",
  draft: "warn",
  verified: "ok",
  stale: "danger",
  needs_reverify: "warn",
};

const FILTER_LABEL: Record<Filter, string> = {
  all: "All",
  review: "Needs checking",
  "no-backup": "No backup proven",
  "ai-draft": "AI draft to check",
  empty: "No steps yet",
};

/**
 * The Procedures tab: every written procedure grouped by the platform or
 * place it is done in, the register items nothing is written for yet, and the
 * editor. `initialItem` opens a procedure by id, or the procedure for a
 * register item (starting one when there is none).
 */
export function ProceduresPanel({ initialItem }: { initialItem?: string | null }) {
  const { profile } = usePractice();
  const { accountId } = useWorkspace();
  const businessId = profile.businessId ?? DEFAULT_BUSINESS_ID;
  // Pictures are stored with the account's copy of the business, never in this browser.
  const pictureAccess: PictureAccess = !accountId
    ? { ok: false, reason: "Sign in to add pictures." }
    : isSampleBusiness(profile)
      ? { ok: false, reason: "Pictures can be added to your own business, not the sample." }
      : { ok: true, businessId };
  const tpl = useTemplate();
  const { saveProcedure, verifyProcedure, removeProcedure, setPlaces } = usePracticeActions();
  const user = useCurrentUser();
  const firmRole = useFirmRole(accountId);
  // The server refuses a verification from a firm preparer; the button is not offered.
  const canVerify = firmRole !== "preparer";
  const verifyingAccount = accountId
    ? { id: accountId, name: user?.displayName || user?.primaryEmail || "" }
    : null;
  const today = localDateKey(useToday());
  const industry = profile.industry;
  const places = useMemo(() => profile.places ?? [], [profile.places]);
  const procedures = useMemo(
    () => (profile.procedures ?? []).filter((p) => p.industry === industry),
    [profile.procedures, industry],
  );
  const people = tpl.people;
  const nameOf = (id?: string) =>
    id ? (people.find((p) => p.id === id)?.name ?? "someone who has left") : null;

  const [editing, setEditing] = useState<{ procedure: Procedure; isNew: boolean } | null>(() =>
    openFor(initialItem),
  );
  const [selectedId, setSelectedId] = useState<string | null>(() => {
    if (!initialItem) return null;
    const match =
      procedures.find((p) => p.id === initialItem) ??
      procedures.find((p) => p.knowledgeIds.includes(initialItem));
    return match?.id ?? null;
  });
  const [filter, setFilter] = useState<Filter>("all");
  const [printing, setPrinting] = useState<Procedure[] | null>(null);
  // Where keyboard focus goes once the editor closes (an element id), so it is not lost.
  const [focusId, setFocusId] = useState<string | null>(null);
  useEffect(() => {
    if (!focusId || editing) return;
    document.getElementById(focusId)?.focus();
    setFocusId(null);
  }, [focusId, editing]);
  const itemName = (id: string) => tpl.knowledge.find((k) => k.id === id)?.name;
  const exportContext: ExportContext = { places, nameOf, itemName, today };
  const businessName = profile.practiceName?.trim() || "Your business";

  /** The editor state a deep link asks for: an existing procedure, or a new one for a register item. */
  function openFor(
    item: string | null | undefined,
  ): { procedure: Procedure; isNew: boolean } | null {
    if (!item) return null;
    if (procedures.some((p) => p.id === item)) return null;
    const knowledge = tpl.knowledge.find((k) => k.id === item);
    if (!knowledge) return null;
    const existing = procedures.find((p) => p.knowledgeIds.includes(item));
    if (existing) return null;
    return { procedure: draftFor(knowledge.name, [knowledge.id]), isNew: true };
  }

  function draftFor(title: string, knowledgeIds: string[] = []): Procedure {
    return newProcedure({ industry, title, knowledgeIds }, today);
  }

  const visible = procedures.filter((p) => {
    const status = procedureStatus(p, today);
    if (filter === "review")
      return status === "draft" || status === "stale" || status === "needs_reverify";
    if (filter === "no-backup") {
      return !backupProofs(p).some((x) => x.on && !proofIsStale(x.on, today));
    }
    if (filter === "ai-draft") return aiDraftedSteps(p) > 0;
    if (filter === "empty") return status === "empty";
    return true;
  });
  const groups = groupByPlace(visible, places);
  const unwritten = useMemo(
    () => unwrittenProcedureRows(tpl.knowledge, procedures, industry),
    [tpl.knowledge, procedures, industry],
  );
  const selected = procedures.find((p) => p.id === selectedId) ?? null;
  const counts = {
    // Only procedures with steps count as written, the rule Who knows what uses.
    total: procedures.filter(isWrittenProcedure).length,
    verified: procedures.filter((p) => procedureStatus(p, today) === "verified").length,
    needCheck: procedures.filter((p) =>
      ["draft", "stale", "needs_reverify"].includes(procedureStatus(p, today)),
    ).length,
  };

  if (editing) {
    return (
      <ProcedureEditor
        key={editing.procedure.id}
        initial={editing.procedure}
        isNew={editing.isNew}
        places={places}
        people={people}
        knowledge={tpl.knowledge}
        pictureAccess={pictureAccess}
        onSave={(next) => {
          const ok = saveProcedure(next);
          if (ok) {
            setEditing(null);
            setSelectedId(next.id);
            setFocusId(PROCEDURE_HEADING);
          }
          return ok;
        }}
        onCancel={() => {
          setEditing(null);
          setFocusId(selected ? PROCEDURE_HEADING : NEW_PROCEDURE);
        }}
        onDelete={() => {
          if (!window.confirm(`Delete "${editing.procedure.title}"? This cannot be undone.`))
            return;
          removeProcedure(editing.procedure.id);
          setEditing(null);
          setSelectedId(null);
          setFocusId(NEW_PROCEDURE);
        }}
      />
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Your procedures</CardTitle>
            <CardDescription>
              {counts.total === 0
                ? "Nothing written yet. Start with a duty only one person can do."
                : `${counts.total} written · ${counts.verified} verified · ${counts.needCheck} need checking`}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex flex-wrap gap-2">
              <Button
                id={NEW_PROCEDURE}
                size="sm"
                disabled={procedures.length >= PROCEDURE_LIMITS.procedures}
                onClick={() => setEditing({ procedure: draftFor(""), isNew: true })}
              >
                <Plus className="size-3.5" /> New procedure
              </Button>
              {procedures.length > 0 && (
                <>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setPrinting(sortedForExport(procedures, places))}
                  >
                    <Printer className="size-3.5" /> Print all
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      downloadText(
                        exportFileName(`${businessName} procedures`, "md"),
                        proceduresMarkdown(
                          sortedForExport(procedures, places),
                          businessName,
                          exportContext,
                        ),
                        "text/markdown;charset=utf-8",
                      )
                    }
                  >
                    <Download className="size-3.5" /> Export all (Markdown)
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      downloadText(
                        exportFileName(`${businessName} procedures`, "json"),
                        proceduresJson(
                          sortedForExport(procedures, places),
                          businessName,
                          exportContext,
                        ),
                        "application/json",
                      )
                    }
                  >
                    <Download className="size-3.5" /> Export all (JSON)
                  </Button>
                </>
              )}
            </div>
            <div role="group" aria-label="Show" className="flex flex-wrap gap-1">
              {(Object.keys(FILTER_LABEL) as Filter[]).map((f) => (
                <Button
                  key={f}
                  size="sm"
                  variant={filter === f ? "secondary" : "ghost"}
                  className="h-7 px-2 text-xs"
                  aria-pressed={filter === f}
                  onClick={() => setFilter(f)}
                >
                  {FILTER_LABEL[f]}
                </Button>
              ))}
            </div>
            {groups.length === 0 && procedures.length > 0 && (
              <p className="text-xs text-muted">No procedure matches this filter.</p>
            )}
            {groups.map((g) => (
              <section key={g.key} aria-label={g.label}>
                <h3 className="mb-1 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted">
                  {g.kind === "physical" ? (
                    <Building2 className="size-3.5" aria-hidden />
                  ) : (
                    <Laptop className="size-3.5" aria-hidden />
                  )}
                  {g.label}
                </h3>
                <ul className="space-y-1">
                  {g.items.map((p) => {
                    const status = procedureStatus(p, today);
                    return (
                      <li key={p.id}>
                        <button
                          type="button"
                          aria-current={p.id === selectedId || undefined}
                          onClick={() => {
                            setSelectedId(p.id);
                            // On a phone the procedure opens below the lists; bring it into view.
                            if (window.matchMedia("(max-width: 1023px)").matches) {
                              requestAnimationFrame(() =>
                                document
                                  .getElementById("procedure-view")
                                  ?.scrollIntoView({ block: "start" }),
                              );
                            }
                          }}
                          className="flex w-full flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-left hover:bg-elevated/60 aria-[current=true]:border-primary/50 aria-[current=true]:bg-primary/5"
                        >
                          <span className="min-w-0 [overflow-wrap:anywhere]">
                            <span className="block font-medium">{p.title}</span>
                            {p.module && (
                              <span className="block text-xs text-muted">{p.module}</span>
                            )}
                          </span>
                          <Badge variant={STATUS_BADGE[status]}>
                            {PROCEDURE_STATUS_LABEL[status]}
                          </Badge>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </CardContent>
        </Card>

        {unwritten.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Not written yet</CardTitle>
              <CardDescription>
                Items on Who knows what with no steps written here and nothing written elsewhere,
                duties first. Starting one creates an empty procedure; nothing is filled in for you.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-1 text-sm">
                {unwritten.slice(0, 12).map(({ item, startedId }) => (
                  <li key={item.id} className="flex items-center justify-between gap-2">
                    <span className="min-w-0 [overflow-wrap:anywhere]">
                      {item.name}
                      {item.criticality === "critical" && (
                        <Badge variant="danger" className="ml-2">
                          Critical
                        </Badge>
                      )}
                    </span>
                    {startedId ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 text-xs"
                        aria-label={`Continue the procedure for ${item.name}`}
                        onClick={() => {
                          const started = procedures.find((p) => p.id === startedId);
                          if (started) setEditing({ procedure: started, isNew: false });
                        }}
                      >
                        Continue
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 text-xs"
                        aria-label={`Start a procedure for ${item.name}`}
                        disabled={procedures.length >= PROCEDURE_LIMITS.procedures}
                        onClick={() =>
                          setEditing({ procedure: draftFor(item.name, [item.id]), isNew: true })
                        }
                      >
                        Start
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
              {unwritten.length > 12 && (
                <p className="mt-2 text-xs text-muted">And {unwritten.length - 12} more.</p>
              )}
            </CardContent>
          </Card>
        )}

        <PlacesCard
          places={places}
          suggestions={placeSuggestions(industry, tpl.processes, places)}
          onChange={setPlaces}
        />
      </div>

      <div id="procedure-view" className="scroll-mt-40">
        {selected ? (
          <ProcedureView
            key={selected.id}
            procedure={selected}
            businessId={businessId}
            place={places.find((pl) => pl.id === selected.placeId) ?? null}
            today={today}
            nameOf={nameOf}
            knowledgeNames={selected.knowledgeIds
              .map((id) => tpl.knowledge.find((k) => k.id === id)?.name)
              .filter((n): n is string => Boolean(n))}
            onEdit={() => setEditing({ procedure: selected, isNew: false })}
            canVerify={canVerify}
            onVerify={() =>
              verifyProcedure(selected.id, selected.reviewerPersonId ?? "owner", verifyingAccount)
            }
            onPrint={() => setPrinting([selected])}
            onDownload={() =>
              downloadText(
                exportFileName(selected.title, "md"),
                procedureMarkdown(selected, exportContext),
                "text/markdown;charset=utf-8",
              )
            }
          />
        ) : (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted">
              {procedures.length
                ? "Pick a procedure to read it."
                : "Write the steps for a task so someone else can do it when the usual person is away."}
            </CardContent>
          </Card>
        )}
      </div>
      {printing && (
        <ProcedurePrint
          procedures={printing}
          places={places}
          businessId={businessId}
          businessName={businessName}
          today={today}
          nameOf={nameOf}
          itemName={itemName}
          onDone={() => setPrinting(null)}
        />
      )}
    </div>
  );
}

/** One procedure as a stand-in reads it, with its review state. */
function ProcedureView({
  procedure: p,
  businessId,
  place,
  today,
  nameOf,
  knowledgeNames,
  onEdit,
  canVerify,
  onVerify,
  onPrint,
  onDownload,
}: {
  procedure: Procedure;
  businessId: string;
  place: Place | null;
  today: string;
  nameOf: (id?: string) => string | null;
  knowledgeNames: string[];
  onEdit: () => void;
  /** False for a firm preparer, who cannot record a verification. */
  canVerify: boolean;
  onVerify: () => void;
  onPrint: () => void;
  onDownload: () => void;
}) {
  const [following, setFollowing] = useState(false);
  const followButton = useRef<HTMLButtonElement>(null);
  // Finishing follow mode reopens the proof section with its form open.
  const [proof, setProof] = useState({ key: 0, open: false });
  const status = procedureStatus(p, today);
  const due = reviewByDate(p);
  const checker = nameOf(p.reviewerPersonId) ?? "the owner";
  const where = [place?.name, p.module].filter(Boolean).join(" › ");
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle
            id={PROCEDURE_HEADING}
            tabIndex={-1}
            className="[overflow-wrap:anywhere] focus:outline-none"
          >
            {p.title}
          </CardTitle>
          <Badge variant={STATUS_BADGE[status]}>{PROCEDURE_STATUS_LABEL[status]}</Badge>
        </div>
        <CardDescription>
          {where || "Where it is done is not set."}
          {p.url && (
            <>
              {" · "}
              <a
                href={p.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-primary underline-offset-2 hover:underline"
              >
                Open the screen <ExternalLink className="size-3" aria-hidden />
              </a>
            </>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {p.purpose && <p>{p.purpose}</p>}
        {p.trigger && (
          <p>
            <span className="font-medium">When: </span>
            {p.trigger}
          </p>
        )}
        {p.prerequisites.length > 0 && (
          <div>
            <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">
              What you need first
            </div>
            <ul className="list-disc space-y-0.5 pl-5">
              {p.prerequisites.map((x, i) => (
                <li key={i}>{x}</li>
              ))}
            </ul>
          </div>
        )}
        {isWrittenProcedure(p) ? (
          <ol className="space-y-2">
            {shownSteps(p).map((s, i) => (
              <li key={s.id} className="flex gap-3">
                <span className="w-6 shrink-0 text-right font-semibold text-muted">{i + 1}.</span>
                <div>
                  <p>{s.text}</p>
                  {s.aiDrafted && (
                    <p className="mt-0.5 text-xs text-accent">
                      Drafted by Grok; not yet checked by a person.
                    </p>
                  )}
                  {s.caution && <p className="mt-0.5 text-xs text-warn">Caution: {s.caution}</p>}
                  {s.requiresPhoto && (
                    <p className="mt-0.5 text-xs text-muted">Take a photo as you do this step.</p>
                  )}
                  {s.imageIds && s.imageIds.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {s.imageIds.map((id, j) => (
                        <StoredPicture
                          key={id}
                          businessId={businessId}
                          imageId={id}
                          alt={`Picture ${j + 1} for step ${i + 1}`}
                          className="max-h-48 w-auto max-w-full"
                        />
                      ))}
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-muted">No steps yet.</p>
        )}
        <dl className="grid gap-x-4 gap-y-1 text-xs sm:grid-cols-2">
          <dt className="text-muted">Does it today</dt>
          <dd>{nameOf(p.ownerPersonId) ?? "Not set"}</dd>
          <dt className="text-muted">Can follow it when that person is out</dt>
          <dd>
            {p.backupPersonIds.length
              ? p.backupPersonIds.map((id) => nameOf(id)).join(", ")
              : "Nobody named yet"}
          </dd>
          <dt className="text-muted">Covers on Who knows what</dt>
          <dd>{knowledgeNames.length ? knowledgeNames.join(", ") : "Nothing linked"}</dd>
          <dt className="text-muted">Checked by</dt>
          <dd>
            {checker}
            {p.verifiedAt
              ? ` · verified ${formatDay(p.verifiedAt)}${due ? `, check again by ${formatDay(due)}` : ""}${p.verifiedByAccountName ? ` · recorded by ${p.verifiedByAccountName}` : ""}`
              : p.lastVerifiedAt
                ? ` · last verified ${formatDay(p.lastVerifiedAt)}, before the steps changed`
                : " · not verified yet"}
          </dd>
          <dt className="text-muted">Version</dt>
          <dd>
            {p.version}
            {p.changelog[0]
              ? ` · ${p.changelog[0].summary} on ${formatDay(p.changelog[0].on)}`
              : ""}
          </dd>
        </dl>
        <ProofSection
          key={`${p.id}-${proof.key}`}
          procedure={p}
          today={today}
          defaultOpen={proof.open}
        />
        <div className="flex flex-wrap gap-2">
          {isWrittenProcedure(p) && (
            <Button ref={followButton} size="sm" onClick={() => setFollowing(true)}>
              <ListChecks className="size-3.5" /> Follow it step by step
            </Button>
          )}
          <Button size="sm" variant="secondary" onClick={onEdit}>
            <Pencil className="size-3.5" /> Edit
          </Button>
          {isWrittenProcedure(p) && status !== "verified" && canVerify && (
            <Button size="sm" onClick={onVerify}>
              <CheckCircle2 className="size-3.5" /> {checker === "the owner" ? "I" : checker}{" "}
              checked these steps today
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={onPrint}>
            <Printer className="size-3.5" /> Print
          </Button>
          <Button size="sm" variant="ghost" onClick={onDownload}>
            <Download className="size-3.5" /> Download
          </Button>
        </div>
        {isWrittenProcedure(p) && status !== "verified" && !canVerify && (
          <p className="text-xs text-muted">
            A firm reviewer or the owner verifies procedures, so that someone other than the
            preparer checks the steps.
          </p>
        )}
        {following && (
          <FollowMode
            procedure={p}
            businessId={businessId}
            askName={nameOf(p.ownerPersonId)}
            onClose={() => {
              setFollowing(false);
              // The dialog is gone before the browser can return focus, so return it here.
              requestAnimationFrame(() => followButton.current?.focus());
            }}
            onRecordRun={() => {
              setFollowing(false);
              setProof((x) => ({ key: x.key + 1, open: true }));
              requestAnimationFrame(() =>
                document
                  .getElementById(`proof-section-${p.id}`)
                  ?.scrollIntoView({ block: "start" }),
              );
            }}
          />
        )}
      </CardContent>
    </Card>
  );
}

/** Procedures in the order the tab lists them: by place, then by title. */
function sortedForExport(procedures: readonly Procedure[], places: readonly Place[]): Procedure[] {
  return groupByPlace(procedures, places).flatMap((g) => g.items);
}

/** The platforms and places procedures are done in, with one-click suggestions. */
function PlacesCard({
  places,
  suggestions,
  onChange,
}: {
  places: readonly Place[];
  suggestions: ReturnType<typeof placeSuggestions>;
  onChange: (next: Place[]) => void;
}) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<PlaceKind>("software");
  const full = places.length >= PROCEDURE_LIMITS.places;
  const add = (placeName: string, placeKind: PlaceKind) => {
    const trimmed = placeName.trim().slice(0, PROCEDURE_LIMITS.placeName);
    if (!trimmed || full) return;
    if (places.some((p) => p.name.toLowerCase() === trimmed.toLowerCase())) return;
    onChange([...places, { id: uid("place"), kind: placeKind, name: trimmed }]);
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle>Platforms and places</CardTitle>
        <CardDescription>
          The software and the physical places your procedures are done in.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {places.length > 0 && (
          <ul className="flex flex-wrap gap-1.5">
            {places.map((p) => (
              <li
                key={p.id}
                className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs"
              >
                {p.kind === "physical" ? (
                  <Building2 className="size-3" aria-hidden />
                ) : (
                  <Laptop className="size-3" aria-hidden />
                )}
                {p.name}
                <button
                  type="button"
                  className="ml-1 text-muted hover:text-danger"
                  aria-label={`Remove ${p.name}`}
                  onClick={() => onChange(places.filter((x) => x.id !== p.id))}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
        <form
          className="flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            add(name, kind);
            setName("");
          }}
        >
          <input
            aria-label="Platform or place name"
            className={`${fieldCls} min-w-0 flex-1`}
            value={name}
            maxLength={PROCEDURE_LIMITS.placeName}
            placeholder="e.g. QuickBooks Online"
            onChange={(e) => setName(e.target.value)}
          />
          <select
            aria-label="Kind"
            className={fieldCls}
            value={kind}
            onChange={(e) => setKind(e.target.value as PlaceKind)}
          >
            <option value="software">Software</option>
            <option value="physical">Physical place</option>
          </select>
          <Button size="sm" type="submit" disabled={full || !name.trim()}>
            Add
          </Button>
        </form>
        {suggestions.length > 0 && !full && (
          <div>
            <div className="mb-1 text-xs text-muted">Suggestions</div>
            <div className="flex flex-wrap gap-1.5">
              {suggestions.slice(0, 8).map((s) => (
                <Button
                  key={s.name}
                  size="sm"
                  variant="ghost"
                  className="h-7 border border-dashed border-border px-2 text-xs"
                  onClick={() => add(s.name, s.kind)}
                >
                  <Plus className="size-3" /> {s.name}
                </Button>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface PlaceGroup {
  key: string;
  label: string;
  kind: PlaceKind;
  items: Procedure[];
}

/** Procedures grouped by place, software before physical, then by name; unplaced ones last. */
function groupByPlace(procedures: readonly Procedure[], places: readonly Place[]): PlaceGroup[] {
  const byId = new Map(places.map((p) => [p.id, p]));
  const groups = new Map<string, PlaceGroup>();
  for (const p of procedures) {
    const place = p.placeId ? byId.get(p.placeId) : undefined;
    const key = place?.id ?? "none";
    const group = groups.get(key) ?? {
      key,
      label: place?.name ?? "Place not set",
      kind: place?.kind ?? "software",
      items: [],
    };
    group.items.push(p);
    groups.set(key, group);
  }
  return [...groups.values()]
    .map((g) => ({ ...g, items: [...g.items].sort((a, b) => a.title.localeCompare(b.title)) }))
    .sort(
      (a, b) =>
        Number(a.key === "none") - Number(b.key === "none") ||
        Number(a.kind === "physical") - Number(b.kind === "physical") ||
        a.label.localeCompare(b.label),
    );
}

/**
 * The signed-in account's role at its firm: null outside any firm or signed
 * out, undefined until known. Only the button depends on it; the server
 * checks the role on every save.
 */
function useFirmRole(accountId: string | null): FirmRole | null | undefined {
  const [role, setRole] = useState<{ accountId: string; role: FirmRole | null } | null>(null);
  useEffect(() => {
    if (!accountId) return;
    let cancelled = false;
    getFirm()
      .then((res) => {
        if (!cancelled) setRole({ accountId, role: res.firm?.role ?? null });
      })
      .catch(() => {
        if (!cancelled) setRole({ accountId, role: null });
      });
    return () => {
      cancelled = true;
    };
  }, [accountId]);
  if (!accountId) return null;
  return role?.accountId === accountId ? role.role : undefined;
}
