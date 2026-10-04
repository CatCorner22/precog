import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import type { Entitlements } from "./entitlements";
import { countClients, loadEntitlements } from "./entitlements.server";
import { loadFirmFor } from "./store";

export type EntitlementsAnswer = Entitlements & {
  /** Live client businesses the plan's limit counts today. */
  clientCount: number;
  /** Whether the caller owns the firm (or is in none), so the Fix payment button shows. */
  isOwner: boolean;
  /** The firm owner's name, for a member who must ask them; null outside a firm. */
  firmOwnerName: string | null;
  firmName: string | null;
};

/**
 * What the signed-in account's plan opens, for the Plan card, the home and
 * firm banners and the second-business stop. Called only by a signed-in
 * viewer: it answers 401 to anyone else.
 */
export const getEntitlements = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<EntitlementsAnswer> => {
    const sql = await getSql();
    const firm = await loadFirmFor(sql, context.userId);
    const [entitlements, clientCount, owners] = await Promise.all([
      loadEntitlements(sql, context.userId),
      countClients(sql, context.userId, firm),
      firm
        ? sql<{ name: string | null }>`select name from "user" where id = ${firm.firmUserId}`
        : Promise.resolve([]),
    ]);
    return {
      ...entitlements,
      clientCount,
      isOwner: !firm || firm.role === "owner",
      firmOwnerName: firm ? owners[0]?.name || null : null,
      firmName: firm?.name ?? null,
    };
  });
