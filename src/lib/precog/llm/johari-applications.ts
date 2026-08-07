/**
 * Johari Window applications for Precog control coaching.
 *
 * Classic model (Luft & Ingham, 1955): 2×2 of
 *   Known to self × Known to others
 *
 * Precog remaps "self" ↔ practice owner / staff reality
 * and "others" ↔ platform sensors, auditors, carriers, peers.
 *
 * Goal: enlarge OPEN area for controls; shrink BLIND / HIDDEN / UNKNOWN
 * via feedback (platform → owner) and disclosure (owner → platform).
 *
 * Educational — not clinical psychology or HR assessment.
 */

export type JohariQuadrant = "open" | "blind" | "hidden" | "unknown";

export type JohariDomain =
  | "leadership"
  | "internal_control"
  | "knowledge_continuity"
  | "sod_dual_release"
  | "insurance_underwriting"
  | "ai_coach_trust"
  | "team_culture"
  | "process_operations";

export interface JohariMove {
  id: string;
  from: JohariQuadrant;
  to: JohariQuadrant;
  mechanism: "feedback" | "disclosure" | "shared_discovery" | "experiment";
  action: string;
  effort: "minutes" | "hours" | "days";
  precogTab?: string;
}

export interface JohariQuadrantGuide {
  id: JohariQuadrant;
  classicName: string;
  classicMeaning: string;
  precogMeaning: string;
  axes: { self: boolean; others: boolean };
  riskIfLarge: string;
  goal: string;
  dentalExamples: string[];
  moves: JohariMove[];
  color: "ok" | "warn" | "primary" | "danger";
}

export interface JohariDomainApp {
  domain: JohariDomain;
  title: string;
  summary: string;
  selfLabel: string;
  othersLabel: string;
  openExample: string;
  blindExample: string;
  hiddenExample: string;
  unknownExample: string;
  primaryMove: string;
  valueForDental: string;
}

export interface JohariApplicationPlaybook {
  modelOrigin: string;
  coreInsight: string;
  axesRemap: {
    self: string;
    others: string;
  };
  strategicGoals: string[];
  quadrants: JohariQuadrantGuide[];
  domains: JohariDomainApp[];
  controlCoachingLoop: string[];
  antiPatterns: string[];
  metrics: { name: string; how: string; target: string }[];
}

export const JOHARI_PLAYBOOK: JohariApplicationPlaybook = {
  modelOrigin:
    "Joseph Luft & Harrington Ingham (1955) — interpersonal awareness model; adapted here for small-practice control systems.",
  coreInsight:
    "Trust and control quality improve when the OPEN pane grows: what the practice knows about itself and what external sensors (platform, CPA, carrier, staff feedback) also know.",
  axesRemap: {
    self: "Practice (owner + staff operating reality, tacit knowledge, workarounds)",
    others:
      "Observers (Precog scores, dual-release logs, bank rec, auditors, insurance, peer feedback)",
  },
  strategicGoals: [
    "Enlarge OPEN: document controls that both operate and are measured",
    "Shrink BLIND: feed platform residual / SoD / anomaly findings back to owner weekly",
    "Shrink HIDDEN: encode owner gut feel, informal rules, and trust maps into the knowledge graph",
    "Shrink UNKNOWN: run probes and ontology expansion (meta-analysis unknown unknowns)",
  ],
  quadrants: [
    {
      id: "open",
      classicName: "Open / Arena",
      classicMeaning: "Known to self and known to others — shared, discussable reality.",
      precogMeaning:
        "Controls and facts that are both true in the practice and captured in Precog (staff size, dual-release policy on/off, tagged SoD conflicts, residual rankings).",
      axes: { self: true, others: true },
      riskIfLarge: "Low — large open area is healthy. Risk only if OPEN is theater (documented but not operating).",
      goal: "Grow this pane: more shared, evidenced control truth.",
      dentalExamples: [
        "Owner and platform both know bank rec is owner-only weekly",
        "Dual ACH threshold $500 is written, enabled, and simulated",
        "Critical knowledge SPOFs listed with named backup owners",
      ],
      moves: [
        {
          id: "m-open-maintain",
          from: "open",
          to: "open",
          mechanism: "experiment",
          action: "Re-run meta-analysis after each control change; keep OPEN inventory current",
          effort: "minutes",
          precogTab: "intel",
        },
      ],
      color: "ok",
    },
    {
      id: "blind",
      classicName: "Blind spot",
      classicMeaning: "Unknown to self, known to others — needs feedback.",
      precogMeaning:
        "What Precog / SoD / anomaly / residual engines see that the owner has not internalized (e.g., segregation health lagging self-rated score, dual-waive residual drag).",
      axes: { self: false, others: true },
      riskIfLarge:
        "High — owner overconfidence; insurance and residual numbers diverge from self-story.",
      goal: "Convert BLIND → OPEN via structured feedback (Pioneer brief, residual radar, SoD badges).",
      dentalExamples: [
        "Platform flags OM vendor+pay conflict; owner thought 'we're fine because small'",
        "Anomaly pressure high while owner rates culture as strong",
        "Exception raises stack until dual-control insurance credit is at risk",
      ],
      moves: [
        {
          id: "m-blind-feedback",
          from: "blind",
          to: "open",
          mechanism: "feedback",
          action: "Weekly 15-min review: residual top 5 + SoD critical open + meta readiness",
          effort: "minutes",
          precogTab: "residual",
        },
        {
          id: "m-blind-pioneer",
          from: "blind",
          to: "open",
          mechanism: "feedback",
          action: "Run Pioneer: 'What am I not seeing in cash and AP controls?'",
          effort: "minutes",
          precogTab: "pioneer",
        },
      ],
      color: "warn",
    },
    {
      id: "hidden",
      classicName: "Hidden / Facade",
      classicMeaning: "Known to self, unknown to others — needs disclosure.",
      precogMeaning:
        "Tacit practice knowledge not encoded: who is never left alone with the deposit, informal void workarounds, family-member dual signers, temporary dual waives not logged.",
      axes: { self: true, others: false },
      riskIfLarge:
        "High — platform under-scores risk; coach gives false comfort; audits surprise the owner.",
      goal: "Convert HIDDEN → OPEN via disclosure into profile, knowledge map, dual exceptions, journal.",
      dentalExamples: [
        "Owner knows front desk and OM are roommates — collusion path not modeled",
        "Shared PMS password for 'speed' never entered as control failure",
        "Refund process only exists in office manager's head",
      ],
      moves: [
        {
          id: "m-hidden-interview",
          from: "hidden",
          to: "open",
          mechanism: "disclosure",
          action: "Structured 15-min interview: trust map, never-alone rules, workarounds",
          effort: "minutes",
          precogTab: "knowledge",
        },
        {
          id: "m-hidden-walk",
          from: "hidden",
          to: "open",
          mechanism: "disclosure",
          action: "Process walk front desk → post to knowledge + process map",
          effort: "hours",
          precogTab: "map",
        },
        {
          id: "m-hidden-exception",
          from: "hidden",
          to: "open",
          mechanism: "disclosure",
          action: "Log every informal dual-release exception with reason + residual note",
          effort: "minutes",
          precogTab: "sod",
        },
      ],
      color: "primary",
    },
    {
      id: "unknown",
      classicName: "Unknown / Mystery",
      classicMeaning: "Unknown to self and unknown to others — joint discovery.",
      precogMeaning:
        "Unknown unknowns and unmodeled domains: collusion graphs, cyber RTO, culture of silence, payer cliffs, owner impairment — neither practice nor Precog currently sees them.",
      axes: { self: false, others: false },
      riskIfLarge:
        "Critical for black-swan paths — residual looks fine until ontology expands.",
      goal: "Convert UNKNOWN → known-unknown (admit gap) then OPEN via probes and new scenarios.",
      dentalExamples: [
        "No one has asked whether dual signers share household finances",
        "Backup restore never tested — ransomware RTO unknown to all",
        "Staff would not report cash concerns about a popular peer",
      ],
      moves: [
        {
          id: "m-unknown-meta",
          from: "unknown",
          to: "blind",
          mechanism: "shared_discovery",
          action: "Meta-analysis: promote top UU to research backlog with named owner",
          effort: "hours",
          precogTab: "intel",
        },
        {
          id: "m-unknown-probe",
          from: "unknown",
          to: "hidden",
          mechanism: "experiment",
          action: "Run one probe (e.g., anonymous pulse on reporting safety)",
          effort: "hours",
          precogTab: "intel",
        },
        {
          id: "m-unknown-scenario",
          from: "unknown",
          to: "open",
          mechanism: "shared_discovery",
          action: "Add Precog scenario for newly discovered failure mode",
          effort: "days",
          precogTab: "precog",
        },
      ],
      color: "danger",
    },
  ],
  domains: [
    {
      domain: "leadership",
      title: "Owner / leadership self-awareness",
      summary:
        "Classic Johari: enlarge open leadership arena through feedback and selective disclosure.",
      selfLabel: "Owner self-view",
      othersLabel: "Staff / coach / platform view",
      openExample: "Owner states 'I approve write-offs >$150' and dual-release enforces it",
      blindExample: "Staff see owner rarely reviews exception reports; residual shows it",
      hiddenExample: "Owner distrusts a specific employee but never changes access",
      unknownExample: "Neither party sees burnout leading to control shortcuts",
      primaryMove: "360-light: platform residual + one staff pulse monthly",
      valueForDental:
        "Owner is often the only second signer — blind spots here are control SPOFs.",
    },
    {
      domain: "internal_control",
      title: "Internal control system design",
      summary:
        "Treat COSO components as Johari panes: documented vs operating vs measured.",
      selfLabel: "Intended control design",
      othersLabel: "Evidence / operating effectiveness",
      openExample: "Policy + dual release + samples in journal",
      blindExample: "Design looks good; anomaly shows void spikes",
      hiddenExample: "Compensating control only the OM knows",
      unknownExample: "New refund fraud path not in control matrix",
      primaryMove: "Map each critical control to OPEN evidence or a probe",
      valueForDental: "Small teams confuse 'we meant to segregate' with 'we segregate.'",
    },
    {
      domain: "knowledge_continuity",
      title: "Knowledge & continuity",
      summary: "SPOF map is OPEN; tacit expertise is HIDDEN; cross-train gaps may be BLIND.",
      selfLabel: "What experts know they know",
      othersLabel: "What the practice graph captures",
      openExample: "Billing denial playbook shared + backup named",
      blindExample: "Platform shows sole owner; person believes 'anyone can do claims'",
      hiddenExample: "Undocumented vendor relationships only OM holds",
      unknownExample: "Key person planning to leave — unknown to owner and system",
      primaryMove: "Disclosure interviews → knowledge map edges",
      valueForDental: "Continuity risk is mostly HIDDEN/UNKNOWN until someone quits.",
    },
    {
      domain: "sod_dual_release",
      title: "SoD & dual release",
      summary:
        "Entitlements OPEN when scanned; collusion and exception stacks often HIDDEN/UNKNOWN.",
      selfLabel: "Role design intent",
      othersLabel: "Conflict engine + release simulator",
      openExample: "Detected conflicts with dual-mitigated badges",
      blindExample: "Owner unaware raise-threshold exceptions eroded dual credit",
      hiddenExample: "Same household as dual signers — not disclosed",
      unknownExample: "Three-party collusion path not in pairwise matrix",
      primaryMove: "Feedback: SoD health + exception inventory every month",
      valueForDental: "Pairwise SoD is OPEN; collusion remains UNKNOWN until ontology grows.",
    },
    {
      domain: "insurance_underwriting",
      title: "Insurance & cost of risk",
      summary:
        "Application answers are HIDDEN until disclosed; loss runs move UNKNOWN → OPEN.",
      selfLabel: "Practice risk story",
      othersLabel: "Carrier / CoR model",
      openExample: "Dual control + cameras reflected in discount variables",
      blindExample: "Carrier would decline; practice thinks premium is 'fine'",
      hiddenExample: "Prior employee theft never reported to carrier",
      unknownExample: "Emerging cyber endorsement gaps",
      primaryMove: "Disclose loss history; align dynamic variables to truth",
      valueForDental: "Misaligned HIDDEN facts create coverage disputes after a claim.",
    },
    {
      domain: "ai_coach_trust",
      title: "AI coach trustworthiness",
      summary:
        "Meta-analysis is Johari for the tool itself: what Precog knows it knows vs blind automation bias.",
      selfLabel: "What the model claims",
      othersLabel: "What evidence + meta-analysis support",
      openExample: "Residual with cited SoD + scenario evidence chips",
      blindExample: "User treats residual 35 as 'safe' without epistemic confidence",
      hiddenExample: "Model limitations not shown until meta tab opened",
      unknownExample: "Future failure modes not in training ontology",
      primaryMove: "Always pair Pioneer briefs with epistemic confidence score",
      valueForDental: "Prevents AI false comfort — a modern blind-spot risk.",
    },
    {
      domain: "team_culture",
      title: "Psychological safety & reporting",
      summary:
        "Culture of silence keeps fraud signals in UNKNOWN or HIDDEN for observers.",
      selfLabel: "Staff private concerns",
      othersLabel: "Escalation channels / journal / owner awareness",
      openExample: "Anonymous pulse + clear escalate path used once",
      blindExample: "Owner thinks 'open door' works; staff disagree",
      hiddenExample: "Front desk sees cash shortfalls, doesn't report",
      unknownExample: "No one has tested whether reporting is safe",
      primaryMove: "Anonymous question: would you report cash concerns about a peer?",
      valueForDental: "Detective controls fail silently without safety.",
    },
    {
      domain: "process_operations",
      title: "Day-to-day process operations",
      summary: "Lean waste and workarounds: process map OPEN only when walked.",
      selfLabel: "How work actually runs",
      othersLabel: "Documented SOPs / map nodes",
      openExample: "Cash process with risks, waste, owners on map",
      blindExample: "Owner believes SOP; shadow shows shared login",
      hiddenExample: "Speed hacks staff won't admit in meetings",
      unknownExample: "Seasonal claim denial pattern not yet noticed",
      primaryMove: "One process walk per month → update map + ideas",
      valueForDental: "Operating reality is the only control that matters.",
    },
  ],
  controlCoachingLoop: [
    "1. Inventory OPEN (known knowns) — celebrate measured controls",
    "2. Surface BLIND via platform feedback (residual, SoD, anomaly, meta readiness)",
    "3. Invite HIDDEN disclosure (interviews, exception logging, trust map)",
    "4. Attack UNKNOWN with probes and scenario design (meta UU list)",
    "5. Re-score epistemic confidence — OPEN should grow each cycle",
    "6. Log decisions so OPEN becomes audit-ready evidence",
  ],
  antiPatterns: [
    "Growing OPEN with paperwork only (facade compliance)",
    "Using dual-release waives without residual notes (HIDDEN debt)",
    "Treating Pioneer scores as truth without meta confidence (AI blind spot)",
    "Never asking staff about reporting safety (culture UNKNOWN stays forever)",
    "One-time Johari workshop with no re-measure",
  ],
  metrics: [
    {
      name: "Open control ratio",
      how: "Count of critical controls with both design + operating evidence / total critical",
      target: ">70% within 90 days",
    },
    {
      name: "Blind feedback cadence",
      how: "Days since last owner review of residual + SoD critical list",
      target: "≤14 days",
    },
    {
      name: "Hidden disclosure events",
      how: "Journal + knowledge edges + exceptions added from interviews",
      target: "≥2 per month during onboarding",
    },
    {
      name: "Unknown probe rate",
      how: "Meta UU items with a named probe in progress",
      target: "≥1 active probe always",
    },
    {
      name: "Epistemic confidence",
      how: "Meta-analysis epistemicConfidence score",
      target: "Trend up after each probe cycle",
    },
  ],
};

/** Ranked moves for a practice given which quadrants are overloaded with items */
export function recommendJohariMoves(
  quadrantLoads: Partial<Record<JohariQuadrant, number>>,
): JohariMove[] {
  const order: JohariQuadrant[] = ["unknown", "blind", "hidden", "open"];
  const moves: JohariMove[] = [];
  for (const q of order) {
    const load = quadrantLoads[q] ?? 0;
    if (load <= 0 && q !== "open") continue;
    const guide = JOHARI_PLAYBOOK.quadrants.find((g) => g.id === q);
    if (!guide) continue;
    for (const m of guide.moves) {
      if (q === "open" && load > 0) {
        moves.push(m);
        break;
      }
      if (q !== "open") moves.push(m);
    }
  }
  return moves.slice(0, 6);
}

export function johariQuadrantFromEpistemic(
  classification: string,
): JohariQuadrant {
  switch (classification) {
    case "known_known":
      return "open";
    case "known_unknown":
      return "blind"; // known gap to platform, often not internalized
    case "unknown_known":
      return "hidden";
    case "unknown_unknown":
      return "unknown";
    default:
      return "unknown";
  }
}
