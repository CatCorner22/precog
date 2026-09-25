import type { IndustryId } from "@/lib/precog/industry";
import {
  rowSeat,
  type OwnTeamRow,
  type SeatReading,
  ownerRow,
} from "@/lib/precog/onboarding/own-team";
import type { EntitlementId } from "@/lib/precog/sod/conflict-rules";
import {
  Briefcase,
  ChefHat,
  Building2,
  HardHat,
  HeartHandshake,
  ShoppingBag,
  Stethoscope,
} from "lucide-react";

export const ICONS: Record<IndustryId, typeof Stethoscope> = {
  dental: Stethoscope,
  retail: ShoppingBag,
  professional_services: Briefcase,
  restaurant: ChefHat,
  construction: HardHat,
  nonprofit: HeartHandshake,
  general: Building2,
};

let nextRowNumber = 0;
/** A key for a grid row that stays with it when rows above it are removed. */
const newRowId = () => `row-${Date.now().toString(36)}-${(nextRowNumber += 1)}`;
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

export const sameDuties = (a: readonly EntitlementId[], b: readonly EntitlementId[]) =>
  a.length === b.length && a.every((d) => b.includes(d));

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

/** How typed titles read, remembered per line of business so typing stays quick. */
const SEAT_CACHE = new Map<string, SeatReading | undefined>();
export function typedSeat(role: string, industry: string): SeatReading | undefined {
  const key = `${industry}|${role.trim()}`;
  if (!SEAT_CACHE.has(key)) {
    if (SEAT_CACHE.size > 500) SEAT_CACHE.clear();
    SEAT_CACHE.set(key, rowSeat({ role }, industry));
  }
  return SEAT_CACHE.get(key);
}
