import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { RequestError, requireObject } from "@/lib/request-errors";
import { requireBusinessOwner } from "./access.server";
import {
  acceptGrant,
  createGrant,
  endGrant,
  loadGrantFor,
  peekGrant,
  type CreatedGrant,
} from "./grant-store";
import { businessInput, EMAIL, tokenInput } from "./server-inputs";

/** The refusal when someone other than the business's own account invites a firm to it. */
export const ONLY_OWNER_INVITES =
  "Only the business's own account can invite a firm to work on it.";

/**
 * The business owner's side of a client invitation (B3 §8): invite a firm
 * owner by address, see the firm working on the business or the invitation
 * waiting, and end the firm's access. The firm owner's side: peek at the
 * link, accept it, and hand the business back.
 */
export const inviteFirmToBusiness = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { businessId: string; email: string }) => {
    const raw = requireObject(input);
    const email = typeof raw.email === "string" ? raw.email.trim().toLowerCase() : "";
    if (!EMAIL.test(email)) throw new RequestError(400, "Enter the firm owner's email address");
    return { ...businessInput(input), email: email.slice(0, 200) };
  })
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const owner = await requireBusinessOwner(sql, context.userId, data.businessId);
    if (owner !== context.userId) throw new RequestError(403, ONLY_OWNER_INVITES);
    const grant = await createGrant(sql, {
      ownerUserId: owner,
      businessId: data.businessId,
      email: data.email,
    });
    const { requestOrigin } = await import("@/lib/request-origin.server");
    const url = `${requestOrigin()}/join/client/${grant.token}`;
    const emailed = await emailGrant(sql, owner, data.businessId, grant, url);
    return { emailed, url, email: grant.email, expiresAt: grant.expiresAt };
  });

/**
 * The firm working on a business its owner shared, or the invitation waiting
 * (shown to the business's own account only). `own` says whether the caller
 * is the business's own account, and `canInvite` whether the "Your
 * accountant" card applies: the caller's own business with no firm, or one
 * it shared with a firm.
 */
export const getBusinessGrant = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(businessInput)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const owner = await requireBusinessOwner(sql, context.userId, data.businessId);
    const own = owner === context.userId;
    const rows = await sql<{ firm_user_id: string | null; granted: boolean }>`
      select firm_user_id, granted_at is not null as granted from businesses
      where user_id = ${owner} and id = ${data.businessId}
    `;
    const row = rows[0];
    const grant = await loadGrantFor(sql, owner, data.businessId);
    return {
      own,
      canInvite: own && Boolean(row) && (row.firm_user_id === null || row.granted),
      grant: own || (grant !== null && "firmName" in grant) ? grant : null,
    };
  });

/** What a client invitation link shows before anyone signs in; null for an unknown link. */
export const peekClientGrant = createServerFn({ method: "GET" })
  .validator(tokenInput)
  .handler(async ({ data }) => {
    const [{ requestIp }, { takeInvitePeekAllowance }] = await Promise.all([
      import("@/lib/request-ip.server"),
      import("./server"),
    ]);
    // Tokens carry 48 hex characters; this only keeps a prober from hammering.
    takeInvitePeekAllowance(requestIp());
    const sql = await getSql();
    return { grant: await peekGrant(sql, data.token) };
  });

/** The firm owner accepts: the business joins the firm's client list. */
export const acceptClientGrant = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(tokenInput)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const accepted = await acceptGrant(sql, data.token, context.userId);
    return { businessName: accepted.businessName, businessId: accepted.businessId };
  });

/**
 * Ends the firm's access to a business its owner shared: the business's own
 * account ("End the firm's access") or the firm owner ("Hand back to its
 * owner"). With no firm on the business, it closes the waiting invitation.
 */
export const endFirmAccess = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(businessInput)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const owner = await requireBusinessOwner(sql, context.userId, data.businessId);
    await endGrant(sql, {
      ownerUserId: owner,
      businessId: data.businessId,
      actorUserId: context.userId,
    });
    return { ok: true as const };
  });

/** Sends the invitation when email is connected; true when it went. */
async function emailGrant(
  sql: Awaited<ReturnType<typeof getSql>>,
  ownerUserId: string,
  businessId: string,
  grant: CreatedGrant,
  url: string,
): Promise<boolean> {
  const [{ mailConfigured, sendEmail }, { renderClientGrantInvitation }] = await Promise.all([
    import("../reminders/mailer.server"),
    import("./grant-email"),
  ]);
  if (!mailConfigured()) return false;
  const rows = await sql<{ owner_name: string | null; owner_email: string; name: string }>`
    select u.name as owner_name, u.email as owner_email, b.name
    from businesses b join "user" u on u.id = b.user_id
    where b.user_id = ${ownerUserId} and b.id = ${businessId}
  `;
  const row = rows[0];
  if (!row) return false;
  try {
    await sendEmail(
      grant.email,
      renderClientGrantInvitation({
        ownerName: row.owner_name || row.owner_email,
        businessName: row.name,
        url,
        expiresAt: grant.expiresAt,
      }),
    );
    return true;
  } catch (err) {
    const { reportServerError } = await import("@/lib/observability/report.server");
    await reportServerError(err, "client-grant-email");
    return false;
  }
}
