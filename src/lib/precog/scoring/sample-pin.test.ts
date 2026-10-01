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
 * - Setting up suppliers plus entering bills is a named duty conflict
 *   ("Create vendor + enter bills"). The construction, automotive and
 *   nonprofit samples each have one person who holds both, so each gains
 *   one finding: the construction and nonprofit segregation scores fall
 *   (14 to 11, 2 to 1) and their register rows, threat index and tornado
 *   move; the automotive score stays at 2 and its figures do not move.
 * - The danger ranking no longer divides by the days until a scheme is
 *   found, and COSO Risk Assessment no longer loses points when the top
 *   scenario is found within 60 days: a detective control shortens those
 *   days, and switching one on must never rank a scenario more dangerous or
 *   lower a component. Scenarios now rank by loss after controls, so the
 *   large fraud scenarios lead every sample; no figure on a ranked row
 *   moves.
 * - The threat deck's duty-conflict cards are the open findings as Start
 *   here and the report count them: a pair the business has accepted the
 *   residual risk on (the samples' "SoD: payments vs reconciliation") gets
 *   no card, so the next open pairs move up.
 * - Version 1.5 counts each fact once on the residual index. An empty control
 *   set is not already 20% effective. Sole-owner knowledge and a weak
 *   segregation score are not applied again as a staff uplift. Scenario rows
 *   are not multiplied by that uplift; the scenario engine already scaled
 *   the dollars. Bank reconciliation is not also the monitoring cadence, and
 *   dual release is not credited on controls that are not cash or payments.
 *   Longer until found raises a scenario row. Found sooner does not.
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
    averageResidual: 57,
    rows: [
      "scen-sc-vendor-fraud:90/1/89",
      "ctrl-c-sod-cash:82/12/81",
      "ctrl-c-sod-ap:82/12/81",
      "ctrl-c-cash:79/12/78",
      "know-k1:88/25/74",
      "know-k3:88/25/74",
      "know-k8:88/25/74",
      "scen-sc-cash-sod-failure:73/1/73",
      "ctrl-c-sod-billing:73/12/72",
      "ctrl-c-controlled:70/12/69",
      "scen-sc-writeoff-abuse:64/1/63",
      "scen-sc-drug-diversion:64/1/63",
      "know-k4:71/25/60",
      "know-k6:71/25/60",
      "ctrl-c-ap:79/38/55",
      "ctrl-c-payroll:53/12/52",
      "ctrl-c-sod-ar:73/38/50",
      "scen-sc-front-desk-leaves:47/1/47",
      "ctrl-c-ar:63/38/44",
      "ctrl-c-claims:53/38/37",
      "ctrl-c-schedule:53/38/37",
      "ctrl-c-clinical:53/38/37",
      "know-k2:65/70/22",
      "know-k5:65/70/22",
      "know-k7:65/70/22",
    ],
    threatIndex: 87,
    threatDeck: [
      "sod-rule-vendor-create-pay:91:92",
      "sod-rule-writeoff:91:92",
      "ctrl-c-sod-cash:85:81",
      "ctrl-c-sod-ap:85:81",
      "ctrl-c-cash:83:78",
      "sod-rule-cash-void:83:78",
      "sod-rule-cash-admin:83:78",
      "scen-sc-vendor-fraud:79:89",
      "spof-k8:76:85",
      "know-k1:70:74",
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
      "sc-vendor-fraud:110588:10588:197:5703",
      "sc-cash-sod-failure:77411:5000:178:4910",
      "sc-front-desk-leaves:36533:5000:89:4800",
      "sc-writeoff-abuse:43445:5000:237:4800",
      "sc-drug-diversion:43445:5000:237:4800",
    ],
    tornado: [
      "spof:13",
      "bank:5",
      "seg:4",
      "dual:3",
    ],
  },
  retail: {
    averageResidual: 67,
    rows: [
      "scen-sc-vendor-fraud:90/2/89",
      "ctrl-c-sod-cash:82/10/83",
      "ctrl-c-sod-ap:82/10/83",
      "ctrl-c-cash:79/10/80",
      "ctrl-c-ap:79/10/80",
      "know-k1:88/25/74",
      "know-k3:88/25/74",
      "know-k6:88/25/74",
      "ctrl-c-sod-billing:73/10/73",
      "scen-sc-cash-sod-failure:73/2/72",
      "scen-sc-writeoff-abuse:64/2/63",
      "ctrl-c-inventory:60/10/60",
      "know-k4:71/25/60",
      "know-k5:71/25/60",
      "ctrl-c-payroll:53/10/53",
      "ctrl-c-sod-ar:73/36/52",
      "scen-sc-key-person-leaves:45/2/45",
      "know-k2:65/70/22",
    ],
    threatIndex: 88,
    threatDeck: [
      "sod-rule-vendor-create-pay:91:92",
      "sod-rule-writeoff:91:92",
      "ctrl-c-sod-cash:86:83",
      "ctrl-c-sod-ap:86:83",
      "ctrl-c-cash:84:80",
      "ctrl-c-ap:84:80",
      "sod-rule-cash-void:83:78",
      "sod-rule-collect-adjust:83:78",
      "scen-sc-vendor-fraud:79:89",
      "spof-k3:76:85",
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
      "sc-vendor-fraud:110588:10588:197:5703",
      "sc-cash-sod-failure:77411:5000:178:4910",
      "sc-key-person-leaves:32584:5000:89:4800",
      "sc-writeoff-abuse:43445:5000:237:4800",
    ],
    tornado: [
      "spof:19",
      "bank:6",
      "seg:6",
      "dual:5",
    ],
  },
  professional_services: {
    averageResidual: 66,
    rows: [
      "scen-sc-vendor-fraud:90/2/89",
      "ctrl-c-sod-cash:82/10/83",
      "ctrl-c-sod-ap:82/10/83",
      "ctrl-c-cash:79/10/80",
      "ctrl-c-trust-rec:79/10/80",
      "ctrl-c-trust-disb:79/10/80",
      "know-k1:88/25/74",
      "know-k2:88/25/74",
      "know-k7:88/25/74",
      "ctrl-c-sod-billing:73/10/73",
      "scen-sc-cash-sod-failure:73/2/73",
      "scen-sc-writeoff-abuse:64/2/63",
      "scen-sc-trust-misappropriation:64/2/63",
      "know-k3:71/25/60",
      "know-k4:71/25/60",
      "know-k6:71/25/60",
      "ctrl-c-ap:79/36/57",
      "ctrl-c-payroll:53/10/53",
      "ctrl-c-sod-ar:73/36/52",
      "ctrl-c-ar:63/36/45",
      "scen-sc-key-person-leaves:45/2/45",
      "know-k5:65/70/22",
    ],
    threatIndex: 89,
    threatDeck: [
      "sod-rule-custody-rec:91:92",
      "sod-rule-vendor-create-pay:91:92",
      "sod-rule-writeoff:91:92",
      "ctrl-c-sod-cash:86:83",
      "ctrl-c-sod-ap:86:83",
      "ctrl-c-cash:84:80",
      "ctrl-c-trust-rec:84:80",
      "ctrl-c-trust-disb:84:80",
      "sod-rule-vendor-approve-pay:83:78",
      "scen-sc-vendor-fraud:79:89",
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
      "sc-vendor-fraud:110588:10588:197:5703",
      "sc-cash-sod-failure:77411:5000:178:4910",
      "sc-key-person-leaves:32584:5000:89:4800",
      "sc-writeoff-abuse:43445:5000:237:4800",
      "sc-trust-misappropriation:55294:5000:178:4800",
    ],
    tornado: [
      "spof:19",
      "bank:6",
      "seg:6",
      "dual:5",
    ],
  },
  restaurant: {
    averageResidual: 66,
    rows: [
      "scen-sc-vendor-fraud:90/4/88",
      "ctrl-c-sod-cash:82/11/82",
      "ctrl-c-sod-ap:82/11/82",
      "ctrl-c-cash:79/11/79",
      "know-k1:88/25/74",
      "know-k5:88/25/74",
      "know-k7:88/25/74",
      "ctrl-c-sod-billing:73/11/72",
      "scen-sc-cash-sod-failure:73/4/72",
      "ctrl-c-salestax:70/11/69",
      "ctrl-c-tip-pool:70/11/69",
      "scen-sc-writeoff-abuse:64/4/63",
      "scen-sc-tip-pool-manipulation:64/4/63",
      "scen-sc-salestax-unremitted:64/4/62",
      "know-k3:71/25/60",
      "know-k4:71/25/60",
      "know-k6:71/25/60",
      "ctrl-c-ap:79/36/57",
      "ctrl-c-payroll:53/11/53",
      "scen-sc-key-person-leaves:45/4/44",
      "know-k2:65/70/22",
    ],
    threatIndex: 88,
    threatDeck: [
      "sod-rule-vendor-create-pay:91:92",
      "sod-rule-writeoff:91:92",
      "ctrl-c-sod-cash:86:82",
      "ctrl-c-sod-ap:86:82",
      "ctrl-c-cash:84:79",
      "sod-rule-cash-void:83:78",
      "sod-rule-collect-adjust:83:78",
      "scen-sc-vendor-fraud:79:88",
      "spof-k7:76:85",
      "know-k1:70:74",
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
      "sc-vendor-fraud:110588:10588:197:5703",
      "sc-cash-sod-failure:77411:5000:178:4910",
      "sc-key-person-leaves:32584:5000:89:4800",
      "sc-writeoff-abuse:43445:5000:237:4800",
      "sc-salestax-unremitted:55294:5000:178:4800",
      "sc-tip-pool-manipulation:43445:5000:237:4800",
    ],
    tornado: [
      "spof:19",
      "bank:6",
      "seg:6",
      "dual:5",
    ],
  },
  construction: {
    averageResidual: 55,
    rows: [
      "scen-sc-vendor-fraud:81/3/80",
      "scen-sc-fictitious-sub:81/3/80",
      "ctrl-c-sod-cash:82/13/71",
      "ctrl-c-sod-ap:82/13/71",
      "ctrl-c-cash:79/13/69",
      "ctrl-c-sub-verify:79/13/69",
      "scen-sc-change-order-kickback:69/3/68",
      "know-k3:88/25/66",
      "know-k4:88/25/66",
      "know-k5:88/25/66",
      "scen-sc-cash-sod-failure:67/3/66",
      "ctrl-c-change-orders:70/13/60",
      "ctrl-c-field-time:70/13/60",
      "ctrl-c-materials:70/13/60",
      "scen-sc-writeoff-abuse:58/3/58",
      "scen-sc-material-theft:58/3/58",
      "scen-sc-field-time-padding:58/3/57",
      "know-k7:71/25/53",
      "ctrl-c-ap:79/39/49",
      "ctrl-c-payroll:53/13/46",
      "ctrl-c-sod-billing:73/39/44",
      "ctrl-c-sod-ar:73/39/44",
      "scen-sc-key-person-leaves:42/3/42",
      "ctrl-c-ar:63/39/39",
      "ctrl-c-lien-waivers:53/39/32",
      "know-k1:65/70/20",
      "know-k2:65/70/20",
      "know-k6:49/70/15",
    ],
    threatIndex: 87,
    threatDeck: [
      "sod-rule-custody-rec:91:92",
      "sod-rule-vendor-create-pay:91:92",
      "sod-rule-invoice-pay:91:92",
      "sod-rule-vendor-create-invoice:83:78",
      "ctrl-c-sod-cash:79:71",
      "ctrl-c-sod-ap:79:71",
      "spof-k3:76:85",
      "spof-k4:76:85",
      "spof-k5:76:85",
      "scen-sc-vendor-fraud:74:80",
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
      "sc-cash-sod-failure:67314:5000:155:4910",
      "sc-vendor-fraud:96163:5000:172:4910",
      "sc-fictitious-sub:96163:5000:172:4910",
      "sc-key-person-leaves:28334:5000:77:4800",
      "sc-writeoff-abuse:37778:5000:206:4800",
      "sc-change-order-kickback:68688:5000:172:4800",
      "sc-material-theft:37778:5000:206:4800",
      "sc-field-time-padding:48082:5000:155:4800",
    ],
    tornado: [
      "spof:11",
      "bank:6",
      "seg:6",
      "dual:5",
    ],
  },
  automotive: {
    averageResidual: 54,
    rows: [
      "scen-sc-vendor-fraud:81/1/81",
      "scen-sc-wire-je-cover:81/1/81",
      "ctrl-c-sod-cash:82/13/71",
      "ctrl-c-sod-ap:82/13/71",
      "ctrl-c-cash:79/13/69",
      "ctrl-c-ro-cash:79/13/69",
      "scen-sc-deal-fee-skim:69/1/69",
      "know-k2:88/25/66",
      "know-k4:88/25/66",
      "know-k5:88/25/66",
      "scen-sc-cash-sod-failure:67/1/66",
      "scen-sc-ro-cash-skim:67/1/66",
      "ctrl-c-sod-billing:73/13/63",
      "ctrl-c-je-review:73/13/63",
      "ctrl-c-parts-count:70/13/60",
      "ctrl-c-deal-audit:70/13/60",
      "scen-sc-writeoff-abuse:58/1/58",
      "scen-sc-parts-resale:58/1/58",
      "ctrl-c-dms-edits:60/13/51",
      "ctrl-c-warranty:60/13/51",
      "ctrl-c-ap:79/40/47",
      "ctrl-c-payroll:53/13/46",
      "ctrl-c-sod-ar:73/40/43",
      "scen-sc-key-person-leaves:42/1/42",
      "ctrl-c-ar:63/40/38",
      "ctrl-c-sublet:60/40/36",
      "know-k1:65/70/20",
      "know-k3:65/70/20",
      "know-k6:49/70/15",
      "know-k7:49/70/15",
    ],
    threatIndex: 87,
    threatDeck: [
      "sod-rule-custody-rec:91:92",
      "sod-rule-vendor-create-pay:91:92",
      "sod-rule-invoice-pay:91:92",
      "sod-rule-cash-void:83:78",
      "ctrl-c-sod-cash:79:71",
      "ctrl-c-sod-ap:79:71",
      "spof-k2:76:85",
      "spof-k4:76:85",
      "spof-k5:76:85",
      "scen-sc-vendor-fraud:75:81",
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
      "sc-cash-sod-failure:67314:5000:155:4910",
      "sc-vendor-fraud:96163:5000:172:4910",
      "sc-ro-cash-skim:67314:5000:155:4910",
      "sc-wire-je-cover:96163:5000:172:4910",
      "sc-key-person-leaves:28334:5000:77:4800",
      "sc-writeoff-abuse:37778:5000:206:4800",
      "sc-parts-resale:37778:5000:206:4800",
      "sc-deal-fee-skim:68688:5000:172:4800",
    ],
    tornado: [
      "spof:8",
      "bank:6",
      "seg:6",
      "dual:4",
    ],
  },
  nonprofit: {
    averageResidual: 55,
    rows: [
      "scen-sc-vendor-fraud:81/0/81",
      "ctrl-c-sod-cash:82/12/72",
      "ctrl-c-sod-ap:82/12/72",
      "ctrl-c-cash:79/12/70",
      "ctrl-c-gift-log:79/12/70",
      "scen-sc-cash-sod-failure:67/0/67",
      "scen-sc-skimmed-donations:67/0/67",
      "know-k2:88/25/66",
      "know-k3:88/25/66",
      "ctrl-c-sod-billing:73/12/64",
      "ctrl-c-restricted:70/12/61",
      "scen-sc-writeoff-abuse:58/0/58",
      "scen-sc-restricted-diverted:58/0/58",
      "scen-sc-card-abuse:58/0/58",
      "ctrl-c-cards:63/12/55",
      "know-k5:71/25/53",
      "know-k6:71/25/53",
      "ctrl-c-board-review:60/12/52",
      "ctrl-c-ap:79/39/49",
      "ctrl-c-payroll:53/12/47",
      "scen-sc-key-person-leaves:42/0/42",
      "ctrl-c-ar:63/39/39",
      "know-k1:65/70/20",
      "know-k4:49/70/15",
      "know-k7:49/70/15",
    ],
    threatIndex: 89,
    threatDeck: [
      "sod-rule-custody-rec:91:92",
      "sod-rule-vendor-create-pay:91:92",
      "sod-rule-invoice-pay:91:92",
      "sod-rule-writeoff:91:92",
      "ctrl-c-sod-cash:80:72",
      "ctrl-c-sod-ap:80:72",
      "ctrl-c-cash:79:70",
      "ctrl-c-gift-log:79:70",
      "spof-k2:76:85",
      "spof-k3:76:85",
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
      "sc-cash-sod-failure:67314:5000:155:4910",
      "sc-vendor-fraud:96163:5000:172:4910",
      "sc-skimmed-donations:67314:5000:155:4910",
      "sc-key-person-leaves:28334:5000:77:4800",
      "sc-writeoff-abuse:37778:5000:206:4800",
      "sc-restricted-diverted:37778:5000:206:4800",
      "sc-card-abuse:48082:5000:155:4800",
    ],
    tornado: [
      "spof:11",
      "bank:6",
      "seg:6",
      "dual:4",
    ],
  },
  general: {
    averageResidual: 61,
    rows: [
      "scen-sc-vendor-fraud:90/3/88",
      "ctrl-c-sod-cash:82/12/81",
      "ctrl-c-sod-ap:82/12/81",
      "ctrl-c-cash:79/12/78",
      "know-k1:88/25/74",
      "know-k3:88/25/74",
      "scen-sc-cash-sod-failure:73/3/72",
      "ctrl-c-sod-billing:73/12/71",
      "scen-sc-writeoff-abuse:64/3/63",
      "know-k4:71/25/60",
      "know-k5:71/25/60",
      "ctrl-c-ap:79/38/55",
      "ctrl-c-payroll:53/12/52",
      "ctrl-c-sod-ar:73/38/50",
      "scen-sc-key-person-leaves:45/3/45",
      "ctrl-c-ar:63/38/44",
      "know-k2:65/70/22",
      "know-k6:65/70/22",
    ],
    threatIndex: 87,
    threatDeck: [
      "sod-rule-vendor-create-pay:91:92",
      "sod-rule-writeoff:91:92",
      "ctrl-c-sod-cash:85:81",
      "ctrl-c-sod-ap:85:81",
      "ctrl-c-cash:83:78",
      "sod-rule-vendor-approve-pay:83:78",
      "sod-rule-collect-adjust:83:78",
      "scen-sc-vendor-fraud:79:88",
      "know-k1:70:74",
      "know-k3:70:74",
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
      "sc-vendor-fraud:110588:10588:197:5703",
      "sc-cash-sod-failure:77411:5000:178:4910",
      "sc-key-person-leaves:32584:5000:89:4800",
      "sc-writeoff-abuse:43445:5000:237:4800",
    ],
    tornado: [
      "spof:15",
      "bank:6",
      "dual:5",
      "seg:5",
    ],
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
