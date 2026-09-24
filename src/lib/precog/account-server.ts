import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { deleteAccountRows, exportAccountRows } from "./account-store";
import { RequestError } from "@/lib/request-errors";

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
 * Deletes the account and everything it owns. The client signs out and clears
 * its local copies afterwards; nothing here can be undone.
 */
export const deleteAccount = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { confirm: string }) => {
    if (input?.confirm !== "DELETE") throw new RequestError(400, "Type DELETE to confirm");
    return { confirm: "DELETE" as const };
  })
  .handler(async ({ context }) => {
    const sql = await getSql();
    await deleteAccountRows(sql, context.userId);
    return { ok: true as const };
  });
