import { useEffect, useLayoutEffect } from "react";
import { setDisplayedAccount } from "./identity-change";

const useBrowserLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * Records the signed-in account as the one this tab shows, for a page
 * outside the business workspace (WorkspaceProvider records it there): an
 * invitation opened from its email, the operator page. Every signed-in
 * server call carries that account (authMiddleware) and is refused 409
 * "The signed-in account changed" when none is recorded, so such a page
 * calls this before its first signed-in call. A layout effect runs before
 * every passive effect of the same commit, the page's children's included,
 * so the first call already carries the account. Nothing is recorded while
 * the session loads or for a signed-out visitor.
 */
export function useRecordDisplayedAccount(userId: string | null | undefined): void {
  useBrowserLayoutEffect(() => {
    if (userId) setDisplayedAccount(userId);
  }, [userId]);
}
