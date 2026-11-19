export const controlguardToolInfo = {
  triage: { label: "Triage a risk", description: "Check hard gates and score the remaining risk." },
  sod: { label: "Rate a duty conflict", description: "Score conflicting duties for an asset." },
  price: {
    label: "Check an invoice price",
    description: "Compare billed prices and packs against contract terms.",
  },
  skim: {
    label: "Check small overcharges",
    description: "Find invoice prices clustered below a tolerance.",
  },
  cliff: {
    label: "Find a notice deadline",
    description: "Find contract or license renewal and notice dates.",
  },
  leave: { label: "Convert leave to hours", description: "Replace leave in days with hours." },
  policy: {
    label: "Check policy wording",
    description: "Screen a policy title and look for unclear wording.",
  },
};

export type ControlGuardTool = keyof typeof controlguardToolInfo;
export const controlguardToolNames = Object.keys(controlguardToolInfo) as ControlGuardTool[];

export function isControlGuardTool(name: unknown): name is ControlGuardTool {
  return typeof name === "string" && Object.hasOwn(controlguardToolInfo, name);
}
