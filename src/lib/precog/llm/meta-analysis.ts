/**
 * What this app can and cannot see about a business.
 *
 * The inventory sorts what the app knows into four kinds:
 *   Known knowns     — facts it measures directly from the profile
 *   Known unknowns   — gaps it knows it has (inputs it does not receive)
 *   Unknown unknowns — areas outside what the model covers at all
 *   Unknown knowns   — what the owner and staff know that the app never records
 *
 * Each gap carries a concrete step that would close it. Decision support, not
 * actuarial or legal advice.
 */
import { detectSodConflicts, sodDetectionOptions } from "../sod/detect";
import { resolveTemplate } from "../active-template";
import type { DecisionEntry, PracticeProfile } from "../practice-profile";
import { pluralTeamLabel } from "../industry";
import { portfolioSummary } from "../scoring/residual-engine";
import { scoreLeadingIndicators } from "../ml/leading-indicators";
import { HEALTH_SCALE } from "../scoring/bands";
import { count, joinWithAnd } from "../text";
import {
  knownUnknowns as knownUnknownItems,
  unknownUnknowns as unknownUnknownItems,
} from "./meta-analysis-gaps";
import { INVENTORY_WORDS, type InventoryWords } from "./meta-analysis-words";
import { residualScope } from "../scoring/scope";
import { DEFAULT_WEIGHTS } from "../scoring/weights";

export type EpistemicClass = "known_known" | "known_unknown" | "unknown_unknown" | "unknown_known";

export interface EpistemicItem {
  id: string;
  classification: EpistemicClass;
  title: string;
  description: string;
  severity: UnknownSeverity;
  /** Which parts of the app are blind or partial without this. */
  affects: string[];
  /** How much this gap weighs when ordering the gaps (0–1); an ordering weight, not a measurement. */
  confidenceDrag: number;
  /** Concrete next action that would turn the gap into something the app knows. */
  probe?: {
    kind: ProbeKind;
    action: string;
    effort: "minutes" | "hours" | "days";
    expectedLift: string;
  };
  link?: { tab: string; id?: string };
  /** The owner changes this in Business settings, on the business menu, not on a tab. */
  opensBusinessSettings?: true;
  /** For known knowns: what the app measured. */
  metric?: string;
}

interface MetaAnalysisReport {
  generatedAt: string;
  practiceName: string;
  realtimeCapabilities: RealtimeCapability[];
  items: EpistemicItem[];
  summary: {
    knownKnowns: number;
    knownUnknowns: number;
    unknownUnknowns: number;
    unknownKnowns: number;
    criticalUnknowns: number;
    topProbe: string;
  };
  /** Johari-style panes for the control system. */
  johari: {
    /** Known to the owner and measured by the app. */
    open: string[];
    /** What the app's checks show about this business that the owner may not have taken in. */
    blind: string[];
    /** What the owner knows that the app does not record. */
    hidden: string[];
    /** What neither sees yet. */
    unknown: string[];
  };
  narrative: string[];
  recommendations: string[];
}

type UnknownSeverity = "critical" | "high" | "medium" | "low";

type ProbeKind =
  | "data_capture"
  | "interview"
  | "sample_test"
  | "system_export"
  | "external_stat"
  | "scenario_design"
  | "process_walk";

interface RealtimeCapability {
  id: string;
  label: string;
  ready: boolean;
  latencyClass: "instant" | "subsecond" | "batch" | "manual";
  description: string;
  dependency: string;
}

export function runMetaAnalysis(profile: PracticeProfile): MetaAnalysisReport {
  const words = INVENTORY_WORDS[profile.industry];
  const facts = businessFacts(profile);
  const items = sortItems(inventoryItems(profile, facts, words));
  const realtimeCapabilities = realtimeCapabilitiesFor(words);
  const byClass = (c: EpistemicClass) => items.filter((i) => i.classification === c);
  const knownKnowns = byClass("known_known").length;
  const knownUnknowns = byClass("known_unknown").length;
  const unknownUnknowns = byClass("unknown_unknown").length;
  const criticalUnknowns = items.filter(
    (i) =>
      i.classification !== "known_known" && (i.severity === "critical" || i.severity === "high"),
  ).length;

  const probes = items.filter((i) => i.probe).sort((a, b) => b.confidenceDrag - a.confidenceDrag);
  const topProbe = probes[0]?.probe?.action ?? "Record who reconciles the bank, and when";
  const rtReady = realtimeCapabilities.filter((c) => c.ready).length;

  return {
    generatedAt: new Date().toISOString(),
    practiceName: profile.practiceName,
    realtimeCapabilities,
    items,
    summary: {
      knownKnowns,
      knownUnknowns,
      unknownUnknowns,
      unknownKnowns: byClass("unknown_known").length,
      criticalUnknowns,
      topProbe,
    },
    johari: {
      open: byClass("known_known")
        .map((i) => i.title)
        .slice(0, 6),
      blind: blindPane(facts),
      hidden: byClass("unknown_known").map((i) => i.title),
      unknown: byClass("unknown_unknown")
        .map((i) => i.title)
        .slice(0, 6),
    },
    narrative: [
      `Precog measures ${knownKnowns} of these items directly from your profile, admits ${knownUnknowns} gaps it knows about, and lists ${unknownUnknowns} areas outside what it models.`,
      `${rtReady} of ${realtimeCapabilities.length} inputs re-score live from the profile; the rest need something imported or written down.`,
      `Most useful next step: ${topProbe}.`,
      "Areas outside the model are not a failure of diligence; they mark where the model stops. Treat them as questions to look into, not as risk scores.",
    ],
    recommendations: recommendationsFor(facts, probes, items),
  };
}

/** The facts about this business the inventory, the blind pane and the recommendations read. */
interface BusinessFacts {
  profile: PracticeProfile;
  tpl: ReturnType<typeof resolveTemplate>;
  decisions: DecisionEntry[];
  sod: ReturnType<typeof detectSodConflicts>;
  portfolio: ReturnType<typeof portfolioSummary>;
  breachedIndicators: number;
  /** Dual-release exceptions that switch dual release off for some payments. */
  waives: number;
}

function businessFacts(profile: PracticeProfile): BusinessFacts {
  const tpl = resolveTemplate(profile);
  const scope = residualScope(profile);
  const leading = scoreLeadingIndicators(
    tpl,
    profile.staff,
    profile.riskVariables,
    scope.confirmedScenarioIds,
  );
  return {
    profile,
    tpl,
    decisions: profile.decisions ?? [],
    sod: detectSodConflicts(tpl, profile.staff, sodDetectionOptions(tpl, profile.dualRelease)),
    portfolio: portfolioSummary(tpl, profile.staff, DEFAULT_WEIGHTS, scope),
    breachedIndicators: leading.indicators.filter((i) => i.status === "breach").length,
    waives: (profile.dualRelease.exceptions ?? []).filter(
      (e) => e.enabled && e.action === "waive_dual",
    ).length,
  };
}

function inventoryItems(
  profile: PracticeProfile,
  facts: BusinessFacts,
  words: InventoryWords,
): EpistemicItem[] {
  const { staff, dualRelease: dual } = profile;
  const { tpl, sod, portfolio, decisions } = facts;
  const items: EpistemicItem[] = [
    {
      id: "kk-staff-composition",
      classification: "known_known",
      title: "Team size, tenure, segregation score",
      description:
        "Precog records team size and the owner's own rating of how the business splits duties, and both feed the residual index, the scenarios and the duty-conflict check.",
      severity: "low",
      affects: ["residual", "precog", "sod"],
      confidenceDrag: 0,
      metric: `team ${staff.teamSize} · segregation ${staff.segregationScore} · tenure ${staff.avgTenureYears}y`,
      opensBusinessSettings: true,
    },
    {
      id: "kk-sod-matrix",
      classification: "known_known",
      title: "Duty conflicts",
      description: `The duty-conflict check found ${count(sod.conflicts.length, "conflict")} (${sod.summary.dualReleaseMitigated} covered by dual release).`,
      severity: "low",
      affects: ["sod", "coso"],
      confidenceDrag: 0,
      metric: `health ${sod.summary.segregationHealth}/100`,
      link: { tab: "sod" },
    },
    {
      id: "kk-knowledge-spof",
      classification: "known_known",
      title: "Who can do each duty",
      description: `${count(tpl.knowledge.length, "register entry", "register entries")} · ${count(tpl.relations.length, "person-to-duty link")} · duties only one person can do, per the profile: ${staff.soleOwnerKnowledgeCount}.`,
      severity: "low",
      affects: ["knowledge", "continuity"],
      confidenceDrag: 0,
      metric: `${tpl.people.filter((p) => p.active).length} active people`,
      link: { tab: "knowledge" },
    },
    {
      id: "kk-dual-release",
      classification: "known_known",
      title: "Dual-release policy state",
      description: dual.enabled
        ? `Policy on · ${count((dual.exceptions ?? []).filter((e) => e.enabled).length, "active exception")}.`
        : "Policy off, so dual release earns no credit.",
      severity: dual.enabled ? "low" : "medium",
      affects: ["sod", "insurance", "controls"],
      confidenceDrag: dual.enabled ? 0 : 0.08,
      metric: dual.enabled ? "on" : "off",
      link: { tab: "sod" },
    },
    {
      id: "kk-residual-portfolio",
      classification: "known_known",
      title: "Residual risk ranking",
      description: `Average residual ${portfolio.averageResidual}; ${portfolio.criticalPath} in the "fix first" band.`,
      severity: "low",
      affects: ["residual", "pioneer"],
      confidenceDrag: 0,
      metric: `avg ${portfolio.averageResidual}`,
      link: { tab: "residual" },
    },
    ...knownUnknownItems(words, decisions).map((gap) => ({
      ...gap,
      classification: "known_unknown" as const,
    })),
    ...unknownUnknownItems(words).map((gap) => ({
      ...gap,
      classification: "unknown_unknown" as const,
    })),
    {
      id: "uk-owner-gut",
      classification: "unknown_known",
      title: "Owner's tacit 'who I trust' map",
      description:
        "Owners often know which person they wouldn't leave alone with the deposit; that judgment rarely reaches the register.",
      severity: "medium",
      affects: ["knowledge", "sod"],
      confidenceDrag: 0.05,
      probe: {
        kind: "interview",
        action: "15-minute structured interview: trust, access, and 'never alone' rules",
        effort: "minutes",
        expectedLift: "Records the owner's judgment about people where Precog can use it",
      },
      link: { tab: "knowledge" },
    },
    {
      id: "uk-front-desk-workarounds",
      classification: "unknown_known",
      title: "Informal workarounds staff use daily",
      description:
        "Staff know about shared passwords, sticky-note overrides, and 'just this once' voids, but the model cannot see them until someone walks the process.",
      severity: "high",
      affects: ["process map", "controls"],
      confidenceDrag: 0.07,
      probe: {
        kind: "process_walk",
        action: "Shadow the front desk for one busy morning; note every workaround",
        effort: "hours",
        expectedLift: "Shows how controls run in practice, not only how someone designed them",
      },
      link: { tab: "map" },
    },
  ];

  if (facts.waives) {
    items.push({
      id: "ku-active-waives",
      classification: "known_unknown",
      title: "Active dual-release waivers",
      description: `${count(facts.waives, "waiver")} deliberately let one person release some payments; the business may have accepted the risk with no re-test on record.`,
      severity: "high",
      affects: ["dual-release", "insurance"],
      confidenceDrag: 0.06 * facts.waives,
      probe: {
        kind: "sample_test",
        action: "Review each waiver; attach a sample of the after-the-fact check that covers it",
        effort: "hours",
        expectedLift: "Keeps waivers from becoming silent permanent holes",
      },
      link: { tab: "sod" },
    });
  }

  if (!staff.independentBankRec) {
    items.push({
      id: "ku-no-indep-rec",
      classification: "known_unknown",
      title: "Independent bank reconciliation not recorded",
      description:
        "The profile does not record an independent bank reconciliation, so the cash and reconciliation risk stays high by design.",
      severity: "critical",
      affects: ["sod", "precog"],
      confidenceDrag: 0.1,
      probe: {
        kind: "data_capture",
        action:
          "Have the owner, or someone other than the bookkeeper, reconcile the bank each week; record it on Who controls what once it runs",
        effort: "hours",
        expectedLift: `Largest single control lift for small ${pluralTeamLabel(profile.industry)}`,
      },
      opensBusinessSettings: true,
    });
  }
  return items;
}

/** Unknown kinds first, then the most severe, then the heaviest gap. */
function sortItems(items: EpistemicItem[]): EpistemicItem[] {
  return [...items].sort(
    (a, b) =>
      CLASS_ORDER[a.classification] - CLASS_ORDER[b.classification] ||
      SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
      b.confidenceDrag - a.confidenceDrag,
  );
}

function realtimeCapabilitiesFor(words: InventoryWords): RealtimeCapability[] {
  return [
    {
      id: "rt-profile",
      label: "Business settings → residual re-score",
      ready: true,
      latencyClass: "instant",
      description: "Team and variable sliders recompute the residual index and leading indicators.",
      dependency: "local state",
    },
    {
      id: "rt-sod",
      label: "Duty-conflict re-scan",
      ready: true,
      latencyClass: "subsecond",
      description: "The duty-conflict check re-runs when dual release or its exceptions change.",
      dependency: "role templates + dual-release policy",
    },
    {
      id: "rt-dual-sim",
      label: "Dual-release simulator",
      ready: true,
      latencyClass: "instant",
      description: "Threshold exceptions change who must approve a payment immediately.",
      dependency: "dual-release policy",
    },
    {
      id: "rt-cascade",
      label: "Variable cascade / cost of risk",
      ready: true,
      latencyClass: "subsecond",
      description: "Insurance levers recompute the retained loss and its knock-on effects.",
      dependency: "dynamic variables",
    },
    {
      id: "rt-pioneer",
      label: "Pioneer brief",
      ready: true,
      latencyClass: "subsecond",
      description:
        "Pioneer rebuilds its brief from the current profile without waiting for a batch job.",
      dependency: "tool catalog",
    },
    {
      id: "rt-pms-stream",
      label: `Live ${words.system} transaction stream`,
      ready: false,
      latencyClass: "manual",
      description:
        "No live import of payments, voids, or claims, so Precog cannot watch transaction-level conditions.",
      dependency: `${words.system} API or scheduled CSV`,
    },
    {
      id: "rt-bank-feed",
      label: "Bank feed vs deposit match",
      ready: false,
      latencyClass: "manual",
      description: `Cannot flag a late deposit without joining the bank feed to the ${words.system}.`,
      dependency: "bank CSV or Open Banking",
    },
    {
      id: "rt-collusion",
      label: "Collusion / lifestyle analytics",
      ready: false,
      latencyClass: "batch",
      description: "Outside the model: nothing traces fraud that needs two or more people.",
      dependency: "a new kind of model",
    },
  ];
}

/**
 * What the app's checks show that the owner may not have taken in, built from
 * this business's own facts; nothing is listed that is not true of it.
 */
function blindPane(facts: BusinessFacts): string[] {
  const { staff } = facts.profile;
  const lines: string[] = [];
  if (facts.waives) {
    lines.push(
      `${count(facts.waives, "dual-release waiver")} let one person release some payments alone`,
    );
  }
  if (facts.breachedIndicators > 0 && staff.segregationScore >= HEALTH_SCALE.adequate) {
    lines.push(
      `${count(facts.breachedIndicators, "watched condition")} breached while separation of duties is self-rated as fine`,
    );
  }
  const top = facts.portfolio.top[0];
  if (top?.p50Days !== undefined) {
    lines.push(
      `${top.name}: Precog assumes about ${count(top.p50Days, "day")} before anyone would find it`,
    );
  }
  return lines.length ? lines : ["Nothing Precog sees that you have not marked."];
}

/** Recommendations that follow from this business's facts, then the standing ones. */
function recommendationsFor(
  facts: BusinessFacts,
  probes: EpistemicItem[],
  items: EpistemicItem[],
): string[] {
  const { profile, decisions } = facts;
  const missing = [
    profile.dualRelease.enabled ? "" : "turn on dual release",
    decisions.length ? "" : "log a first decision in the Decisions log",
  ].filter(Boolean);
  const topGap = probes.find((i) => i.classification === "known_unknown");
  const topOutside = items.find((i) => i.classification === "unknown_unknown");
  return [
    missing.length ? `Give Precog more to work with: ${joinWithAnd(missing)}.` : "",
    profile.staff.independentBankRec
      ? ""
      : "Read every index here with the gaps in mind while nobody independent reconciles the bank.",
    topGap ? `Close the top known gap: ${topGap.title}.` : "",
    topOutside ? `Look into the top area outside the model: ${topOutside.title}.` : "",
    "Schedule a weekly export of voids, payments, and write-offs so Precog can watch transaction-level conditions.",
    "Re-run this check after any dual-release exception, team change, or new Decisions log entry.",
  ].filter(Boolean);
}

const CLASS_ORDER: Record<EpistemicClass, number> = {
  unknown_unknown: 0,
  known_unknown: 1,
  unknown_known: 2,
  known_known: 3,
};

const SEVERITY_ORDER: Record<UnknownSeverity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};
