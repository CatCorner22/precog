import { browserWorkspace, currentStorage, type WorkspaceToken } from "./workspace";

export interface CloudAcknowledgement {
  revision: number | null;
  updatedAt: string;
}
const ACK_KEY = "precog.cloud-ack.v1";
const queues = new Map<string, Promise<unknown>>();

/**
 * Serializes one tab's writes without weakening database compare-and-swap.
 * Failed or stale writes are not automatically replayed over remote edits.
 */
export async function serialWorkspaceWrite<T>(
  token: WorkspaceToken,
  businessId: string,
  work: () => Promise<T>,
): Promise<T> {
  const key = JSON.stringify([token.owner, token.epoch, businessId]);
  const previous = queues.get(key) ?? Promise.resolve();
  const pending = previous
    .catch(() => undefined)
    .then(async () => {
      browserWorkspace.assertCurrent(token);
      const result = await work();
      browserWorkspace.assertCurrent(token);
      return result;
    });
  queues.set(key, pending);
  try {
    return await pending;
  } finally {
    if (queues.get(key) === pending) queues.delete(key);
  }
}

function acknowledgements(): Record<string, CloudAcknowledgement> {
  try {
    const raw = currentStorage()?.getItem(ACK_KEY);
    const value: unknown = raw ? JSON.parse(raw) : {};
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, CloudAcknowledgement>)
      : {};
  } catch {
    return {};
  }
}

export function cloudAcknowledgement(businessId: string): CloudAcknowledgement | undefined {
  return acknowledgements()[businessId];
}

export function acknowledgeCloud(
  token: WorkspaceToken,
  businessId: string,
  updatedAt: string,
  revision: number | null,
): void {
  browserWorkspace.assertCurrent(token);
  const all = acknowledgements();
  all[businessId] = { updatedAt, revision };
  try {
    currentStorage()?.setItem(ACK_KEY, JSON.stringify(all));
  } catch {
    // Without a durable acknowledgement the exit dialog errs toward recovery.
  }
}
