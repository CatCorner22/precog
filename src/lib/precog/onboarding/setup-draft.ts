import type { Departure } from "../continuity/access-removal";
import { MAX_BUSINESS_NAME } from "../business-id";
import { INDUSTRIES, type IndustryId } from "../industry";
import type { StorageLike } from "../local-data";
import { normalizeSetupAnswers, type SetupAnswers } from "./setup-answers";
import { firstRowForIndustry, type OwnTeamRow } from "./own-team";

/**
 * The setup grid in progress, kept in this tab's session storage so a reload
 * does not throw away what the owner has entered: the line of business they
 * picked, the business name, the rows, a roster pasted but not yet used, and
 * the people a pasted roster left out as no longer working here.
 */
export const SETUP_DRAFT_KEY = "precog.onboarding-draft.v1";

export interface SetupDraft {
  step: "industry" | "money" | "team";
  selected: IndustryId;
  businessName: string;
  rows: OwnTeamRow[];
  /** Roster text pasted into the box but not yet used to fill the table. */
  paste: string;
  /** The unfinished business the draft was entered for; absent in drafts from older versions. */
  businessId?: string;
  /**
   * People a pasted roster marked terminated or inactive, whose pay and
   * logins finishing asks the owner to confirm are stopped. The paste is
   * cleared once used, so the draft is the only place they survive a reload.
   */
  leftOut?: Departure[];
  answers?: SetupAnswers;
}

function sessionArea(): StorageLike | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

const INDUSTRY_IDS = new Set<string>(INDUSTRIES.map((i) => i.id));

const optional = (value: unknown, type: "string" | "boolean") =>
  value === undefined || typeof value === type;

/** A row every field of which has the type the grid gives it; anything else is dropped. */
function isRow(value: unknown): value is OwnTeamRow {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  const readAs = row.readAs as Record<string, unknown> | undefined;
  return (
    typeof row.name === "string" &&
    typeof row.role === "string" &&
    Array.isArray(row.duties) &&
    row.duties.every((d) => typeof d === "string") &&
    optional(row.owner, "boolean") &&
    optional(row.onLeave, "boolean") &&
    (row.tenureYears === undefined ||
      (typeof row.tenureYears === "number" && Number.isFinite(row.tenureYears))) &&
    ["department", "employeeId", "lastDay", "suggestedFor", "rowId"].every((key) =>
      optional(row[key], "string"),
    ) &&
    (readAs === undefined ||
      (typeof readAs === "object" &&
        readAs !== null &&
        typeof readAs.role === "string" &&
        optional(readAs.title, "string") &&
        optional(readAs.partial, "boolean")))
  );
}

function isDeparture(value: unknown): value is Departure {
  if (!value || typeof value !== "object") return false;
  const who = value as Record<string, unknown>;
  return (
    typeof who.name === "string" && optional(who.role, "string") && optional(who.personId, "string")
  );
}

/**
 * The draft in this tab, or null when there is none or it is not one this
 * version can read, such as a draft for a line of business this version does
 * not know.
 */
export function readSetupDraft(storage: StorageLike | null = sessionArea()): SetupDraft | null {
  let raw: string | null;
  try {
    raw = storage?.getItem(SETUP_DRAFT_KEY) ?? null;
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const draft = JSON.parse(raw) as Record<string, unknown>;
    if (!draft || typeof draft !== "object") return null;
    if (typeof draft.businessName !== "string" || !Array.isArray(draft.rows)) return null;
    if (typeof draft.selected !== "string" || !INDUSTRY_IDS.has(draft.selected)) return null;
    const leftOut = Array.isArray(draft.leftOut) ? draft.leftOut.filter(isDeparture) : [];
    const answers = normalizeSetupAnswers(draft.answers);
    return {
      step: draft.step === "team" || draft.step === "money" ? draft.step : "industry",
      selected: draft.selected as IndustryId,
      businessName: draft.businessName.slice(0, MAX_BUSINESS_NAME),
      rows: draft.rows.filter(isRow),
      paste: typeof draft.paste === "string" ? draft.paste : "",
      ...(typeof draft.businessId === "string" ? { businessId: draft.businessId } : {}),
      ...(leftOut.length > 0 ? { leftOut } : {}),
      ...(answers ? { answers } : {}),
    };
  } catch {
    return null;
  }
}

/** Saves the draft, or clears it with null; storage that refuses leaves it in memory only. */
export function writeSetupDraft(
  draft: SetupDraft | null,
  storage: StorageLike | null = sessionArea(),
): boolean {
  if (!storage) return false;
  try {
    if (draft) storage.setItem(SETUP_DRAFT_KEY, JSON.stringify(draft));
    else storage.removeItem(SETUP_DRAFT_KEY);
    return true;
  } catch {
    // Tell the caller instead of implying a reload can recover this draft.
    return false;
  }
}

/** Something the owner typed: a business name, a person's name, or a pasted roster. */
export function draftHasTypedWork(draft: Pick<SetupDraft, "businessName" | "rows" | "paste">) {
  return (
    draft.businessName.trim().length > 0 ||
    draft.paste.trim().length > 0 ||
    draft.rows.some((r) => r.name.trim().length > 0)
  );
}

/** How many people in the draft have a name. */
export function namedPeople(draft: Pick<SetupDraft, "rows">): number {
  return draft.rows.filter((r) => r.name.trim().length > 0).length;
}

/**
 * Where setup starts. A draft entered for this same unfinished business (a
 * reload mid-setup) comes back exactly as it was. A draft from an earlier
 * setup in this tab, one the owner left to load the sample, comes back when
 * it holds typed work, with the name and line of business chosen for this
 * business, and `restoredEarlier` so the dialog can say so and offer to start
 * over. Otherwise setup starts fresh, on the money step when the business
 * already has a name.
 */
export function initialSetup(
  draft: SetupDraft | null,
  business: { businessId: string; industry: IndustryId; typedName: string },
  freshRows: () => OwnTeamRow[],
): { draft: SetupDraft; restoredEarlier: boolean } {
  const fresh: SetupDraft = {
    step: business.typedName ? "money" : "industry",
    selected: business.industry,
    businessName: business.typedName,
    // A nonprofit's grid starts with its executive director, not an owner.
    rows: firstRowForIndustry(freshRows(), business.industry),
    paste: "",
    businessId: business.businessId,
  };
  if (!draft) return { draft: fresh, restoredEarlier: false };
  const sameSetup =
    draft.businessId === business.businessId ||
    (draft.businessId === undefined && draftHasTypedWork(draft));
  if (sameSetup)
    return { draft: { ...draft, businessId: business.businessId }, restoredEarlier: false };
  if (!draftHasTypedWork(draft)) return { draft: fresh, restoredEarlier: false };
  return {
    draft: {
      ...draft,
      step: "team",
      selected: business.typedName ? business.industry : draft.selected,
      businessName: business.typedName || draft.businessName,
      businessId: business.businessId,
    },
    restoredEarlier: true,
  };
}
