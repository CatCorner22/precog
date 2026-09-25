import type { DueItem } from "./due-items";

/**
 * The reminder messages, as plain text and simple HTML. Text first: these
 * land in accountants' inboxes, where a clear list beats a designed email.
 */
export interface DigestClient {
  businessName: string;
  items: DueItem[];
}

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function itemLine(item: DueItem): string {
  const when = item.dueOn
    ? item.overdue
      ? `overdue since ${item.dueOn}`
      : `due ${item.dueOn}`
    : "";
  return when ? `${item.title} (${when})` : item.title;
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
      ? `${overdue} overdue across ${input.clients.length} client${input.clients.length === 1 ? "" : "s"}`
      : `${total} item${total === 1 ? "" : "s"} due this week`;

  const textSections = input.clients.map((client) =>
    [`${client.businessName}`, ...client.items.map((item) => `  - ${itemLine(item)}`)].join("\n"),
  );
  const text = [
    input.firmName ? `${input.firmName}: weekly review` : "Weekly review",
    "",
    ...textSections.flatMap((section) => [section, ""]),
    `Open the firm workspace: ${input.appUrl}/firm`,
    "",
    "You receive this because the weekly digest is on in your Precog account. Turn it off in the firm workspace.",
  ].join("\n");

  const htmlSections = input.clients
    .map(
      (client) =>
        `<h3 style="margin:16px 0 4px;font-size:15px">${escapeHtml(client.businessName)}</h3>` +
        `<ul style="margin:0;padding-left:18px">${client.items
          .map(
            (item) =>
              `<li style="margin:2px 0">${escapeHtml(item.title)}${
                item.dueOn
                  ? ` <span style="color:${item.overdue ? "#b91c1c" : "#6b7280"}">(${
                      item.overdue ? "overdue since" : "due"
                    } ${item.dueOn})</span>`
                  : ""
              }</li>`,
          )
          .join("")}</ul>`,
    )
    .join("");
  const html =
    `<div style="font:14px/1.5 -apple-system,Segoe UI,sans-serif;color:#111;max-width:560px">` +
    `<p style="font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:#6b7280;margin:0">${escapeHtml(
      input.firmName ?? "Precog",
    )}</p>` +
    `<h2 style="margin:4px 0 12px;font-size:18px">Weekly review</h2>` +
    htmlSections +
    `<p style="margin-top:20px"><a href="${escapeHtml(input.appUrl)}/firm">Open the firm workspace</a></p>` +
    `<p style="color:#6b7280;font-size:12px">You receive this because the weekly digest is on in your Precog account. Turn it off in the firm workspace.</p>` +
    `</div>`;
  return { subject, text, html };
}

/** The note to a client's owner about what is due on their own business. */
export function renderOwnerReminder(input: {
  businessName: string;
  firmName: string | null;
  items: DueItem[];
}): RenderedEmail {
  const from = input.firmName ? ` from ${input.firmName}` : "";
  const subject = `${input.businessName}: ${input.items.length} item${input.items.length === 1 ? "" : "s"} to confirm`;
  const text = [
    `A reminder${from} about ${input.businessName}.`,
    "",
    ...input.items.map((item) => `- ${itemLine(item)}\n  ${item.detail}`),
    "",
    input.firmName
      ? `Reply to ${input.firmName} once each is done, or tell them if something has changed.`
      : "Reply to your advisor once each is done.",
  ].join("\n");
  const html =
    `<div style="font:14px/1.5 -apple-system,Segoe UI,sans-serif;color:#111;max-width:560px">` +
    `<p>A reminder${escapeHtml(from)} about <strong>${escapeHtml(input.businessName)}</strong>.</p>` +
    `<ul style="padding-left:18px">${input.items
      .map(
        (item) =>
          `<li style="margin:6px 0"><strong>${escapeHtml(itemLine(item))}</strong><br/><span style="color:#374151">${escapeHtml(item.detail)}</span></li>`,
      )
      .join("")}</ul>` +
    `<p style="color:#6b7280;font-size:12px">${escapeHtml(
      input.firmName
        ? `Reply to ${input.firmName} once each is done, or tell them if something has changed.`
        : "Reply to your advisor once each is done.",
    )}</p></div>`;
  return { subject, text, html };
}
