import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { RequestError } from "@/lib/request-errors";
import { deleteAccountRows, exportAccountRows } from "./account-store";
import { decryptSecret, qboConfigured, revokeToken } from "./integrations/qbo/client.server";

/**
 * Everything the account holds, for the owner to keep. Serialised here because
 * the stored JSON columns have no static shape the transport layer can check.
 */
export const exportAccountData = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    return { json: JSON.stringify(await exportAccountRows(sql, context.userId), null, 2) };
  });

/**
 * Deletes the account and everything it owns, then revokes its QuickBooks
 * connections at Intuit. Refused (409) while the firm plan is billing or the
 * account holds another firm's clients (see deleteAccountRows). The client
 * signs out and clears its local copies afterwards; nothing here can be undone.
 */
export const deleteAccount = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { confirm: string }) => {
    if (input?.confirm !== "DELETE") throw new RequestError(400, "Type DELETE to confirm");
    return { confirm: "DELETE" as const };
  })
  .handler(async ({ context }) => {
    const sql = await getSql();
    const deleted = await deleteAccountRows(sql, context.userId);
    await revokeQuickBooksTokens(deleted.quickBooksRefreshTokens);
    return { ok: true as const };
  });

/** Best effort: the rows are already gone, so a failed revoke is logged, never thrown. */
async function revokeQuickBooksTokens(sealedTokens: string[]): Promise<void> {
  if (!sealedTokens.length || !qboConfigured()) return;
  await Promise.all(
    sealedTokens.map(async (sealed) => {
      try {
        await revokeToken(decryptSecret(sealed));
      } catch (error) {
        console.error(
          "[account] QuickBooks token not revoked:",
          error instanceof Error ? error.message : error,
        );
      }
    }),
  );
}
