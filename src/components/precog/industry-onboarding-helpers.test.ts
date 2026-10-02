import { describe, expect, it } from "vitest";
import { CASE_LIBRARY } from "@/lib/precog/evidence";
import { INDUSTRIES } from "@/lib/precog/industry";
import { caseCoveragePhrase } from "./industry-onboarding-helpers";

const total = CASE_LIBRARY.length;
const inSectors = (...sectors: string[]) =>
  CASE_LIBRARY.filter((c) => sectors.includes(c.sector)).length;

describe("caseCoveragePhrase", () => {
  it("states a line of business's own count beside the whole library's, both from the library", () => {
    expect(caseCoveragePhrase("retail")).toBe(
      `${inSectors("retail")} prosecuted cases in retail, ${total} across all lines of business`,
    );
    expect(caseCoveragePhrase("construction")).toBe(
      `${inSectors("construction", "trades")} prosecuted cases in construction and the trades, ${total} across all lines of business`,
    );
    expect(caseCoveragePhrase("dental")).toBe(
      `${inSectors("dental", "medical", "veterinary")} prosecuted cases in dental, medical and veterinary practices, ${total} across all lines of business`,
    );
  });

  it("gives the general template the whole library", () => {
    expect(caseCoveragePhrase("general")).toBe(
      `${total} prosecuted cases across all lines of business`,
    );
  });

  it("never claims coverage for a line of business without saying the library total", () => {
    for (const ind of INDUSTRIES) {
      expect(caseCoveragePhrase(ind.id)).toMatch(
        new RegExp(`\\b${total} (prosecuted cases )?across all lines of business$`),
      );
      expect(caseCoveragePhrase(ind.id)).not.toContain("this line of business");
    }
  });
});
