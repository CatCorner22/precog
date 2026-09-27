import type { DutyFamily } from "./conflict-rules";

/** Each duty family's name, legend colour and one-line meaning, as the power map and matrix show them. */
export const FAMILY_META: Record<
  DutyFamily,
  { label: string; color: string; description: string }
> = {
  authorization: {
    label: "Authorization",
    color: "#a78bfa",
    description: "Approve or direct a transaction",
  },
  custody: {
    label: "Custody",
    color: "#fb7185",
    description: "Hold money, data, goods, or release capability",
  },
  recording: {
    label: "Recording",
    color: "#60a5fa",
    description: "Enter transactions or alter records",
  },
  reconciliation: {
    label: "Reconciliation",
    color: "#34d399",
    description: "Independently verify what occurred",
  },
  master_data: {
    label: "Master data",
    color: "#fbbf24",
    description: "Change standing data, users, vendors, or prices",
  },
};
