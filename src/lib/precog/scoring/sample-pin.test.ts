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
 * Three moves since then come from the duty-conflict engine, not from the
 * scoping changes, and are intended:
 * - A deposit preparer who can enter write-offs is flagged ("Collect cash +
 *   enter write-offs", read through deposit preparation), and it takes the
 *   deck slot "Deposit prep + payment posting" held at the same priority.
 * - The professional-services bookkeeper prepares deposits and reconciles,
 *   a new critical cash-custody finding: threat index 90 → 91, and it enters
 *   the deck ahead of the lowest item (a single point of failure at 65).
 * - Findings that tie at the displayed score now rank by their full score,
 *   so "Payment posting + bank reconciliation" leads "Create vendor +
 *   release payment" where both show 91.
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
    averageResidual: 60,
    rows: [
      "know-k1:88/25/91",
      "know-k3:88/25/91",
      "scen-sc-vendor-fraud:76/31/90",
      "ctrl-c-sod-cash:82/26/84",
      "ctrl-c-sod-ap:82/26/84",
      "ctrl-c-cash:79/26/81",
      "ctrl-c-sod-billing:73/26/74",
      "know-k4:71/25/74",
      "know-k6:71/25/74",
      "scen-sc-cash-sod-failure:63/31/74",
      "scen-sc-front-desk-leaves:53/31/62",
      "ctrl-c-ap:73/40/61",
      "ctrl-c-sod-ar:67/40/55",
      "scen-sc-writeoff-abuse:42/31/49",
      "ctrl-c-ar:57/40/47",
      "ctrl-c-claims:47/40/39",
      "ctrl-c-payroll:47/40/39",
      "ctrl-c-schedule:47/40/39",
      "ctrl-c-clinical:47/40/39",
      "know-k2:65/70/27",
      "know-k5:65/70/27",
      "know-k7:65/70/27",
    ],
    threatIndex: 88,
    threatDeck: [
      "sod-rule-vendor-create-pay:91:92",
      "sod-rule-writeoff:91:92",
      "ctrl-c-sod-cash:87:84",
      "ctrl-c-sod-ap:87:84",
      "ctrl-c-cash:85:81",
      "sod-rule-collect-adjust:83:78",
      "scen-sc-vendor-fraud:80:90",
      "know-k1:79:91",
      "know-k3:79:91",
      "spof-k4:65:65",
    ],
    coso: 37,
    cosoComponents: [
      "control_environment:50",
      "risk_assessment:46",
      "control_activities:20",
      "information_communication:30",
      "monitoring:37",
    ],
    ranked: [
      "sc-front-desk-leaves:36533:5000:90:4782",
      "sc-vendor-fraud:110588:10588:187:5613",
      "sc-cash-sod-failure:77411:5000:169:4867",
      "sc-writeoff-abuse:43445:5000:241:4782",
    ],
    tornado: ["seg:8", "bank:6", "dual:5", "spof:5", "team:5"],
  },
  retail: {
    averageResidual: 66,
    rows: [
      "know-k3:88/25/91",
      "know-k6:88/25/91",
      "scen-sc-vendor-fraud:76/31/90",
      "ctrl-c-sod-cash:82/26/85",
      "ctrl-c-sod-ap:82/26/85",
      "ctrl-c-cash:79/26/82",
      "ctrl-c-sod-billing:73/26/75",
      "know-k4:71/25/74",
      "know-k5:71/25/74",
      "scen-sc-cash-sod-failure:63/31/74",
      "ctrl-c-ap:73/39/62",
      "scen-sc-key-person-leaves:51/31/60",
      "ctrl-c-sod-ar:67/39/56",
      "scen-sc-writeoff-abuse:42/31/49",
      "ctrl-c-ar:57/39/48",
      "ctrl-c-payroll:47/39/40",
      "know-k1:65/70/27",
      "know-k2:65/70/27",
    ],
    threatIndex: 88,
    threatDeck: [
      "sod-rule-vendor-create-pay:91:92",
      "sod-rule-writeoff:91:92",
      "ctrl-c-sod-cash:87:85",
      "ctrl-c-sod-ap:87:85",
      "ctrl-c-cash:86:82",
      "scen-sc-vendor-fraud:80:90",
      "know-k3:79:91",
      "know-k6:79:91",
      "spof-k4:65:65",
      "spof-k5:65:65",
    ],
    coso: 37,
    cosoComponents: [
      "control_environment:50",
      "risk_assessment:46",
      "control_activities:20",
      "information_communication:30",
      "monitoring:37",
    ],
    ranked: [
      "sc-key-person-leaves:32584:5000:90:4782",
      "sc-vendor-fraud:110588:10588:187:5613",
      "sc-cash-sod-failure:77411:5000:169:4867",
      "sc-writeoff-abuse:43445:5000:241:4782",
    ],
    tornado: ["seg:9", "bank:7", "dual:6", "spof:6", "team:6"],
  },
  professional_services: {
    averageResidual: 70,
    rows: [
      "know-k1:88/25/91",
      "know-k2:88/25/91",
      "scen-sc-vendor-fraud:76/30/90",
      "ctrl-c-sod-cash:82/23/88",
      "ctrl-c-sod-ap:82/23/88",
      "ctrl-c-cash:79/23/85",
      "ctrl-c-sod-billing:73/23/77",
      "scen-sc-cash-sod-failure:63/30/75",
      "know-k3:71/25/74",
      "know-k4:71/25/74",
      "know-k6:71/25/74",
      "ctrl-c-ap:73/38/64",
      "scen-sc-key-person-leaves:51/30/60",
      "ctrl-c-sod-ar:67/38/58",
      "ctrl-c-ar:57/38/49",
      "scen-sc-writeoff-abuse:42/30/49",
      "ctrl-c-payroll:47/38/41",
      "know-k5:65/70/27",
    ],
    threatIndex: 91,
    threatDeck: [
      "sod-rule-custody-rec:91:92",
      "sod-rule-release-rec:91:92",
      "sod-rule-cash-rec:91:92",
      "sod-rule-vendor-create-pay:91:92",
      "ctrl-c-sod-cash:89:88",
      "ctrl-c-sod-ap:89:88",
      "ctrl-c-cash:87:85",
      "scen-sc-vendor-fraud:80:90",
      "know-k1:79:91",
      "know-k2:79:91",
    ],
    coso: 33,
    cosoComponents: [
      "control_environment:50",
      "risk_assessment:38",
      "control_activities:16",
      "information_communication:25",
      "monitoring:37",
    ],
    ranked: [
      "sc-key-person-leaves:32584:5000:90:4782",
      "sc-vendor-fraud:110588:10588:187:5613",
      "sc-cash-sod-failure:77411:5000:169:4867",
      "sc-writeoff-abuse:43445:5000:241:4782",
    ],
    tornado: ["seg:10", "dual:7", "bank:7", "spof:7", "team:7"],
  },
  restaurant: {
    averageResidual: 66,
    rows: [
      "know-k5:88/25/91",
      "scen-sc-vendor-fraud:76/29/91",
      "ctrl-c-sod-cash:82/25/86",
      "ctrl-c-sod-ap:82/25/86",
      "ctrl-c-cash:79/25/83",
      "ctrl-c-sod-billing:73/25/76",
      "scen-sc-cash-sod-failure:63/29/75",
      "know-k3:71/25/74",
      "know-k4:71/25/74",
      "know-k6:71/25/74",
      "ctrl-c-ap:73/39/62",
      "scen-sc-key-person-leaves:51/29/61",
      "ctrl-c-sod-ar:67/39/56",
      "scen-sc-writeoff-abuse:42/29/50",
      "ctrl-c-ar:57/39/48",
      "ctrl-c-payroll:47/39/40",
      "know-k1:65/70/27",
      "know-k2:65/70/27",
    ],
    threatIndex: 90,
    threatDeck: [
      "sod-rule-cash-rec:91:92",
      "sod-rule-vendor-create-pay:91:92",
      "sod-rule-writeoff:91:92",
      "ctrl-c-sod-cash:88:86",
      "ctrl-c-sod-ap:88:86",
      "ctrl-c-cash:86:83",
      "sod-rule-collect-adjust:83:78",
      "ctrl-c-sod-billing:82:76",
      "scen-sc-vendor-fraud:80:91",
      "know-k5:79:91",
    ],
    coso: 36,
    cosoComponents: [
      "control_environment:50",
      "risk_assessment:46",
      "control_activities:15",
      "information_communication:30",
      "monitoring:37",
    ],
    ranked: [
      "sc-key-person-leaves:32584:5000:90:4782",
      "sc-vendor-fraud:110588:10588:187:5613",
      "sc-cash-sod-failure:77411:5000:169:4867",
      "sc-writeoff-abuse:43445:5000:241:4782",
    ],
    tornado: ["seg:10", "dual:7", "bank:7", "spof:6", "team:6"],
  },
  general: {
    averageResidual: 66,
    rows: [
      "know-k1:88/25/91",
      "know-k3:88/25/91",
      "scen-sc-vendor-fraud:76/31/90",
      "ctrl-c-sod-cash:82/26/85",
      "ctrl-c-sod-ap:82/26/85",
      "ctrl-c-cash:79/26/82",
      "ctrl-c-sod-billing:73/26/75",
      "know-k4:71/25/74",
      "know-k5:71/25/74",
      "scen-sc-cash-sod-failure:63/31/74",
      "ctrl-c-ap:73/39/62",
      "scen-sc-key-person-leaves:51/31/60",
      "ctrl-c-sod-ar:67/39/56",
      "scen-sc-writeoff-abuse:42/31/49",
      "ctrl-c-ar:57/39/48",
      "ctrl-c-payroll:47/39/40",
      "know-k2:65/70/27",
      "know-k6:65/70/27",
    ],
    threatIndex: 89,
    threatDeck: [
      "sod-rule-cash-rec:91:92",
      "sod-rule-vendor-create-pay:91:92",
      "sod-rule-writeoff:91:92",
      "ctrl-c-sod-cash:87:85",
      "ctrl-c-sod-ap:87:85",
      "ctrl-c-cash:86:82",
      "scen-sc-vendor-fraud:80:90",
      "know-k1:79:91",
      "know-k3:79:91",
      "spof-k4:65:65",
    ],
    coso: 37,
    cosoComponents: [
      "control_environment:50",
      "risk_assessment:46",
      "control_activities:20",
      "information_communication:30",
      "monitoring:37",
    ],
    ranked: [
      "sc-key-person-leaves:32584:5000:90:4782",
      "sc-vendor-fraud:110588:10588:187:5613",
      "sc-cash-sod-failure:77411:5000:169:4867",
      "sc-writeoff-abuse:43445:5000:241:4782",
    ],
    tornado: ["seg:9", "bank:7", "dual:6", "spof:6", "team:6"],
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
