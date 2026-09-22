import type { EvidenceFrequency, EvidenceItem, ProcessNode } from "../types";

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

export function evidenceStatus(
  item: EvidenceItem,
  now = Date.now(),
): { status: EvidenceStatus; daysLeft: number | null } {
  if (!item.lastDoneAt) return { status: "never", daysLeft: null };
  const period = FREQUENCY_DAYS[item.frequency];
  const elapsedDays = (now - new Date(item.lastDoneAt).getTime()) / 86_400_000;
  const daysLeft = Math.round(period - elapsedDays);
  if (daysLeft < 0) return { status: "overdue", daysLeft };
  // "Due soon" in the last fifth of the window (min 1 day for daily).
  if (daysLeft <= Math.max(1, Math.round(period * 0.2))) return { status: "due_soon", daysLeft };
  return { status: "current", daysLeft };
}

export interface EvidenceSummary {
  total: number;
  current: number;
  dueSoon: number;
  overdue: number;
  never: number;
  /** 0–100 share of evidence items that are current or due soon. */
  coverage: number;
  overdueItems: { process: ProcessNode; item: EvidenceItem; daysLeft: number | null }[];
}

export function summarizeEvidence(processes: ProcessNode[], now = Date.now()): EvidenceSummary {
  const s: EvidenceSummary = {
    total: 0,
    current: 0,
    dueSoon: 0,
    overdue: 0,
    never: 0,
    coverage: 100,
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
  s.coverage = s.total ? Math.round(((s.current + s.dueSoon) / s.total) * 100) : 100;
  s.overdueItems.sort((a, b) => (a.daysLeft ?? -9999) - (b.daysLeft ?? -9999));
  return s;
}

/** Sensible default evidence for a process based on its controls and risks. */
export function suggestEvidence(process: ProcessNode): Omit<EvidenceItem, "id">[] {
  const out: Omit<EvidenceItem, "id">[] = [];
  const text = `${process.name} ${process.description}`.toLowerCase();
  const fraud = (process.risks ?? []).some((r) => r.kind === "fraud");
  if (/cash|deposit|payment|receipt/.test(text))
    out.push({ label: "Owner reviews deposit vs. posted receipts", frequency: "weekly" });
  if (/bank|reconcil/.test(text) || fraud)
    out.push({ label: "Independent bank reconciliation signed off", frequency: "monthly" });
  if (/vendor|payable|invoice|ap\b/.test(text))
    out.push({ label: "New-vendor and payment-batch approval log reviewed", frequency: "monthly" });
  if (/payroll/.test(text))
    out.push({ label: "Payroll register approved before transmission", frequency: "monthly" });
  if (/write.?off|adjust|claim|billing|a\/r|receivable/.test(text))
    out.push({ label: "Adjustment / write-off report reviewed by owner", frequency: "monthly" });
  if (/inventory|stock|count/.test(text))
    out.push({ label: "Cycle count variance investigated", frequency: "monthly" });
  if (process.controlIds.length && !out.length)
    out.push({ label: "Control operating-effectiveness walkthrough", frequency: "quarterly" });
  if (!out.length)
    out.push({ label: "Process owner attests procedure is followed", frequency: "quarterly" });
  return out.slice(0, 3);
}
