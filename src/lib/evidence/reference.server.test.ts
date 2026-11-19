import { describe, expect, it } from "vitest";
import {
  getEvidenceModuleFromBundle,
  listBenchmarkStudiesFromBundle,
  listEvidenceModulesFromBundle,
} from "./reference.server";

describe("evidence reference bundle", () => {
  it("loads all ten modules with titles and section headings", () => {
    const modules = listEvidenceModulesFromBundle();

    expect(modules).toHaveLength(10);
    expect(modules.map(({ id }) => id)).toEqual(
      expect.arrayContaining([
        "statistics",
        "misleading_reporting",
        "trial_standards",
        "grading_rubric",
        "psych_controls",
        "evidence_appraisal",
        "retrieval_workflow",
        "research_database",
        "benchmark_survey",
        "Trial_Evidence_Lab_Knowledge_Base",
      ]),
    );
    expect(modules.find(({ id }) => id === "trial_standards")?.headings).toContain(
      "3. Require an explicit baseline/placebo/sham comparator audit",
    );
  });

  it("returns full module markdown by id and null for an unknown id", () => {
    expect(getEvidenceModuleFromBundle("grading_rubric")?.markdown).toContain(
      "Three-part grading rubric",
    );
    expect(getEvidenceModuleFromBundle("missing-module")).toBeNull();
  });

  it("trims the twenty benchmarks to citations and three grades with rationales", () => {
    const studies = listBenchmarkStudiesFromBundle();

    expect(studies).toHaveLength(20);
    expect(studies[0]).toMatchObject({
      title:
        "Reduction in the Incidence of Type 2 Diabetes with Lifestyle Intervention or Metformin",
      doi: "10.1056/NEJMoa012512",
      pmid: "11832527",
      grades: {
        design: { grade: "B", rationale: expect.any(String) },
        results: { grade: "B", rationale: expect.any(String) },
        conclusions: { grade: "B", rationale: expect.any(String) },
      },
    });
  });
});
