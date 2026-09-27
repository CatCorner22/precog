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
 *   with its register (2 against 1), so only the restaurant figures move. * - Content added to three samples moves their figures, and only theirs:
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
      "scen-sc-vendor-fraud:76/22/99",
      "know-k1:88/25/95",
      "know-k3:88/25/95",
      "know-k8:88/25/95",
      "ctrl-c-sod-cash:82/21/94",
      "ctrl-c-cash:79/21/91",
      "ctrl-c-sod-billing:73/21/83",
      "scen-sc-cash-sod-failure:63/22/82",
      "know-k4:71/25/77",
      "know-k6:71/25/77",
      "ctrl-c-controlled:60/21/68",
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
      "scen-sc-vendor-fraud:85:99",
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
      "sc-front-desk-leaves:36533:5000:90:4782",
      "sc-vendor-fraud:110588:10588:187:5613",
      "sc-cash-sod-failure:77411:5000:169:4867",
      "sc-writeoff-abuse:43445:5000:241:4782",
      "sc-drug-diversion:43445:5000:241:4782",
    ],
    tornado: ["seg:10", "spof:8", "dual:6", "bank:6", "team:5"],
  },
  retail: {
    averageResidual: 80,
    rows: [
      "ctrl-c-sod-ap:82/12/100",
      "ctrl-c-ap:79/12/100",
      "scen-sc-vendor-fraud:76/23/98",
      "ctrl-c-sod-cash:82/20/96",
      "know-k1:88/25/95",
      "know-k3:88/25/95",
      "know-k6:88/25/95",
      "ctrl-c-cash:79/20/92",
      "ctrl-c-sod-billing:73/20/84",
      "scen-sc-cash-sod-failure:63/23/81",
      "know-k4:71/25/77",
      "know-k5:71/25/77",
      "ctrl-c-inventory:60/12/76",
      "ctrl-c-payroll:53/12/67",
      "scen-sc-key-person-leaves:51/23/65",
      "ctrl-c-sod-ar:67/38/60",
      "scen-sc-writeoff-abuse:42/23/53",
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
      "scen-sc-vendor-fraud:84:98",
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
      "sc-key-person-leaves:32584:5000:90:4782",
      "sc-vendor-fraud:110588:10588:187:5613",
      "sc-cash-sod-failure:77411:5000:169:4867",
      "sc-writeoff-abuse:43445:5000:241:4782",
    ],
    tornado: ["seg:13", "spof:10", "dual:7", "bank:7", "team:6"],
  },
  professional_services: {
    averageResidual: 76,
    rows: [
      "ctrl-c-sod-ap:82/12/100",
      "scen-sc-vendor-fraud:76/22/98",
      "ctrl-c-sod-cash:82/19/96",
      "know-k1:88/25/95",
      "know-k2:88/25/95",
      "know-k7:88/25/95",
      "ctrl-c-cash:79/19/93",
      "ctrl-c-sod-billing:73/19/85",
      "scen-sc-cash-sod-failure:63/22/81",
      "know-k3:71/25/77",
      "know-k4:71/25/77",
      "know-k6:71/25/77",
      "ctrl-c-trust-rec:60/19/70",
      "ctrl-c-trust-disb:60/19/70",
      "ctrl-c-payroll:53/12/68",
      "scen-sc-trust-misappropriation:52/22/68",
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
      "scen-sc-vendor-fraud:84:98",
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
      "sc-key-person-leaves:32584:5000:90:4782",
      "sc-vendor-fraud:110588:10588:187:5613",
      "sc-cash-sod-failure:77411:5000:169:4867",
      "sc-trust-misappropriation:55294:5000:180:4782",
      "sc-writeoff-abuse:43445:5000:241:4782",
    ],
    tornado: ["seg:12", "spof:10", "dual:6", "bank:6", "team:6"],
  },
  restaurant: {
    averageResidual: 76,
    rows: [
      "ctrl-c-sod-ap:82/13/100",
      "scen-sc-vendor-fraud:76/24/97",
      "ctrl-c-sod-cash:82/20/95",
      "know-k1:88/25/95",
      "know-k5:88/25/95",
      "know-k7:88/25/95",
      "ctrl-c-cash:79/20/92",
      "ctrl-c-sod-billing:73/20/84",
      "scen-sc-cash-sod-failure:63/24/81",
      "know-k3:71/25/77",
      "know-k4:71/25/77",
      "know-k6:71/25/77",
      "ctrl-c-salestax:60/20/69",
      "ctrl-c-tip-pool:60/20/69",
      "ctrl-c-ap:73/37/67",
      "ctrl-c-payroll:53/13/67",
      "scen-sc-salestax-unremitted:52/24/67",
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
      "scen-sc-vendor-fraud:84:97",
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
      "sc-key-person-leaves:32584:5000:90:4782",
      "sc-vendor-fraud:110588:10588:187:5613",
      "sc-cash-sod-failure:77411:5000:169:4867",
      "sc-salestax-unremitted:55294:5000:180:4782",
      "sc-writeoff-abuse:43445:5000:241:4782",
      "sc-tip-pool-manipulation:43445:5000:241:4782",
    ],
    tornado: ["seg:12", "spof:9", "dual:6", "bank:6", "team:6"],
  },
  construction: {
    averageResidual: 61,
    rows: [
      "ctrl-c-sod-ap:82/15/93",
      "know-k3:88/25/88",
      "know-k4:88/25/88",
      "know-k5:88/25/88",
      "ctrl-c-sod-cash:82/23/84",
      "scen-sc-vendor-fraud:72/24/84",
      "ctrl-c-cash:79/23/81",
      "know-k7:71/25/71",
      "scen-sc-cash-sod-failure:61/24/71",
      "scen-sc-fictitious-sub:59/24/69",
      "scen-sc-change-order-kickback:59/24/69",
      "ctrl-c-change-orders:60/23/61",
      "ctrl-c-sub-verify:60/23/61",
      "ctrl-c-field-time:60/23/61",
      "ctrl-c-materials:60/23/61",
      "ctrl-c-payroll:53/15/60",
      "scen-sc-field-time-padding:51/24/60",
      "scen-sc-key-person-leaves:50/24/59",
      "ctrl-c-ap:73/40/58",
      "ctrl-c-sod-ar:67/40/53",
      "scen-sc-writeoff-abuse:42/24/49",
      "scen-sc-material-theft:42/24/49",
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
      "scen-sc-vendor-fraud:76:84",
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
      "sc-key-person-leaves:28334:5000:78:4782",
      "sc-cash-sod-failure:67314:5000:147:4867",
      "sc-field-time-padding:48082:5000:157:4782",
      "sc-vendor-fraud:96163:5000:163:4867",
      "sc-fictitious-sub:68688:5000:174:4782",
      "sc-change-order-kickback:68688:5000:174:4782",
      "sc-writeoff-abuse:37778:5000:209:4782",
      "sc-material-theft:37778:5000:209:4782",
    ],
    tornado: ["seg:10", "spof:8", "dual:6", "bank:6"],
  },
  nonprofit: {
    averageResidual: 61,
    rows: [
      "ctrl-c-sod-ap:82/14/90",
      "know-k2:88/25/84",
      "know-k3:88/25/84",
      "ctrl-c-sod-cash:82/21/83",
      "scen-sc-vendor-fraud:72/21/82",
      "ctrl-c-cash:79/21/80",
      "ctrl-c-sod-billing:73/21/73",
      "ctrl-c-board-review:70/21/70",
      "scen-sc-cash-sod-failure:61/21/69",
      "know-k5:71/25/68",
      "know-k6:71/25/68",
      "ctrl-c-cards:63/21/63",
      "ctrl-c-gift-log:60/21/60",
      "ctrl-c-restricted:60/21/60",
      "scen-sc-skimmed-donations:51/21/59",
      "scen-sc-card-abuse:51/21/59",
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
      "scen-sc-vendor-fraud:75:82",
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
      "sc-key-person-leaves:28334:5000:78:4782",
      "sc-cash-sod-failure:67314:5000:147:4867",
      "sc-skimmed-donations:48082:5000:157:4782",
      "sc-card-abuse:48082:5000:157:4782",
      "sc-vendor-fraud:96163:5000:163:4867",
      "sc-writeoff-abuse:37778:5000:209:4782",
      "sc-restricted-diverted:37778:5000:209:4782",
    ],
    tornado: ["seg:12", "dual:6", "bank:6", "spof:6"],
  },
  general: {
    averageResidual: 70,
    rows: [
      "ctrl-c-sod-ap:82/14/98",
      "scen-sc-vendor-fraud:76/23/94",
      "know-k1:88/25/91",
      "know-k3:88/25/91",
      "ctrl-c-sod-cash:82/22/90",
      "ctrl-c-cash:79/22/86",
      "ctrl-c-sod-billing:73/22/79",
      "scen-sc-cash-sod-failure:63/23/78",
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
      "scen-sc-vendor-fraud:82:94",
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
      "sc-key-person-leaves:32584:5000:90:4782",
      "sc-vendor-fraud:110588:10588:187:5613",
      "sc-cash-sod-failure:77411:5000:169:4867",
      "sc-writeoff-abuse:43445:5000:241:4782",
    ],
    tornado: ["seg:12", "dual:7", "bank:7", "spof:7", "team:7"],
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
