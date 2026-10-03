/**
 * The pages that open the owner's business. Only these wait for the account
 * check and the business to load; sign-in, the legal pages, a shared map, an
 * invitation and the not-found page render at once, on the server too.
 */
const PRACTICE_ROUTE_IDS: ReadonlySet<string> = new Set(["/", "/report", "/firm"]);

/** Whether any of the matched routes needs the owner's business. */
export function needsPractice(routeIds: Iterable<string>): boolean {
  for (const id of routeIds) if (PRACTICE_ROUTE_IDS.has(id)) return true;
  return false;
}

/**
 * Whether an address opens one of those pages. Each of them has a fixed path
 * equal to its route id, so the address alone answers before the router has
 * matched it.
 */
export function isPracticePath(pathname: string): boolean {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  return PRACTICE_ROUTE_IDS.has(path || "/");
}
