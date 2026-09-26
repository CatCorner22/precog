import { describe, expect, it } from "vitest";
import { getBaseTemplate } from "../active-template";
import { INDUSTRIES, type IndustryId } from "../industry";
import { scenarioFlags } from "./scenario-kind";

const FRAUD_WORDS =
  /\b(theft|steal|stolen|skim|skimmed|kickback|divert|diverted|diversion|misappropriat\w*|abuse|fictitious|taken|inflated|padded|kept|personal spending|not paid)\b/i;

const everyScenario = INDUSTRIES.flatMap(({ id }) =>
  getBaseTemplate(id as IndustryId).scenarios.map((s) => ({ industry: id, s })),
);

describe("scenarioFlags", () => {
  it("prices every scenario that describes taking money or goods as fraud", () => {
    for (const { industry, s } of everyScenario) {
      if (!FRAUD_WORDS.test(`${s.title} ${s.description}`)) continue;
      expect(scenarioFlags(s.id).fraudRelated, `${industry}/${s.id}`).toBe(true);
    }
  });

  it("classifies the industry-specific frauds the id words used to miss", () => {
    for (const id of [
      "sc-skimmed-donations",
      "sc-trust-misappropriation",
      "sc-drug-diversion",
      "sc-card-abuse",
      "sc-change-order-kickback",
      "sc-fictitious-sub",
      "sc-material-theft",
      "sc-field-time-padding",
      "sc-tip-pool-manipulation",
      "sc-salestax-unremitted",
      "sc-restricted-diverted",
    ]) {
      expect(scenarioFlags(id).fraudRelated, id).toBe(true);
    }
  });

  it("does not call a departure fraud", () => {
    expect(scenarioFlags("sc-front-desk-leaves")).toEqual({
      fraudRelated: false,
      cashRelated: false,
    });
    expect(scenarioFlags("sc-key-person-leaves").fraudRelated).toBe(false);
  });

  it("writes a kind down for every scenario a template carries", () => {
    const departures = new Set(["sc-front-desk-leaves", "sc-key-person-leaves"]);
    for (const { industry, s } of everyScenario) {
      expect(scenarioFlags(s.id).fraudRelated, `${industry}/${s.id}`).toBe(!departures.has(s.id));
    }
  });
});
