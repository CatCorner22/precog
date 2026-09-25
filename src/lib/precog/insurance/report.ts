import { known, policyPremium, TERM_LABELS, type InsuranceWorkspace, type TermKey } from "./model";

const safe = (value: unknown) =>
  String(value ?? "")
    .replace(/[\r\n]+/g, " ")
    .replace(/[\\`*_[\]<>]/g, "\\$&");

/** Private, user-triggered review packet. No upload, referral, or insurance transaction. */
export function insuranceReviewMarkdown(
  businessName: string,
  state: InsuranceWorkspace,
  scenarios: readonly { id: string; title: string }[],
): string {
  const lines = [
    `# Insurance review — ${safe(businessName)}`,
    `Generated: ${new Date().toISOString()}`,
    `Model: ${state.modelVersion}`,
    `Information status: ${state.status}`,
    "",
    "This is an owner-maintained discussion packet, not a quote, policy interpretation, binder, coverage opinion, or claim decision. Source labels record what the user reported; they are not independent verification.",
    "",
    "## Questions for the broker",
    "1. Which exact insuring agreement or endorsement addresses each scenario?",
    "2. Which insured entities, people, locations, policy dates, and loss/discovery/reporting triggers apply?",
    "3. What deductible, sublimit, aggregate, exclusions, verification conditions, waiting period, and reporting deadlines matter?",
    "4. How do investigation/defense costs and other potentially applicable policies affect available limits?",
    "5. What cash must the business fund before any reimbursement, and which control evidence should it retain?",
    "",
  ];
  for (const policy of state.policies) {
    lines.push(
      `## ${safe(policy.label)}`,
      `Category: ${safe(policy.kind)}`,
      `Carrier recorded: ${safe(policy.carrier) || "Not recorded"}`,
      `Policy/document reference: ${safe(policy.policyReference) || "Not recorded"}`,
      `Period: ${policy.effectiveFrom ?? "unknown"} to ${policy.effectiveTo ?? "unknown"}; trigger: ${policy.trigger}`,
      `Limit basis: ${policy.limitBasis}; premium basis: ${policy.premiumBasis}`,
      "",
    );
    for (const key of Object.keys(TERM_LABELS) as TermKey[]) {
      const fact = policy.terms[key];
      lines.push(
        `- ${TERM_LABELS[key]}: ${known(fact) ? fact.value : "not established"}; source: ${fact.source}; reference: ${safe(fact.reference) || "not recorded"}; recorded: ${fact.recordedOn ?? "unknown"}.`,
      );
    }
    lines.push(
      `- Calculated premium from recorded quote terms: ${policyPremium(policy) ?? "not established"} USD.`,
      `- Conditions: ${safe(policy.conditions) || "Not recorded"}`,
      `- Exclusions: ${safe(policy.exclusions) || "Not recorded"}`,
      `- Reporting requirements: ${safe(policy.reportingRequirements) || "Not recorded"}`,
      `- Waiting period: ${safe(policy.waitingPeriod) || "Not recorded"}`,
      "",
      "### Scenario applicability recorded by the owner",
    );
    for (const scenario of scenarios)
      lines.push(`- ${safe(scenario.title)}: ${policy.scenarios[scenario.id] ?? "unknown"}.`);
    lines.push("");
  }
  lines.push(
    "## Modeling limits",
    "All amounts use USD. Recovery illustrations evaluate one selected policy and one event; they do not add overlapping policies or independent scenario premiums. Unknown terms remain unknown. Annual cost is not established without a recorded premium and an explicit annual-frequency assumption. Insurance financing does not repair an operational control gap.",
    "",
    `Annual-frequency assumption: ${state.annualFrequencyPct === null ? "not entered" : `${state.annualFrequencyPct}%`}`,
    `Assumption source: ${safe(state.annualFrequencySource) || "not recorded"}`,
    "",
  );
  return lines.join("\n");
}
