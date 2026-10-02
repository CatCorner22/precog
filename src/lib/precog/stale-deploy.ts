import { isChunkLoadError } from "@/lib/observability/report-browser";

/** The lasting notice shown once a save meets a newer release of Precog. */
export const PRECOG_UPDATED_MESSAGE =
  "Precog was updated. Reload to keep saving. Your work is kept on this device.";

/**
 * Whether a failed request means a new release moved code this open page
 * still points at: the server answers an unknown server-function id with a
 * plain 404 "Not found" (src/start.ts), which the client throws as an Error
 * with exactly that message, and a renamed chunk fails its dynamic import.
 * Conservative on purpose: any other failure is an ordinary save error.
 */
export function isStaleDeployError(error: unknown): boolean {
  if (isChunkLoadError(error)) return true;
  if (!(error instanceof Error)) return false;
  // Firefox words a failed dynamic import differently from Chromium and Safari.
  if (/error loading dynamically imported module/i.test(error.message)) return true;
  return error.message.trim() === "Not found";
}
