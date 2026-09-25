/**
 * Known gaps and blind spots the meta-analysis lists for every business.
 * Wording follows the industry inventory; the items themselves do not change.
 */
import type { EpistemicItem } from "./meta-analysis";
import type { InventoryWords } from "./meta-analysis-words";

function capitalize(text: string): string {
  return `${text[0].toUpperCase()}${text.slice(1)}`;
}

export function knownUnknowns(
  words: InventoryWords,
  decisionCount: number,
): Omit<EpistemicItem, "classification">[] {
  return [
    {
      id: "ku-actual-cash-counts",
      title: "Actual cash drawer variance history",
      description: `No imported daily cash-count vs ${words.system} variance series. Lapping and skim detection stay prior-driven.`,
      severity: "critical",
      affects: ["precog", "watched conditions", "cash process"],
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
      title: `${capitalize(words.system)} void / adjustment audit log`,
      description:
        "Write-off dual release thresholds exist, but live void/adjustment velocity is not streamed.",
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
      description: "Fictitious vendor path is modeled; actual create/edit events are not ingested.",
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
      description: "Bonded-cash-handler flag exists without expiration dates per person.",
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
      description: `${decisionCount} journal entries; few carry evidence artifacts that control actually changed.`,
      severity: decisionCount < 2 ? "medium" : "low",
      affects: ["monitoring", "coso"],
      confidenceDrag: decisionCount < 2 ? 0.05 : 0.02,
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
      title: "Multi-party collusion outside pairwise SoD",
      description: `SoD detects one-person conflicts. Two-person collusion (${words.pair}) can pass dual release by design. Platform does not model collusion graphs or lifestyle red flags.`,
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
      description: `Model is fraud/ops/continuity oriented. ${words.hostageData}, and restoration RTO/RPO are outside residual drivers today.`,
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
        action: "Designate backup second signer + attorney-in-fact for 30-day cover",
        effort: "hours",
        expectedLift: "Removes silent assumption that owner is always the control",
      },
      link: { tab: "sod" },
    },
    {
      id: "uu-supply-chain-lab-integrity",
      title: `${words.partners} integrity failure`,
      description: `External partners can inject fraud (${words.partnerFraud}) without internal SoD firing.`,
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
