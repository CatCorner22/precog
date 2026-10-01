import { escapeHtml, type RenderedEmail } from "../reminders/email";
import type { InviteRole } from "./store";

/** The email that carries a firm invitation link to the colleague it names. */
export function renderFirmInvitation(input: {
  firmName: string;
  inviterName: string | null;
  role: InviteRole;
  link: string;
}): RenderedEmail {
  const who = input.inviterName ? `${input.inviterName} invited you` : "The firm invites you";
  const intro = `${who} to join ${input.firmName} on Precog as a ${input.role}.`;
  const duty = ROLE_DUTY[input.role];
  const closing =
    "The link works once and expires in two weeks. Sign in with this email address, then open it to join.";
  return {
    subject: `Join ${input.firmName} on Precog`,
    text: [intro, duty, "", input.link, "", closing].join("\n"),
    html:
      `<div style="font:14px/1.5 -apple-system,Segoe UI,sans-serif;color:#111;max-width:560px">` +
      `<p>${escapeHtml(intro)} ${escapeHtml(duty)}</p>` +
      `<p><a href="${escapeHtml(input.link)}">Join ${escapeHtml(input.firmName)}</a></p>` +
      `<p style="color:#6b7280;font-size:12px">${escapeHtml(closing)}</p></div>`,
  };
}

/**
 * To the firm owner, when someone joined with an invitation Precog could not
 * match to their account: who joined, as what, and how to undo it.
 */
export function renderUnmatchedJoin(input: {
  firmName: string;
  role: string;
  memberName: string | null;
  accountEmail: string;
  invitedEmail: string;
  link: string;
}): RenderedEmail {
  const who = input.memberName ? `${input.memberName} (${input.accountEmail})` : input.accountEmail;
  const intro = `${who} joined ${input.firmName} as a ${input.role} with the invitation you sent to ${input.invitedEmail}.`;
  const why =
    "Precog could not match their sign-in to that address, so they confirmed they are the person you invited.";
  const action = "If you did not expect this, remove them in the firm workspace:";
  return {
    subject: `${input.accountEmail} joined ${input.firmName} on Precog`,
    text: [intro, why, "", action, input.link].join("\n"),
    html:
      `<div style="font:14px/1.5 -apple-system,Segoe UI,sans-serif;color:#111;max-width:560px">` +
      `<p>${escapeHtml(intro)} ${escapeHtml(why)}</p>` +
      `<p>${escapeHtml(action)} <a href="${escapeHtml(input.link)}">Open the firm workspace</a></p></div>`,
  };
}

const ROLE_DUTY: Record<InviteRole, string> = {
  preparer:
    "A preparer maps clients, records monthly review results and control checks, and locks reports.",
  reviewer:
    "A reviewer does what a preparer does, reviews control checks, and signs off reports that someone else prepared.",
};
