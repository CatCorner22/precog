import { toast } from "sonner";
import type { IndustryId } from "@/lib/precog/industry";

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

/**
 * Adds a client from the Add client form: the form is busy while Precog adds
 * it and free again afterwards, whether Precog added it, refused it or the
 * request failed; a failure says why, as a refusal does.
 */
export async function addClientFromForm(
  onAdd: (name: string, industry: IndustryId) => Promise<boolean>,
  name: string,
  industry: IndustryId,
  setBusy: (busy: boolean) => void,
  onAdded: () => void,
): Promise<void> {
  setBusy(true);
  let ok = false;
  try {
    ok = await onAdd(name, industry);
  } catch (err) {
    toast.error("Precog could not add the client.", {
      description: err instanceof Error ? err.message : undefined,
    });
  } finally {
    setBusy(false);
  }
  if (ok) onAdded();
}
