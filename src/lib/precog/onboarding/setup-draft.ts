import { INDUSTRIES, type IndustryId } from "../industry";
import type { StorageLike } from "../local-data";
import { firstRowForIndustry, type OwnTeamRow } from "./own-team";

/**
 * The setup grid in progress, kept in this tab's session storage so a reload
 * does not throw away what the owner has entered: the line of business they
 * picked, the business name, the rows, and a roster pasted but not yet used.
 */
export const SETUP_DRAFT_KEY = "precog.onboarding-draft.v1";

export interface SetupDraft {
  step: "industry" | "team";
  selected: IndustryId;
  businessName: string;
  rows: OwnTeamRow[];
  /** Roster text pasted into the box but not yet used to fill the table. */
  paste: string;
  /** The unfinished business the draft was entered for; absent in drafts from older versions. */
  businessId?: string;
}

function sessionArea(): StorageLike | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

const INDUSTRY_IDS = new Set<string>(INDUSTRIES.map((i) => i.id));

function isRow(value: unknown): value is OwnTeamRow {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return typeof row.name === "string" && typeof row.role === "string" && Array.isArray(row.duties);
}

/** The draft in this tab, or null when there is none or it is not one this version can read. */
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
    return {
      step: draft.step === "team" ? "team" : "industry",
      selected:
        typeof draft.selected === "string" && INDUSTRY_IDS.has(draft.selected)
          ? (draft.selected as IndustryId)
          : "dental",
      businessName: draft.businessName.slice(0, 80),
      rows: draft.rows.filter(isRow),
      paste: typeof draft.paste === "string" ? draft.paste : "",
      ...(typeof draft.businessId === "string" ? { businessId: draft.businessId } : {}),
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
 * over. Otherwise setup starts fresh, on the team step when the business
 * already has a name.
 */
export function initialSetup(
  draft: SetupDraft | null,
  business: { businessId: string; industry: IndustryId; typedName: string },
  freshRows: () => OwnTeamRow[],
): { draft: SetupDraft; restoredEarlier: boolean } {
  const fresh: SetupDraft = {
    step: business.typedName ? "team" : "industry",
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
