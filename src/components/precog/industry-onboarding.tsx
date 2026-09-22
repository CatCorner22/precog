import { useState } from "react";
import { INDUSTRIES, type IndustryId } from "@/lib/precog/industry";
import { getIndustryTemplate } from "@/lib/precog/templates";
import { CASE_LIBRARY, sectorsForIndustry } from "@/lib/precog/evidence";
import { usePractice } from "@/lib/precog/practice-context";
import {
  CORE_DUTIES,
  OWN_TEAM_MAX,
  buildOwnTeam,
  coreDutyLabel,
  type OwnTeamRow,
} from "@/lib/precog/onboarding/own-team";
import type { EntitlementId } from "@/lib/precog/sod/conflict-rules";
import { JOB_CATALOG, matchJobTitle } from "@/lib/precog/onboarding/job-catalog";
import { parseRoster } from "@/lib/precog/import/roster";
import { ROLE_TEMPLATES } from "@/lib/precog/sod/detect";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  Briefcase,
  ChefHat,
  Building2,
  Plus,
  ShoppingBag,
  Stethoscope,
  Trash2,
} from "lucide-react";

const ICONS: Record<IndustryId, typeof Stethoscope> = {
  dental: Stethoscope,
  retail: ShoppingBag,
  professional_services: Briefcase,
  restaurant: ChefHat,
  general: Building2,
};

const inputCls =
  "rounded-md border border-border bg-bg px-2 py-1.5 text-sm text-fg placeholder:text-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";

const EMPTY_ROW = (role = ""): OwnTeamRow => ({ name: "", role, duties: [] });

/**
 * First visit. Step one picks the line of business; step two takes the
 * owner's own business name, people, and who does the eight money duties,
 * so the first screen they see is about their team. "Explore a sample"
 * stays as the second path.
 */
export function IndustryOnboarding() {
  const { completeOnboarding, startOwnBusiness } = usePractice();
  const [selected, setSelected] = useState<IndustryId>("dental");
  const [step, setStep] = useState<"industry" | "team">("industry");
  const [businessName, setBusinessName] = useState("");
  const [rows, setRows] = useState<OwnTeamRow[]>([
    EMPTY_ROW("Owner"),
    EMPTY_ROW(""),
    EMPTY_ROW(""),
  ]);

  const [paste, setPaste] = useState("");
  const [pasteNote, setPasteNote] = useState("");
  const industry = INDUSTRIES.find((i) => i.id === selected);
  const namedRows = rows.filter((r) => r.name.trim().length > 0);
  const coreSet = new Set<string>(CORE_DUTIES);

  /** The catalog's duties for a title, kept to the eight the grid shows. */
  function coreDutiesForTitle(title: string): EntitlementId[] {
    const match = matchJobTitle(title);
    return match ? match.entry.entitlements.filter((d) => coreSet.has(d)) : [];
  }

  /** When a role is typed and no duty is ticked yet, tick what that title usually holds. */
  function suggestDuties(index: number) {
    setRows((current) =>
      current.map((row, i) =>
        i === index && row.duties.length === 0 && row.role.trim()
          ? { ...row, duties: coreDutiesForTitle(row.role) }
          : row,
      ),
    );
  }

  /** Fill the grid from a pasted HR or payroll export, or a plain "Name, Title" list. */
  function fillFromPaste() {
    const tpl = getIndustryTemplate(selected);
    const result = parseRoster(paste, tpl);
    const incoming: OwnTeamRow[] = result.people
      .filter((p) => p.active)
      .map((p) => {
        // A title that matches one of this industry's own roles carries no
        // explicit duties (the engines read the role template), so the grid
        // ticks that template's duties instead.
        const duties = p.entitlements ?? tpl.roleTemplates[p.role] ?? ROLE_TEMPLATES[p.role] ?? [];
        return {
          name: p.name,
          role: p.role,
          duties: duties.filter((d): d is EntitlementId => coreSet.has(d)),
        };
      });
    if (incoming.length === 0) {
      setPasteNote(
        result.issues[0]?.message ?? "No names found. One person per line: Name, Title.",
      );
      return;
    }
    setRows((current) => {
      const kept = current.filter((r) => r.name.trim().length > 0);
      return [...kept, ...incoming].slice(0, OWN_TEAM_MAX);
    });
    const recognised = result.titles.filter((t) => t.catalogTitle).length;
    const unmatched = result.titles.filter((t) => !t.catalogTitle).length;
    const skipped = result.people.length - incoming.length;
    setPasteNote(
      `Added ${incoming.length} ${incoming.length === 1 ? "person" : "people"}. ${recognised} ${recognised === 1 ? "title" : "titles"} recognised and duties ticked from the catalog${
        unmatched ? `; ${unmatched} not recognised, tick their duties below` : ""
      }${skipped ? `; ${skipped} inactive ${skipped === 1 ? "person" : "people"} left out` : ""}. Check every row: a title is a starting point, not a fact about your business.`,
    );
    setPaste("");
  }

  function updateRow(index: number, patch: Partial<OwnTeamRow>) {
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }
  function toggleDuty(index: number, duty: EntitlementId) {
    setRows((current) =>
      current.map((row, i) => {
        if (i !== index) return row;
        const has = row.duties.includes(duty);
        return {
          ...row,
          duties: has ? row.duties.filter((d) => d !== duty) : [...row.duties, duty],
        };
      }),
    );
  }
  function finish() {
    const people = buildOwnTeam(rows);
    if (people.length === 0) return;
    startOwnBusiness({ industry: selected, practiceName: businessName, people });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-bg/90 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="industry-onboarding-title"
    >
      <Card className="max-h-[92dvh] w-full max-w-3xl overflow-y-auto border-border bg-surface shadow-2xl">
        {step === "industry" ? (
          <>
            <CardHeader>
              <Badge variant="accent" className="w-fit">
                Welcome to Precog Pioneer
              </Badge>
              <CardTitle id="industry-onboarding-title" className="text-xl sm:text-2xl">
                What kind of business is this?
              </CardTitle>
              <CardDescription>
                Pick the closest line of business. Next you enter your own team, or explore a sample
                first. You can switch industry anytime in Business profile.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-2 sm:grid-cols-2">
                {INDUSTRIES.map((ind) => {
                  const Icon = ICONS[ind.id];
                  const tpl = getIndustryTemplate(ind.id);
                  const active = selected === ind.id;
                  // How many prosecuted cases the library holds for this line
                  // of business. The general template counts the whole library.
                  const sectors = sectorsForIndustry(ind.id);
                  const caseCount = sectors.includes("any")
                    ? CASE_LIBRARY.length
                    : CASE_LIBRARY.filter((c) => sectors.includes(c.sector)).length;
                  const casePhrase = sectors.includes("any")
                    ? `${caseCount} prosecuted cases across every line of business`
                    : `${caseCount} prosecuted ${caseCount === 1 ? "case" : "cases"} in this line of business`;
                  return (
                    <button
                      key={ind.id}
                      type="button"
                      onClick={() => setSelected(ind.id)}
                      className={cn(
                        "rounded-xl border p-4 text-left transition-colors",
                        active
                          ? "border-primary/50 bg-primary/10 glow-primary"
                          : "border-border bg-elevated hover:border-border-strong",
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <span
                          className={cn(
                            "flex size-9 shrink-0 items-center justify-center rounded-lg",
                            active ? "bg-primary/20 text-primary" : "bg-panel text-muted",
                          )}
                        >
                          <Icon className="size-4" />
                        </span>
                        <div className="min-w-0">
                          <p className="font-medium">{ind.label}</p>
                          <p className="mt-0.5 text-xs text-muted">{ind.tagline}</p>
                          <p className="mt-2 text-[10px] text-subtle">
                            Sample: {tpl.processes.length} processes, {tpl.people.length} people
                          </p>
                          <p className="mt-0.5 text-[10px] text-subtle">{casePhrase}</p>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <Button className="w-full" onClick={() => setStep("team")} autoFocus>
                  Set up my own business
                </Button>
                <Button
                  className="w-full"
                  variant="secondary"
                  onClick={() => completeOnboarding(selected)}
                >
                  Load {industry?.label} demo
                </Button>
              </div>
              <p className="text-center text-[11px] text-subtle">
                The demo is a fictional team. Every finding on it says so until you enter your own.
              </p>
            </CardContent>
          </>
        ) : (
          <>
            <CardHeader>
              <Badge variant="accent" className="w-fit">
                {industry?.label}
              </Badge>
              <CardTitle id="industry-onboarding-title" className="text-xl sm:text-2xl">
                Your business and who does the money work
              </CardTitle>
              <CardDescription>
                Name your people and tick the duties each one handles today. Eight duties are enough
                to find the arrangements that let one person take money and hide it. Paste a roster
                from your HR or payroll system and common job titles fill the duties for you; you
                can add everything else later in Who knows what.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-muted">Business name</span>
                <input
                  className={cn(inputCls, "max-w-md")}
                  placeholder={industry?.demoName ? `e.g. ${industry.demoName}` : "Business name"}
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  maxLength={80}
                />
              </label>

              <details className="rounded-xl border border-border bg-elevated/50 p-3">
                <summary className="cursor-pointer text-sm font-medium">
                  Paste your team from Workday, SAP, Oracle, or your payroll export
                </summary>
                <div className="mt-2 space-y-2">
                  <p className="text-xs text-muted">
                    Paste the worker list as exported, header row included, or one person per line
                    as <span className="font-mono">Name, Title</span>. Titles such as Bookkeeper,
                    Office Manager, AP Specialist, or Cashier are read from a catalog of common jobs
                    and their usual duties are ticked. People marked inactive are left out.
                  </p>
                  <textarea
                    className={cn(inputCls, "min-h-28 w-full font-mono text-xs")}
                    aria-label="Pasted roster"
                    placeholder={
                      "Ana Ruiz, Office Manager\nBen Ochoa, Bookkeeper\nCal Diaz, Front Desk"
                    }
                    value={paste}
                    onChange={(e) => setPaste(e.target.value)}
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <Button size="sm" onClick={fillFromPaste} disabled={!paste.trim()}>
                      Fill the table
                    </Button>
                    {pasteNote && <p className="text-xs text-muted">{pasteNote}</p>}
                  </div>
                </div>
              </details>

              <datalist id="job-title-options">
                {JOB_CATALOG.map((j) => (
                  <option key={j.id} value={j.title} />
                ))}
              </datalist>

              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="w-full min-w-[720px] border-separate border-spacing-0 text-xs">
                  <thead className="bg-elevated">
                    <tr>
                      <th scope="col" className="border-b border-border p-2 text-left font-medium">
                        Person
                      </th>
                      <th scope="col" className="border-b border-border p-2 text-left font-medium">
                        Role
                      </th>
                      {CORE_DUTIES.map((duty) => (
                        <th
                          key={duty}
                          scope="col"
                          className="border-b border-border p-2 text-center font-normal text-muted"
                        >
                          {coreDutyLabel(duty)}
                        </th>
                      ))}
                      <th scope="col" className="border-b border-border p-2">
                        <span className="sr-only">Remove</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, index) => (
                      <tr key={index}>
                        <td className="border-b border-border p-1.5">
                          <input
                            className={cn(inputCls, "w-36")}
                            placeholder={index === 0 ? "Your name" : "Name"}
                            aria-label={`Person ${index + 1} name`}
                            value={row.name}
                            onChange={(e) => updateRow(index, { name: e.target.value })}
                            maxLength={60}
                          />
                        </td>
                        <td className="border-b border-border p-1.5">
                          <input
                            className={cn(inputCls, "w-40")}
                            placeholder="e.g. Bookkeeper"
                            aria-label={`Person ${index + 1} role`}
                            list="job-title-options"
                            value={row.role}
                            onChange={(e) => updateRow(index, { role: e.target.value })}
                            onBlur={() => suggestDuties(index)}
                            maxLength={40}
                          />
                        </td>
                        {CORE_DUTIES.map((duty) => (
                          <td key={duty} className="border-b border-border p-1.5 text-center">
                            <input
                              type="checkbox"
                              aria-label={`${row.name || `Person ${index + 1}`}: ${coreDutyLabel(duty)}`}
                              checked={row.duties.includes(duty)}
                              onChange={() => toggleDuty(index, duty)}
                            />
                          </td>
                        ))}
                        <td className="border-b border-border p-1.5 text-center">
                          {rows.length > 1 && (
                            <button
                              type="button"
                              aria-label={`Remove person ${index + 1}`}
                              className="rounded-md p-1 text-muted hover:bg-elevated hover:text-danger"
                              onClick={() =>
                                setRows((current) => current.filter((_, i) => i !== index))
                              }
                            >
                              <Trash2 className="size-3.5" aria-hidden />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={rows.length >= OWN_TEAM_MAX}
                  onClick={() => setRows((current) => [...current, EMPTY_ROW("")])}
                >
                  <Plus className="size-3.5" aria-hidden /> Add a person
                </Button>
                <p className="text-[11px] text-subtle">
                  Up to {OWN_TEAM_MAX} people here; larger teams continue in Who knows what.
                </p>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <Button className="w-full" onClick={finish} disabled={namedRows.length === 0}>
                  Show me my findings
                </Button>
                <Button className="w-full" variant="secondary" onClick={() => setStep("industry")}>
                  Back
                </Button>
              </div>
              <p className="text-center text-[11px] text-subtle">
                Nothing leaves this browser until you sign in and choose to sync.
              </p>
            </CardContent>
          </>
        )}
      </Card>
    </div>
  );
}
