import type { Benchmark } from "./types";

/** The study and link every benchmark below shares. */
const ACFE_2026 = {
  study: "Occupational Fraud 2026: A Report to the Nations",
  studyYear: 2026,
  source: {
    publisher: "Association of Certified Fraud Examiners",
    url: "https://www.acfe.com/fraud-resources/report-to-the-nations",
  },
} satisfies Pick<Benchmark, "study" | "studyYear" | "source">;

/** The shared caveat on the three ACFE fraud categories. */
const CATEGORY_OVERLAP =
  "A case can involve more than one category, so the three category shares add to more than 100%.";

/**
 * Published benchmark statistics, each tied to its study. No unpublished rate
 * appears here: a figure no published source supports is left out, not
 * re-dressed.
 *
 * Primary study: the ACFE's Occupational Fraud 2026: A Report to the Nations,
 * 14th edition, drawn from 2,402 cases investigated by Certified Fraud
 * Examiners across 143 countries, with documented losses over $3.4 billion.
 *
 * No entry carries a `page` or `figure` yet. Those fields are filled only after
 * someone reads the figure in the published report; until then a reader can
 * check a figure only through the study's landing page.
 */
export const BENCHMARKS: Benchmark[] = [
  {
    id: "bm-median-loss",
    label: "Median loss per occupational fraud case",
    value: "$104,000",
    numeric: 104000,
    soWhat:
      "Half of all cases cost more than this. For most small businesses a six-figure loss is not an accounting problem, it is a solvency problem.",
    ...ACFE_2026,
  },
  {
    id: "bm-median-duration",
    label: "Median time from when a scheme starts to when someone finds it",
    value: "12 months",
    numeric: 12,
    soWhat:
      "The typical scheme runs a full year before anyone notices. Detection speed, not prevention alone, is what caps the loss.",
    ...ACFE_2026,
  },
  {
    id: "bm-duration-cost-curve",
    label: "What delay costs",
    value:
      "Caught within 6 months: $40,000 median. Running over 5 years: over $1.1 million median.",
    soWhat:
      "These are two different groups of schemes, not one scheme measured twice: the ones that ran longest were also the ones built to grow and to hide, so the gap is partly cause and partly selection. What it does establish is that the schemes which do the real damage are the ones nobody found for years, and that is the argument for detective controls.",
    ...ACFE_2026,
  },
  {
    id: "bm-tips",
    label: "Share of cases first detected by a tip",
    value: "43%",
    numeric: 0.43,
    soWhat:
      "A tip is the single largest route by which fraud comes to light — larger than any one review, audit, or control on its own. A way for staff to raise a concern is one of the cheapest controls a small business can put in place.",
    ...ACFE_2026,
    caveat:
      "43% is a plurality, not a majority. Controls and reviews, taken together, found the other 57% of cases — internal audit and management review alone account for over a quarter — so a reporting channel complements those controls rather than replacing them.",
  },
  {
    id: "bm-small-org-hotline-gap",
    label: "Organizations under 100 employees with a reporting mechanism",
    value: "24%, against 85% of organizations with 100 or more employees",
    numeric: 0.24,
    soWhat:
      "Three quarters of small businesses lack the one control that detects the most fraud, while 85% of organizations with 100 or more employees have it. This is the widest and cheapest gap to close on this list.",
    ...ACFE_2026,
  },
  {
    id: "bm-small-org-losses",
    label: "Median loss, organizations under 100 employees",
    value: "$126,000, against $123,000 for organizations over 10,000",
    numeric: 126000,
    soWhat:
      "Small businesses do not lose less because they are small. They lose slightly more than the largest organizations in absolute terms, and vastly more relative to what they can absorb.",
    ...ACFE_2026,
    caveat:
      "The two figures are close, so size matters far less than it appears. What separates them is capacity to survive the loss, which this table does not measure.",
  },
  {
    id: "bm-revenue-share",
    label: "Share of annual revenue organizations lose to fraud",
    value: "5%, as estimated by Certified Fraud Examiners",
    numeric: 0.05,
    soWhat:
      "Not a figure to apply to your own revenue. It is the examiners' opinion of losses across all organizations together; a single business either has a scheme running or does not. To size your own exposure, use the stated losses in the cases for your sector.",
    ...ACFE_2026,
    caveat: "An estimate by practitioners, not a measurement. Treat it as an order of magnitude.",
  },
  {
    id: "bm-duration-distribution",
    label: "How long schemes actually run",
    value: "A third come to light within six months; 5% run beyond five years",
    soWhat:
      "A third come to light within six months, which means two thirds do not — consistent with the twelve-month median above. The damage concentrates in the small share that run for years, which is why detection speed matters more than detection certainty.",
    ...ACFE_2026,
  },
  {
    id: "bm-asset-misappropriation",
    label: "Asset misappropriation — taking cash or property",
    value: "90% of cases, $100,000 median loss",
    numeric: 0.9,
    soWhat:
      "Nine cases in ten involve someone taking money or property. Controls over cash, payables, and payroll cover the overwhelming majority of real exposure.",
    ...ACFE_2026,
    caveat: CATEGORY_OVERLAP,
  },
  {
    id: "bm-corruption",
    label: "Corruption — kickbacks, bid rigging, conflicts of interest",
    value: "45% of cases, $150,000 median loss",
    numeric: 0.45,
    soWhat:
      "Half again as costly as straightforward theft and far harder to see in the books, because the money never enters the business to begin with.",
    ...ACFE_2026,
    caveat: CATEGORY_OVERLAP,
  },
  {
    id: "bm-financial-statement",
    label: "Financial statement fraud — misstating the numbers",
    value: "6% of cases, $1 million median loss",
    numeric: 0.06,
    soWhat:
      "Rare but severe. For a small business this matters most around a sale, a loan application, or a partner buyout, when someone else relies on the numbers.",
    ...ACFE_2026,
    caveat: CATEGORY_OVERLAP,
  },
  {
    id: "bm-case-scale",
    label: "Study basis",
    value:
      "2,402 cases, 143 countries, over $3.4 billion in documented losses, investigated and closed between January 2024 and September 2025",
    soWhat:
      "These figures come from cases that investigators examined and substantiated, not from a survey of opinions.",
    ...ACFE_2026,
    caveat:
      "Selection effect worth understanding: the study counts only cases that came to light. Schemes nobody detected cannot appear in it, so real frequency is higher than any such study can show, and median durations are, if anything, understated.",
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
  "These figures describe what happened to other businesses. They are a reference class, not a prediction about yours.",
  "The published medians cover cases that someone detected and investigated. Schemes that nobody found cannot be in the data, so real frequency runs higher than any study can measure.",
  "Loss figures are medians, not averages. Half of cases cost more. The distribution has a long tail.",
  "Nothing here scores a person. Every gap Precog shows is a structural weakness in how the business divides work, which is a fact about the organization chart and not about anyone's character.",
  "Segregation of duties assumes people do not collude. Two people acting together defeat every control built on one person checking another; co-conspirators carried out at least one case in this library.",
  "This is decision support for prioritizing internal controls. It is not an audit, an actuarial estimate, or legal advice.",
];
