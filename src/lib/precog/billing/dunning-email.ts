import { escapeHtml, type RenderedEmail } from "../reminders/email";

/**
 * The one email a firm owner gets when the Firm plan's payment fails. Days
 * are "YYYY-MM-DD" as the Plan card prints them; `closesOn` is null while
 * Precog does not know when the failed payment started, in which case the
 * plan stays open while Stripe retries.
 */
export function renderPaymentFailed(input: {
  firmName: string;
  failedOn: string;
  closesOn: string | null;
  fixUrl: string;
}): RenderedEmail {
  const declined = `The payment for the Firm plan for ${input.firmName} failed on ${input.failedOn}.`;
  const closes =
    "the QuickBooks link, new locked report versions, member invitations and owner reminder emails close until the payment goes through.";
  const retry = input.closesOn
    ? `Stripe will try again over the next 14 days. Precog keeps the plan open until ${input.closesOn}; after that ${closes}`
    : `Stripe will try again over the next 14 days, and Precog keeps the plan open while it does; after that ${closes}`;
  const stays =
    "The Monthly review for your clients and every locked version you already hold stay open.";
  const because = `You receive this because you own ${input.firmName} on Precog.`;
  return {
    subject: "Precog: the Firm plan payment failed",
    text: [`${declined} ${retry} ${stays} Fix the payment: ${input.fixUrl}`, "", because].join(
      "\n",
    ),
    html:
      `<div style="font:14px/1.5 -apple-system,Segoe UI,sans-serif;color:#111;max-width:560px">` +
      `<p>${escapeHtml(declined)} ${escapeHtml(retry)} ${escapeHtml(stays)}</p>` +
      `<p><a href="${escapeHtml(input.fixUrl)}">Fix the payment</a></p>` +
      `<p style="color:#6b7280;font-size:12px">${escapeHtml(because)}</p></div>`,
  };
}
