import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql, type Sql } from "@/lib/db";
import { reportServerError } from "@/lib/observability/report.server";
import { RequestError, invalidRequest, requireObject } from "@/lib/request-errors";
import { inTransaction } from "@/lib/sql-transaction";
import {
  ACTIVE_SUBSCRIPTION_STATUSES,
  isHandMarked,
  loadBillingAccount,
  NO_RUNNING_SUBSCRIPTION,
  recordSubscription,
  setStripeCustomer,
} from "../firm/billing-store";
import { insertAudit } from "../firm/audit.server";
import { loadFirmFor, setFirmPlan } from "../firm/store";
import { stripeConfigured, updateCustomer } from "../billing/stripe.server";
import { userScope } from "../llm/daily-usage";
import { requireOperator } from "./access.server";
import { runCount } from "./counts.server";
import { findUserByEmail, findUserById, loadOperatorAccount } from "./lookup.server";
import {
  listCustomerSubscriptions,
  subscriptionToApply,
  type StripeSubscription,
} from "./stripe-read.server";
import {
  BILLING_NOT_CONNECTED,
  NOT_A_CUSTOMER_ID,
  noAccountWithId,
  subscriptionStillRunning,
  type OperatorAccount,
  type OperatorCountResult,
} from "./texts";

/**
 * Precog's operator page (B3 §14). Every function answers 404 to anyone whose
 * user id is not in PRECOG_OPERATOR_IDS, before it reads its input, so the
 * page does not exist for anyone else. Each action prints one server log line
 * `[operator] {action} {target id or count name} by {operator id}`; on an
 * account in a firm, the lookup, the link and the cap lift also write the
 * firm's activity log inside the action's own transaction, so a change and
 * its record commit together or not at all.
 */

const CUSTOMER_ID = /^cus_[A-Za-z0-9]{1,250}$/;

function stringField(raw: Record<string, unknown>, key: string, max: number): string {
  const value = typeof raw[key] === "string" ? (raw[key] as string).trim() : "";
  if (!value || value.length > max) throw invalidRequest();
  return value;
}

/** Whether the signed-in account is an operator; 404 otherwise. */
export const getOperatorStatus = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<{ operator: true }> => {
    requireOperator(context.userId);
    return { operator: true };
  });

/**
 * One account by its exact address (compared lower-cased), never a list. A
 * POST, so the address never sits in a URL or a request log.
 */
export const findOperatorAccount = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { email: string }) => input)
  .handler(async ({ context, data }): Promise<{ account: OperatorAccount | null }> => {
    requireOperator(context.userId);
    const email = stringField(requireObject(data), "email", 320).toLowerCase();
    const sql = await getSql();
    const user = await findUserByEmail(sql, email);
    if (!user) {
      console.info("[operator] lookup", "no-match", "by", context.userId);
      return { account: null };
    }
    const account = await inTransaction(sql, async (tx) => {
      const found = await loadOperatorAccount(tx, user);
      if (found.firm) {
        await insertAudit(tx, {
          firmUserId: found.firm.firmUserId,
          actorUserId: context.userId,
          event: "operator_lookup",
          subjectUserId: user.id,
        });
      }
      return found;
    });
    console.info("[operator] lookup", user.id, "by", context.userId);
    return { account };
  });

/** One standing count by name (counts.server.ts); any other name answers 404. */
export const runOperatorCount = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { name: string }) => input)
  .handler(async ({ context, data }): Promise<OperatorCountResult> => {
    // audit: exempt (read-only count; the server log line is the record)
    requireOperator(context.userId);
    const name = requireObject(data).name;
    const sql = await getSql();
    const result = await runCount(sql, name);
    console.info("[operator] count", result.name, "by", context.userId);
    return result;
  });

/**
 * Stores the linked customer's subscription as the account's, as the link
 * script does (scripts/lib/link-stripe-customer.mjs), and moves the firm row
 * with it. Another subscription the account still stores as running (the
 * replaced customer's) is let go first: recordSubscription would keep it as
 * the one the firm pays for, so cancelling it in Stripe would later close
 * the firm and put the replaced customer back. Its later events find this
 * one running and change nothing. A customer with no running subscription
 * never goes over a running one, since the plan would close while Stripe
 * still charges the old one: refused (409), naming it.
 */
async function applyLinkedSubscription(
  tx: Sql,
  userId: string,
  customerId: string,
  applied: StripeSubscription,
): Promise<void> {
  const stored = await loadBillingAccount(tx, userId);
  const other = stored?.subscriptionId ?? null;
  const status = stored?.subscriptionStatus ?? null;
  if (
    other !== null &&
    other !== applied.id &&
    status &&
    ACTIVE_SUBSCRIPTION_STATUSES.has(status)
  ) {
    if (!ACTIVE_SUBSCRIPTION_STATUSES.has(applied.status)) {
      throw new RequestError(409, subscriptionStillRunning(other));
    }
    // The replaced subscription's dunning state is not the new one's.
    await tx`
      update billing_accounts
      set subscription_status = null, past_due_since = null,
        payment_failed_email_sent_at = null, payment_failed_invoice_url = null,
        updated_at = now()
      where user_id = ${userId}
    `;
  }
  // Stamped with the link time: an event Stripe sent before the link
  // (refused then, retried now) is older, so the webhook skips it.
  const recorded = await recordSubscription(tx, {
    userId,
    stripeCustomerId: customerId,
    subscriptionId: applied.id,
    status: applied.status,
    currentPeriodEnd:
      applied.currentPeriodEnd === null
        ? null
        : new Date(applied.currentPeriodEnd * 1000).toISOString(),
    eventAt: new Date().toISOString(),
    priceId: applied.priceId,
  });
  if (recorded.accountDeleted) throw new RequestError(404, noAccountWithId(userId));
  await setFirmPlan(
    tx,
    userId,
    ACTIVE_SUBSCRIPTION_STATUSES.has(recorded.status) ? "monthly" : "assessment",
  );
}

/**
 * Links a Stripe customer set up outside Checkout (a net-30 invoice
 * subscription, a firm marked by hand) to an account, and applies the
 * customer's running subscription at once (applyLinkedSubscription).
 * Refuses a customer with no running subscription unless Replace is ticked
 * on an account that is not marked by hand (decision 36), and every refusal
 * setStripeCustomer makes. Without billing connected nothing is called and
 * nothing written. Answers the account as the lookup reads it after the
 * link, so the page shows every line as it now stands.
 */
export const linkStripeCustomerForAccount = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { userId: string; customerId: string; replace?: boolean }) => input)
  .handler(
    async ({
      context,
      data,
    }): Promise<{
      outcome: "linked" | "unchanged";
      name: string;
      planLabel: string;
      account: OperatorAccount;
    }> => {
      requireOperator(context.userId);
      const raw = requireObject(data);
      const userId = stringField(raw, "userId", 200);
      const customerId = typeof raw.customerId === "string" ? raw.customerId.trim() : "";
      if (!CUSTOMER_ID.test(customerId)) throw new RequestError(400, NOT_A_CUSTOMER_ID);
      const replace = raw.replace === true;
      if (!stripeConfigured()) throw new RequestError(409, BILLING_NOT_CONNECTED);
      const sql = await getSql();
      const user = await findUserById(sql, userId);
      if (!user) throw new RequestError(404, noAccountWithId(userId));

      const { running, applied } = subscriptionToApply(await listCustomerSubscriptions(customerId));
      // Without a running subscription the new row would close the plan;
      // only Replace on an account that is not marked by hand may go ahead.
      if (!running && (!replace || (await isHandMarked(sql, userId)))) {
        throw new RequestError(409, NO_RUNNING_SUBSCRIPTION(customerId));
      }

      const outcome = await inTransaction(sql, async (tx) => {
        const linked = await setStripeCustomer(tx, userId, customerId, { replace });
        if (applied) await applyLinkedSubscription(tx, userId, customerId, applied);
        const firm = await loadFirmFor(tx, userId);
        if (firm) {
          await insertAudit(tx, {
            firmUserId: firm.firmUserId,
            actorUserId: context.userId,
            event: "operator_linked_stripe",
            subjectUserId: userId,
            detail: { customerId, subscriptionId: applied?.id ?? null, replace },
          });
        }
        return linked;
      });
      console.info("[operator] link", userId, "by", context.userId);
      try {
        // The customer names the account, so a later event attributes by it too.
        await updateCustomer(customerId, { email: null, userId });
      } catch (err) {
        await reportServerError(err, "operator-link-metadata");
      }
      const account = await loadOperatorAccount(sql, user);
      return { outcome, name: user.name || user.email, planLabel: account.planLabel, account };
    },
  );

/** Sets the account's model-call count for today back to 0 (the global count stays). */
export const liftDailyCapToday = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { userId: string }) => input)
  .handler(async ({ context, data }): Promise<{ email: string }> => {
    requireOperator(context.userId);
    const userId = stringField(requireObject(data), "userId", 200);
    const sql = await getSql();
    const user = await findUserById(sql, userId);
    if (!user) throw new RequestError(404, noAccountWithId(userId));
    await inTransaction(sql, async (tx) => {
      await tx`
        delete from llm_daily_usage where scope = ${userScope(userId)} and day = current_date
      `;
      const firm = await loadFirmFor(tx, userId);
      if (firm) {
        await insertAudit(tx, {
          firmUserId: firm.firmUserId,
          actorUserId: context.userId,
          event: "operator_lifted_cap",
          subjectUserId: userId,
        });
      }
    });
    console.info("[operator] lift", userId, "by", context.userId);
    return { email: user.email };
  });
