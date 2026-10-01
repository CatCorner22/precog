import type { EvidenceFrequency, EvidenceItem, ProcessNode } from "../types";
import { DAY_MS, localDaysBetween } from "../dates";

export const FREQUENCY_DAYS: Record<EvidenceFrequency, number> = {
  daily: 1,
  weekly: 7,
  monthly: 30,
  quarterly: 91,
  annual: 365,
};

export const FREQUENCY_LABEL: Record<EvidenceFrequency, string> = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
  quarterly: "Quarterly",
  annual: "Annual",
};

export type EvidenceStatus = "never" | "current" | "due_soon" | "overdue";

/**
 * Where an evidence item stands and how many calendar days are left until
 * its next review (negative once overdue; null when never done). "Due soon"
 * is the last fifth of the window, at least a day, so a daily item is
 * current once done and due soon on its due day. Days are counted between
 * local calendar days, the same way the control calendar counts them.
 */
export function evidenceStatus(
  item: EvidenceItem,
  now = Date.now(),
): { status: EvidenceStatus; daysLeft: number | null } {
  const due = evidenceDueDate(item);
  if (!due) return { status: "never", daysLeft: null };
  const period = FREQUENCY_DAYS[item.frequency];
  const daysLeft = localDaysBetween(new Date(now), due);
  if (daysLeft < 0) return { status: "overdue", daysLeft };
  const soon = period <= 1 ? 0 : Math.max(1, Math.round(period * 0.2));
  if (daysLeft <= soon) return { status: "due_soon", daysLeft };
  return { status: "current", daysLeft };
}

/** When the item's next review falls due: one period after it was last done; null when never done. */
export function evidenceDueDate(item: EvidenceItem): Date | null {
  if (!item.lastDoneAt) return null;
  return new Date(new Date(item.lastDoneAt).getTime() + FREQUENCY_DAYS[item.frequency] * DAY_MS);
}

export interface EvidenceSummary {
  total: number;
  current: number;
  dueSoon: number;
  overdue: number;
  never: number;
  /** 0–100 share of evidence items that are current or due soon. */
  /** Null when nothing is listed. An empty list is not full coverage. */
  coverage: number | null;
  overdueItems: { process: ProcessNode; item: EvidenceItem; daysLeft: number | null }[];
}

export function summarizeEvidence(processes: ProcessNode[], now = Date.now()): EvidenceSummary {
  const s: EvidenceSummary = {
    total: 0,
    current: 0,
    dueSoon: 0,
    overdue: 0,
    never: 0,
    coverage: null,
    overdueItems: [],
  };
  for (const p of processes) {
    for (const item of p.evidence ?? []) {
      s.total += 1;
      const { status, daysLeft } = evidenceStatus(item, now);
      if (status === "current") s.current += 1;
      else if (status === "due_soon") s.dueSoon += 1;
      else if (status === "overdue") {
        s.overdue += 1;
        s.overdueItems.push({ process: p, item, daysLeft });
      } else {
        s.never += 1;
        s.overdueItems.push({ process: p, item, daysLeft: null });
      }
    }
  }
  s.coverage = s.total ? Math.round(((s.current + s.dueSoon) / s.total) * 100) : null;
  s.overdueItems.sort((a, b) => (a.daysLeft ?? -9999) - (b.daysLeft ?? -9999));
  return s;
}

/** Sensible default evidence for a process based on its controls and risks. */
export function suggestEvidence(process: ProcessNode): Omit<EvidenceItem, "id">[] {
  const out: Omit<EvidenceItem, "id">[] = [];
  const text = `${process.name} ${process.description}`.toLowerCase();
  const fraud = (process.risks ?? []).some((r) => r.kind === "fraud");
  // Whole words only: "count" inside "account" or "ap" inside "map" is not a match.
  if (/\b(cash|deposits?|payments?|receipts?)\b/.test(text))
    out.push({ label: "Owner reviews deposit vs. posted receipts", frequency: "weekly" });
  if (/\b(bank(ing|s)?|reconcil\w*)\b/.test(text) || fraud)
    out.push({ label: "Independent bank reconciliation signed off", frequency: "monthly" });
  if (/\b(vendors?|payables?|invoices?|ap)\b/.test(text))
    out.push({ label: "New-vendor and payment-batch approval log reviewed", frequency: "monthly" });
  if (/\bpayroll\b/.test(text))
    out.push({ label: "Payroll register approved before transmission", frequency: "monthly" });
  if (/\b(write.?offs?|adjust\w*|claims?|billing|a\/r|receivables?)(?![a-z])/.test(text))
    out.push({ label: "Adjustment / write-off report reviewed by owner", frequency: "monthly" });
  if (/\b(inventory|stock|counts?)\b/.test(text))
    out.push({ label: "Cycle count variance investigated", frequency: "monthly" });
  if (process.controlIds.length && !out.length)
    out.push({ label: "Control operating-effectiveness walkthrough", frequency: "quarterly" });
  if (!out.length)
    out.push({
      label: "Process owner attests that staff follow the procedure",
      frequency: "quarterly",
    });
  return out.slice(0, 3);
}
