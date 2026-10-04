import { formatDay } from "../dates";
import { count } from "../text";
import type { ReminderItem } from "./due-items";

/**
 * The reminder messages, as plain text and simple HTML. Text first: these
 * land in accountants' inboxes, where a clear list beats a designed email.
 */
interface DigestClient {
  businessId: string;
  businessName: string;
  items: ReminderItem[];
}

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
  /** Where a reply goes; the platform's EMAIL_REPLY_TO when absent. */
  replyTo?: string;
  /** Extra mail headers, for example List-Unsubscribe. */
  headers?: Record<string, string>;
}

/**
 * The advisor's weekly digest across every client with something due. Each
 * item links to its business and tab on the home page; the stop link turns
 * the digest off for this account alone, with no sign-in, and also goes out
 * as the one-click List-Unsubscribe header that mail apps show.
 */
export function renderDigest(input: {
  firmName: string | null;
  clients: DigestClient[];
  appUrl: string;
  unsubscribeUrl: string;
  /** Connected clients whose QuickBooks reading failed or whose permission is about to end. */
  quickBooks?: { needAttention: number };
}): RenderedEmail {
  const needAttention = input.quickBooks?.needAttention ?? 0;
  const quickBooksLine =
    needAttention > 0
      ? `QuickBooks needs attention for ${count(needAttention, "client")}. See the firm workspace.`
      : null;
  const total = input.clients.reduce((n, c) => n + c.items.length, 0);
  const overdue = input.clients.reduce((n, c) => n + c.items.filter((i) => i.overdue).length, 0);
  const subject = `Precog: ${digestSubject(input.firmName, input.clients, total, overdue)}`;
  const heading = input.firmName ? `${input.firmName}: weekly digest` : "Weekly digest";
  const because = "You receive this because the weekly digest is on in your Precog account.";
  const optOut = `${because} Stop it: ${input.unsubscribeUrl}`;
  const itemUrl = (client: DigestClient, item: ReminderItem) =>
    `${input.appUrl}/?business=${encodeURIComponent(client.businessId)}&${item.href.replace(/^\?/, "")}`;

  const textSections = input.clients.map((client) =>
    [
      client.businessName,
      ...client.items.map((item) => `  - ${itemLine(item)}\n    ${itemUrl(client, item)}`),
    ].join("\n"),
  );
  const text = [
    heading,
    "",
    ...textSections.flatMap((section) => [section, ""]),
    ...(quickBooksLine ? [quickBooksLine, ""] : []),
    `Open the firm workspace: ${input.appUrl}/firm`,
    "",
    optOut,
  ].join("\n");

  const htmlSections = input.clients
    .map(
      (client) =>
        `<h3 style="margin:16px 0 4px;font-size:15px">${escapeHtml(client.businessName)}</h3>` +
        `<ul style="margin:0;padding-left:18px">${client.items
          .map(
            (item) =>
              `<li style="margin:2px 0"><a href="${escapeHtml(itemUrl(client, item))}">${escapeHtml(
                item.title,
              )}</a> <span style="color:${
                item.overdue ? "#b91c1c" : "#6b7280"
              }">(${escapeHtml(whenText(item))})</span></li>`,
          )
          .join("")}</ul>`,
    )
    .join("");
  const html =
    `<div style="font:14px/1.5 -apple-system,Segoe UI,sans-serif;color:#111;max-width:560px">` +
    `<p style="font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:#6b7280;margin:0">${escapeHtml(
      input.firmName ?? "Precog",
    )}</p>` +
    `<h2 style="margin:4px 0 12px;font-size:18px">Weekly digest</h2>` +
    htmlSections +
    (quickBooksLine ? `<p style="margin-top:16px">${escapeHtml(quickBooksLine)}</p>` : "") +
    `<p style="margin-top:20px"><a href="${escapeHtml(input.appUrl)}/firm">Open the firm workspace</a></p>` +
    `<p style="color:#6b7280;font-size:12px">${escapeHtml(because)} ` +
    `<a href="${escapeHtml(input.unsubscribeUrl)}">Stop the weekly digest</a></p>` +
    `</div>`;
  return {
    subject,
    text,
    html,
    headers: {
      "List-Unsubscribe": `<${input.unsubscribeUrl}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  };
}

/**
 * A firm reads "across 2 clients"; an owner with one business reads "on
 * Ortiz Dental", and one with several "across 2 businesses".
 */
function digestSubject(
  firmName: string | null,
  clients: DigestClient[],
  total: number,
  overdue: number,
): string {
  const what =
    overdue > 0 ? `${count(overdue, "item")} overdue` : `${count(total, "item")} due this week`;
  if (firmName) return overdue > 0 ? `${what} across ${count(clients.length, "client")}` : what;
  if (clients.length === 1) return `${what} on ${clients[0].businessName}`;
  return `${what} across ${count(clients.length, "business", "businesses")}`;
}

/**
 * The note to a client's owner about what is due on their own business.
 * Replies go to the advisor whose digest reached it, and the note says who
 * set the reminders up and how to stop them.
 */
export function renderOwnerReminder(input: {
  businessName: string;
  firmName: string | null;
  items: ReminderItem[];
  /** The advisor a reply should reach. */
  advisorEmail?: string;
  /** The page that stops these reminders; also sent as a one-click List-Unsubscribe. */
  unsubscribeUrl: string;
}): RenderedEmail {
  const advisor = input.firmName ?? "Your advisor";
  const from = input.firmName ? ` from ${input.firmName}` : "";
  const subject = `${input.businessName}: ${count(input.items.length, "item")} to confirm`;
  const reply = input.advisorEmail
    ? `Reply to this email to reach ${input.firmName ?? "your advisor"} once you have done each, or if something has changed.`
    : `Tell ${input.firmName ?? "your advisor"} once you have done each, or if something has changed.`;
  const setUp = `${advisor} set these reminders up in Precog.`;
  const text = [
    `A reminder${from} about ${input.businessName}.`,
    "",
    ...input.items.map((item) => `- ${itemLine(item)}\n  ${item.ownerDetail}`),
    "",
    reply,
    "",
    `${setUp} To stop them, open this link:`,
    input.unsubscribeUrl,
  ].join("\n");
  const html =
    `<div style="font:14px/1.5 -apple-system,Segoe UI,sans-serif;color:#111;max-width:560px">` +
    `<p>A reminder${escapeHtml(from)} about <strong>${escapeHtml(input.businessName)}</strong>.</p>` +
    `<ul style="padding-left:18px">${input.items
      .map(
        (item) =>
          `<li style="margin:6px 0"><strong>${escapeHtml(itemLine(item))}</strong><br/><span style="color:#374151">${escapeHtml(item.ownerDetail)}</span></li>`,
      )
      .join("")}</ul>` +
    `<p>${escapeHtml(reply)}</p>` +
    `<p style="color:#6b7280;font-size:12px">${escapeHtml(setUp)} ` +
    `<a href="${escapeHtml(input.unsubscribeUrl)}">Stop these reminders</a></p></div>`;
  return {
    subject,
    text,
    html,
    ...(input.advisorEmail ? { replyTo: input.advisorEmail } : {}),
    headers: {
      "List-Unsubscribe": `<${input.unsubscribeUrl}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  };
}

/**
 * The one email an owner address gets before any reminder: it asks the
 * owner to agree. Until they do, Precog sends that address nothing more.
 */
export function renderOwnerEmailConfirm(input: {
  businessName: string;
  firmName: string | null;
  confirmUrl: string;
}): RenderedEmail {
  const who = input.firmName ?? "An advisor";
  const intro = `${who} wants Precog to email you reminders about ${input.businessName}. Open this link to agree:`;
  const closing =
    "If you do not know them or do not want these emails, ignore this one. Precog sends nothing more unless you agree.";
  return {
    subject: `Get reminders about ${input.businessName}?`,
    text: [intro, "", input.confirmUrl, "", closing].join("\n"),
    html:
      `<div style="font:14px/1.5 -apple-system,Segoe UI,sans-serif;color:#111;max-width:560px">` +
      `<p>${escapeHtml(intro)}</p>` +
      `<p><a href="${escapeHtml(input.confirmUrl)}">Yes, send me reminders</a></p>` +
      `<p style="color:#6b7280;font-size:12px">${escapeHtml(closing)}</p></div>`,
  };
}

function itemLine(item: ReminderItem): string {
  return `${item.title} (${whenText(item)})`;
}

function whenText(item: ReminderItem): string {
  const day = formatDay(item.dueOn);
  if (!item.overdue) return `due ${day}`;
  return item.stillOpen ? `still open, overdue since ${day}` : `overdue since ${day}`;
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
