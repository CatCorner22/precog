/**
 * The pages that open the owner's business. Only these wait for the account
 * check and the business to load; sign-in, the legal pages, a shared map, an
 * invitation and the not-found page render at once, on the server too.
 */
const PRACTICE_ROUTE_IDS: ReadonlySet<string> = new Set(["/", "/report", "/threat", "/firm"]);

/** Whether any of the matched routes needs the owner's business. */
export function needsPractice(routeIds: Iterable<string>): boolean {
  for (const id of routeIds) if (PRACTICE_ROUTE_IDS.has(id)) return true;
  return false;
}
