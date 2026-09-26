export function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export const REPORT_DETECTION: Record<string, string> = {
  tip: "Someone spoke up",
  "owner-review": "The owner looked",
  "external-audit": "An outside audit",
  "bank-or-insurer": "A bank or insurer flagged it",
  "law-enforcement": "Law enforcement",
  "by-accident": "By accident, when the money ran out",
  cover: "someone else covered the desk",
  reconciliation: "A reconciliation caught it",
};
