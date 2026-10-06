import type { Sql } from "@/lib/db";
import { escapeHtml, type RenderedEmail } from "../reminders/email";
import { NOT_SUPPRESSED } from "../reminders/suppression-store";
import { eligibleReviewers, type ReportVersionRow } from "./reports";
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

/** How the emails go out; tests and callers without a request pass their own. */
export interface ReviewMailOptions {
  send?: (to: string, message: RenderedEmail) => Promise<void>;
  configured?: () => boolean;
  origin?: () => string;
  report?: (err: unknown, at: string) => Promise<void>;
}

/** The subject of the request email. */
export function reviewRequestedSubject(clientName: string, versionNo: number): string {
  return `Review requested: ${clientName} version ${versionNo}`;
}

/** The subject of the return email. */
export function returnedSubject(clientName: string, versionNo: number): string {
  return `Returned: ${clientName} version ${versionNo}`;
}

export function renderReviewRequested(input: {
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

export function renderReturned(input: {
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
  options: ReviewMailOptions = {},
): Promise<void> {
  await guarded(options, "review-requested-email", async (o) => {
    const { version } = input;
    const recipients = version.reviewRequestedFrom
      ? [version.reviewRequestedFrom]
      : await firmReviewers(sql, input.ownerUserId, version);
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
      link: versionLink(o.origin(), version.id),
    });
    await sendEach(sql, { ownerUserId: input.ownerUserId, businessId: version.businessId }, to, {
      message,
      o,
    });
  });
}

/** Emails the preparer of a returned version. Never throws. */
export async function mailReturned(
  sql: Sql,
  input: { ownerUserId: string; version: ReportVersionRow; returnedBy: string },
  options: ReviewMailOptions = {},
): Promise<void> {
  await guarded(options, "version-returned-email", async (o) => {
    const { version } = input;
    if (!version.preparedBy || version.preparedBy === input.returnedBy) return;
    const clientName = await clientNameOf(sql, input.ownerUserId, version.businessId);
    const message = renderReturned({
      clientName,
      versionNo: version.versionNo,
      returnerName: version.returnedByName,
      note: version.returnNote,
      link: versionLink(o.origin(), version.id),
    });
    await sendEach(
      sql,
      { ownerUserId: input.ownerUserId, businessId: version.businessId },
      [version.preparedBy],
      { message, o },
    );
  });
}

type ResolvedOptions = Required<ReviewMailOptions>;

async function guarded(
  options: ReviewMailOptions,
  at: string,
  run: (o: ResolvedOptions) => Promise<void>,
): Promise<void> {
  const report =
    options.report ??
    (async (err: unknown, where: string) => {
      const { reportServerError } = await import("@/lib/observability/report.server");
      await reportServerError(err, where);
    });
  try {
    const mailer =
      options.send && options.configured ? null : await import("../reminders/mailer.server");
    const configured = options.configured ?? mailer!.mailConfigured;
    if (!configured()) return;
    const origin = options.origin ?? (await import("@/lib/request-origin.server")).requestOrigin;
    await run({ send: options.send ?? mailer!.sendEmail, configured, origin, report });
  } catch (err) {
    // The request or return is stored; the email is a courtesy on top.
    await report(err, at).catch(() => undefined);
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
  mail: { message: RenderedEmail; o: ResolvedOptions },
): Promise<void> {
  const { message, o } = mail;
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
      await o.send(row.email, message);
    } catch (err) {
      await o.report(err, "review-email").catch(() => undefined);
    }
  }
}

async function firmReviewers(
  sql: Sql,
  ownerUserId: string,
  version: ReportVersionRow,
): Promise<string[]> {
  const rows = await sql<{ firm_user_id: string | null }>`
    select firm_user_id from businesses
    where user_id = ${ownerUserId} and id = ${version.businessId}
  `;
  const firmUserId = rows[0]?.firm_user_id;
  return firmUserId ? eligibleReviewers(sql, firmUserId, version.preparedBy) : [];
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
