import type { ExceptionAction, ReleaseChannel } from "@/lib/precog/controls/dual-release";

export const DUAL_RELEASE_CHANNELS: ReleaseChannel[] = [
  "ach",
  "check",
  "writeoff",
  "vendor_new",
  "deposit",
  "payroll",
];

export const EXCEPTION_ACTIONS: { id: ExceptionAction; label: string; hint: string }[] = [
  {
    id: "raise_threshold",
    label: "Raise threshold",
    hint: "Allow single release up to a higher amount",
  },
  {
    id: "lower_threshold",
    label: "Lower threshold",
    hint: "Stricter — dual required sooner",
  },
  {
    id: "force_dual",
    label: "Force dual",
    hint: "Always require two signers when match",
  },
  {
    id: "waive_dual",
    label: "Waive dual",
    hint: "Skip dual (logs residual — use sparingly)",
  },
];
