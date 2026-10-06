import { authClient, authEnabled } from "./client";

/**
 * The signed-in account's id, read once, or null for a signed-out visitor.
 * The crash screen loads this module only when it renders outside the
 * workspace, so the auth client stays out of the code every public page
 * loads. With auth turned off it answers the same id `useCurrentUserState`
 * gives.
 */
export async function currentAccountId(): Promise<string | null> {
  if (!authEnabled) return "dev-user";
  const result = await authClient.getSession();
  return result.data?.user?.id ?? null;
}
