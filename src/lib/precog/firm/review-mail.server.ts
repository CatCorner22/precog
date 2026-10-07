import type { Sql } from "@/lib/db";
import { escapeHtml, type RenderedEmail } from "../reminders/email";
import { NOT_SUPPRESSED } from "../reminders/suppression-store";
import { businessReviewers, type ReportVersionRow } from "./reports";
import { TRUSTED_EMAIL } from "./vouched-email";

/**
 * The two emails of the review workflow (CPA-9), sent after the request or
 * the return is stored:
 * - "Review requested: <client> version N", to the reviewer the request
 *   names, or to every owner and reviewer of the firm who did not prepare
 *   the version when it names none;
 * - "Returned: <client> version N", with the note, to the preparer.
 * Nobody receives an email about their own action. On a business with a
 * firm, only a current member of that firm receives one: a preparer who
 * left the firm, or was removed from it, never learns the client's name or
 * the note this way. Only an address Precog
 * vouches for (TRUSTED_EMAIL, as for the weekly digest) receives one, and an
 * address on the suppression list (bounced or complained) receives none. Without email set
 * up nothing is sent. A failure is reported and never fails the request the
 * reviewer or preparer made: the request or return is already stored.
 */

/** How an email goes out once this deployment can send one. */
type Send = (to: string, message: RenderedEmail) => Promise<void>;

/** The subject of the request email. */
function reviewRequestedSubject(clientName: string, versionNo: number): string {
  return `Review requested: ${clientName} version ${versionNo}`;
}

/** The subject of the return email. */
function returnedSubject(clientName: string, versionNo: number): string {
  return `Returned: ${clientName} version ${versionNo}`;
}

function renderReviewRequested(input: {
  clientName: string;
  versionNo: number;
  requesterName: string | null;
  link: string;
}): RenderedEmail {
  const who = input.requesterName ?? "A member of your firm";
  const intro = `${who} asked for a review for issuance of version ${input.versionNo} of the ${input.clientName} report.`;
  const next =
    "Open the version to review it for issuance, or return it to its preparer with a note.";
  return simpleEmail(reviewRequestedSubject(input.clientName, input.versionNo), [intro, next], {
    link: input.link,
    label: `Open version ${input.versionNo}`,
  });
}

function renderReturned(input: {
  clientName: string;
  versionNo: number;
  returnerName: string | null;
  note: string;
  link: string;
}): RenderedEmail {
  const who = input.returnerName ?? "A reviewer at your firm";
  const intro = `${who} returned version ${input.versionNo} of the ${input.clientName} report to you.`;
  const note = `What to change: ${input.note}`;
  const next = "Make the changes, then lock a new version and ask for review again.";
  return simpleEmail(returnedSubject(input.clientName, input.versionNo), [intro, note, next], {
    link: input.link,
    label: `Open version ${input.versionNo}`,
  });
}

/** Emails the reviewers a request reached. Never throws. */
export async function mailReviewRequested(
  sql: Sql,
  input: { ownerUserId: string; version: ReportVersionRow; requestedBy: string },
): Promise<void> {
  await guarded("review-requested-email", async (send, origin) => {
    const { version } = input;
    const recipients = version.reviewRequestedFrom
      ? [version.reviewRequestedFrom]
      : await businessReviewers(sql, input.ownerUserId, version.businessId, version.preparedBy);
    const to = recipients.filter((id) => id !== input.requestedBy);
    if (to.length === 0) return;
    const [clientName, requesterName] = await Promise.all([
      clientNameOf(sql, input.ownerUserId, version.businessId),
      nameOf(sql, input.requestedBy),
    ]);
    const message = renderReviewRequested({
      clientName,
      versionNo: version.versionNo,
      requesterName,
      link: versionLink(origin(), version.id),
    });
    await sendEach(sql, { ownerUserId: input.ownerUserId, businessId: version.businessId }, to, {
      message,
      send,
    });
  });
}

/** Emails the preparer of a returned version. Never throws. */
export async function mailReturned(
  sql: Sql,
  input: { ownerUserId: string; version: ReportVersionRow; returnedBy: string },
): Promise<void> {
  await guarded("version-returned-email", async (send, origin) => {
    const { version } = input;
    if (!version.preparedBy || version.preparedBy === input.returnedBy) return;
    const clientName = await clientNameOf(sql, input.ownerUserId, version.businessId);
    const message = renderReturned({
      clientName,
      versionNo: version.versionNo,
      returnerName: version.returnedByName,
      note: version.returnNote,
      link: versionLink(origin(), version.id),
    });
    await sendEach(
      sql,
      { ownerUserId: input.ownerUserId, businessId: version.businessId },
      [version.preparedBy],
      { message, send },
    );
  });
}

/**
 * Runs one email's work once this deployment can send email, with the mailer
 * and the request's origin, which the work reads only when someone gets mail.
 * A failure is reported, never thrown.
 */
async function guarded(
  at: string,
  run: (send: Send, origin: () => string) => Promise<void>,
): Promise<void> {
  try {
    const { mailConfigured, sendEmail } = await import("../reminders/mailer.server");
    if (!mailConfigured()) return;
    const { requestOrigin } = await import("@/lib/request-origin.server");
    await run(sendEmail, requestOrigin);
  } catch (err) {
    // The request or return is stored; the email is a courtesy on top.
    await report(err, at);
  }
}

/** Reports a failed email. A report that fails is dropped, so this never throws. */
async function report(err: unknown, at: string): Promise<void> {
  try {
    const { reportServerError } = await import("@/lib/observability/report.server");
    await reportServerError(err, at);
  } catch {
    // The request or return stands either way.
  }
}

/**
 * Sends to each account's trusted, unsuppressed address, among the accounts
 * still members of the business's firm (any account when the business has
 * no firm); one failure does not stop the rest. Membership is read as the
 * email goes out, so someone who left after the version was locked, or
 * after the request named them, receives nothing.
 */
async function sendEach(
  sql: Sql,
  business: { ownerUserId: string; businessId: string },
  userIds: string[],
  mail: { message: RenderedEmail; send: Send },
): Promise<void> {
  const { message, send } = mail;
  const rows = await sql.query<{ email: string }>(
    `select u.email from "user" u
     join businesses b on b.user_id = $2 and b.id = $3
     where u.id = any($1::text[])
       and (b.firm_user_id is null or exists (
         select 1 from firm_members m
         where m.firm_user_id = b.firm_user_id and m.member_user_id = u.id))
       and position('@' in u.email) > 0
       and ${TRUSTED_EMAIL("u")}
       and ${NOT_SUPPRESSED("u.email")}`,
    [userIds, business.ownerUserId, business.businessId],
  );
  for (const row of rows) {
    try {
      await send(row.email, message);
    } catch (err) {
      await report(err, "review-email");
    }
  }
}

async function clientNameOf(sql: Sql, ownerUserId: string, businessId: string): Promise<string> {
  const rows = await sql<{ name: string }>`
    select name from businesses where user_id = ${ownerUserId} and id = ${businessId}
  `;
  return rows[0]?.name?.trim() || "your client";
}

async function nameOf(sql: Sql, userId: string): Promise<string | null> {
  const rows = await sql<{ name: string | null }>`select name from "user" where id = ${userId}`;
  return rows[0]?.name?.trim() || null;
}

function versionLink(origin: string, id: string): string {
  return `${origin}/report?version=${encodeURIComponent(id)}`;
}

function simpleEmail(
  subject: string,
  lines: string[],
  action: { link: string; label: string },
): RenderedEmail {
  return {
    subject,
    text: [...lines, "", `${action.label}: ${action.link}`].join("\n"),
    html:
      `<div style="font:14px/1.5 -apple-system,Segoe UI,sans-serif;color:#111;max-width:560px">` +
      lines.map((line) => `<p>${escapeHtml(line)}</p>`).join("") +
      `<p><a href="${escapeHtml(action.link)}">${escapeHtml(action.label)}</a></p></div>`,
  };
}
