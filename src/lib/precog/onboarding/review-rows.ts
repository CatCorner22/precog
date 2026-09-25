import type { OwnTeamRow, SeatReading } from "./own-team";

/** Show ambiguous/incomplete rows first without removing them from the roster. */
export function setupRowNeedsAttention(row: OwnTeamRow, seat: SeatReading | undefined): boolean {
  const named = Boolean(row.name.trim());
  const hasWork = named || Boolean(row.role.trim()) || row.duties.length > 0;
  if (!hasWork) return false;
  return !named || !row.role.trim() || !seat?.title || seat.partial;
}
