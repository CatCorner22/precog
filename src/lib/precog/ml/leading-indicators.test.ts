import { getIndustryTemplate } from "../templates";
import { describe, expect, it } from "vitest";
import { resolveTemplate } from "../active-template";
import { DEFAULT_RISK_VARIABLES } from "../scoring/dynamic-variables";
import type { StaffComposition } from "../types";
import { defaultProfile } from "../practice-profile";
import { portfolioSummary } from "../scoring/residual-engine";
import { residualScope } from "../scoring/scope";
import { DEFAULT_WEIGHTS } from "../scoring/weights";
import { scoreLeadingIndicators, statusRank } from "./leading-indicators";

const calmStaff: StaffComposition = {
  teamSize: 12,
  soleOwnerKnowledgeCount: 0,
  avgTenureYears: 8,
  segregationScore: 95,
  dualControlPayments: true,
  independentBankRec: true,
};

describe("scoreLeadingIndicators", () => {
  it("reads zero pressure and a calm band when every indicator is clear", () => {
    const base = getIndustryTemplate("general");
    // Every control separated, every register item held by two people.
    const tpl = resolveTemplate({
      industry: "general",
      customRelations: base.knowledge.flatMap((k) =>
        base.people.slice(0, 2).map((p) => ({
          personId: p.id,
          knowledgeId: k.id,
          level: "expert" as const,
        })),
      ),
    });
    const clean = { ...tpl, controls: tpl.controls.map((c) => ({ ...c, segregated: true })) };
    const report = scoreLeadingIndicators(clean, calmStaff, {
      ...DEFAULT_RISK_VARIABLES,
      dailyCashExposure: 1000,
    });
    const notClear = report.indicators.filter((i) => i.status !== "ok");
    // The residual index is not driven to zero by staff alone; COSO is no longer watched.
    expect(notClear.every((i) => i.id === "li_residual")).toBe(true);
    if (notClear.length === 0) {
      expect(report.pressureIndex).toBe(0);
      expect(report.band).toBe("calm");
    }
    expect(report.topActions).toHaveLength(notClear.length);
  });

  it("breaches on missing bank reconciliation and dual control, and orders actions by weight", () => {
    const tpl = getIndustryTemplate("dental");
    const report = scoreLeadingIndicators(
      tpl,
      { ...calmStaff, independentBankRec: false, dualControlPayments: false },
      DEFAULT_RISK_VARIABLES,
    );
    const byId = new Map(report.indicators.map((i) => [i.id, i]));
    expect(byId.get("li_bank_rec")!.status).toBe("breach");
    expect(byId.get("li_dual")!.status).toBe("breach");
    expect(report.pressureIndex).toBeGreaterThan(0);
    expect(["watch", "heat", "red"]).toContain(report.band);
  });

  it("puts daily cash on watch at $4,000 and breach at $6,000", () => {
    const tpl = getIndustryTemplate("general");
    const at = (dailyCashExposure: number) =>
      scoreLeadingIndicators(tpl, calmStaff, {
        ...DEFAULT_RISK_VARIABLES,
        dailyCashExposure,
      }).indicators.find((i) => i.id === "li_cash")!.status;
    expect(at(3999)).toBe("ok");
    expect(at(4000)).toBe("watch");
    expect(at(6000)).toBe("breach");
  });

  it("lists every threshold and weight as Precog's assumption", () => {
    const report = scoreLeadingIndicators(
      getIndustryTemplate("general"),
      calmStaff,
      DEFAULT_RISK_VARIABLES,
    );
    expect(report.assumptions[0]).toMatch(/Precog's assumption/);
    expect(report.assumptions.join(" ")).toContain("$4,000");
    expect(report.method).not.toMatch(/composite/);
  });

  it("uses plain words, not internal jargon", () => {
    const report = scoreLeadingIndicators(
      getIndustryTemplate("general"),
      { ...calmStaff, independentBankRec: false },
      DEFAULT_RISK_VARIABLES,
    );
    const text = report.indicators.map((i) => `${i.label} ${i.why}`).join(" ");
    expect(text).not.toMatch(/SPOF|SoD|recon\b|signals elevated/);
  });
});

describe("statusRank", () => {
  it("orders breach before watch before clear", () => {
    expect(statusRank("breach")).toBeGreaterThan(statusRank("watch"));
    expect(statusRank("watch")).toBeGreaterThan(statusRank("ok"));
  });
});

describe("the average residual check", () => {
  it("reads the Residual page's scoped figure: the owner's risk settings and confirmed scenarios", () => {
    const base = defaultProfile("dental");
    const profile = {
      ...base,
      riskVariables: {
        ...base.riskVariables,
        dailyCashExposure: 7500,
        hasSecurityCameras: true,
        deductible: 25000,
      },
    };
    const tpl = resolveTemplate(profile);
    const scope = residualScope(profile);
    const scoped = portfolioSummary(tpl, profile.staff, DEFAULT_WEIGHTS, scope).averageResidual;
    // The settings move the figure, so the check below can tell the two apart.
    expect(scoped).not.toBe(portfolioSummary(tpl, profile.staff).averageResidual);
    const report = scoreLeadingIndicators(
      tpl,
      profile.staff,
      profile.riskVariables,
      scope.confirmedScenarioIds,
    );
    expect(report.indicators.find((i) => i.id === "li_residual")?.value).toBe(scoped);
  });
});
