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
      nonprofit: "organizations",
      general: "businesses",
    });
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
