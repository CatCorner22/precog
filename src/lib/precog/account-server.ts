import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { RequestError, requireObject } from "@/lib/request-errors";
import {
  deleteAccountRows,
  encodeHistoryPage,
  exportAccountRows,
  exportBusinessHistoryPage,
  listAccountHistoryBusinesses,
} from "./account-store";
import { isBusinessId } from "./profile-input";
import { loadFirmFor } from "./firm/store";
import { recordAuditForAccount } from "./firm/audit.server";
import { SUPPORT_EMAIL } from "./legal/operator";
import { formatDay, utcDateKey } from "./dates";
import { escapeHtml, type RenderedEmail } from "./reminders/email";
import { decryptSecret, qboConfigured, revokeToken } from "./integrations/qbo/client.server";

/**
 * Everything the account holds, for the owner to keep. Serialised here because
 * the stored JSON columns have no static shape the transport layer can check.
 */
export const exportAccountData = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const firmUserId = await ownedFirm(sql, context.userId);
    const json = JSON.stringify(await exportAccountRows(sql, context.userId, firmUserId), null, 2);
    await recordAuditForAccount(sql, context.userId, {
      actorUserId: context.userId,
      event: "export_run",
      detail: { kind: "account" },
    });
    return { json };
  });

/** The firm the account owns, whose members' clients its export and history list hold; null otherwise. */
async function ownedFirm(sql: Awaited<ReturnType<typeof getSql>>, userId: string) {
  const firm = await loadFirmFor(sql, userId);
  return firm?.role === "owner" ? firm.firmUserId : null;
}

/** The account's businesses with past versions, for the Download history list. */
export const listHistoryDownloads = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const firmUserId = await ownedFirm(sql, context.userId);
    return { businesses: await listAccountHistoryBusinesses(sql, context.userId, firmUserId) };
  });

/**
 * One page of a business's past versions (see exportBusinessHistoryPage). The
 * client asks again with `nextBeforeRevision` until it is null and joins the
 * pages into one file. Sent as base64 JSON (see encodeHistoryPage) so a page's
 * size on the wire stays bounded whatever the profiles hold.
 */
export const exportBusinessHistory = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(
    (input: {
      businessId: string;
      beforeRevision?: number | null;
      ownerUserId?: string | null;
    }) => {
      const raw = requireObject(input);
      if (!isBusinessId(raw.businessId)) throw new RequestError(400, "Unknown business");
      const before = raw.beforeRevision ?? null;
      if (before !== null && (!Number.isInteger(before) || Number(before) < 1)) {
        throw new RequestError(400, "Unknown revision");
      }
      // The list row's account; the store accepts it only through the caller's firm.
      const owner = raw.ownerUserId ?? null;
      if (owner !== null && (typeof owner !== "string" || !owner || owner.length > 128)) {
        throw new RequestError(400, "Unknown business");
      }
      return {
        businessId: raw.businessId,
        beforeRevision: before === null ? null : Number(before),
        ownerUserId: owner,
      };
    },
  )
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const page = await exportBusinessHistoryPage(
      sql,
      context.userId,
      data.businessId,
      data.beforeRevision,
      undefined,
      await ownedFirm(sql, context.userId),
      data.ownerUserId,
    );
    // One row per download: its first page, when it holds a version. An
    // empty first page (a business the caller cannot read, or one with no
    // past versions) downloaded nothing.
    if (data.beforeRevision === null && page.rows.length > 0) {
      await recordAuditForAccount(sql, context.userId, {
        actorUserId: context.userId,
        event: "export_run",
        businessId: data.businessId,
        detail: { kind: "history" },
      });
    }
    return { base64: encodeHistoryPage(page.rows), nextBeforeRevision: page.nextBeforeRevision };
  });

/**
 * Deletes the account and everything it owns, then revokes its QuickBooks
 * connections at Intuit and deletes its Stripe customer. Refused (409) while
 * the firm plan is billing or the account holds another firm's clients (see
 * deleteAccountRows), and refused (403) unless the session began within
 * FRESH_SESSION_MINUTES, so a session left open or taken cannot delete the
 * account. Once the deletion has committed, the account's address gets a
 * notice; a failed send is reported and the deletion stands. The client signs
 * out and clears its local copies afterwards; nothing here can be undone.
 */
export const deleteAccount = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { confirm: string }) => {
    if (input?.confirm !== "DELETE") throw new RequestError(400, "Type DELETE to confirm");
    return { confirm: "DELETE" as const };
  })
  .handler(async ({ context }) => {
    // audit: exempt (deleteAccountRows writes member_left and client_handed_back to the other firms the account leaves; its own firm's log goes with it)
    const { requireFreshSession } = await import("@/lib/auth/fresh-session");
    const { email } = await requireFreshSession({
      userId: context.userId,
      bearerToken: context.bearerToken,
      message: SIGN_IN_AGAIN_TO_DELETE,
    });
    const sql = await getSql();
    // Commits before it returns; everything after it is best effort.
    const deleted = await deleteAccountRows(sql, context.userId);
    await revokeQuickBooksTokens(deleted.quickBooksRefreshTokens);
    await deleteStripeCustomer(deleted.stripeCustomerId);
    await sendAccountDeletedEmail(email, new Date());
    return { ok: true as const };
  });

/** The refusal when the session began more than FRESH_SESSION_MINUTES ago. */
export const SIGN_IN_AGAIN_TO_DELETE = "For your safety, sign in again, then delete your account.";

/** The notice to the deleted account's address. The day is the UTC day of the deletion. */
export function renderAccountDeletedEmail(deletedAt: Date): RenderedEmail {
  const text = `Your Precog account was deleted on ${formatDay(utcDateKey(deletedAt))}. If you did not do this, write to ${SUPPORT_EMAIL}.`;
  return {
    subject: "Your Precog account was deleted",
    text,
    html: `<p>${escapeHtml(text)}</p>`,
  };
}

/**
 * Best effort, after the deletion has committed: a failed send is reported,
 * never thrown, so it cannot undo or block the deletion. Nothing goes out
 * when the account has no address or this deployment has no email set up.
 */
export async function sendAccountDeletedEmail(to: string | null, deletedAt: Date): Promise<void> {
  if (!to) return;
  try {
    const { mailConfigured, sendEmail } = await import("./reminders/mailer.server");
    if (!mailConfigured()) return;
    await sendEmail(to, renderAccountDeletedEmail(deletedAt));
  } catch (error) {
    try {
      const { reportServerError } = await import("@/lib/observability/report.server");
      await reportServerError(error, "account-deleted-email");
    } catch {
      console.error(
        "[account] Deletion notice not sent:",
        error instanceof Error ? error.message : error,
      );
    }
  }
}

/** Best effort, as above: Stripe keeps the invoices and tax records either way. */
async function deleteStripeCustomer(customerId: string | null): Promise<void> {
  if (!customerId) return;
  try {
    const { deleteCustomer } = await import("./billing/stripe.server");
    await deleteCustomer(customerId);
  } catch (error) {
    console.error(
      "[account] Stripe customer not deleted:",
      error instanceof Error ? error.message : error,
    );
  }
}

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
