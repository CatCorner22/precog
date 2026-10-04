import { formatDay } from "../dates";
import { escapeHtml, type RenderedEmail } from "../reminders/email";

/**
 * The email that carries a business owner's client invitation to the firm
 * owner's address. Pure, so its words are pinned without a mailer.
 */
export function renderClientGrantInvitation(input: {
  ownerName: string;
  businessName: string;
  url: string;
  /** ISO timestamp the link stops working. */
  expiresAt: string;
}): RenderedEmail {
  const { ownerName: owner, businessName: business, url } = input;
  const intro = `${owner} invites your firm to work on ${business} in Precog. Open this link to add it to your firm's client list; the business stays ${owner}'s:`;
  const footer = `You receive this because ${owner} entered your address in Precog. The link expires on ${formatDay(input.expiresAt)}.`;
  return {
    subject: `Precog: ${owner} invites your firm to work on ${business}`,
    text: [`${intro} ${url}`, "", footer].join("\n"),
    html:
      `<div style="font:14px/1.5 -apple-system,Segoe UI,sans-serif;color:#111;max-width:560px">` +
      `<p>${escapeHtml(intro)} <a href="${escapeHtml(url)}">${escapeHtml(url)}</a></p>` +
      `<p style="color:#6b7280;font-size:12px">${escapeHtml(footer)}</p></div>`,
  };
}
