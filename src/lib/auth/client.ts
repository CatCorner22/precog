import * as core from "./auth-client-core";
import {
  browserWorkspace,
  IDENTITY_EVENT_KEY,
  prepareWorkspaceExit,
  rawBrowserStorage,
} from "@/lib/precog/sync/workspace";

export * from "./auth-client-core";

function notifyIdentityTransition(): void {
  browserWorkspace.invalidate();
  try {
    rawBrowserStorage()?.setItem(IDENTITY_EVENT_KEY, crypto.randomUUID());
  } catch {
    // Server-side identity checks still protect writes when storage is blocked.
  }
}

/** Keep preview popups synchronous with the gesture. Old account data stays isolated. */
export function signIn(
  providerId: string,
  options: { callbackURL?: string; errorCallbackURL?: string } = {},
): Promise<void> {
  notifyIdentityTransition();
  return core.signIn(providerId, options);
}

export async function signOut(redirectTo = "/"): Promise<void> {
  if (!(await prepareWorkspaceExit())) return;
  notifyIdentityTransition();
  return core.signOut(redirectTo);
}
