import type { IndustryId } from "@/lib/precog/industry";

/** Items a Johari pane lists before the owner asks for all of them. */
export const PANE_PREVIEW = 8;

/**
 * The items a pane lists and the count its heading states. The heading
 * always states the pane's real total, and says when only some are shown,
 * so it matches the number on the 2×2 above it.
 */
export function paneItems<T>(
  all: readonly T[],
  expanded: boolean,
): { shown: T[]; total: number; count: string } {
  const shown = expanded ? [...all] : all.slice(0, PANE_PREVIEW);
  return {
    shown,
    total: all.length,
    count: shown.length < all.length ? `showing ${shown.length} of ${all.length}` : `${all.length}`,
  };
}

/**
 * Heading for the playbook's worked examples, which are written for a
 * dental office: said plainly, and for other businesses with a note that the
 * same patterns occur in any business.
 */
export function examplesHeading(industry: IndustryId): string {
  return industry === "dental"
    ? "Examples from a dental or medical office"
    : "Examples from a dental office · the same patterns occur in any business";
}
