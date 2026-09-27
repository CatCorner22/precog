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
    averageResidual: 67,
    rows: [
      "ctrl-c-sod-ap:82/14/100",
      "scen-sc-vendor-fraud:75/22/97",
      "know-k1:88/25/95",
      "know-k3:88/25/95",
      "know-k8:88/25/95",
      "ctrl-c-sod-cash:82/21/94",
      "ctrl-c-cash:79/21/91",
      "ctrl-c-sod-billing:73/21/83",
      "scen-sc-cash-sod-failure:62/22/81",
      "ctrl-c-controlled:70/21/80",
      "know-k4:71/25/77",
      "know-k6:71/25/77",
      "scen-sc-front-desk-leaves:53/22/68",
      "ctrl-c-payroll:53/14/66",
      "ctrl-c-ap:73/40/64",
      "ctrl-c-sod-ar:67/40/58",
      "scen-sc-writeoff-abuse:42/22/54",
      "scen-sc-drug-diversion:42/22/54",
      "ctrl-c-ar:57/40/50",
      "ctrl-c-claims:47/40/41",
      "ctrl-c-schedule:47/40/41",
      "ctrl-c-clinical:47/40/41",
      "know-k2:65/70/28",
      "know-k5:65/70/28",
      "know-k7:65/70/28",
    ],
    threatIndex: 92,
    threatDeck: [
      "ctrl-c-sod-ap:95:100",
      "ctrl-c-sod-cash:92:94",
      "sod-rule-vendor-create-pay:91:92",
      "sod-rule-writeoff:91:92",
      "sod-rule-cash-rec:91:92",
      "scen-sc-vendor-fraud:84:97",
      "sod-rule-cash-void:83:78",
      "know-k1:82:95",
      "know-k3:82:95",
      "know-k8:82:95",
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
    averageResidual: 80,
    rows: [
      "ctrl-c-sod-ap:82/12/100",
      "ctrl-c-ap:79/12/100",
      "scen-sc-vendor-fraud:75/23/97",
      "ctrl-c-sod-cash:82/20/96",
      "know-k1:88/25/95",
      "know-k3:88/25/95",
      "know-k6:88/25/95",
      "ctrl-c-cash:79/20/92",
      "ctrl-c-sod-billing:73/20/84",
      "scen-sc-cash-sod-failure:62/23/80",
      "know-k4:71/25/77",
      "know-k5:71/25/77",
      "ctrl-c-inventory:60/12/76",
      "ctrl-c-payroll:53/12/67",
      "scen-sc-key-person-leaves:51/23/66",
      "ctrl-c-sod-ar:67/38/60",
      "scen-sc-writeoff-abuse:42/23/54",
      "know-k2:65/70/28",
    ],
    threatIndex: 93,
    threatDeck: [
      "ctrl-c-sod-ap:95:100",
      "ctrl-c-ap:95:100",
      "ctrl-c-sod-cash:93:96",
      "sod-rule-vendor-create-pay:91:92",
      "sod-rule-writeoff:91:92",
      "sod-rule-release-rec:91:92",
      "sod-rule-cash-rec:91:92",
      "scen-sc-vendor-fraud:84:97",
      "know-k1:82:95",
      "know-k3:82:95",
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
    tornado: ["spof:29", "seg:13", "bank:7", "dual:6"],
  },
  professional_services: {
    averageResidual: 78,
    rows: [
      "ctrl-c-sod-ap:82/12/100",
      "scen-sc-vendor-fraud:75/22/97",
      "ctrl-c-sod-cash:82/19/96",
      "know-k1:88/25/95",
      "know-k2:88/25/95",
      "know-k7:88/25/95",
      "ctrl-c-cash:79/19/93",
      "ctrl-c-trust-rec:79/19/93",
      "ctrl-c-trust-disb:79/19/93",
      "ctrl-c-sod-billing:73/19/85",
      "scen-sc-cash-sod-failure:62/22/80",
      "know-k3:71/25/77",
      "know-k4:71/25/77",
      "know-k6:71/25/77",
      "ctrl-c-payroll:53/12/68",
      "scen-sc-trust-misappropriation:53/22/68",
      "ctrl-c-ap:73/37/67",
      "scen-sc-key-person-leaves:51/22/66",
      "ctrl-c-sod-ar:67/37/60",
      "scen-sc-writeoff-abuse:42/22/54",
      "ctrl-c-ar:57/37/52",
      "know-k5:65/70/28",
    ],
    threatIndex: 92,
    threatDeck: [
      "ctrl-c-sod-ap:95:100",
      "ctrl-c-sod-cash:93:96",
      "sod-rule-custody-rec:91:92",
      "sod-rule-vendor-create-pay:91:92",
      "sod-rule-writeoff:91:92",
      "sod-rule-release-rec:91:92",
      "scen-sc-vendor-fraud:84:97",
      "know-k1:82:95",
      "know-k2:82:95",
      "know-k7:82:95",
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
    tornado: ["spof:28", "seg:12", "dual:6", "bank:6"],
  },
  restaurant: {
    averageResidual: 77,
    rows: [
      "ctrl-c-sod-ap:82/13/100",
      "scen-sc-vendor-fraud:75/24/96",
      "ctrl-c-sod-cash:82/20/95",
      "know-k1:88/25/95",
      "know-k5:88/25/95",
      "know-k7:88/25/95",
      "ctrl-c-cash:79/20/92",
      "ctrl-c-sod-billing:73/20/84",
      "ctrl-c-salestax:70/20/81",
      "ctrl-c-tip-pool:70/20/81",
      "scen-sc-cash-sod-failure:62/24/80",
      "know-k3:71/25/77",
      "know-k4:71/25/77",
      "know-k6:71/25/77",
      "ctrl-c-ap:73/37/67",
      "ctrl-c-payroll:53/13/67",
      "scen-sc-salestax-unremitted:53/24/67",
      "scen-sc-key-person-leaves:51/24/65",
      "scen-sc-writeoff-abuse:42/24/53",
      "scen-sc-tip-pool-manipulation:42/24/53",
      "know-k2:65/70/28",
    ],
    threatIndex: 92,
    threatDeck: [
      "ctrl-c-sod-ap:95:100",
      "ctrl-c-sod-cash:93:95",
      "sod-rule-vendor-create-pay:91:92",
      "sod-rule-writeoff:91:92",
      "sod-rule-cash-rec:91:92",
      "scen-sc-vendor-fraud:83:96",
      "sod-rule-cash-void:83:78",
      "know-k1:82:95",
      "know-k5:82:95",
      "know-k7:82:95",
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
    tornado: ["spof:28", "seg:12", "dual:6", "bank:5"],
  },
  construction: {
    averageResidual: 64,
    rows: [
      "ctrl-c-sod-ap:82/15/93",
      "know-k3:88/25/88",
      "know-k4:88/25/88",
      "know-k5:88/25/88",
      "ctrl-c-sod-cash:82/23/84",
      "scen-sc-vendor-fraud:71/24/83",
      "scen-sc-fictitious-sub:71/24/83",
      "ctrl-c-cash:79/23/81",
      "ctrl-c-sub-verify:79/23/81",
      "ctrl-c-change-orders:70/23/71",
      "ctrl-c-field-time:70/23/71",
      "ctrl-c-materials:70/23/71",
      "know-k7:71/25/71",
      "scen-sc-cash-sod-failure:60/24/70",
      "scen-sc-change-order-kickback:59/24/69",
      "scen-sc-field-time-padding:52/24/61",
      "ctrl-c-payroll:53/15/60",
      "scen-sc-key-person-leaves:50/24/59",
      "ctrl-c-ap:73/40/58",
      "ctrl-c-sod-ar:67/40/53",
      "scen-sc-writeoff-abuse:42/24/50",
      "scen-sc-material-theft:42/24/50",
      "ctrl-c-sod-billing:67/48/46",
      "ctrl-c-ar:57/40/45",
      "ctrl-c-lien-waivers:47/40/37",
      "know-k1:65/70/26",
      "know-k2:65/70/26",
      "know-k6:49/70/19",
    ],
    threatIndex: 91,
    threatDeck: [
      "ctrl-c-sod-ap:92:93",
      "sod-rule-custody-rec:91:92",
      "sod-rule-vendor-create-pay:91:92",
      "sod-rule-invoice-pay:91:92",
      "sod-rule-release-rec:91:92",
      "ctrl-c-sod-cash:87:84",
      "know-k3:78:88",
      "know-k4:78:88",
      "know-k5:78:88",
      "scen-sc-vendor-fraud:76:83",
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
    tornado: ["spof:19", "seg:11", "bank:7", "dual:6"],
  },
  nonprofit: {
    averageResidual: 62,
    rows: [
      "ctrl-c-sod-ap:82/14/90",
      "know-k2:88/25/84",
      "know-k3:88/25/84",
      "ctrl-c-sod-cash:82/21/83",
      "scen-sc-vendor-fraud:71/21/81",
      "ctrl-c-cash:79/21/80",
      "ctrl-c-gift-log:79/21/80",
      "ctrl-c-sod-billing:73/21/73",
      "ctrl-c-restricted:70/21/70",
      "know-k5:71/25/68",
      "know-k6:71/25/68",
      "scen-sc-cash-sod-failure:60/21/68",
      "scen-sc-skimmed-donations:60/21/68",
      "ctrl-c-cards:63/21/63",
      "ctrl-c-board-review:60/21/60",
      "scen-sc-card-abuse:52/21/59",
      "ctrl-c-payroll:53/14/58",
      "scen-sc-key-person-leaves:50/21/57",
      "ctrl-c-ap:73/40/56",
      "scen-sc-writeoff-abuse:42/21/48",
      "scen-sc-restricted-diverted:42/21/48",
      "ctrl-c-ar:57/40/43",
      "know-k1:65/70/25",
      "know-k4:49/70/19",
      "know-k7:49/70/19",
    ],
    threatIndex: 91,
    threatDeck: [
      "sod-rule-custody-rec:91:92",
      "sod-rule-vendor-create-pay:91:92",
      "sod-rule-invoice-pay:91:92",
      "sod-rule-writeoff:91:92",
      "ctrl-c-sod-ap:90:90",
      "ctrl-c-sod-cash:86:83",
      "ctrl-c-cash:84:80",
      "know-k2:75:84",
      "know-k3:75:84",
      "scen-sc-vendor-fraud:75:81",
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
    tornado: ["spof:16", "seg:12", "bank:6", "dual:5"],
  },
  general: {
    averageResidual: 69,
    rows: [
      "ctrl-c-sod-ap:82/14/98",
      "scen-sc-vendor-fraud:75/23/92",
      "know-k1:88/25/91",
      "know-k3:88/25/91",
      "ctrl-c-sod-cash:82/22/90",
      "ctrl-c-cash:79/22/86",
      "ctrl-c-sod-billing:73/22/79",
      "scen-sc-cash-sod-failure:62/23/77",
      "know-k4:71/25/74",
      "know-k5:71/25/74",
      "ctrl-c-payroll:53/14/63",
      "scen-sc-key-person-leaves:51/23/63",
      "ctrl-c-ap:73/39/62",
      "ctrl-c-sod-ar:67/39/56",
      "scen-sc-writeoff-abuse:42/23/51",
      "ctrl-c-ar:57/39/48",
      "know-k2:65/70/27",
      "know-k6:65/70/27",
    ],
    threatIndex: 91,
    threatDeck: [
      "ctrl-c-sod-ap:94:98",
      "sod-rule-vendor-create-pay:91:92",
      "sod-rule-writeoff:91:92",
      "sod-rule-cash-rec:91:92",
      "ctrl-c-sod-cash:90:90",
      "ctrl-c-cash:88:86",
      "sod-rule-vendor-approve-pay:83:78",
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
    tornado: ["spof:21", "seg:11", "bank:6", "dual:5"],
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
