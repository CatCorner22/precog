/**
 * Known gaps and blind spots the meta-analysis lists for every business.
 * Wording follows the industry inventory; the items themselves do not change.
 */
import type { DecisionEntry } from "../practice-profile";
import { count } from "../text";
import type { EpistemicItem } from "./meta-analysis";
import type { InventoryWords } from "./meta-analysis-words";

export function knownUnknowns(
  words: InventoryWords,
  decisions: readonly DecisionEntry[],
): Omit<EpistemicItem, "classification">[] {
  const reviewed = decisions.filter((d) => d.reviews?.length).length;
  return [
    {
      id: "ku-actual-cash-counts",
      title: "Actual cash drawer variance history",
      description: `No daily cash count is compared with the ${words.system}, so lapping and skimming are judged from assumptions, not records.`,
      severity: "critical",
      affects: ["precog", "watched conditions", "cash process"],
      confidenceDrag: 0.12,
      probe: {
        kind: "system_export",
        action:
          "Compare 90 days of drawer close reports with the deposit slips yourself; this app cannot import them yet",
        effort: "hours",
        expectedLift: "Shows whether the cash scenarios' assumptions match what happened",
      },
      link: { tab: "map", id: "proc-cash" },
    },
    {
      id: "ku-bank-rec-cadence",
      title: "Bank reconciliation dates and findings",
      description:
        "Independent bank reconciliation is recorded as yes or no, not as dated work with the exceptions found.",
      severity: "high",
      affects: ["sod", "monitoring", "coso"],
      confidenceDrag: 0.09,
      probe: {
        kind: "data_capture",
        action:
          "Note the last 6 reconciliation dates, who did each, and how many items were left open",
        effort: "minutes",
        expectedLift: "Turns the reconciliation from a yes/no answer into a measured control",
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
        expectedLift: "Grounds the assumed size of an employee theft loss in your own history",
      },
      link: { tab: "precog" },
    },
    {
      id: "ku-pms-audit-log",
      title: `${capitalize(words.system)} void / adjustment audit log`,
      description:
        "Write-off dual-release thresholds exist, but live void/adjustment velocity is not streamed.",
      severity: "high",
      affects: ["watched conditions", "ar process", "sod"],
      confidenceDrag: 0.1,
      probe: {
        kind: "system_export",
        action: "Weekly export of voids, write-offs, and user who posted",
        effort: "hours",
        expectedLift: "Lets the app watch the billing path at transaction level",
      },
      link: { tab: "map", id: "proc-ar" },
    },
    {
      id: "ku-vendor-master-changes",
      title: "Vendor master change log",
      description:
        "The invented-vendor path is modeled; the real vendor additions and edits are not imported.",
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
        "Bonded cash handlers are recorded as yes or no, with no expiry date per person.",
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
      title: `${capitalize(words.payer)} refund authorization trail`,
      description: `A ${words.payer} refund moves cash out with nothing coming back, and one person can originate, approve, and record it. The refund path is not yet a process node with dual release.`,
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
      description: decisions.length
        ? `${count(decisions.length, "Decisions log entry", "Decisions log entries")}, ${reviewed} with a review recorded.`
        : "No Decisions log entry yet, so no fix has a recorded review.",
      severity: decisions.length < 2 ? "medium" : "low",
      affects: ["monitoring", "coso"],
      confidenceDrag: decisions.length < 2 ? 0.05 : 0.02,
      probe: {
        kind: "interview",
        action: "After each remediate decision, attach proof (policy, bank setting, screenshot)",
        effort: "minutes",
        expectedLift: "Turns decisions into documented control evidence",
      },
      link: { tab: "journal" },
    },
  ];
}

export function unknownUnknowns(words: InventoryWords): Omit<EpistemicItem, "classification">[] {
  return [
    {
      id: "uu-collusion-rings",
      title: "Collusion between two or more people",
      description: `The duty-conflict check finds one person holding two duties. Two people working together (${words.pair}) can pass dual release by design, and the app does not model collusion or lifestyle red flags.`,
      severity: "critical",
      affects: ["sod", "dual-release", "precog"],
      confidenceDrag: 0.14,
      probe: {
        kind: "scenario_design",
        action: "Add collusion scenario: dual signers who are related / share finances",
        effort: "days",
        expectedLift: "Takes the model beyond one person holding two duties",
      },
    },
    {
      id: "uu-cyber-ransomware-ops",
      title: "Cyber / ransomware operational cascade",
      description: `The model covers fraud, operations and continuity. ${words.hostageData}, and how long a restore would take or how much data it would lose, are outside the residual index today.`,
      severity: "critical",
      affects: ["continuity", "insurance", "layers"],
      confidenceDrag: 0.11,
      probe: {
        kind: "external_stat",
        action:
          "Read your cyber policy's terms and note the date of the last test restore from backup (outside this app)",
        effort: "hours",
        expectedLift: "Opens a new residual domain Pioneer can score",
      },
      link: { tab: "layers" },
    },
    {
      id: "uu-regulatory-hipaa-ocr",
      title: words.regulator,
      description: words.regulatorDetail,
      severity: "high",
      affects: ["coso", "residual"],
      confidenceDrag: 0.08,
      probe: {
        kind: "scenario_design",
        action: words.regulatorProbe,
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
        action: "Name a stand-in second signer and an attorney-in-fact for a 30-day absence",
        effort: "hours",
        expectedLift: "Removes silent assumption that owner is always the control",
      },
      link: { tab: "sod" },
    },
    {
      id: "uu-supply-chain-lab-integrity",
      title: `${words.partners} integrity failure`,
      description: `Outside partners can commit fraud (${words.partnerFraud}) without any duty conflict inside the business.`,
      severity: "high",
      affects: ["ap", "claims", "process map"],
      confidenceDrag: 0.07,
      probe: {
        kind: "sample_test",
        action: words.partnerCheck,
        effort: "hours",
        expectedLift: "Surfaces external custody risks",
      },
    },
    {
      id: "uu-ai-tooling-risk",
      title: "Pioneer's own model risk",
      description:
        "Pioneer's advice can create false confidence. This list exists to say that residual risk scores rest on this app's assumptions, not on measurements.",
      severity: "medium",
      affects: ["pioneer", "all modules"],
      confidenceDrag: 0.06,
      probe: {
        kind: "interview",
        action: "Have a person sign off any residual below 40 before treating it as 'safe'",
        effort: "minutes",
        expectedLift: "Guards against AI overconfidence",
      },
      link: { tab: "pioneer" },
    },
    {
      id: "uu-macro-payer-shock",
      title: words.revenueShock,
      description:
        "Revenue continuity shocks change fraud pressure and cash intensity; not in dynamic variable graph yet.",
      severity: "medium",
      affects: ["dynamic variables", "precog"],
      confidenceDrag: 0.05,
      probe: {
        kind: "data_capture",
        action: words.revenueProbe,
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
}

function capitalize(text: string): string {
  return `${text[0].toUpperCase()}${text.slice(1)}`;
}
