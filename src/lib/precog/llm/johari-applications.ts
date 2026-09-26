/**
 * The Johari window applied to a small business's controls.
 *
 * Classic model (Luft & Ingham, 1955): a 2×2 of known to self × known to
 * others. Here "self" is the owner and staff, and "others" is what this app,
 * the accountant, the insurer and outside reviewers can see.
 *
 * Goal: enlarge the OPEN pane; shrink BLIND, HIDDEN and UNKNOWN through
 * feedback (app → owner) and disclosure (owner → app). Every example is
 * written for any line of business.
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

interface JohariMove {
  id: string;
  from: JohariQuadrant;
  to: JohariQuadrant;
  mechanism: "feedback" | "disclosure" | "shared_discovery" | "experiment";
  action: string;
  effort: "minutes" | "hours" | "days";
  precogTab?: string;
}

interface JohariQuadrantGuide {
  id: JohariQuadrant;
  classicName: string;
  classicMeaning: string;
  precogMeaning: string;
  axes: { self: boolean; others: boolean };
  riskIfLarge: string;
  goal: string;
  examples: string[];
  moves: JohariMove[];
  color: "ok" | "warn" | "primary" | "danger";
}

interface JohariDomainApp {
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
  whyItMatters: string;
}

interface JohariApplicationPlaybook {
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
  metrics: { name: string; how: string; target: string; basis: string }[];
}

export const JOHARI_PLAYBOOK: JohariApplicationPlaybook = {
  modelOrigin:
    "Joseph Luft & Harrington Ingham (1955) — interpersonal awareness model; adapted here for a small business's controls.",
  coreInsight:
    "Trust and control quality improve when the OPEN pane grows: what the business knows about itself and what outside eyes (this app, the accountant, the insurer, staff feedback) also know.",
  axesRemap: {
    self: "The business (how the owner and staff really work, what they know, their workarounds)",
    others:
      "Outside eyes (this app's checks, dual-release logs, bank reconciliation, auditors, insurer, peer feedback)",
  },
  strategicGoals: [
    "Enlarge OPEN: document controls that both operate and are measured",
    "Shrink BLIND: feed the app's residual, duty-conflict, and indicator findings back to the owner weekly",
    "Shrink HIDDEN: record the owner's judgment, informal rules and who-trusts-whom in the register",
    "Shrink UNKNOWN: run checks on the areas outside the model and add scenarios for what they find",
  ],
  quadrants: [
    {
      id: "open",
      classicName: "Open / Arena",
      classicMeaning: "Known to self and known to others — shared, discussable reality.",
      precogMeaning:
        "Controls and facts that are both true in the business and recorded in this app (staff size, dual-release policy on or off, duty conflicts, residual rankings).",
      axes: { self: true, others: true },
      riskIfLarge:
        "Low — large open area is healthy. Risk only if OPEN is theater (documented but not operating).",
      goal: "Grow this pane: more shared, evidenced control truth.",
      examples: [
        "Owner and app both know the owner alone reconciles the bank each week",
        "Transfers over $500 need a second approver, and the rule is written down and switched on",
        "Every critical duty only one person can do is listed with a named backup",
      ],
      moves: [
        {
          id: "m-open-maintain",
          from: "open",
          to: "open",
          mechanism: "experiment",
          action: "Re-run the what-the-app-can-see check after each control change",
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
        "What the app's residual, duty-conflict and indicator checks see that the owner has not taken in (for example, duty separation weaker than the owner's own rating, or dual-release waivers adding up).",
      axes: { self: false, others: true },
      riskIfLarge:
        "High — owner overconfidence; the insurance and residual figures drift from the owner's own account.",
      goal: "Move BLIND into OPEN through regular feedback (the coach's brief, the residual ranking, duty-conflict badges).",
      examples: [
        "The app flags one person who can both add a vendor and pay it; the owner thought 'we're too small for that'",
        "Watched conditions breached while the owner rates the culture as strong",
        "Exceptions to dual release pile up until the insurance credit for dual control is at risk",
      ],
      moves: [
        {
          id: "m-blind-feedback",
          from: "blind",
          to: "open",
          mechanism: "feedback",
          action:
            "Weekly 15-minute review: the top 5 residual risks, open critical duty conflicts, and known gaps",
          effort: "minutes",
          precogTab: "residual",
        },
        {
          id: "m-blind-pioneer",
          from: "blind",
          to: "open",
          mechanism: "feedback",
          action: "Ask the coach: 'What am I not seeing in cash and bill-payment controls?'",
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
        "What the business knows but never recorded: who is never left alone with the deposit, informal void workarounds, family members as the two signers, dual-release waivers nobody logged.",
      axes: { self: true, others: false },
      riskIfLarge:
        "High — the app under-scores the risk, the coach gives false comfort, and an audit surprises the owner.",
      goal: "Move HIDDEN into OPEN by writing it into the profile, the register, dual-release exceptions and the Journal.",
      examples: [
        "The owner knows two staff who check each other's work share a home; the app does not model that",
        "A shared login to the main business system 'for speed' was never recorded as a control failure",
        "The refund process exists only in the office manager's head",
      ],
      moves: [
        {
          id: "m-hidden-interview",
          from: "hidden",
          to: "open",
          mechanism: "disclosure",
          action:
            "Structured 15-minute interview: who is trusted with what, never-alone rules, workarounds",
          effort: "minutes",
          precogTab: "knowledge",
        },
        {
          id: "m-hidden-walk",
          from: "hidden",
          to: "open",
          mechanism: "disclosure",
          action:
            "Walk one process end to end; add what you find to the register and the process map",
          effort: "hours",
          precogTab: "map",
        },
        {
          id: "m-hidden-exception",
          from: "hidden",
          to: "open",
          mechanism: "disclosure",
          action:
            "Log every informal dual-release exception with its reason and a note on the risk",
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
        "Areas outside the model: fraud by two or more people together, how long a ransomware outage would last, a culture of silence, the loss of the largest customer or funder, the owner falling ill — neither the business nor this app sees them yet.",
      axes: { self: false, others: false },
      riskIfLarge:
        "Critical for rare, severe events — the residual looks fine until the model grows.",
      goal: "Name each one as a known gap first, then move it to OPEN with a check or a new scenario.",
      examples: [
        "Nobody has asked whether the two people who sign together share household finances",
        "Nobody has tested restoring from backup, so how long a ransomware outage would last is unknown",
        "Staff would not report cash concerns about a popular colleague",
      ],
      moves: [
        {
          id: "m-unknown-meta",
          from: "unknown",
          to: "blind",
          mechanism: "shared_discovery",
          action: "Pick the top area outside the model and name someone to look into it",
          effort: "hours",
          precogTab: "intel",
        },
        {
          id: "m-unknown-probe",
          from: "unknown",
          to: "hidden",
          mechanism: "experiment",
          action:
            "Run one check (for example, an anonymous question on whether staff feel safe reporting)",
          effort: "hours",
          precogTab: "intel",
        },
        {
          id: "m-unknown-scenario",
          from: "unknown",
          to: "open",
          mechanism: "shared_discovery",
          action: "Add a scenario for any new way things could go wrong that you find",
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
      othersLabel: "Staff, coach and app view",
      openExample: "Owner states 'I approve write-offs >$150' and dual-release enforces it",
      blindExample: "Staff see owner rarely reviews exception reports; residual shows it",
      hiddenExample: "Owner distrusts a specific employee but never changes access",
      unknownExample: "Neither party sees burnout leading to control shortcuts",
      primaryMove: "Monthly: read the residual ranking and ask staff one question",
      whyItMatters:
        "The owner is often the only second signer, so a blind spot here is a control only one person holds.",
    },
    {
      domain: "internal_control",
      title: "Internal control system design",
      summary: "Treat each COSO component as a Johari pane: documented, operating, and measured.",
      selfLabel: "Intended control design",
      othersLabel: "Evidence / operating effectiveness",
      openExample: "Policy + dual release + samples in journal",
      blindExample: "Design looks good; the void-rate indicator is at breach",
      hiddenExample: "A compensating control only the office manager knows about",
      unknownExample: "A new refund fraud path no control covers",
      primaryMove: "Give each critical control either evidence it runs or a check to find out",
      whyItMatters: "Small teams confuse 'we meant to separate duties' with 'we separate duties'.",
    },
    {
      domain: "knowledge_continuity",
      title: "Knowledge & continuity",
      summary:
        "Who can do each duty is OPEN; unwritten expertise is HIDDEN; cross-training gaps may be BLIND.",
      selfLabel: "What experts know they know",
      othersLabel: "What the register records",
      openExample: "Written steps for the hardest recurring task, with a named backup",
      blindExample: "The app shows one person holds a duty; they believe 'anyone can do it'",
      hiddenExample: "Vendor relationships only the office manager holds, written nowhere",
      unknownExample: "A key person planning to leave, unknown to the owner and the app",
      primaryMove: "Interview each expert; add what they alone can do to the register",
      whyItMatters: "Continuity risk stays HIDDEN or UNKNOWN until someone quits.",
    },
    {
      domain: "sod_dual_release",
      title: "Duty conflicts & dual release",
      summary:
        "Who holds which duty is OPEN once checked; collusion and piled-up exceptions are often HIDDEN or UNKNOWN.",
      selfLabel: "How roles were meant to be split",
      othersLabel: "The duty-conflict check and the release simulator",
      openExample: "Duty conflicts listed, each marked when dual release covers it",
      blindExample: "The owner has not noticed raised thresholds wore away the dual-control credit",
      hiddenExample: "The two signers share a household, and nobody said so",
      unknownExample: "Fraud that needs three people, which a two-duty check cannot see",
      primaryMove: "Every month: read the duty-conflict list and the exception list",
      whyItMatters:
        "One person holding two duties is OPEN; people working together stays UNKNOWN until the model grows.",
    },
    {
      domain: "insurance_underwriting",
      title: "Insurance & cost of risk",
      summary: "Application answers are HIDDEN until disclosed; loss runs move UNKNOWN → OPEN.",
      selfLabel: "The owner's account of the risk",
      othersLabel: "The insurer and the cost-of-risk figure",
      openExample: "Dual control + cameras reflected in discount variables",
      blindExample: "The insurer would decline; the owner thinks the premium is 'fine'",
      hiddenExample: "Prior employee theft never reported to carrier",
      unknownExample: "Emerging cyber endorsement gaps",
      primaryMove: "Tell the insurer the loss history; set the policy figures here to match",
      whyItMatters:
        "HIDDEN facts that do not match the application cause coverage disputes after a claim.",
    },
    {
      domain: "ai_coach_trust",
      title: "AI coach trustworthiness",
      summary:
        "The what-the-app-can-see check is the Johari window for the tool itself: what it knows, and where trusting it blindly goes wrong.",
      selfLabel: "What the model claims",
      othersLabel: "What the evidence and the known gaps support",
      openExample: "A residual figure shown with the duty conflicts and cases behind it",
      blindExample: "A residual of 35 read as 'safe' without looking at the known gaps",
      hiddenExample: "The model's limits stay out of sight until someone opens the gaps list",
      unknownExample: "Ways things could go wrong that the model was never built to see",
      primaryMove: "Read every coach brief next to the list of known gaps",
      whyItMatters: "Keeps an AI answer from giving false comfort, a modern blind spot.",
    },
    {
      domain: "team_culture",
      title: "Psychological safety & reporting",
      summary: "Culture of silence keeps fraud signals in UNKNOWN or HIDDEN for observers.",
      selfLabel: "Staff private concerns",
      othersLabel: "Ways to raise a concern, the Journal, what the owner hears",
      openExample: "Anonymous pulse + clear escalate path used once",
      blindExample: "Owner thinks 'open door' works; staff disagree",
      hiddenExample: "Front desk sees cash shortfalls, doesn't report",
      unknownExample: "No one has tested whether reporting is safe",
      primaryMove: "Anonymous question: would you report cash concerns about a peer?",
      whyItMatters:
        "Checks that rely on someone speaking up fail silently when nobody feels safe to.",
    },
    {
      domain: "process_operations",
      title: "Day-to-day process operations",
      summary: "Lean waste and workarounds: the process map is OPEN only once someone walks it.",
      selfLabel: "How work actually runs",
      othersLabel: "Written procedures and the process map",
      openExample: "Cash process with risks, waste, owners on map",
      blindExample: "Owner believes SOP; shadow shows shared login",
      hiddenExample: "Speed hacks staff won't admit in meetings",
      unknownExample: "A seasonal pattern in refunds or write-offs nobody has noticed yet",
      primaryMove: "Walk one process a month; update the map and its ideas",
      whyItMatters: "How work really runs is the only control that matters.",
    },
  ],
  controlCoachingLoop: [
    "1. List what is OPEN (what the app measures) — credit the controls that run",
    "2. Bring BLIND spots out through the app's feedback (residual, duty conflicts, indicators, known gaps)",
    "3. Invite HIDDEN knowledge out (interviews, exception logging, who-trusts-whom)",
    "4. Take on UNKNOWN areas with checks and new scenarios (the list of areas outside the model)",
    "5. Re-run the what-the-app-can-see check — OPEN should grow each cycle",
    "6. Log decisions so what is OPEN has written evidence",
  ],
  antiPatterns: [
    "Growing OPEN with paperwork only (facade compliance)",
    "Using dual-release waivers without a note on the risk (HIDDEN debt)",
    "Treating the coach's figures as truth without reading the known gaps (AI blind spot)",
    "Never asking staff about reporting safety (culture UNKNOWN stays forever)",
    "One-time Johari workshop with no re-measure",
  ],
  metrics: [
    {
      name: "Open control ratio",
      how: "Count of critical controls with both design + operating evidence / total critical",
      target: ">70% within 90 days",
      basis:
        "A goal this playbook sets for a small team, not a published benchmark. Adjust it to your own programme.",
    },
    {
      name: "Blind feedback cadence",
      how: "Days since the owner last read the residual ranking and the critical duty conflicts",
      target: "≤14 days",
      basis:
        "A goal this playbook sets for a small team, not a published benchmark. Adjust it to your own programme.",
    },
    {
      name: "Hidden disclosure events",
      how: "Journal entries, register links and exceptions added after interviews",
      target: "≥2 per month during onboarding",
      basis:
        "A goal this playbook sets for a small team, not a published benchmark. Adjust it to your own programme.",
    },
    {
      name: "Areas outside the model under review",
      how: "Areas outside the model with a named check in progress",
      target: "≥1 check in progress at all times",
      basis:
        "A goal this playbook sets for a small team, not a published benchmark. Adjust it to your own programme.",
    },
    {
      name: "Known gaps closed",
      how: "Known gaps turned into something the app measures, per cycle",
      target: "At least one per cycle",
      basis:
        "A goal this playbook sets for a small team, not a published benchmark. Adjust it to your own programme.",
    },
  ],
};

export function johariQuadrantFromEpistemic(classification: string): JohariQuadrant {
  switch (classification) {
    case "known_known":
      return "open";
    case "known_unknown":
      return "blind"; // a gap the app knows of, which the owner may not have taken in
    case "unknown_known":
      return "hidden";
    case "unknown_unknown":
      return "unknown";
    default:
      return "unknown";
  }
}
