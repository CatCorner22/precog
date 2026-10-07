/**
 * Opens a client's control report: switches to that business first and goes
 * to the report only once the switch succeeded, so the report never shows
 * the business that was open before.
 */
export async function openClientReport(
  id: string,
  switchBusiness: (id: string) => Promise<{ ok: true } | { ok: false; reason: string }>,
  goToReport: () => void,
  onRefused: (reason: string) => void,
): Promise<boolean> {
  const r = await switchBusiness(id);
  if (!r.ok) {
    onRefused(r.reason);
    return false;
  }
  goToReport();
  return true;
}

/**
 * Where "Open report" lands for a client: the newest version awaiting the
 * firm's review when one waits, otherwise the live report.
 */
export function clientReportSearch(client: { awaitingVersionId: string | null } | undefined): {
  version?: string;
} {
  return client?.awaitingVersionId ? { version: client.awaitingVersionId } : {};
}
