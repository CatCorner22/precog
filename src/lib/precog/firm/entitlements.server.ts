import type { Sql } from "@/lib/db";
import { RequestError } from "@/lib/request-errors";
import { stripeConfigured } from "../billing/stripe.server";
import { loadBillingAccount } from "./billing-store";
import {
  entitlementRefusal,
  entitlementsFor,
  type Entitlements,
  type Feature,
} from "./entitlements";
import { loadFirmFor, type FirmContext } from "./store";

/**
 * The plan of the firm `userId` works in (its owner's billing row), or of the
 * account itself when it is in no firm. Every paid gate reads this, so a
 * member of a paid firm is as open as its owner.
 */
export async function loadEntitlements(sql: Sql, userId: string): Promise<Entitlements> {
  const firm = await loadFirmFor(sql, userId);
  const billing = await loadBillingAccount(sql, firm?.firmUserId ?? userId);
  return entitlementsFor({
    stripeConfigured: stripeConfigured(),
    firmPlan: firm?.plan ?? null,
    billing,
    now: new Date(),
  });
}

/** Throws a 402 naming why the feature is closed; returns the entitlements when it is open. */
export async function requireEntitlement(
  sql: Sql,
  userId: string,
  feature: Exclude<Feature, "moreClients">,
): Promise<Entitlements> {
  const e = await loadEntitlements(sql, userId);
  if (!e.features[feature]) throw new RequestError(402, entitlementRefusal(feature, e));
  return e;
}

/**
 * Live businesses the plan's client limit counts: the firm's clients when the
 * account is in a firm (whoever created them), else the account's own.
 */
export async function countClients(
  sql: Sql,
  userId: string,
  firm: FirmContext | null,
): Promise<number> {
  const rows = firm
    ? await sql<{ n: number | string }>`
        select count(*) as n from businesses
        where firm_user_id = ${firm.firmUserId} and deleted_at is null
      `
    : await sql<{ n: number | string }>`
        select count(*) as n from businesses
        where user_id = ${userId} and deleted_at is null
      `;
  return Number(rows[0]?.n ?? 0);
}
