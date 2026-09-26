import { describe, expect, it } from "vitest";
import { INDUSTRIES } from "../industry";
import { pluralTeamLabel } from "./industry-copy";

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
