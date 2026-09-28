import { formatDay } from "../dates";
import { slug } from "../text";
import {
  PROCEDURE_STATUS_LABEL,
  procedureStatus,
  reviewByDate,
  shownSteps,
  stepMarkNote,
} from "./lifecycle";
import type { Place, Procedure } from "./types";

/**
 * Procedures out of the app: Markdown a person can read, paste into a wiki
 * or print, and JSON that keeps every field. Pictures stay in the account;
 * the Markdown says how many a step has, and the JSON keeps their ids.
 */

/** What the export needs to know beyond the procedure: names, places and the day. */
export interface ExportContext {
  places: readonly Place[];
  /** A person's name by id; null when the id is unset. */
  nameOf: (id?: string) => string | null;
  /** A register item's name by id. */
  itemName: (id: string) => string | undefined;
  today: string;
}

/** One procedure as Markdown, in the order a stand-in reads it. */
export function procedureMarkdown(p: Procedure, ctx: ExportContext): string {
  const place = ctx.places.find((pl) => pl.id === p.placeId);
  const where = [place?.name, p.module].filter(Boolean).join(" › ");
  const lines: string[] = [`# ${inline(p.title)}`, ""];
  const facts: [string, string | undefined][] = [
    ["Where", where || undefined],
    ["Link", p.url],
    ["When", p.trigger],
    ["Status", statusLine(p, ctx)],
    [
      "Version",
      `${p.version}${p.changelog[0] ? ` (${p.changelog[0].summary} on ${formatDay(p.changelog[0].on)})` : ""}`,
    ],
  ];
  for (const [label, value] of facts) {
    if (value) lines.push(`**${label}:** ${label === "Link" ? `<${value}>` : inline(value)}  `);
  }
  if (p.purpose) lines.push("", inline(p.purpose));
  if (p.prerequisites.length) {
    lines.push("", "## What you need first", "");
    for (const x of p.prerequisites) lines.push(`- ${inline(x)}`);
  }
  lines.push("", "## Steps", "");
  const steps = shownSteps(p);
  if (!steps.length) lines.push("No steps yet.");
  steps.forEach((s, i) => {
    const pad = " ".repeat(String(i + 1).length + 2);
    const pictures = s.imageIds?.length ?? 0;
    // Each step's parts, in order; the first goes on the numbered line, so a
    // step with only a caution, a photo or pictures still reads as a step.
    const parts = [
      s.text.trim() ? inline(s.text) : "",
      s.caution ? `**Caution:** ${inline(s.caution)}` : "",
      s.requiresPhoto ? "_Take a photo as you do this step._" : "",
      pictures ? `_${pictures} ${pictures === 1 ? "picture" : "pictures"} in Precog._` : "",
      stepMarkNote(s) ? `_${stepMarkNote(s)}_` : "",
    ].filter(Boolean);
    parts.forEach((part, j) => lines.push(j === 0 ? `${i + 1}. ${part}` : `${pad}${part}`));
  });
  const names = (ids: readonly string[]) =>
    ids.map((id) => ctx.nameOf(id) ?? id).join(", ") || undefined;
  const items = p.knowledgeIds.map((id) => ctx.itemName(id)).filter(Boolean) as string[];
  lines.push(
    "",
    "## People",
    "",
    `- Does it today: ${inline(ctx.nameOf(p.ownerPersonId) ?? "Not set")}`,
    `- Stand-ins: ${inline(names(p.backupPersonIds) ?? "Nobody named yet")}`,
    `- Reviewer: ${inline(ctx.nameOf(p.reviewerPersonId) ?? "the owner")}`,
    `- Covers on Who knows what: ${inline(items.join(", ") || "Nothing linked")}`,
  );
  return `${lines.join("\n")}\n`;
}

/** Every procedure as one Markdown file, separated by rules, with a heading for the business. */
export function proceduresMarkdown(
  procedures: readonly Procedure[],
  businessName: string,
  ctx: ExportContext,
): string {
  const head = `# Procedures: ${inline(businessName || "your business")}\n\nExported ${formatDay(ctx.today)} · ${procedures.length} ${procedures.length === 1 ? "procedure" : "procedures"}\n`;
  const body = procedures.map((p) => procedureMarkdown(p, ctx).replace(/^# /, "## "));
  // Each procedure's own sections move down one level under the business heading.
  return [head, ...body.map((b) => b.replace(/\n## (?!#)/g, "\n### "))].join("\n---\n\n");
}

/** Every field of every procedure, the places they refer to, and the people's names. */
export function proceduresJson(
  procedures: readonly Procedure[],
  businessName: string,
  ctx: ExportContext,
): string {
  const personIds = new Set<string>();
  for (const p of procedures) {
    for (const id of [p.ownerPersonId, p.reviewerPersonId, ...p.backupPersonIds]) {
      if (id) personIds.add(id);
    }
    for (const proof of p.proofs) personIds.add(proof.personId);
  }
  const placeIds = new Set(procedures.map((p) => p.placeId).filter(Boolean));
  return `${JSON.stringify(
    {
      format: "precog-procedures",
      version: 1,
      exportedOn: ctx.today,
      business: businessName,
      people: Object.fromEntries(
        [...personIds].map((id) => [id, ctx.nameOf(id) ?? "someone who has left"]),
      ),
      places: ctx.places.filter((pl) => placeIds.has(pl.id)),
      procedures,
    },
    null,
    2,
  )}\n`;
}

/** "reconcile-the-checking-account.md"; "procedure.md" for a title with no letters or digits. */
export function exportFileName(title: string, extension: "md" | "json"): string {
  return `${slug(title) || "procedure"}.${extension}`;
}

function statusLine(p: Procedure, ctx: ExportContext): string {
  const status = procedureStatus(p, ctx.today);
  const due = reviewByDate(p);
  if (p.verifiedAt && due) {
    const recorded = p.verifiedByAccountName ? `; recorded by ${p.verifiedByAccountName}` : "";
    return status === "stale"
      ? `Verification overdue: verified ${formatDay(p.verifiedAt)}; verify again by ${formatDay(due)}${recorded}`
      : `Verified ${formatDay(p.verifiedAt)}; verify again by ${formatDay(due)}${recorded}`;
  }
  if (p.lastVerifiedAt) {
    return `Changed since verified: last verified ${formatDay(p.lastVerifiedAt)}, before the steps changed`;
  }
  return PROCEDURE_STATUS_LABEL[status];
}

/**
 * Owner text on one line, with the characters Markdown would act on escaped,
 * and never read as a heading, quote, rule, code fence or list item where it
 * starts a line or a list entry.
 */
function inline(value: string): string {
  return value
    .trim()
    .replace(/\s*\n\s*/g, " ")
    .replace(/([\\`*_[\]<>|~])/g, "\\$1")
    .replace(/^([#+=-])/, "\\$1")
    .replace(/^(\d+)([.)])/, "$1\\$2");
}
