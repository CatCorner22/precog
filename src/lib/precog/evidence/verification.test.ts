import { describe, expect, it } from "vitest";
import { BENCHMARKS } from "./benchmarks";
import { VERIFIED_CASE_COUNT } from "./case-count";
import {
  allCasesUnverified,
  benchmarkCitation,
  CASE_LIBRARY,
  caseCountsForIndustry,
  caseIsVerified,
  sectorsForIndustry,
} from "./index";

/**
 * Who has checked the library against its sources. Nobody has yet, so every
 * case card carries the "Unverified" marker, a list of cases says so once
 * above it, the landing page says Precog is still checking, and no benchmark
 * prints a page. When a person checks a record or reads a page in the
 * published report, raise the matching count here, and VERIFIED_CASE_COUNT
 * in case-count.ts, in the same change.
 */
describe("verification of the evidence library", () => {
  it("counts the case records a named person has verified, and the landing page's count matches", () => {
    expect(CASE_LIBRARY.filter(caseIsVerified)).toHaveLength(0);
    expect(VERIFIED_CASE_COUNT).toBe(CASE_LIBRARY.filter(caseIsVerified).length);
  });

  it("draws every case record from a Justice Department or IRS release, as the landing page says", () => {
    const hosts = new Set(CASE_LIBRARY.map((c) => new URL(c.source.url).hostname));
    expect([...hosts].sort()).toEqual(["www.irs.gov", "www.justice.gov"]);
  });

  it("calls a list all unverified only when it holds cases and none is verified", () => {
    const checked = { verifiedOn: "2026-10-01", verifiedBy: "A. Reviewer" };
    expect(allCasesUnverified(CASE_LIBRARY)).toBe(true);
    expect(allCasesUnverified([])).toBe(false);
    expect(allCasesUnverified([{}, checked])).toBe(false);
    expect(allCasesUnverified([checked])).toBe(false);
  });

  it("counts the benchmarks that carry a page from the published report", () => {
    expect(BENCHMARKS.filter((b) => Boolean(b.page))).toHaveLength(0);
  });

  it("calls a record verified only with both a date and a name", () => {
    expect(caseIsVerified({})).toBe(false);
    expect(caseIsVerified({ verifiedOn: "2026-10-01" })).toBe(false);
    expect(caseIsVerified({ verifiedOn: "2026-10-01", verifiedBy: "A. Reviewer" })).toBe(true);
  });

  it("adds a page and figure to a benchmark's citation only when they are filled", () => {
    const study = "Occupational Fraud 2026: A Report to the Nations";
    expect(benchmarkCitation({ study })).toBe(study);
    expect(benchmarkCitation({ study, page: "", figure: "" })).toBe(study);
    expect(benchmarkCitation({ study, page: "12", figure: "8" })).toBe(
      `${study}, page 12, figure 8`,
    );
  });
});

describe("caseCountsForIndustry", () => {
  it("counts a line of business's own records from the library, beside the whole library", () => {
    for (const industry of ["retail", "automotive", "dental", "construction"]) {
      const sectors = sectorsForIndustry(industry);
      const own = CASE_LIBRARY.filter((c) => sectors.includes(c.sector)).length;
      expect(caseCountsForIndustry(industry)).toEqual({
        own,
        total: CASE_LIBRARY.length,
        sectors,
      });
    }
  });

  it("gives the general template no line of its own", () => {
    expect(caseCountsForIndustry("general").own).toBeNull();
  });
});
