/**
 * Epistemic Meta-Analysis Engine
 * --------------------------------
 * Real-time evaluation of how well Precog can evaluate the practice —
 * not just residual risk, but the *quality of knowing*.
 *
 * Rumsfeld taxonomy (adapted for internal control coaching):
 *   Known knowns     — measured facts the platform can score confidently
 *   Known unknowns   — gaps we know we don't have (missing inputs / probes)
 *   Unknown unknowns — blind spots the model structure itself cannot see
 *                      without expanding its ontology
 *
 * Also scores:
 *   - Real-time evaluation readiness (can we re-score on input change?)
 *   - Input observability / freshness
 *   - Coverage of risk surface
 *   - Probe recommendations to convert unknowns → knowns
 *
 * Educational / decision-support — not actuarial or legal advice.
 */
import { controls, knowledge, people, relations, scenarios } from "../demo-data";
import { detectSodConflicts } from "../sod/detect";
import { mitigatedSodRuleIds } from "../controls/dual-release";
import type { DualReleasePolicy } from "../controls/dual-release";
import type { PracticeProfile } from "../practice-profile";
import { portfolioSummary } from "../scoring/residual-engine";
import { scoreLeadingIndicators } from "../ml/leading-indicators";
import { scoreAnomalies } from "../ml/anomaly";

export type EpistemicClass =
  | "known_known"
  | "known_unknown"
  | "unknown_unknown"
  | "unknown_known"; // tacit knowledge we fail to encode

export type UnknownSeverity = "critical" | "high" | "medium" | "low";

export type ProbeKind =
  | "data_capture"
  | "interview"
  | "sample_test"
  | "system_export"
  | "external_stat"
  | "scenario_design"
  | "process_walk";

export interface EpistemicItem {
  id: string;
  classification: EpistemicClass;
  title: string;
  description: string;
  severity: UnknownSeverity;
  /** Which platform modules are blind or partial without this */
  affects: string[];
  /** How confident (0–1) we are in current evaluation despite this gap */
  confidenceDrag: number;
  /** Concrete next action to convert toward known known */
  probe?: {
    kind: ProbeKind;
    action: string;
    effort: "minutes" | "hours" | "days";
    expectedLift: string;
  };
  link?: { tab: string; id?: string };
  /** For known knowns: what we measured */
  metric?: string;
}

export interface RealtimeCapability {
  id: string;
  label: string;
  ready: boolean;
  latencyClass: "instant" | "subsecond" | "batch" | "manual";
  description: string;
  dependency: string;
}

export interface CoverageSlice {
  domain: string;
  coveredPct: number;
  knownKnowns: number;
  knownUnknowns: number;
  unknownUnknowns: number;
  note: string;
}

export interface MetaAnalysisReport {
  generatedAt: string;
  practiceName: string;
  /** 0–100: how well the platform can evaluate *right now* given inputs */
  evaluationReadiness: number;
  readinessBand: "fragile" | "partial" | "solid" | "high";
  /** 0–100: confidence that residual/Precog numbers aren't lying by omission */
  epistemicConfidence: number;
  confidenceBand: "low" | "moderate" | "good" | "high";
  /** Real-time re-evaluation capability */
  realtimeScore: number;
  realtimeCapabilities: RealtimeCapability[];
  items: EpistemicItem[];
  coverage: CoverageSlice[];
  summary: {
    knownKnowns: number;
    knownUnknowns: number;
    unknownUnknowns: number;
    unknownKnowns: number;
    criticalUnknowns: number;
    topProbe: string;
  };
  /** Johari-style windows for the control system */
  johari: {
    open: string[]; // known to practice + platform
    blind: string[]; // platform sees, practice may not
    hidden: string[]; // practice knows, platform doesn't capture
    unknown: string[]; // neither sees yet
  };
  narrative: string[];
  recommendations: string[];
}

function bandReadiness(n: number): MetaAnalysisReport["readinessBand"] {
  if (n >= 80) return "high";
  if (n >= 60) return "solid";
  if (n >= 40) return "partial";
  return "fragile";
}

function bandConfidence(n: number): MetaAnalysisReport["confidenceBand"] {
  if (n >= 78) return "high";
  if (n >= 60) return "good";
  if (n >= 42) return "moderate";
  return "low";
}

function clamp(n: number, lo = 0, hi = 100) {
  return Math.max(lo, Math.min(hi, Math.round(n)));
}

/**
 * Run epistemic meta-analysis over current practice profile + demo corpus.
 */
export function runMetaAnalysis(profile: PracticeProfile): MetaAnalysisReport {
  const staff = profile.staff;
  const vars = profile.riskVariables;
  const dual = profile.dualRelease;
  const decisions = profile.decisions ?? [];
  const sod = detectSodConflicts(staff, {
    dualReleaseMitigatedRuleIds: mitigatedSodRuleIds(dual),
  });
  const portfolio = portfolioSummary(staff);
  const leading = scoreLeadingIndicators(staff, vars);
  const anomaly = scoreAnomalies(staff, vars);

  const items: EpistemicItem[] = [];

  // ─── Known knowns (what we can evaluate confidently now) ───
  items.push({
    id: "kk-staff-composition",
    classification: "known_known",
    title: "Staff size, tenure, segregation score",
    description:
      "Team composition and self-rated segregation are captured and flow into residual, Precog, and SoD health.",
    severity: "low",
    affects: ["residual", "precog", "sod"],
    confidenceDrag: 0,
    metric: `n=${staff.teamSize} · seg=${staff.segregationScore} · tenure=${staff.avgTenureYears}y`,
    link: { tab: "command" },
  });

  items.push({
    id: "kk-sod-matrix",
    classification: "known_known",
    title: "SoD entitlement conflicts",
    description: `Pairwise conflict engine scored ${sod.conflicts.length} conflicts (${sod.summary.dualReleaseMitigated} dual-mitigated).`,
    severity: "low",
    affects: ["sod", "coso"],
    confidenceDrag: 0,
    metric: `health ${sod.summary.segregationHealth}/100`,
    link: { tab: "sod" },
  });

  items.push({
    id: "kk-knowledge-spof",
    classification: "known_known",
    title: "Knowledge SPOF graph",
    description: `${knowledge.length} knowledge items · ${relations.length} edges · sole-owner count in profile: ${staff.soleOwnerKnowledgeCount}.`,
    severity: "low",
    affects: ["knowledge", "continuity"],
    confidenceDrag: 0,
    metric: `${people.filter((p) => p.active).length} active people`,
    link: { tab: "knowledge" },
  });

  items.push({
    id: "kk-dual-release",
    classification: "known_known",
    title: "Dual-release policy state",
    description: dual.enabled
      ? `Policy ON · ${(dual.exceptions ?? []).filter((e) => e.enabled).length} active exception(s).`
      : "Policy OFF — dual control not credited.",
    severity: dual.enabled ? "low" : "medium",
    affects: ["sod", "insurance", "controls"],
    confidenceDrag: dual.enabled ? 0 : 0.08,
    metric: dual.enabled ? "enabled" : "disabled",
    link: { tab: "sod" },
  });

  items.push({
    id: "kk-residual-portfolio",
    classification: "known_known",
    title: "Residual portfolio ranking",
    description: `Average residual ${portfolio.averageResidual}; ${portfolio.criticalPath} on critical path.`,
    severity: "low",
    affects: ["residual", "pioneer"],
    confidenceDrag: 0,
    metric: `avg ${portfolio.averageResidual}`,
    link: { tab: "residual" },
  });

  // ─── Known unknowns (we know we're missing these) ───
  const ku: Omit<EpistemicItem, "classification">[] = [
    {
      id: "ku-actual-cash-counts",
      title: "Actual cash drawer variance history",
      description:
        "No imported daily cash-count vs PMS variance series. Lapping and skim detection stay prior-driven.",
      severity: "critical",
      affects: ["precog", "ml-anomaly", "cash process"],
      confidenceDrag: 0.12,
      probe: {
        kind: "system_export",
        action: "Export 90 days of drawer close reports + deposit logs; upload CSV",
        effort: "hours",
        expectedLift: "+12–18 pts epistemic confidence on cash scenarios",
      },
      link: { tab: "map", id: "proc-cash" },
    },
    {
      id: "ku-bank-rec-cadence",
      title: "Bank recon completion dates & findings",
      description:
        "Independent bank rec is a boolean, not a dated workpaper trail with exception rates.",
      severity: "high",
      affects: ["sod", "monitoring", "coso"],
      confidenceDrag: 0.09,
      probe: {
        kind: "data_capture",
        action: "Log last 6 recon dates, who performed, open items count",
        effort: "minutes",
        expectedLift: "Converts recon control from flag → measured control",
      },
      link: { tab: "sod" },
    },
    {
      id: "ku-insurance-claims-loss-runs",
      title: "Carrier loss runs & incident history",
      description:
        "Claims load factor is editable but not grounded in actual loss runs or denied crime claims.",
      severity: "high",
      affects: ["insurance", "cor", "dynamic variables"],
      confidenceDrag: 0.08,
      probe: {
        kind: "external_stat",
        action: "Request 5-year loss runs from crime/property carrier",
        effort: "days",
        expectedLift: "Calibrates severity priors for employee dishonesty",
      },
      link: { tab: "precog" },
    },
    {
      id: "ku-pms-audit-log",
      title: "PMS void / adjustment audit log",
      description:
        "Write-off dual release thresholds exist, but live void/adjustment velocity is not streamed.",
      severity: "high",
      affects: ["ml-anomaly", "ar process", "sod"],
      confidenceDrag: 0.1,
      probe: {
        kind: "system_export",
        action: "Weekly export of voids, write-offs, and user who posted",
        effort: "hours",
        expectedLift: "Enables real-time anomaly scoring on billing fraud path",
      },
      link: { tab: "map", id: "proc-ar" },
    },
    {
      id: "ku-vendor-master-changes",
      title: "Vendor master change log",
      description:
        "Fictitious vendor path is modeled; actual create/edit events are not ingested.",
      severity: "high",
      affects: ["ap", "dual-release", "precog"],
      confidenceDrag: 0.07,
      probe: {
        kind: "sample_test",
        action: "Sample all vendors added in 12 months; verify owner approval",
        effort: "hours",
        expectedLift: "Grounds vendor-fraud residual in observed control failure rate",
      },
      link: { tab: "map", id: "proc-ap" },
    },
    {
      id: "ku-background-check-dates",
      title: "Bonding & background-check currency",
      description:
        "Bonded-cash-handler flag exists without expiration dates per person.",
      severity: "medium",
      affects: ["insurance discount", "people risk"],
      confidenceDrag: 0.04,
      probe: {
        kind: "data_capture",
        action: "Record bond/background dates and renewal for cash handlers",
        effort: "minutes",
        expectedLift: "Protects discount eligibility evidence",
      },
    },
    {
      id: "ku-patient-refund-controls",
      title: "Patient refund authorization trail",
      description:
        "Refunds are a common dental fraud vector not yet a first-class process node with dual release.",
      severity: "medium",
      affects: ["process map", "sod rules"],
      confidenceDrag: 0.05,
      probe: {
        kind: "process_walk",
        action: "Walk refund workflow; add process + dual-release channel if material",
        effort: "hours",
        expectedLift: "Closes a known model gap",
      },
      link: { tab: "map" },
    },
    {
      id: "ku-decision-followthrough",
      title: "Remediation completion evidence",
      description: `${decisions.length} journal entries; few carry evidence artifacts that control actually changed.`,
      severity: decisions.length < 2 ? "medium" : "low",
      affects: ["monitoring", "coso"],
      confidenceDrag: decisions.length < 2 ? 0.05 : 0.02,
      probe: {
        kind: "interview",
        action: "After each remediate decision, attach proof (policy, bank setting, screenshot)",
        effort: "minutes",
        expectedLift: "Turns decisions into audit-ready control evidence",
      },
      link: { tab: "journal" },
    },
  ];

  for (const k of ku) {
    items.push({ ...k, classification: "known_unknown" });
  }

  // ─── Unknown unknowns (ontology / black-swan blind spots) ───
  const uu: Omit<EpistemicItem, "classification">[] = [
    {
      id: "uu-collusion-rings",
      title: "Multi-party collusion outside pairwise SoD",
      description:
        "SoD detects one-person conflicts. Two-person collusion (front desk + OM) can pass dual release by design. Platform does not model collusion graphs or lifestyle red flags.",
      severity: "critical",
      affects: ["sod", "dual-release", "precog"],
      confidenceDrag: 0.14,
      probe: {
        kind: "scenario_design",
        action: "Add collusion scenario: dual signers who are related / share finances",
        effort: "days",
        expectedLift: "Expands ontology beyond pairwise SoD",
      },
    },
    {
      id: "uu-cyber-ransomware-ops",
      title: "Cyber / ransomware operational cascade",
      description:
        "Model is fraud/ops/continuity oriented. Full PMS hostage, ePHI extortion, and restoration RTO/RPO are outside residual drivers today.",
      severity: "critical",
      affects: ["continuity", "insurance", "layers"],
      confidenceDrag: 0.11,
      probe: {
        kind: "external_stat",
        action: "Import cyber insurance terms + last backup restore test date",
        effort: "hours",
        expectedLift: "Opens a new residual domain the coach can score",
      },
      link: { tab: "layers" },
    },
    {
      id: "uu-regulatory-hipaa-ocr",
      title: "HIPAA / OCR enforcement trajectory",
      description:
        "Privacy breaches and OCR civil money penalties are not linked to control failures (e.g. snooping, misdirected claims).",
      severity: "high",
      affects: ["coso", "residual"],
      confidenceDrag: 0.08,
      probe: {
        kind: "scenario_design",
        action: "Add OCR/HIPAA breach butterfly scenario tied to access admin entitlements",
        effort: "days",
        expectedLift: "Connects access control to regulatory severity",
      },
    },
    {
      id: "uu-owner-impairment",
      title: "Owner incapacity / divorce / addiction",
      description:
        "When the dual-release second signer is the owner, owner impairment is a single point of failure the model treats as always available.",
      severity: "high",
      affects: ["dual-release", "continuity", "knowledge"],
      confidenceDrag: 0.09,
      probe: {
        kind: "interview",
        action: "Designate backup second signer + attorney-in-fact for 30-day cover",
        effort: "hours",
        expectedLift: "Removes silent assumption that owner is always the control",
      },
      link: { tab: "sod" },
    },
    {
      id: "uu-supply-chain-lab-integrity",
      title: "Lab / DSO / clearinghouse integrity failure",
      description:
        "External partners can inject fraud (inflated lab bills, claim re-routing) without internal SoD firing.",
      severity: "high",
      affects: ["ap", "claims", "process map"],
      confidenceDrag: 0.07,
      probe: {
        kind: "sample_test",
        action: "Reconcile lab invoices to cases completed for 30 days",
        effort: "hours",
        expectedLift: "Surfaces external custody risks",
      },
    },
    {
      id: "uu-ai-tooling-risk",
      title: "This coach's own model risk",
      description:
        "Pioneer guidance can create false confidence (automation bias). Meta-analysis exists to flag that residual scores are educational priors, not truth.",
      severity: "medium",
      affects: ["pioneer", "all modules"],
      confidenceDrag: 0.06,
      probe: {
        kind: "interview",
        action: "Require human sign-off on any residual <40 before treating as 'safe'",
        effort: "minutes",
        expectedLift: "Guards against AI overconfidence",
      },
      link: { tab: "pioneer" },
    },
    {
      id: "uu-macro-payer-shock",
      title: "Payer mix / Medicaid cliff / fee schedule shock",
      description:
        "Revenue continuity shocks change fraud pressure and cash intensity; not in dynamic variable graph yet.",
      severity: "medium",
      affects: ["dynamic variables", "precog"],
      confidenceDrag: 0.05,
      probe: {
        kind: "data_capture",
        action: "Add payer-mix % and largest payer concentration to practice profile",
        effort: "minutes",
        expectedLift: "Links macro revenue risk to cash/fraud intensity",
      },
    },
    {
      id: "uu-cultural-silence",
      title: "Psychological safety / fear of reporting",
      description:
        "Controls assume someone will escalate. A culture of silence is an unknown unknown that nullifies monitoring.",
      severity: "high",
      affects: ["monitoring", "coso", "journal"],
      confidenceDrag: 0.08,
      probe: {
        kind: "interview",
        action: "Anonymous staff pulse: 'Would you report cash concerns about a peer?'",
        effort: "hours",
        expectedLift: "Tests whether detective controls can fire",
      },
    },
  ];

  for (const u of uu) {
    items.push({ ...u, classification: "unknown_unknown" });
  }

  // ─── Unknown knowns (tacit knowledge not encoded) ───
  items.push({
    id: "uk-owner-gut",
    classification: "unknown_known",
    title: "Owner's tacit 'who I trust' map",
    description:
      "Owners often know which employee they wouldn't leave alone with the deposit — that judgment rarely enters the knowledge graph.",
    severity: "medium",
    affects: ["knowledge", "sod"],
    confidenceDrag: 0.05,
    probe: {
      kind: "interview",
      action: "15-min structured interview: trust, access, and 'never alone' rules",
      effort: "minutes",
      expectedLift: "Encodes tacit risk into person-level weights",
    },
    link: { tab: "knowledge" },
  });

  items.push({
    id: "uk-front-desk-workarounds",
    classification: "unknown_known",
    title: "Informal workarounds staff use daily",
    description:
      "Shared passwords, sticky-note overrides, and 'just this once' voids are known to staff, invisible to the model until walked.",
    severity: "high",
    affects: ["process map", "controls"],
    confidenceDrag: 0.07,
    probe: {
      kind: "process_walk",
      action: "Shadow front desk for one busy morning; log every workaround",
      effort: "hours",
      expectedLift: "Surfaces control design vs control operating reality",
    },
    link: { tab: "map" },
  });

  // Dynamic: if dual waive exceptions, escalate known unknown
  const waives = (dual.exceptions ?? []).filter(
    (e) => e.enabled && e.action === "waive_dual",
  );
  if (waives.length) {
    items.push({
      id: "ku-active-waives",
      classification: "known_unknown",
      title: "Active dual-release waives",
      description: `${waives.length} waive exception(s) deliberately create control gaps — residual may be accepted without re-test evidence.`,
      severity: "high",
      affects: ["dual-release", "insurance"],
      confidenceDrag: 0.06 * waives.length,
      probe: {
        kind: "sample_test",
        action: "Review each waive; attach compensating detective control samples",
        effort: "hours",
        expectedLift: "Keeps waives from becoming silent permanent holes",
      },
      link: { tab: "sod" },
    });
  }

  if (!staff.independentBankRec) {
    items.push({
      id: "ku-no-indep-rec",
      classification: "known_unknown",
      title: "Independent bank rec not asserted",
      description: "Profile flag off — cash/recon SoD residual stays elevated by design.",
      severity: "critical",
      affects: ["sod", "precog"],
      confidenceDrag: 0.1,
      probe: {
        kind: "data_capture",
        action: "Assign owner or bookkeeper to weekly bank rec; flip flag when live",
        effort: "hours",
        expectedLift: "Largest single control lift for small practices",
      },
      link: { tab: "command" },
    });
  }

  // ─── Real-time evaluation capabilities ───
  const realtimeCapabilities: RealtimeCapability[] = [
    {
      id: "rt-profile",
      label: "Practice profile → residual re-score",
      ready: true,
      latencyClass: "instant",
      description: "Staff & variable sliders recompute residual, leading indicators, anomaly.",
      dependency: "local state",
    },
    {
      id: "rt-sod",
      label: "SoD conflict re-scan",
      ready: true,
      latencyClass: "subsecond",
      description: "Entitlement matrix re-runs when dual release / exceptions change.",
      dependency: "role templates + dual policy",
    },
    {
      id: "rt-dual-sim",
      label: "Dual-release simulator",
      ready: true,
      latencyClass: "instant",
      description: "Threshold exceptions resolve effective dual requirement immediately.",
      dependency: "dual-release policy",
    },
    {
      id: "rt-cascade",
      label: "Variable cascade / CoR",
      ready: true,
      latencyClass: "subsecond",
      description: "Insurance levers recompute retained EL and second-order effects.",
      dependency: "dynamic variables",
    },
    {
      id: "rt-pioneer",
      label: "Pioneer agent loop",
      ready: true,
      latencyClass: "subsecond",
      description: "Tool-grounded brief rebuilds from current profile without waiting for batch jobs.",
      dependency: "tool catalog",
    },
    {
      id: "rt-pms-stream",
      label: "Live PMS transaction stream",
      ready: false,
      latencyClass: "manual",
      description: "No live webhook/import of payments, voids, claims — anomaly stays prior-based.",
      dependency: "PMS API or scheduled CSV",
    },
    {
      id: "rt-bank-feed",
      label: "Bank feed vs deposit match",
      ready: false,
      latencyClass: "manual",
      description: "Cannot auto-flag deposit lag without bank/PMS join.",
      dependency: "bank CSV or Open Banking",
    },
    {
      id: "rt-collusion",
      label: "Collusion / lifestyle analytics",
      ready: false,
      latencyClass: "batch",
      description: "Unknown-unknown domain — no graph features for multi-party fraud.",
      dependency: "new model ontology",
    },
  ];

  const rtReady = realtimeCapabilities.filter((c) => c.ready).length;
  const realtimeScore = clamp(
    (rtReady / realtimeCapabilities.length) * 100 +
      (vars.hasDualControl ? 4 : 0) +
      (staff.independentBankRec ? 4 : 0) -
      (waives.length * 3),
  );

  // ─── Scores ───
  const drag = items
    .filter((i) => i.classification !== "known_known")
    .reduce((s, i) => s + i.confidenceDrag, 0);

  const knownKnowns = items.filter((i) => i.classification === "known_known").length;
  const knownUnknowns = items.filter((i) => i.classification === "known_unknown").length;
  const unknownUnknowns = items.filter((i) => i.classification === "unknown_unknown").length;
  const unknownKnowns = items.filter((i) => i.classification === "unknown_known").length;
  const criticalUnknowns = items.filter(
    (i) =>
      i.classification !== "known_known" &&
      (i.severity === "critical" || i.severity === "high"),
  ).length;

  // Evaluation readiness: can we evaluate inputs we *have* in real time?
  let evaluationReadiness =
    38 +
    knownKnowns * 6 +
    rtReady * 5 +
    (dual.enabled ? 6 : 0) +
    (decisions.length > 0 ? 4 : 0) +
    (staff.segregationScore >= 40 ? 4 : 0) -
    criticalUnknowns * 2;
  evaluationReadiness = clamp(evaluationReadiness);

  // Epistemic confidence: how much should we trust the outputs?
  let epistemicConfidence =
    72 -
    drag * 100 * 0.55 +
    (anomaly.overallScore < 40 ? 4 : anomaly.overallScore > 70 ? -6 : 0) +
    (leading.pressureIndex < 45 ? 3 : leading.pressureIndex > 70 ? -5 : 0) +
    Math.min(8, decisions.length);
  epistemicConfidence = clamp(epistemicConfidence);

  // Coverage slices
  const coverage: CoverageSlice[] = [
    {
      domain: "Cash & deposits",
      coveredPct: clamp(55 - (items.find((i) => i.id === "ku-actual-cash-counts") ? 20 : 0) + (dual.enabled ? 10 : 0)),
      knownKnowns: 1,
      knownUnknowns: 2,
      unknownUnknowns: 1,
      note: "Strong structural model; weak transaction evidence",
    },
    {
      domain: "SoD & dual release",
      coveredPct: clamp(70 + (dual.enabled ? 12 : -10) - waives.length * 8),
      knownKnowns: 2,
      knownUnknowns: 1,
      unknownUnknowns: 2,
      note: "Pairwise solid; collusion & owner impairment are blind spots",
    },
    {
      domain: "Knowledge continuity",
      coveredPct: 68,
      knownKnowns: 1,
      knownUnknowns: 0,
      unknownUnknowns: 1,
      note: "SPOF map good; tacit trust map not captured",
    },
    {
      domain: "Insurance / CoR",
      coveredPct: clamp(50 + (vars.hasDualControl ? 8 : 0) + (vars.hasSecurityCameras ? 5 : 0)),
      knownKnowns: 1,
      knownUnknowns: 2,
      unknownUnknowns: 1,
      note: "Discount levers live; loss runs missing",
    },
    {
      domain: "Cyber / regulatory",
      coveredPct: 18,
      knownKnowns: 0,
      knownUnknowns: 0,
      unknownUnknowns: 2,
      note: "Largely outside current ontology",
    },
    {
      domain: "Culture & monitoring",
      coveredPct: clamp(35 + Math.min(15, decisions.length * 3)),
      knownKnowns: 0,
      knownUnknowns: 1,
      unknownUnknowns: 1,
      note: "Journal helps; psychological safety unmeasured",
    },
  ];

  // Johari-style
  const johari = {
    open: items
      .filter((i) => i.classification === "known_known")
      .map((i) => i.title)
      .slice(0, 6),
    blind: [
      "Dual-release exception residual accumulation",
      "Anomaly pressure vs self-rated segregation mismatch",
      "Scenario p50 timelines the owner may not have internalized",
    ],
    hidden: items
      .filter((i) => i.classification === "unknown_known")
      .map((i) => i.title),
    unknown: items
      .filter((i) => i.classification === "unknown_unknown")
      .map((i) => i.title)
      .slice(0, 6),
  };

  const sortedProbes = items
    .filter((i) => i.probe)
    .sort((a, b) => b.confidenceDrag - a.confidenceDrag);

  const topProbe =
    sortedProbes[0]?.probe?.action ??
    "Capture independent bank recon dates and cash variance history";

  const narrative = [
    `Evaluation readiness is ${evaluationReadiness}/100 (${bandReadiness(evaluationReadiness)}) — the platform can re-score ${rtReady}/${realtimeCapabilities.length} capability streams in real time from profile inputs.`,
    `Epistemic confidence is ${epistemicConfidence}/100 (${bandConfidence(epistemicConfidence)}) after ${knownUnknowns} known unknowns and ${unknownUnknowns} unknown unknowns dragged confidence by ~${Math.round(drag * 100)} pts.`,
    `Leading pressure ${leading.pressureIndex}/100 · anomaly ${anomaly.overallScore}/100 · SoD health ${sod.summary.segregationHealth}/100 · residual avg ${portfolio.averageResidual}.`,
    `Highest-leverage probe: ${topProbe}.`,
    "Unknown unknowns are not failures of diligence — they mark edges of the model. Treat them as research backlog, not residual scores.",
  ];

  const recommendations: string[] = [];
  if (evaluationReadiness < 55) {
    recommendations.push(
      "Raise readiness: enable dual release, complete practice profile, log first decision.",
    );
  }
  if (epistemicConfidence < 55) {
    recommendations.push(
      "Trust outputs less until cash variance + bank rec evidence is loaded.",
    );
  }
  recommendations.push(
    `Convert top known unknown: ${sortedProbes.find((i) => i.classification === "known_unknown")?.title ?? "cash counts"}.`,
  );
  recommendations.push(
    `Expand ontology for top unknown unknown: ${items.find((i) => i.classification === "unknown_unknown")?.title ?? "collusion"}.`,
  );
  if (!realtimeCapabilities.find((c) => c.id === "rt-pms-stream")?.ready) {
    recommendations.push(
      "Schedule weekly PMS export (voids, payments, write-offs) to unlock real-time anomaly.",
    );
  }
  recommendations.push(
    "Re-run this meta-analysis after any dual-release exception, staff change, or new journal decision.",
  );

  // Sort items: critical unknowns first, then by drag
  items.sort((a, b) => {
    const classOrder = {
      unknown_unknown: 0,
      known_unknown: 1,
      unknown_known: 2,
      known_known: 3,
    };
    const sevOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    if (classOrder[a.classification] !== classOrder[b.classification]) {
      return classOrder[a.classification] - classOrder[b.classification];
    }
    if (sevOrder[a.severity] !== sevOrder[b.severity]) {
      return sevOrder[a.severity] - sevOrder[b.severity];
    }
    return b.confidenceDrag - a.confidenceDrag;
  });

  return {
    generatedAt: new Date().toISOString(),
    practiceName: profile.practiceName,
    evaluationReadiness,
    readinessBand: bandReadiness(evaluationReadiness),
    epistemicConfidence,
    confidenceBand: bandConfidence(epistemicConfidence),
    realtimeScore,
    realtimeCapabilities,
    items,
    coverage,
    summary: {
      knownKnowns,
      knownUnknowns,
      unknownUnknowns,
      unknownKnowns,
      criticalUnknowns,
      topProbe,
    },
    johari,
    narrative,
    recommendations,
  };
}

/** Lightweight real-time tick — recompute only scores for HMR-friendly UI polls */
export function quickReadiness(profile: PracticeProfile): {
  evaluationReadiness: number;
  epistemicConfidence: number;
  realtimeScore: number;
  criticalUnknowns: number;
} {
  const full = runMetaAnalysis(profile);
  return {
    evaluationReadiness: full.evaluationReadiness,
    epistemicConfidence: full.epistemicConfidence,
    realtimeScore: full.realtimeScore,
    criticalUnknowns: full.summary.criticalUnknowns,
  };
}
