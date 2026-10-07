import type { IndustryId } from "@/lib/precog/industry";
import {
  CORE_DUTIES,
  extraDuties,
  ownerRow,
  rowSeat,
  sharedTitles,
  unconfirmedDuties,
  type OwnTeamRow,
  type SeatReading,
} from "@/lib/precog/onboarding/own-team";
import type { SetupAnswers } from "@/lib/precog/onboarding/setup-answers";
import type { EntitlementId } from "@/lib/precog/sod/conflict-rules";
import type { TitleTicksItem } from "./industry-onboarding-parts";
import {
  Briefcase,
  Car,
  ChefHat,
  Building2,
  HardHat,
  HeartHandshake,
  ShoppingBag,
  Stethoscope,
} from "lucide-react";
import { caseCountsForIndustry, type IndustrySector } from "@/lib/precog/evidence";
import { count, joinWithAnd, titleKey, uid } from "@/lib/precog/text";

/**
 * The words for a sector inside "N in …". The dental template's three sectors
 * join to "dental, medical and veterinary practices", so only the last
 * carries the noun.
 */
const SECTOR_WORDS: Record<Exclude<IndustrySector, "any">, string> = {
  dental: "dental",
  medical: "medical",
  veterinary: "veterinary practices",
  restaurant: "restaurants",
  construction: "construction",
  trades: "the trades",
  automotive: "auto dealerships and repair shops",
  "professional-services": "professional services",
  retail: "retail",
  nonprofit: "nonprofits",
};

/**
 * How many prosecuted cases the library holds for a line of business, beside
 * the whole library's count, so a thin line of business is not mistaken for
 * the evidence as a whole: "3 prosecuted cases in retail, 53 across all lines
 * of business". The general template counts the whole library. Both counts
 * come from the library, never from a typed number.
 */
export function caseCoveragePhrase(industryId: IndustryId): string {
  const { own, total, sectors } = caseCountsForIndustry(industryId);
  if (own === null) return `${count(total, "prosecuted case")} across all lines of business`;
  const words = joinWithAnd(sectors.map((s) => (s === "any" ? "" : SECTOR_WORDS[s])));
  return `${count(own, "prosecuted case")} in ${words}, ${total} across all lines of business`;
}

export const ICONS: Record<IndustryId, typeof Stethoscope> = {
  dental: Stethoscope,
  retail: ShoppingBag,
  professional_services: Briefcase,
  restaurant: ChefHat,
  construction: HardHat,
  automotive: Car,
  nonprofit: HeartHandshake,
  general: Building2,
};

/** A key for a grid row that stays with it when rows above it are removed. */
const newRowId = () => uid("row");
/** Gives every row a stable key; returns the same array when all have one. */
export function withRowIds(rows: OwnTeamRow[]): OwnTeamRow[] {
  const seen = new Set<string>();
  let changed = false;
  const next = rows.map((row) => {
    if (row.rowId && !seen.has(row.rowId)) {
      seen.add(row.rowId);
      return row;
    }
    changed = true;
    const rowId = newRowId();
    seen.add(rowId);
    return { ...row, rowId };
  });
  return changed ? next : rows;
}

export const EMPTY_ROW = (role = ""): OwnTeamRow => ({
  name: "",
  role,
  duties: [],
  rowId: newRowId(),
});
/** A fresh grid: the Owner row and two empty rows. */
export const freshRows = (): OwnTeamRow[] => [
  { ...ownerRow(), rowId: newRowId() },
  EMPTY_ROW(""),
  EMPTY_ROW(""),
];

export const nameInputId = (index: number) => `onboarding-person-${index + 1}-name`;

/** Everything in `root` a keyboard can reach, in order, skipping what is hidden. */
export function focusableIn(root: HTMLElement | null): HTMLElement[] {
  if (!root) return [];
  return Array.from(
    root.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((el) => el.getClientRects().length > 0 && !el.closest("[inert]"));
}

/** Moves focus once React has drawn the change. */
export function focusSoon(find: () => HTMLElement | null | undefined) {
  requestAnimationFrame(() => find()?.focus());
}

/** Who a row names, for labels: the name, or its place in the table. */
export const whoIs = (row: OwnTeamRow, index: number) => row.name.trim() || `Person ${index + 1}`;

/**
 * The catalog seat behind a row's ticks (see `rowSeat`), remembered per line
 * of business and reading so typing stays quick.
 */
export function typedSeat(
  row: Pick<OwnTeamRow, "role" | "readAs">,
  industry: string,
): SeatReading | undefined {
  const readAs = row.readAs?.role.trim() === row.role.trim() ? row.readAs : undefined;
  const key = JSON.stringify([industry, row.role.trim(), readAs?.title, readAs?.partial]);
  if (!SEAT_CACHE.has(key)) {
    if (SEAT_CACHE.size > 500) SEAT_CACHE.clear();
    SEAT_CACHE.set(key, rowSeat(row, industry));
  }
  return SEAT_CACHE.get(key);
}

const SEAT_CACHE = new Map<string, SeatReading | undefined>();

/**
 * Job titles two or more rows share where at least one of them holds a
 * duty: the titles "untick one duty for all of them" is worth offering for.
 */
export function sharedTitlesWithDuties(
  rows: readonly OwnTeamRow[],
): { role: string; count: number }[] {
  const withDuties = new Set(rows.filter((r) => r.duties.length > 0).map((r) => titleKey(r.role)));
  return sharedTitles(rows).filter((t) => withDuties.has(titleKey(t.role)));
}

/** The duties anyone with this job title holds, grid columns first. */
export function dutiesHeldByTitle(rows: readonly OwnTeamRow[], role: string): EntitlementId[] {
  const key = titleKey(role);
  const held = new Set<EntitlementId>();
  for (const row of rows) {
    if (titleKey(row.role) !== key) continue;
    for (const duty of row.duties) held.add(duty);
  }
  return [...CORE_DUTIES, ...extraDuties([...held])].filter((d) => held.has(d));
}

/**
 * The people whose job title suggested duties the owner has not yet kept or
 * removed, for the review before Finish: named rows only, since Finish drops
 * a row with no name. Every such duty is listed, grid column or not.
 */
export function titleTicksItems(
  rows: readonly OwnTeamRow[],
  industry: string,
  answers: SetupAnswers,
  waiting: (row: OwnTeamRow) => EntitlementId[] = (row) =>
    unconfirmedDuties(row, industry, answers),
): TitleTicksItem[] {
  return rows.flatMap((row) => {
    const who = row.name.trim();
    const duties = who ? waiting(row) : [];
    return duties.length > 0
      ? [{ rowId: row.rowId ?? "", who, role: row.role.trim(), duties }]
      : [];
  });
}

/**
 * What holds Finish back: the suggested duties still to keep or remove, and
 * the first person they belong to; null once every one is decided.
 */
export function finishWaits(
  items: readonly TitleTicksItem[],
): { waiting: number; first: TitleTicksItem } | null {
  const waiting = items.reduce((sum, item) => sum + item.duties.length, 0);
  return waiting > 0 && items[0] ? { waiting, first: items[0] } : null;
}

/** Whether leaving setup now loses typed work: the browser keeps nothing, or the draft write failed. */
export function setupLeaveLosesWork(input: {
  keepsNothing: boolean;
  draftSaved: boolean | null;
}): boolean {
  return input.keepsNothing || input.draftSaved === false;
}

/**
 * What leaving setup asks when the owner typed something, or null when
 * there is nothing to ask about. Escape asks whenever there is typed work
 * (an accidental keypress); when the browser cannot keep the draft, the
 * question says the typed work is lost.
 */
export function leaveSetupConfirm(input: {
  typed: boolean;
  keepsNothing: boolean;
  draftSaved: boolean | null;
  returnsToName: string;
}): string | null {
  if (!input.typed) return null;
  const lost = setupLeaveLosesWork(input) ? " This browser will not keep what you typed." : "";
  return `Leave setup and go back to ${input.returnsToName}?${lost}`;
}

/**
 * What the Cancel link asks, or null when it goes back silently. The draft
 * restores when storage works, so Cancel only asks when leaving loses typed
 * work.
 */
export function cancelSetupConfirm(input: {
  typed: boolean;
  keepsNothing: boolean;
  draftSaved: boolean | null;
}): string | null {
  if (!input.typed || !setupLeaveLosesWork(input)) return null;
  return "Cancel setup? This browser will not keep what you typed.";
}

export const ONE_PERSON_NOTE =
  "You can continue with one person. Precog will assess that sole-owner setup; add the rest of your team later under Team for a fuller team assessment.";

/** The one-person note under the team table, shown only while nobody or one person is named. */
export function onePersonNote(namedCount: number): string | null {
  return namedCount <= 1 ? ONE_PERSON_NOTE : null;
}
