import { escapeHtml, type RenderedEmail } from "../reminders/email";
import type { InviteRole } from "./store";

/** The email that carries a firm invitation link to the colleague it names. */
export function renderFirmInvitation(input: {
  firmName: string;
  inviterName: string | null;
  role: InviteRole;
  link: string;
}): RenderedEmail {
  const who = input.inviterName ? `${input.inviterName} invited you` : "You are invited";
  const intro = `${who} to join ${input.firmName} on Precog as a ${input.role}.`;
  const duty = ROLE_DUTY[input.role];
  const closing = "The link works once and expires in two weeks. Sign in, then open it to join.";
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

const ROLE_DUTY: Record<InviteRole, string> = {
  preparer: "A preparer maps clients, records reviews and locks reports.",
  reviewer: "A reviewer maps clients too and signs off reports someone else prepared.",
};
