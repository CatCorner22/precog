/**
 * Evidence layer — real, citable fraud and control-failure incidents plus
 * published benchmark statistics.
 *
 * Design rule for this directory: every number carries a source a reader can
 * open. Nothing in here is invented, extrapolated, or rounded for effect. When
 * a figure is a composite or an estimate, the record says so in `caveat`.
 *
 * Why this exists: a control recommendation is only persuasive to a small
 * business owner when it answers "what actually happened to someone like me,
 * and what did it cost them." Hypothetical risk registers do not do that.
 */

/** Industry bucket a case or benchmark belongs to. */
export type IndustrySector =
  | "dental"
  | "medical"
  | "restaurant"
  | "construction"
  | "professional-services"
  | "retail"
  | "nonprofit"
  | "trades"
  | "any";

/**
 * The mechanism by which money left the business. These mirror the ACFE
 * occupational-fraud taxonomy so case frequencies stay comparable to the
 * published benchmarks.
 */
export type SchemeKind =
  | "check-tampering"
  | "billing-shell-vendor"
  | "payroll"
  | "expense-reimbursement"
  | "skimming"
  | "cash-larceny"
  | "receivables-diversion"
  | "corruption"
  | "financial-statement"
  /** Non-cash misappropriation: stock, parts, equipment, supplies, controlled substances. */
  | "inventory-theft"
  /** Register disbursements: refunds, voids, or credits issued with no sale behind them. */
  | "refund-fraud"
  /** Customer, pricing, or patient data taken for a competitor or for sale. */
  | "data-theft"
  /** An insider deleted, wiped, or locked the business out of its own data. */
  | "data-destruction";

/**
 * How the scheme ended. Detection route matters more than any other single
 * variable: it is the difference between a four-figure loss and a
 * seven-figure one.
 */
export type DetectionRoute =
  | "tip"
  | "owner-review"
  | "external-audit"
  | "bank-or-insurer"
  | "law-enforcement"
  | "by-accident"
  | "reconciliation"
  /** Someone else had to do the person's job for a while and saw the records. */
  | "cover"
  | "unknown";

import type { ControlId } from "./controls";

/** Confidence in the facts as recorded. */
export type SourceGrade =
  /** Facts taken from the text of a government press release or court filing. */
  | "primary-document"
  /**
   * Facts reported from a primary document that this environment could not
   * open directly. The citation URL points at the primary document so a reader
   * can confirm in one click.
   */
  | "primary-document-reported";

export interface EvidenceSource {
  /** Publisher, e.g. "U.S. Attorney's Office, District of Massachusetts". */
  publisher: string;
  /** Direct link to the primary document. */
  url: string;
  grade: SourceGrade;
}

/**
 * A real incident, tagged with the control whose absence made it possible.
 *
 * `preventiveControlIds` and `sodRuleIds` are what turn this library from a
 * reading list into a working part of the product: when the app recommends a
 * control, it can cite the cases that control would have stopped.
 */
export interface CaseStudy {
  id: string;
  /** Neutral, factual headline. Never sensationalized. */
  title: string;
  sector: IndustrySector;
  schemes: SchemeKind[];
  /** Plain-English account of how the money moved. */
  howItWorked: string;
  /**
   * The specific control weakness. Phrased as a structural fact about the
   * business, never as a judgment about the person.
   */
  controlGap: string;
  /** Amount taken, as stated in the source. */
  lossUsd: number;
  /** True when `lossUsd` is a floor ("more than $X") rather than an exact sum. */
  lossIsFloor: boolean;
  /** How long the scheme ran before it stopped, in months. */
  durationMonths?: number;
  /**
   * Years the person had worked for the victim when the scheme ended, only
   * where the source states a hire year or a length of service. 0 means under
   * a year. Absent otherwise; never inferred from how long the scheme ran.
   */
  tenureYearsStated?: number;
  detection: DetectionRoute;
  /** Approximate headcount of the victim organization, where reported. */
  victimSize?: string;
  /** Year the case resolved (sentencing or plea), for recency signalling. */
  resolvedYear?: number;
  /**
   * IDs from sod/conflict-rules.ts that this case demonstrates. A rule belongs
   * here only when `howItWorked` or `controlGap` shows the insider held both
   * duties the rule pairs. Empty when the record shows no named pair: the case
   * is then found by its schemes and shown only under the heading "A related
   * scheme". scripts/verify-evidence.mjs warns when a record mentions neither
   * duty of a rule it cites.
   */
  sodRuleIds: string[];
  /**
   * What would plausibly have caught it.
   *
   * Each entry names a canonical control plus the phrasing that fits this
   * case. The canonical id is what lets the recommendation list count how many
   * real cases a given control would have stopped; `asApplied` is what the
   * case card shows, so the advice stays concrete rather than generic.
   */
  wouldHaveCaughtIt: { control: ControlId; asApplied: string }[];
  source: EvidenceSource;
  /** Anything a careful reader should know about the figures. */
  caveat?: string;
}

/** A published statistic, with its exact provenance. */
export interface Benchmark {
  id: string;
  label: string;
  /** The figure itself, kept as a string so units and qualifiers survive. */
  value: string;
  /** Numeric form where a computation needs it. */
  numeric?: number;
  /** What the figure means for a small business, in one sentence. */
  soWhat: string;
  study: string;
  studyYear: number;
  source: EvidenceSource;
  /**
   * Page of the study the figure appears on, once someone has checked it
   * against the published report. Left empty until then; never filled from
   * memory or from a secondary summary.
   */
  page?: string;
  /** Figure or table number in the study, under the same rule as `page`. */
  figure?: string;
  caveat?: string;
}
