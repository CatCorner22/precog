import type { LeanWasteKind, ProcessIdea, ProcessRiskKind } from "@/lib/precog/types";

export const RISK_KINDS: ProcessRiskKind[] = [
  "fraud",
  "control",
  "continuity",
  "compliance",
  "quality",
  "revenue",
  "safety",
];
export const IDEA_CATEGORIES: ProcessIdea["category"][] = [
  "control",
  "lean",
  "tech",
  "training",
  "policy",
];
export const EFFORTS: ProcessIdea["effort"][] = ["low", "medium", "high"];
export const IDEA_STATUS: ProcessIdea["status"][] = ["backlog", "exploring", "planned", "done"];
export const WASTE_KINDS: { id: LeanWasteKind; label: string }[] = [
  { id: "muda_waiting", label: "Waiting" },
  { id: "muda_rework", label: "Rework" },
  { id: "muda_motion", label: "Motion" },
  { id: "muda_overprocessing", label: "Over-processing" },
  { id: "mura", label: "Unevenness (mura)" },
  { id: "muri", label: "Overburden (muri)" },
];

export { slug, uid } from "@/lib/precog/text";

export const inputCls =
  "w-full rounded-lg border border-border bg-elevated px-2.5 py-1.5 text-xs text-fg placeholder:text-subtle focus:border-primary/50";
export const labelCls = "block text-xs font-medium tracking-wide text-subtle uppercase";
/** A regular-size text field on the page background (dialogs, workspace forms). */
export const fieldCls =
  "rounded-md border border-border bg-bg px-2 py-1.5 text-sm text-fg placeholder:text-subtle";
