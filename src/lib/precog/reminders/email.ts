import { formatDay } from "../dates";
import { count } from "../text";
import type { ReminderItem } from "./due-items";

/**
 * The reminder messages, as plain text and simple HTML. Text first: these
 * land in accountants' inboxes, where a clear list beats a designed email.
 */
interface DigestClient {
  businessName: string;
  items: ReminderItem[];
}

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
  /** Where a reply goes; the platform's EMAIL_REPLY_TO when absent. */
  replyTo?: string;
}

/** The advisor's weekly digest across every client with something due. */
export function renderDigest(input: {
  firmName: string | null;
  clients: DigestClient[];
  appUrl: string;
}): RenderedEmail {
  const total = input.clients.reduce((n, c) => n + c.items.length, 0);
  const overdue = input.clients.reduce((n, c) => n + c.items.filter((i) => i.overdue).length, 0);
  const subject =
    overdue > 0
      ? `Precog: ${count(overdue, "item")} overdue across ${count(input.clients.length, "client")}`
      : `Precog: ${count(total, "item")} due this week`;
  const heading = input.firmName ? `${input.firmName}: weekly digest` : "Weekly digest";
  const optOut =
    "You receive this because the weekly digest is on in your Precog account. Turn it off in the firm workspace.";

  const textSections = input.clients.map((client) =>
    [client.businessName, ...client.items.map((item) => `  - ${itemLine(item)}`)].join("\n"),
  );
  const text = [
    heading,
    "",
    ...textSections.flatMap((section) => [section, ""]),
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
              `<li style="margin:2px 0">${escapeHtml(item.title)} <span style="color:${
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
    `<p style="margin-top:20px"><a href="${escapeHtml(input.appUrl)}/firm">Open the firm workspace</a></p>` +
    `<p style="color:#6b7280;font-size:12px">${escapeHtml(optOut)}</p>` +
    `</div>`;
  return { subject, text, html };
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
}): RenderedEmail {
  const advisor = input.firmName ?? "Your advisor";
  const from = input.firmName ? ` from ${input.firmName}` : "";
  const subject = `${input.businessName}: ${count(input.items.length, "item")} to confirm`;
  const reply = input.advisorEmail
    ? `Reply to this email to reach ${input.firmName ?? "your advisor"} once each is done, or if something has changed.`
    : `Tell ${input.firmName ?? "your advisor"} once each is done, or if something has changed.`;
  const setUp = `${advisor} set these reminders up in Precog. To stop them, ask ${input.firmName ?? "them"} to remove your address.`;
  const text = [
    `A reminder${from} about ${input.businessName}.`,
    "",
    ...input.items.map((item) => `- ${itemLine(item)}\n  ${item.ownerDetail}`),
    "",
    reply,
    "",
    setUp,
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
    `<p style="color:#6b7280;font-size:12px">${escapeHtml(setUp)}</p></div>`;
  return { subject, text, html, ...(input.advisorEmail ? { replyTo: input.advisorEmail } : {}) };
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
