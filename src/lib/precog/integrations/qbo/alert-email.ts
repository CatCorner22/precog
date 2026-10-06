import { formatDay } from "../../dates";
import { count } from "../../text";
import { escapeHtml, type RenderedEmail } from "../../reminders/email";

/**
 * Warn this many days before Intuit's permission ends: a healthy connection
 * is read every 28 days, so the firm has one scheduled reading's worth of
 * time. The scheduled alert and the digest's count read the same figure.
 */
export const EXPIRY_WARNING_DAYS = 30;

/**
 * One problem on one client's QuickBooks connection. Days are "YYYY-MM-DD"
 * (the UTC day of the stored time), so the email prints the same day
 * whatever the server's clock zone.
 */
export interface QuickBooksAlertItem {
  businessName: string;
  kind: "failed" | "lapsing" | "lapsed";
  /** The failure sentence stored on the connection (kind "failed"). */
  detail?: string | null;
  /** The day the reading failed; null for a failure recorded before Precog kept the day. */
  when?: string | null;
  /** The day of the last successful reading, when there was one. */
  lastReadOn?: string | null;
  /** The day Intuit's permission ends or ended (kinds "lapsing" and "lapsed"). */
  lapsesOn?: string | null;
}

/**
 * The service notice to the firm owner about QuickBooks connections that
 * need attention: one email per account, one paragraph per problem, sent
 * once per problem by the scheduled run. No stop link: it concerns a
 * connection the firm set up, not the weekly digest.
 */
export function renderQuickBooksAlert(input: {
  firmName: string | null;
  items: QuickBooksAlertItem[];
  link: string;
}): RenderedEmail {
  const names = [...new Set(input.items.map((i) => i.businessName))];
  const subject = `Precog: QuickBooks needs attention for ${
    names.length === 1 ? names[0] : count(names.length, "client")
  }`;
  const lines = input.items.map(itemText);
  const where = input.firmName ? `in ${input.firmName} on Precog` : "in your Precog account";
  const because = `You receive this because ${listNames(names)} ${
    names.length === 1 ? "is" : "are"
  } connected to QuickBooks ${where}. Precog sends it once per problem.`;
  const text = [
    ...lines.flatMap((line) => [line, ""]),
    `Open the firm workspace: ${input.link}`,
    "",
    because,
  ].join("\n");
  const html =
    `<div style="font:14px/1.5 -apple-system,Segoe UI,sans-serif;color:#111;max-width:560px">` +
    `<p style="font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:#6b7280;margin:0">${escapeHtml(
      input.firmName ?? "Precog",
    )}</p>` +
    `<h2 style="margin:4px 0 12px;font-size:18px">QuickBooks needs attention</h2>` +
    lines.map((line) => `<p>${escapeHtml(line)}</p>`).join("") +
    `<p style="margin-top:20px"><a href="${escapeHtml(input.link)}">Open the firm workspace</a></p>` +
    `<p style="color:#6b7280;font-size:12px">${escapeHtml(because)}</p>` +
    `</div>`;
  return { subject, text, html };
}

function itemText(item: QuickBooksAlertItem): string {
  const day = (value: string | null | undefined) => (value ? formatDay(value) : "");
  switch (item.kind) {
    case "failed": {
      const when = item.when ? `on ${day(item.when)}` : "on an earlier reading";
      const detail = (item.detail ?? "").trim();
      const first = `Precog could not read the QuickBooks books of ${item.businessName} ${when}: ${detail}`;
      if (!item.lastReadOn) return first;
      return `${first} Until it is read again, the vendor and employee-list comparison uses the reading of ${day(item.lastReadOn)}. Payment status is not checked by this reading.`;
    }
    case "lapsing":
      return `QuickBooks' permission for ${item.businessName} ends on ${day(item.lapsesOn)}. Open the client and read the books before then to renew it, or connect QuickBooks again after.`;
    case "lapsed":
      return `QuickBooks' permission for ${item.businessName} ended on ${day(item.lapsesOn)}, so the monthly reading has stopped. Open the client, disconnect, then connect QuickBooks again.`;
  }
}

/** "Ortiz Dental", "Ortiz Dental and Hill Dental", "A, B and C". */
function listNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}
