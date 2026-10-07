import { describe, expect, it } from "vitest";
import { resolveTemplate } from "../active-template";
import { defaultProfile } from "../practice-profile";
import type { IndustryId } from "../industry";
import { pioneerProfileFrom } from "./pioneer-profile";
import { matchScenarios } from "./scenario-question";

const cases: {
  industry: IndustryId;
  question: string;
  expected: string[];
}[] = [
  {
    industry: "dental",
    question: "Walk me through a write-off abuse scenario and its controls.",
    expected: ["sc-writeoff-abuse"],
  },
  {
    industry: "retail",
    question: "Compare the vendor fraud and cash skimming scenarios for my store.",
    expected: ["sc-vendor-fraud", "sc-cash-sod-failure"],
  },
  {
    industry: "restaurant",
    question: "Walk me through a vendor fraud scenario for my kitchen.",
    expected: ["sc-vendor-fraud"],
  },
  {
    industry: "professional_services",
    question: "Compare the trust commingling and vendor fraud scenarios.",
    expected: ["sc-trust-misappropriation", "sc-vendor-fraud"],
  },
  {
    industry: "construction",
    question: "Walk me through a change-order kickback scenario and its controls.",
    expected: ["sc-change-order-kickback"],
  },
  {
    industry: "automotive",
    question: "Walk me through a title-fee or rebate diversion scenario and its controls.",
    expected: ["sc-deal-fee-skim"],
  },
  {
    industry: "nonprofit",
    question: "Walk me through a card abuse scenario and the checks the treasurer runs.",
    expected: ["sc-card-abuse"],
  },
  {
    industry: "general",
    question: "Walk me through a vendor fraud scenario step by step.",
    expected: ["sc-vendor-fraud"],
  },
];

function sampleScenarios(industry: IndustryId) {
  const profile = pioneerProfileFrom(defaultProfile(industry) as never);
  return resolveTemplate(profile).scenarios;
}

describe("matchScenarios", () => {
  it.each(cases)("matches the $industry sample prompt", ({ industry, question, expected }) => {
    const matched = matchScenarios(question, sampleScenarios(industry)).map((item) => item.id);
    expect(matched).toHaveLength(expected.length);
    expect(matched).toEqual(expect.arrayContaining(expected));
  });

  it.each([
    "If my front desk lead leaves, what breaks first?",
    "Vendor fraud is a problem in my store.",
  ])("does not match a question without a scenario trigger: %s", (question) => {
    for (const industry of [
      "dental",
      "retail",
      "restaurant",
      "professional_services",
      "construction",
      "automotive",
      "nonprofit",
      "general",
    ] satisfies IndustryId[]) {
      expect(matchScenarios(question, sampleScenarios(industry))).toEqual([]);
    }
  });
});
