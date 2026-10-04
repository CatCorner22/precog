import type { Sql } from "@/lib/db";
import { reportServerError } from "@/lib/observability/report.server";
import {
  loadBillingAccount,
  markPaymentFailedEmailSent,
  userForCustomer,
} from "../firm/billing-store";
import { PAST_DUE_GRACE_DAYS } from "../firm/entitlements";
import { loadFirmFor } from "../firm/store";
import { mailConfigured, sendEmail } from "../reminders/mailer.server";
import type { RenderedEmail } from "../reminders/email";
import { isSuppressed } from "../reminders/suppression-store";
import { renderPaymentFailed } from "./dunning-email";
import { billingChangeFor, type StripeEvent } from "./stripe";

export type DunningOutcome = "none" | "skipped" | "suppressed" | "sent";

/**
 * After a billing event has been applied and committed: the one email of a
 * failed-payment episode, to the firm owner, once the stored status is
 * past_due and nothing has gone out for this episode. Runs outside the
 * transaction, so a rolled-back event never emails. Without email set up
 * nothing is stamped, so the first connected deployment sends on the next
 * event. A suppressed owner address is reported once and stamped, so one
 * episode reports once; the banner still shows to every member.
 */
export async function afterBillingEvent(
  sql: Sql,
  event: StripeEvent,
  options: { origin: string; send?: (to: string, message: RenderedEmail) => Promise<void> },
): Promise<DunningOutcome> {
  const change = billingChangeFor(event);
  let userId: string | null = null;
  let eventAt: string | null = null;
  if (change.kind === "payment-failed") {
    userId = change.customerId ? await userForCustomer(sql, change.customerId) : null;
    eventAt = change.eventAt;
  } else if (change.kind === "subscription" && change.status === "past_due") {
    userId =
      change.userId ?? (change.customerId ? await userForCustomer(sql, change.customerId) : null);
    eventAt = change.eventAt;
  }
  if (!userId) return "none";
  const account = await loadBillingAccount(sql, userId);
  if (account?.subscriptionStatus !== "past_due" || account.paymentFailedEmailSentAt) return "none";
  if (!mailConfigured()) return "skipped";

  const owners = await sql<{ email: string }>`select email from "user" where id = ${userId}`;
  const email = owners[0]?.email ?? "";
  if (!email.includes("@") || (await isSuppressed(sql, email))) {
    await reportServerError(new Error("dunning email suppressed"), "stripe-dunning");
    await markPaymentFailedEmailSent(sql, userId);
    return "suppressed";
  }
  const firm = await loadFirmFor(sql, userId);
  const since = account.pastDueSince ?? eventAt ?? new Date().toISOString();
  const closesOn = account.pastDueSince
    ? new Date(Date.parse(account.pastDueSince) + PAST_DUE_GRACE_DAYS * 86_400_000)
        .toISOString()
        .slice(0, 10)
    : null;
  const send = options.send ?? sendEmail;
  await send(
    email,
    renderPaymentFailed({
      firmName: firm?.name ?? "your firm",
      failedOn: since.slice(0, 10),
      closesOn,
      fixUrl: account.paymentFailedInvoiceUrl ?? `${options.origin}/firm?billing=overdue`,
    }),
  );
  await markPaymentFailedEmailSent(sql, userId);
  return "sent";
}
