import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  BENCHMARK_BY_ID,
  casesForSodRules,
  caseIsVerified,
  citingCaseStats,
  UNVERIFIED_CASE,
  type CaseStudy,
} from "@/lib/precog/evidence";
import { DEFAULT_FRAUD_STATS } from "@/lib/precog/templates/shared-controls";
import { formatUsd } from "@/lib/utils";
import {
  ControlReportCaseAppendix,
  ControlReportEvidenceSection,
} from "./control-report-evidence-section";

const RULES = ["rule-cash-rec", "rule-sign-rec", "rule-release-rec", "rule-payroll-release"];

function sectionHtml() {
  const citing = citingCaseStats(RULES);
  return renderToStaticMarkup(
    <ControlReportEvidenceSection
      evidence={casesForSodRules(RULES)}
      citing={citing}
      steps={[]}
      lossRange={citing.loss}
      found={citing.detection}
      statsScope={{
        count: citing.count,
        floors: citing.cases.filter((c) => c.lossUsd > 0 && c.lossIsFloor).length,
      }}
    />,
  );
}

const verify = (c: CaseStudy): CaseStudy => ({
  ...c,
  verifiedOn: "2026-10-01",
  verifiedBy: "A. Reviewer",
});

describe("the report's evidence section", () => {
  it("leads with the small-organization median and its source, then the prosecuted cases' median", () => {
    const html = sectionHtml();
    const loss = citingCaseStats(RULES).loss;
    expect(loss).not.toBeNull();
    const small = BENCHMARK_BY_ID["bm-small-org-losses"];
    // The figure the report prints is the one the fraud survey record holds.
    expect(small.numeric).toBe(DEFAULT_FRAUD_STATS.medianLossSmallOrgUsd);
    expect(formatUsd(small.numeric ?? 0)).toBe("$126,000");
    const lead = `>Organizations under 100 employees that suffered an investigated fraud lost a median of $126,000 (Association of Certified Fraud Examiners, Occupational Fraud 2026: A Report to the Nations).`;
    expect(html).toContain(lead);
    const second = ` Among prosecuted federal cases with these gaps, the median stated loss was ${formatUsd(loss!.median)}, from ${formatUsd(loss!.low)} to ${formatUsd(loss!.high)}`;
    expect(html).toContain(second);
    expect(html.indexOf(lead)).toBeLessThan(html.indexOf(second));
    expect(html).not.toContain("cases that show these gaps,");
  });
});

describe("the report's case appendix", () => {
  const evidence = casesForSodRules(RULES);

  it("prints one note and no per-case mark when no cited case has been checked", () => {
    expect(evidence.length).toBeGreaterThan(1);
    expect(evidence.some(caseIsVerified)).toBe(false);
    const html = renderToStaticMarkup(<ControlReportCaseAppendix evidence={evidence} />);
    expect(html.split(UNVERIFIED_CASE.listNote)).toHaveLength(2);
    expect(UNVERIFIED_CASE.listNote).toBe(
      "None of these case records has been checked against its source yet.",
    );
    expect(html).not.toContain(`[${UNVERIFIED_CASE.label}]`);
    expect(html).not.toContain(`A case marked ${UNVERIFIED_CASE.label}`);
    const first = evidence[0];
    expect(html).toContain(
      `${first.title}${first.resolvedYear ? ` (${first.resolvedYear})` : ""} — ${first.source.publisher.replace(/'/g, "&#x27;")}, <span class="break-all">`,
    );
  });

  it("keeps the per-case mark on a mixed set, and drops the note", () => {
    const mixed = [verify(evidence[0]), ...evidence.slice(1)];
    const html = renderToStaticMarkup(<ControlReportCaseAppendix evidence={mixed} />);
    expect(html).not.toContain(UNVERIFIED_CASE.listNote);
    expect(html).toContain(`A case marked ${UNVERIFIED_CASE.label}`);
    expect(html.split(`[${UNVERIFIED_CASE.label}]`)).toHaveLength(mixed.length);
  });

  it("prints no mark and no note once every cited case is verified", () => {
    const html = renderToStaticMarkup(
      <ControlReportCaseAppendix evidence={evidence.map(verify)} />,
    );
    expect(html).not.toContain(UNVERIFIED_CASE.listNote);
    expect(html).not.toContain(UNVERIFIED_CASE.label);
  });
});
