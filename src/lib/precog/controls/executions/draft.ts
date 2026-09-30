import type { StorageLike } from "../../local-data";

/** Small in-progress form values only. Review attestations never survive a reload. */
const PREFIX = "control-evidence-draft:v1:";
export function readDraft(storage: StorageLike | null, key: string): Record<string, string> | null {
  try {
    const raw = storage?.getItem(PREFIX + key);
    if (!raw || raw.length > 20_000) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return Object.fromEntries(
      Object.entries(parsed).filter(
        ([key, value]) =>
          key !== "independenceConfirmed" && typeof value === "string" && value.length <= 5000,
      ),
    );
  } catch {
    return null;
  }
}
export function writeDraft(
  storage: StorageLike | null,
  key: string,
  value: Record<string, string> | null,
): boolean {
  if (!storage) return false;
  try {
    if (value) storage.setItem(PREFIX + key, JSON.stringify(value));
    else storage.removeItem(PREFIX + key);
    return true;
  } catch {
    return false;
  }
}
