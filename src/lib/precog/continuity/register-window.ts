/**
 * The continuity grid draws one control per person per item. Past these
 * sizes that paint stalls the page, so the grid shows one page of rows and
 * one page of people at a time. The register itself is not truncated.
 */
export const REGISTER_ITEM_PAGE = 25;
export const REGISTER_PEOPLE_PAGE = 8;

/** Sizes where a single unpaged grid was measured as stalling the tab. */
export const REGISTER_RESPONSIVE_PEOPLE = 30;
export const REGISTER_RESPONSIVE_ITEMS = 150;

export function pageCount(total: number, size: number): number {
  if (total <= 0) return 1;
  return Math.ceil(total / size);
}

export function clampPage(page: number, total: number, size: number): number {
  const pages = pageCount(total, size);
  if (!Number.isFinite(page) || page < 0) return 0;
  return Math.min(pages - 1, Math.floor(page));
}

export function pageSlice<T>(items: readonly T[], page: number, size: number): T[] {
  const start = clampPage(page, items.length, size) * size;
  return items.slice(start, start + size);
}

export function registerNeedsPaging(people: number, items: number): boolean {
  return people > REGISTER_PEOPLE_PAGE || items > REGISTER_ITEM_PAGE;
}

export function registerOverResponsiveLimit(people: number, items: number): boolean {
  return people > REGISTER_RESPONSIVE_PEOPLE || items > REGISTER_RESPONSIVE_ITEMS;
}
