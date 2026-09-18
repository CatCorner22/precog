/**
 * iCalendar export for control work — one recurring VEVENT per evidence item,
 * one-off VEVENTs for journal re-reviews. All-day events; RFC 5545 folding + escaping.
 */
import type { DueItem } from "./due";
import type { EvidenceFrequency } from "../types";

const RRULE: Record<EvidenceFrequency, string> = {
  daily: "FREQ=DAILY",
  weekly: "FREQ=WEEKLY",
  monthly: "FREQ=MONTHLY",
  quarterly: "FREQ=MONTHLY;INTERVAL=3",
  annual: "FREQ=YEARLY",
};

const FREQ_FROM_LABEL: Record<string, EvidenceFrequency> = {
  Daily: "daily",
  Weekly: "weekly",
  Monthly: "monthly",
  Quarterly: "quarterly",
  Annual: "annual",
};

function esc(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

function fold(line: string): string {
  // 75 octets per line; we fold on characters which is safe for ASCII-heavy content.
  const out: string[] = [];
  let rest = line;
  while (rest.length > 73) {
    out.push(rest.slice(0, 73));
    rest = ` ${rest.slice(73)}`;
  }
  out.push(rest);
  return out.join("\r\n");
}

function ymd(d: Date): string {
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
}

function stamp(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

export function buildIcs(
  items: DueItem[],
  opts: { businessName: string; appUrl?: string; now?: Date },
): string {
  const now = opts.now ?? new Date();
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Precog Pioneer//Control calendar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    fold(`X-WR-CALNAME:${esc(`${opts.businessName} · control reviews`)}`),
  ];

  for (const i of items) {
    if (!i.dueAt) continue;
    const start = new Date(i.dueAt);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    const uid = `${i.id}@precog-pioneer`;
    const summary = i.kind === "decision" ? i.title : `Control review: ${i.title}`;
    const descParts = [i.detail];
    if (i.reviewer) descParts.push(`Reviewer: ${i.reviewer}`);
    if (i.kind === "evidence") descParts.push("Mark it done in Precog Pioneer → Dashboard → Control calendar.");
    lines.push(
      "BEGIN:VEVENT",
      fold(`UID:${esc(uid)}`),
      `DTSTAMP:${stamp(now)}`,
      `DTSTART;VALUE=DATE:${ymd(start)}`,
      `DTEND;VALUE=DATE:${ymd(end)}`,
      fold(`SUMMARY:${esc(summary)}`),
      fold(`DESCRIPTION:${esc(descParts.join("\n"))}`),
      fold(`CATEGORIES:${esc(i.kind === "decision" ? "Decision review" : "Internal control")}`),
    );
    if (i.kind === "evidence" && i.frequencyLabel && FREQ_FROM_LABEL[i.frequencyLabel]) {
      lines.push(`RRULE:${RRULE[FREQ_FROM_LABEL[i.frequencyLabel]]}`);
    }
    if (opts.appUrl) lines.push(fold(`URL:${esc(opts.appUrl)}`));
    lines.push("BEGIN:VALARM", "ACTION:DISPLAY", fold(`DESCRIPTION:${esc(summary)}`), "TRIGGER:-PT9H", "END:VALARM");
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return `${lines.join("\r\n")}\r\n`;
}

export function downloadIcs(content: string, fileName: string) {
  const blob = new Blob([content], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName.endsWith(".ics") ? fileName : `${fileName}.ics`;
  a.click();
  URL.revokeObjectURL(url);
}
