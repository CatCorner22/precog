import type { Benchmark } from "./types";

const ACFE_2026_RTTN = {
  publisher: "Association of Certified Fraud Examiners",
  url: "https://www.acfe.com/fraud-resources/report-to-the-nations",
  grade: "primary-document-reported" as const,
};

/**
 * Published benchmark statistics, each tied to its study.
 *
 * These replace the invented rates the app previously carried. Where the
 * earlier data set asserted a figure such as an "industry embezzlement rate"
 * of 18% per year, no published source supports a number of that shape, and it
 * has been removed rather than re-dressed. What follows is what the research
 * actually establishes.
 *
 * Primary study: the ACFE's Occupational Fraud 2026: A Report to the Nations,
 * 14th edition, drawn from 2,402 cases investigated by Certified Fraud
 * Examiners across 143 countries, with documented losses over $3.4 billion.
 */
export const BENCHMARKS: Benchmark[] = [
  {
    id: "bm-median-loss",
    label: "Median loss per occupational fraud case",
    value: "$104,000",
    numeric: 104000,
    soWhat:
      "Half of all cases cost more than this. For most small businesses a six-figure loss is not an accounting problem, it is a solvency problem.",
    study: "Occupational Fraud 2026: A Report to the Nations",
    studyYear: 2026,
    source: ACFE_2026_RTTN,
  },
  {
    id: "bm-median-duration",
    label: "Median time from when a scheme starts to when it is found",
    value: "12 months",
    numeric: 12,
    soWhat:
      "The typical scheme runs a full year before anyone notices. Detection speed, not prevention alone, is what caps the loss.",
    study: "Occupational Fraud 2026: A Report to the Nations",
    studyYear: 2026,
    source: ACFE_2026_RTTN,
  },
  {
    id: "bm-duration-cost-curve",
    label: "What delay costs",
    value: "Caught within 6 months: $40,000 median. Running over 5 years: over $1.1 million median.",
    soWhat:
      "This is the single most actionable statistic in the field. A scheme found early costs roughly one twenty-eighth of one found late. Every control that shortens detection time is worth more than its face value suggests.",
    study: "Occupational Fraud 2026: A Report to the Nations",
    studyYear: 2026,
    source: ACFE_2026_RTTN,
  },
  {
    id: "bm-tips",
    label: "Share of cases first detected by a tip",
    value: "43%",
    numeric: 0.43,
    soWhat:
      "More cases are found by someone speaking up than by every audit, review, and control combined. A way for staff to raise a concern is the highest-return control a small business can put in place, and it costs almost nothing.",
    study: "Occupational Fraud 2026: A Report to the Nations",
    studyYear: 2026,
    source: ACFE_2026_RTTN,
  },
  {
    id: "bm-small-org-hotline-gap",
    label: "Small organizations with a reporting mechanism",
    value: "25%, against 85% of large organizations",
    numeric: 0.25,
    soWhat:
      "Three quarters of small businesses lack the one control that detects the most fraud. This is the widest and cheapest gap to close on this list.",
    study: "Occupational Fraud 2026: A Report to the Nations",
    studyYear: 2026,
    source: ACFE_2026_RTTN,
  },
  {
    id: "bm-small-org-losses",
    label: "Losses by organization size",
    value: "Smallest organizations carry the highest median losses of any size band",
    soWhat:
      "Small businesses do not lose less because they are small. They lose the most, because fewer people means fewer independent checks and a single role covering the whole cash cycle.",
    study: "Occupational Fraud 2026: A Report to the Nations",
    studyYear: 2026,
    source: ACFE_2026_RTTN,
    caveat:
      "Organizations with more than 10,000 employees are a close second in the same table, so the relationship with size is U-shaped rather than linear.",
  },
  {
    id: "bm-asset-misappropriation",
    label: "Asset misappropriation — taking cash or property",
    value: "90% of cases, $100,000 median loss",
    numeric: 0.9,
    soWhat:
      "Nine cases in ten are someone taking money, not cooking the books. Controls over cash, payables, and payroll cover the overwhelming majority of real exposure.",
    study: "Occupational Fraud 2026: A Report to the Nations",
    studyYear: 2026,
    source: ACFE_2026_RTTN,
  },
  {
    id: "bm-corruption",
    label: "Corruption — kickbacks, bid rigging, conflicts of interest",
    value: "45% of cases, $150,000 median loss",
    numeric: 0.45,
    soWhat:
      "Half again as costly as straightforward theft and far harder to see in the books, because the money never enters the business to begin with.",
    study: "Occupational Fraud 2026: A Report to the Nations",
    studyYear: 2026,
    source: ACFE_2026_RTTN,
  },
  {
    id: "bm-financial-statement",
    label: "Financial statement fraud — misstating the numbers",
    value: "6% of cases, $1 million median loss",
    numeric: 0.06,
    soWhat:
      "Rare but severe. For a small business this matters most around a sale, a loan application, or a partner buyout, when the numbers are being relied on by someone else.",
    study: "Occupational Fraud 2026: A Report to the Nations",
    studyYear: 2026,
    source: ACFE_2026_RTTN,
  },
  {
    id: "bm-case-scale",
    label: "Study basis",
    value: "2,402 cases, 143 countries, over $3.4 billion in documented losses",
    soWhat:
      "These figures come from cases that were investigated and substantiated, not from a survey of opinions.",
    study: "Occupational Fraud 2026: A Report to the Nations",
    studyYear: 2026,
    source: ACFE_2026_RTTN,
    caveat:
      "Selection effect worth understanding: the study counts cases that were found. Schemes never detected cannot appear in it, so real frequency is higher than any such study can show, and median durations are, if anything, understated.",
  },
];

export const BENCHMARK_BY_ID: Record<string, Benchmark> = Object.fromEntries(
  BENCHMARKS.map((b) => [b.id, b]),
);

/**
 * Honest statement of what this app can and cannot tell a business owner.
 * Surfaced in the UI wherever a projection is shown. Being straight about the
 * limits is what separates a decision aid from a scare tactic.
 */
export const METHOD_CAVEATS: string[] = [
  "These figures describe what happened to other organizations. They are a reference class, not a prediction about yours.",
  "The published medians cover cases that were detected and investigated. Schemes that were never found cannot be in the data, so real frequency runs higher than any study can measure.",
  "Loss figures are medians, not averages. Half of cases cost more. The distribution has a long tail.",
  "Nothing here scores a person. Every finding in this application describes a structural gap in how work is divided, which is a fact about the organization chart and not about anyone's character.",
  "This is decision support for prioritizing internal controls. It is not an audit, an actuarial estimate, or legal advice.",
];
