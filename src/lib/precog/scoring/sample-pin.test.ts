import { describe, expect, it } from "vitest";
import { resolveTemplate } from "../active-template";
import { assessCoso } from "../coso";
import { rankDangerousScenarios } from "../engine";
import { INDUSTRIES, type IndustryId } from "../industry";
import { defaultProfile } from "../practice-profile";
import { buildThreatAssessment } from "../threat-scoring";
import { portfolioSummary, tornadoSensitivity } from "./residual-engine";

/**
 * The sample business's numbers, captured before the own-business scoping
 * changes (register not assessed, starter scenarios, no crime policy until
 * entered). None of those changes may move a sample figure: every row of the
 * residual register (inherent / effectiveness / residual), the average, the
 * tornado, the threat index and deck, the COSO index and the ranked scenarios
 * (gross, retained, assumed days, annual cost of risk) stay exactly as they
 * were for every industry.
 *
 * Later moves come from the duty-conflict engine, not from the
 * scoping changes, and are intended:
 * - A deposit preparer who can enter write-offs is flagged ("Collect cash +
 *   enter write-offs", read through deposit preparation), and it takes the
 *   deck slot "Deposit prep + payment posting" held at the same priority.
 * - The professional-services bookkeeper prepares deposits and reconciles,
 *   a new critical cash-custody finding that leads its deck.
 * - Findings that tie at the displayed score rank by their full score.
 * - The threat assessment reads the sample's own control records, as every
 *   other screen does: the accepted residual and compensating control on
 *   "SoD: payments vs reconciliation" lower the findings linked to it, so
 *   those findings sit lower in the deck.
 * - A manager who prepares the deposit and approves voids or write-offs is
 *   flagged ("Take payments + approve voids or write-offs"), and it enters
 *   the dental and restaurant decks.
 * - The deck holds one card per duty gap and none for the owner's own pairs,
 *   so a gap two people hold no longer takes two of the four duty-conflict
 *   slots; other gaps (payroll entry + release, release + reconciliation)
 *   take them, and the lowest single-point items drop off the top ten
 *   (professional-services threat index 90 to 91).
 * - Each sample's sole-owner count is read from its own register, as an
 *   owner's is, instead of a preset. Only the restaurant preset disagreed
 *   with its register (2 against 1), so only the restaurant figures move.
 * - Content added to three samples moves their figures, and only theirs:
 *   the dental and medical sample gains a controlled-drugs process, control,
 *   register item and scenario; the professional-services sample a
 *   three-way trust reconciliation process, two trust controls, a register
 *   item and a trust misappropriation scenario; the restaurant sample tip
 *   pool and sales tax processes, controls, a register item and two
 *   scenarios. Each new register item has one holder, so the dental and
 *   professional-services sole-owner counts rise from 2 to 3 and the
 *   restaurant's from 1 to 2. Retail and general are unchanged.
 * - The construction and nonprofit samples are new; their figures are
 *   pinned as first computed.
 * - Each scenario's kind is written down per scenario instead of read from
 *   words in its id. Payments to a fictitious subcontractor and skimmed
 *   donations are cash schemes like vendor fraud and the cash failure, so the
 *   daily cash figure scales them and they price like their shared
 *   counterparts; the construction and nonprofit figures move.
 * - No business is assumed to have a monitored alarm until the owner says
 *   so, and how often a scheme starts no longer lengthens how long one runs
 *   before it is found (the timeline follows detection lag only). Every
 *   sample's assumed days and annual cost of risk move.
 * - A control's fraud class and money exposure come from what it guards (the
 *   scenario that names it, or a cash, payment or trust duty), not from
 *   letters in its id: every control an industry fraud scenario names
 *   (trust, controlled drugs, sales tax, tip pool, subcontractors, change
 *   orders, field time, materials, gift log, restricted funds) rises, and
 *   board review falls. Dual payment control
 *   is credited to fraud scenarios only, so a departure scenario no longer
 *   falls when it is switched on.
 * - The tornado's cross-training lever gives every item one person holds a
 *   real second holder, so the register rows move with it and it leads most
 *   samples; the "grow the team" lever is gone.
 * - A scenario card in the threat deck takes its heat from the scenario's own
 *   residual-risk row (the index the Residual radar shows) instead of an
 *   unlabelled blend of retained dollars and days (S08-models-processes-013).
 *   For every sample that row equals the heat the card already showed, so no
 *   deck figure moves. (A departure scenario's register row, which links to
 *   the same scenario, is not its heat.)
 * - Every sample's team figures are derived from its own people, as an
 *   owner's are: the segregation score is the SoD engine's index for the
 *   sample team (8 to 18, not a typed 34 to 42), and the average tenure is
 *   the roster's. A control a conflict rule covers counts as a gap whenever
 *   someone holds its pair, so payroll approval is a gap in every sample.
 *   No sample claims a dual release it does not have, the dental billing
 *   specialist and the retail bookkeeper reconcile the bank as their cash
 *   scenarios say, the restaurant's tip pool has the one expert its
 *   scenario names, and the nonprofit's finance manager can post and approve
 *   pledge write-offs as its write-off scenario says. The restaurant and
 *   the retail store carry no receivables controls, and the store files
 *   receiving under a receiving and count check. Residuals, threat decks
 *   and COSO scores move accordingly.
 * - Pinned again after those sample changes met the duty-conflict engine
 *   and scoring changes merged alongside them (owners reconciling while
 *   releasing payments, no assumed alarm, scenario kinds by id): every
 *   sample's residual rows, average, threat index and deck, tornado and
 *   (except construction and nonprofit) COSO components move; the ranked
 *   scenarios (loss, retained loss, assumed days, annual cost of risk) do
 *   not.
 * - Version 1.4 removes credit for unverified control descriptions and risk
 *   acceptance; ownership no longer creates an independent reconciler.
 *   Inherent detection difficulty is held before segregation credit, so
 *   segregation acts through effectiveness instead of also lowering inherent
 *   risk. The complete recalculated rows are pinned below; behavioral tests
 *   separately assert those changes and prevent score-gaming by note count.
 * - The automotive sample (a dealership with a service department) is new;
 *   its figures are pinned as first computed.
 */
const PINNED: Record<
  string,
  {
    averageResidual: number;
    rows: string[];
    threatIndex: number;
    threatDeck: string[];
    coso: number;
    cosoComponents: string[];
    ranked: string[];
    tornado: string[];
  }
> = {
  dental: {
    averageResidual: 70,
    rows: [
      "ctrl-c-cash:79/12/100",
      "ctrl-c-sod-cash:82/12/100",
      "ctrl-c-sod-ap:82/12/100",
      "scen-sc-vendor-fraud:75/21/97",
      "know-k1:88/25/95",
      "know-k3:88/25/95",
      "know-k8:88/25/95",
      "ctrl-c-sod-billing:73/12/93",
      "ctrl-c-controlled:70/12/89",
      "scen-sc-cash-sod-failure:62/21/81",
      "know-k4:71/25/77",
      "know-k6:71/25/77",
      "ctrl-c-ap:79/38/71",
      "ctrl-c-payroll:53/12/68",
      "scen-sc-front-desk-leaves:53/21/68",
      "ctrl-c-sod-ar:73/38/65",
      "ctrl-c-ar:63/38/56",
      "scen-sc-writeoff-abuse:42/21/54",
      "scen-sc-drug-diversion:42/21/54",
      "ctrl-c-claims:53/38/47",
      "ctrl-c-schedule:53/38/47",
      "ctrl-c-clinical:53/38/47",
      "know-k2:65/70/28",
      "know-k5:65/70/28",
      "know-k7:65/70/28",
    ],
    threatIndex: 93,
    threatDeck: [
      "ctrl-c-cash:95:100",
      "ctrl-c-sod-cash:95:100",
      "ctrl-c-sod-ap:95:100",
      "sod-rule-cash-rec:91:92",
      "sod-rule-vendor-create-pay:91:92",
      "sod-rule-writeoff:91:92",
      "scen-sc-vendor-fraud:84:97",
      "sod-rule-cash-void:83:78",
      "know-k1:82:95",
      "know-k3:82:95",
    ],
    coso: 31,
    cosoComponents: [
      "control_environment:50",
      "risk_assessment:38",
      "control_activities:15",
      "information_communication:25",
      "monitoring:25",
    ],
    ranked: [
      "sc-front-desk-leaves:36533:5000:89:4800",
      "sc-vendor-fraud:110588:10588:197:5703",
      "sc-cash-sod-failure:77411:5000:178:4910",
      "sc-writeoff-abuse:43445:5000:237:4800",
      "sc-drug-diversion:43445:5000:237:4800",
    ],
    tornado: ["spof:22", "seg:10", "dual:5", "bank:5"],
  },
  retail: {
    averageResidual: 82,
    rows: [
      "ctrl-c-cash:79/10/100",
      "ctrl-c-sod-cash:82/10/100",
      "ctrl-c-sod-ap:82/10/100",
      "ctrl-c-ap:79/10/100",
      "scen-sc-vendor-fraud:75/22/97",
      "know-k1:88/25/95",
      "know-k3:88/25/95",
      "know-k6:88/25/95",
      "ctrl-c-sod-billing:73/10/94",
      "scen-sc-cash-sod-failure:62/22/80",
      "ctrl-c-inventory:60/10/77",
      "know-k4:71/25/77",
      "know-k5:71/25/77",
      "ctrl-c-payroll:53/10/69",
      "ctrl-c-sod-ar:73/36/67",
      "scen-sc-key-person-leaves:51/22/66",
      "scen-sc-writeoff-abuse:42/22/54",
      "know-k2:65/70/28",
    ],
    threatIndex: 94,
    threatDeck: [
      "ctrl-c-cash:95:100",
      "ctrl-c-sod-cash:95:100",
      "ctrl-c-sod-ap:95:100",
      "ctrl-c-ap:95:100",
      "sod-rule-release-rec:91:92",
      "sod-rule-cash-rec:91:92",
      "sod-rule-vendor-create-pay:91:92",
      "sod-rule-writeoff:91:92",
      "scen-sc-vendor-fraud:84:97",
      "know-k1:82:95",
    ],
    coso: 30,
    cosoComponents: [
      "control_environment:50",
      "risk_assessment:38",
      "control_activities:15",
      "information_communication:25",
      "monitoring:20",
    ],
    ranked: [
      "sc-key-person-leaves:32584:5000:89:4800",
      "sc-vendor-fraud:110588:10588:197:5703",
      "sc-cash-sod-failure:77411:5000:178:4910",
      "sc-writeoff-abuse:43445:5000:237:4800",
    ],
    tornado: ["spof:28", "seg:13", "bank:6", "dual:5"],
  },
  professional_services: {
    averageResidual: 81,
    rows: [
      "ctrl-c-cash:79/10/100",
      "ctrl-c-sod-cash:82/10/100",
      "ctrl-c-sod-ap:82/10/100",
      "ctrl-c-trust-rec:79/10/100",
      "ctrl-c-trust-disb:79/10/100",
      "scen-sc-vendor-fraud:75/22/97",
      "ctrl-c-sod-billing:73/10/95",
      "know-k1:88/25/95",
      "know-k2:88/25/95",
      "know-k7:88/25/95",
      "scen-sc-cash-sod-failure:62/22/80",
      "know-k3:71/25/77",
      "know-k4:71/25/77",
      "know-k6:71/25/77",
      "ctrl-c-ap:79/36/74",
      "ctrl-c-payroll:53/10/69",
      "scen-sc-trust-misappropriation:53/22/68",
      "ctrl-c-sod-ar:73/36/67",
      "scen-sc-key-person-leaves:51/22/66",
      "ctrl-c-ar:63/36/58",
      "scen-sc-writeoff-abuse:42/22/54",
      "know-k5:65/70/28",
    ],
    threatIndex: 95,
    threatDeck: [
      "ctrl-c-cash:95:100",
      "ctrl-c-sod-cash:95:100",
      "ctrl-c-sod-ap:95:100",
      "ctrl-c-trust-rec:95:100",
      "ctrl-c-trust-disb:95:100",
      "sod-rule-custody-rec:91:92",
      "sod-rule-release-rec:91:92",
      "sod-rule-cash-rec:91:92",
      "sod-rule-vendor-create-pay:91:92",
      "scen-sc-vendor-fraud:84:97",
    ],
    coso: 28,
    cosoComponents: [
      "control_environment:50",
      "risk_assessment:30",
      "control_activities:15",
      "information_communication:25",
      "monitoring:20",
    ],
    ranked: [
      "sc-key-person-leaves:32584:5000:89:4800",
      "sc-vendor-fraud:110588:10588:197:5703",
      "sc-cash-sod-failure:77411:5000:178:4910",
      "sc-trust-misappropriation:55294:5000:178:4800",
      "sc-writeoff-abuse:43445:5000:237:4800",
    ],
    tornado: ["spof:28", "seg:12", "bank:6", "dual:5"],
  },
  restaurant: {
    averageResidual: 80,
    rows: [
      "ctrl-c-cash:79/11/100",
      "ctrl-c-sod-cash:82/11/100",
      "ctrl-c-sod-ap:82/11/100",
      "scen-sc-vendor-fraud:75/24/96",
      "know-k1:88/25/95",
      "know-k5:88/25/95",
      "know-k7:88/25/95",
      "ctrl-c-sod-billing:73/11/94",
      "ctrl-c-salestax:70/11/90",
      "ctrl-c-tip-pool:70/11/90",
      "scen-sc-cash-sod-failure:62/24/80",
      "know-k3:71/25/77",
      "know-k4:71/25/77",
      "know-k6:71/25/77",
      "ctrl-c-ap:79/36/74",
      "ctrl-c-payroll:53/11/68",
      "scen-sc-salestax-unremitted:53/24/67",
      "scen-sc-key-person-leaves:51/24/65",
      "scen-sc-writeoff-abuse:42/24/54",
      "scen-sc-tip-pool-manipulation:42/24/54",
      "know-k2:65/70/28",
    ],
    threatIndex: 93,
    threatDeck: [
      "ctrl-c-cash:95:100",
      "ctrl-c-sod-cash:95:100",
      "ctrl-c-sod-ap:95:100",
      "sod-rule-cash-rec:91:92",
      "sod-rule-vendor-create-pay:91:92",
      "sod-rule-writeoff:91:92",
      "scen-sc-vendor-fraud:83:96",
      "sod-rule-cash-void:83:78",
      "know-k1:82:95",
      "know-k5:82:95",
    ],
    coso: 28,
    cosoComponents: [
      "control_environment:50",
      "risk_assessment:30",
      "control_activities:15",
      "information_communication:25",
      "monitoring:20",
    ],
    ranked: [
      "sc-key-person-leaves:32584:5000:89:4800",
      "sc-vendor-fraud:110588:10588:197:5703",
      "sc-cash-sod-failure:77411:5000:178:4910",
      "sc-salestax-unremitted:55294:5000:178:4800",
      "sc-writeoff-abuse:43445:5000:237:4800",
      "sc-tip-pool-manipulation:43445:5000:237:4800",
    ],
    tornado: ["spof:28", "seg:12", "dual:6", "bank:6"],
  },
  construction: {
    averageResidual: 67,
    rows: [
      "ctrl-c-sod-cash:82/14/94",
      "ctrl-c-sod-ap:82/14/94",
      "ctrl-c-cash:79/14/91",
      "ctrl-c-sub-verify:79/14/91",
      "know-k3:88/25/88",
      "know-k4:88/25/88",
      "know-k5:88/25/88",
      "scen-sc-vendor-fraud:71/24/84",
      "scen-sc-fictitious-sub:71/24/84",
      "ctrl-c-change-orders:70/14/80",
      "ctrl-c-field-time:70/14/80",
      "ctrl-c-materials:70/14/80",
      "know-k7:71/25/71",
      "scen-sc-cash-sod-failure:60/24/71",
      "scen-sc-change-order-kickback:59/24/69",
      "ctrl-c-ap:79/39/65",
      "ctrl-c-payroll:53/14/61",
      "scen-sc-field-time-padding:52/24/61",
      "ctrl-c-sod-billing:73/39/59",
      "ctrl-c-sod-ar:73/39/59",
      "scen-sc-key-person-leaves:50/24/59",
      "ctrl-c-ar:63/39/51",
      "scen-sc-writeoff-abuse:42/24/50",
      "scen-sc-material-theft:42/24/50",
      "ctrl-c-lien-waivers:53/39/43",
      "know-k1:65/70/26",
      "know-k2:65/70/26",
      "know-k6:49/70/19",
    ],
    threatIndex: 91,
    threatDeck: [
      "ctrl-c-sod-cash:92:94",
      "ctrl-c-sod-ap:92:94",
      "sod-rule-custody-rec:91:92",
      "sod-rule-release-rec:91:92",
      "sod-rule-cash-rec:91:92",
      "sod-rule-vendor-create-pay:91:92",
      "ctrl-c-cash:90:91",
      "ctrl-c-sub-verify:90:91",
      "know-k3:78:88",
      "know-k4:78:88",
    ],
    coso: 32,
    cosoComponents: [
      "control_environment:50",
      "risk_assessment:46",
      "control_activities:15",
      "information_communication:30",
      "monitoring:20",
    ],
    ranked: [
      "sc-key-person-leaves:28334:5000:77:4800",
      "sc-cash-sod-failure:67314:5000:155:4910",
      "sc-field-time-padding:48082:5000:155:4800",
      "sc-vendor-fraud:96163:5000:172:4910",
      "sc-fictitious-sub:96163:5000:172:4910",
      "sc-change-order-kickback:68688:5000:172:4800",
      "sc-writeoff-abuse:37778:5000:206:4800",
      "sc-material-theft:37778:5000:206:4800",
    ],
    tornado: ["spof:19", "seg:11", "dual:6", "bank:6"],
  },
  automotive: {
    averageResidual: 67,
    rows: [
      "ctrl-c-sod-cash:82/13/95",
      "ctrl-c-sod-ap:82/13/95",
      "ctrl-c-cash:79/13/91",
      "ctrl-c-ro-cash:79/13/91",
      "know-k2:88/25/88",
      "know-k4:88/25/88",
      "know-k5:88/25/88",
      "scen-sc-vendor-fraud:71/21/85",
      "scen-sc-wire-je-cover:71/21/85",
      "ctrl-c-je-review:73/13/84",
      "ctrl-c-sod-billing:73/13/83",
      "ctrl-c-parts-count:70/13/80",
      "ctrl-c-deal-audit:70/13/80",
      "scen-sc-cash-sod-failure:60/21/72",
      "scen-sc-ro-cash-skim:60/21/72",
      "scen-sc-deal-fee-skim:59/21/71",
      "ctrl-c-dms-edits:60/13/68",
      "ctrl-c-warranty:60/13/68",
      "ctrl-c-ap:79/40/63",
      "ctrl-c-payroll:53/13/61",
      "scen-sc-key-person-leaves:50/21/60",
      "ctrl-c-sod-ar:73/40/58",
      "scen-sc-writeoff-abuse:42/21/51",
      "scen-sc-parts-resale:42/21/51",
      "ctrl-c-ar:63/40/50",
      "ctrl-c-sublet:60/40/47",
      "know-k1:65/70/26",
      "know-k3:65/70/26",
      "know-k6:49/70/19",
      "know-k7:49/70/19",
    ],
    threatIndex: 92,
    threatDeck: [
      "ctrl-c-sod-cash:93:95",
      "ctrl-c-sod-ap:93:95",
      "sod-rule-custody-rec:91:92",
      "sod-rule-release-rec:91:92",
      "sod-rule-cash-rec:91:92",
      "sod-rule-vendor-create-pay:91:92",
      "ctrl-c-cash:90:91",
      "ctrl-c-ro-cash:90:91",
      "know-k2:78:88",
      "know-k4:78:88",
    ],
    coso: 36,
    cosoComponents: [
      "control_environment:50",
      "risk_assessment:54",
      "control_activities:15",
      "information_communication:40",
      "monitoring:20",
    ],
    ranked: [
      "sc-key-person-leaves:28334:5000:77:4800",
      "sc-cash-sod-failure:67314:5000:155:4910",
      "sc-ro-cash-skim:67314:5000:155:4910",
      "sc-vendor-fraud:96163:5000:172:4910",
      "sc-wire-je-cover:96163:5000:172:4910",
      "sc-deal-fee-skim:68688:5000:172:4800",
      "sc-writeoff-abuse:37778:5000:206:4800",
      "sc-parts-resale:37778:5000:206:4800",
    ],
    tornado: ["spof:16", "seg:13", "dual:6", "bank:6"],
  },
  nonprofit: {
    averageResidual: 65,
    rows: [
      "ctrl-c-sod-cash:82/12/92",
      "ctrl-c-sod-ap:82/12/92",
      "ctrl-c-cash:79/12/89",
      "ctrl-c-gift-log:79/12/89",
      "know-k2:88/25/84",
      "know-k3:88/25/84",
      "ctrl-c-sod-billing:73/12/81",
      "scen-sc-vendor-fraud:71/21/81",
      "ctrl-c-restricted:70/12/78",
      "ctrl-c-cards:63/12/70",
      "know-k5:71/25/68",
      "know-k6:71/25/68",
      "scen-sc-cash-sod-failure:60/21/68",
      "scen-sc-skimmed-donations:60/21/68",
      "ctrl-c-board-review:60/12/66",
      "ctrl-c-ap:79/39/62",
      "ctrl-c-payroll:53/12/59",
      "scen-sc-card-abuse:52/21/59",
      "scen-sc-key-person-leaves:50/21/57",
      "ctrl-c-ar:63/39/49",
      "scen-sc-writeoff-abuse:42/21/48",
      "scen-sc-restricted-diverted:42/21/48",
      "know-k1:65/70/25",
      "know-k4:49/70/19",
      "know-k7:49/70/19",
    ],
    threatIndex: 91,
    threatDeck: [
      "ctrl-c-sod-cash:91:92",
      "ctrl-c-sod-ap:91:92",
      "sod-rule-custody-rec:91:92",
      "sod-rule-release-rec:91:92",
      "sod-rule-cash-rec:91:92",
      "sod-rule-vendor-create-pay:91:92",
      "ctrl-c-cash:89:89",
      "ctrl-c-gift-log:89:89",
      "know-k2:75:84",
      "know-k3:75:84",
    ],
    coso: 32,
    cosoComponents: [
      "control_environment:50",
      "risk_assessment:46",
      "control_activities:15",
      "information_communication:30",
      "monitoring:20",
    ],
    ranked: [
      "sc-key-person-leaves:28334:5000:77:4800",
      "sc-cash-sod-failure:67314:5000:155:4910",
      "sc-skimmed-donations:67314:5000:155:4910",
      "sc-card-abuse:48082:5000:155:4800",
      "sc-vendor-fraud:96163:5000:172:4910",
      "sc-writeoff-abuse:37778:5000:206:4800",
      "sc-restricted-diverted:37778:5000:206:4800",
    ],
    tornado: ["spof:17", "seg:13", "bank:6", "dual:5"],
  },
  general: {
    averageResidual: 72,
    rows: [
      "ctrl-c-sod-cash:82/12/100",
      "ctrl-c-sod-ap:82/12/100",
      "ctrl-c-cash:79/12/97",
      "scen-sc-vendor-fraud:75/23/92",
      "know-k1:88/25/91",
      "know-k3:88/25/91",
      "ctrl-c-sod-billing:73/12/88",
      "scen-sc-cash-sod-failure:62/23/77",
      "know-k4:71/25/74",
      "know-k5:71/25/74",
      "ctrl-c-ap:79/38/69",
      "ctrl-c-payroll:53/12/64",
      "ctrl-c-sod-ar:73/38/63",
      "scen-sc-key-person-leaves:51/23/63",
      "ctrl-c-ar:63/38/54",
      "scen-sc-writeoff-abuse:42/23/52",
      "know-k2:65/70/27",
      "know-k6:65/70/27",
    ],
    threatIndex: 93,
    threatDeck: [
      "ctrl-c-sod-cash:95:100",
      "ctrl-c-sod-ap:95:100",
      "ctrl-c-cash:94:97",
      "sod-rule-cash-rec:91:92",
      "sod-rule-vendor-create-pay:91:92",
      "sod-rule-writeoff:91:92",
      "sod-rule-deposit-post:83:78",
      "scen-sc-vendor-fraud:81:92",
      "know-k1:79:91",
      "know-k3:79:91",
    ],
    coso: 34,
    cosoComponents: [
      "control_environment:50",
      "risk_assessment:46",
      "control_activities:15",
      "information_communication:30",
      "monitoring:31",
    ],
    ranked: [
      "sc-key-person-leaves:32584:5000:89:4800",
      "sc-vendor-fraud:110588:10588:197:5703",
      "sc-cash-sod-failure:77411:5000:178:4910",
      "sc-writeoff-abuse:43445:5000:237:4800",
    ],
    tornado: ["spof:21", "seg:11", "dual:6", "bank:6"],
  },
};

describe("sample business numbers", () => {
  for (const { id } of INDUSTRIES) {
    it(`are unchanged for the ${id} sample`, () => {
      const pinned = PINNED[id];
      expect(pinned, id).toBeDefined();
      const p = defaultProfile(id as IndustryId);
      const tpl = resolveTemplate(p);
      const port = portfolioSummary(tpl, p.staff);
      expect(port.averageResidual).toBe(pinned.averageResidual);
      expect(
        port.all.map((s) => `${s.id}:${s.inherent}/${s.controlEffectiveness}/${s.residual}`),
      ).toEqual(pinned.rows);
      expect(tornadoSensitivity(tpl, p.staff).levers.map((l) => `${l.id}:${l.delta}`)).toEqual(
        pinned.tornado,
      );
      const threat = buildThreatAssessment({
        tpl,
        practiceName: p.practiceName,
        staff: p.staff,
        riskVariables: p.riskVariables,
        dualRelease: p.dualRelease,
      });
      expect(threat.overallThreatIndex).toBe(pinned.threatIndex);
      expect(threat.targetDeck.map((t) => `${t.id}:${t.priority}:${t.heat}`)).toEqual(
        pinned.threatDeck,
      );
      const coso = assessCoso(tpl, p.staff, { riskVariables: p.riskVariables });
      expect(coso.overall).toBe(pinned.coso);
      expect(coso.components.map((c) => `${c.id}:${c.score}`)).toEqual(pinned.cosoComponents);
      expect(
        rankDangerousScenarios(tpl, { staff: p.staff, riskVariables: p.riskVariables }).map(
          (r) =>
            `${r.scenario.id}:${r.result.financialImpact.expected}:${r.result.retainedImpact.expected}:${r.result.timelineDays.p50}:${r.result.dynamic?.expectedAnnualCostOfRisk}`,
        ),
      ).toEqual(pinned.ranked);
    });
  }
});
