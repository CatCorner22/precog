import { escapeHtml, type RenderedEmail } from "@/lib/precog/reminders/email";

/**
 * The two emails behind email/password sign-in: the link that confirms a new
 * address, and the link that sets a new password. Plain and short, like the
 * reminders.
 */
export function renderVerifyEmail(input: { email: string; url: string }): RenderedEmail {
  const intro = `Open this link to confirm ${input.email} for your Precog account. The link works for 24 hours.`;
  const closing = "If you did not ask for a Precog account, ignore this email.";
  return {
    subject: "Confirm your email for Precog",
    text: [intro, "", input.url, "", closing].join("\n"),
    html: linkHtml(intro, input.url, "Confirm my email", closing),
  };
}

export function renderPasswordReset(input: { email: string; url: string }): RenderedEmail {
  const intro = `Open this link to set a new Precog password for ${input.email}. The link works for one hour.`;
  const closing = "If you did not ask for this, ignore this email. Your password stays the same.";
  return {
    subject: "Set a new Precog password",
    text: [intro, "", input.url, "", closing].join("\n"),
    html: linkHtml(intro, input.url, "Set a new password", closing),
  };
}

function linkHtml(intro: string, url: string, label: string, closing: string): string {
  return (
    `<div style="font:14px/1.5 -apple-system,Segoe UI,sans-serif;color:#111;max-width:560px">` +
    `<p>${escapeHtml(intro)}</p>` +
    `<p><a href="${escapeHtml(url)}">${escapeHtml(label)}</a></p>` +
    `<p style="color:#6b7280;font-size:12px">${escapeHtml(closing)}</p></div>`
  );
}
