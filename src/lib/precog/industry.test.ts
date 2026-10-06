import { describe, expect, it } from "vitest";
import {
  DEFAULT_INDUSTRY,
  INDUSTRIES,
  industryMeta,
  pluralTeamLabel,
  type IndustryId,
} from "./industry";
import { getIndustryTemplate } from "./templates";
import { getIndustryCopy } from "./templates/industry-copy";

describe("pluralTeamLabel", () => {
  it("spells the plural of every industry's word for a business", () => {
    expect(Object.fromEntries(INDUSTRIES.map(({ id }) => [id, pluralTeamLabel(id)]))).toEqual({
      dental: "practices",
      retail: "stores",
      professional_services: "firms",
      restaurant: "restaurants",
      construction: "companies",
      automotive: "shops",
      nonprofit: "organizations",
      general: "businesses",
    });
  });
});

describe("sample notes", () => {
  it("tells each line of business what the sample is and what to skip", () => {
    for (const industry of INDUSTRIES) {
      expect(industry.sampleNote.length, industry.id).toBeGreaterThan(20);
      expect(industry.sampleNote, industry.id).not.toMatch(/\bshould\b|\be\.g\./i);
    }
  });
});

describe("an industry the app does not know", () => {
  it("falls back to one industry for its metadata, sample and copy alike", () => {
    const unknown = "veterinary" as IndustryId;
    expect(industryMeta(unknown).id).toBe(DEFAULT_INDUSTRY);
    expect(getIndustryTemplate(unknown).id).toBe(DEFAULT_INDUSTRY);
    expect(getIndustryCopy(unknown)).toBe(getIndustryCopy(DEFAULT_INDUSTRY));
  });
});
