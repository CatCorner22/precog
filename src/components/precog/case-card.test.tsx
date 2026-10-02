import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  CASE_LIBRARY,
  caseForRule,
  NO_CASE_FOR_RULE,
  UNVERIFIED_CASE,
} from "@/lib/precog/evidence";
import { CaseCard, RuleCaseCard } from "./case-card";

describe("CaseCard", () => {
  it("marks a record nobody has checked as unverified, with the reason on hover", () => {
    const html = renderToStaticMarkup(<CaseCard study={CASE_LIBRARY[0]} />);
    expect(html).toContain(UNVERIFIED_CASE.label);
    expect(html).toContain(`title="${UNVERIFIED_CASE.title}"`);
    expect(UNVERIFIED_CASE.title).toBe("Nobody has checked this record against its source yet.");
  });

  it("drops the marker once a named person has verified the record", () => {
    const verified = { ...CASE_LIBRARY[0], verifiedOn: "2026-10-01", verifiedBy: "A. Reviewer" };
    expect(renderToStaticMarkup(<CaseCard study={verified} />)).not.toContain(
      UNVERIFIED_CASE.label,
    );
  });
});

describe("RuleCaseCard", () => {
  it("says no prosecuted case shows the pair when no record cites the rule", () => {
    // No record cites rule-access-export; a related scheme exists but is not shown.
    expect(caseForRule("rule-access-export")?.citesRule ?? false).toBe(false);
    const html = renderToStaticMarkup(<RuleCaseCard ruleId="rule-access-export" />);
    expect(html).toContain(NO_CASE_FOR_RULE);
    expect(NO_CASE_FOR_RULE).toBe("No prosecuted case in the library shows this pair yet.");
    expect(html).not.toContain("A related scheme");
  });

  it("shows a citing case under 'This arrangement'", () => {
    const html = renderToStaticMarkup(<RuleCaseCard ruleId="rule-cash-rec" />);
    expect(html).toContain("This arrangement");
    expect(html).not.toContain(NO_CASE_FOR_RULE);
  });
});
