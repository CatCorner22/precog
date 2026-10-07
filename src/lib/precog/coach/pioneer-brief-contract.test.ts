import { describe, expect, it } from "vitest";
import { resolveTemplate } from "../active-template";
import { runPrecogScenario } from "../engine";
import type { IndustryId } from "../industry";
import { DEFAULT_RISK_VARIABLES } from "../scoring/dynamic-variables";
import { describeScenarioFigures } from "../llm/scenario-tools";
import { defaultProfile } from "../practice-profile";
import { getIndustryCopy } from "../templates/industry-copy";
import { ownBusinessProfile, buildOwnTeam } from "../onboarding/own-team";
import { answerPioneer } from "./pioneer-answer";
import { pioneerProfileFrom } from "./pioneer-profile";
import { DEFAULT_COACH_QUESTION, localBrief } from "./local-brief";

const INDUSTRIES: IndustryId[] = [
  "dental",
  "retail",
  "restaurant",
  "professional_services",
  "construction",
  "automotive",
  "nonprofit",
  "general",
];
const TODAY = "2026-04-12";
const REMOVED_HEADINGS = [
  "Your question",
  "Your open duty conflicts",
  "Watched conditions",
  "What else moves",
  "Order of fixes (Precog's model)",
  "Four review lenses",
  "Tradeoffs",
  "Where the figures come from",
];
const SCENARIO_QUESTIONS: {
  industry: IndustryId;
  question: string;
  ids: string[];
}[] = [
  {
    industry: "dental",
    question: "Walk me through a write-off abuse scenario and its controls.",
    ids: ["sc-writeoff-abuse"],
  },
  {
    industry: "retail",
    question: "Compare the vendor fraud and cash skimming scenarios for my store.",
    ids: ["sc-vendor-fraud", "sc-cash-sod-failure"],
  },
  {
    industry: "restaurant",
    question: "Walk me through a vendor fraud scenario for my kitchen.",
    ids: ["sc-vendor-fraud"],
  },
  {
    industry: "professional_services",
    question: "Compare the trust commingling and vendor fraud scenarios.",
    ids: ["sc-trust-misappropriation", "sc-vendor-fraud"],
  },
  {
    industry: "construction",
    question: "Walk me through a change-order kickback scenario and its controls.",
    ids: ["sc-change-order-kickback"],
  },
  {
    industry: "automotive",
    question: "Walk me through a title-fee or rebate diversion scenario and its controls.",
    ids: ["sc-deal-fee-skim"],
  },
  {
    industry: "nonprofit",
    question: "Walk me through a card abuse scenario and the checks the treasurer runs.",
    ids: ["sc-card-abuse"],
  },
  {
    industry: "general",
    question: "Walk me through a vendor fraud scenario step by step.",
    ids: ["sc-vendor-fraud"],
  },
];

function sampleProfile(industry: IndustryId) {
  return pioneerProfileFrom(defaultProfile(industry) as never);
}

function runBrief(industry: IndustryId, question: string) {
  const profile = sampleProfile(industry);
  return localBrief(question, { profile, question, today: TODAY }, profile);
}

describe("Pioneer brief contract", () => {
  it("keeps every industry prompt answer-first, concise, and free of malformed deltas", async () => {
    for (const industry of INDUSTRIES) {
      const questions = [DEFAULT_COACH_QUESTION, ...getIndustryCopy(industry).pioneerPrompts];
      for (const question of questions) {
        const run = runBrief(industry, question);
        const { brief } = run;
        for (const heading of REMOVED_HEADINGS) {
          expect(brief.markdown).not.toContain(`## ${heading}`);
        }
        expect(brief.markdown).not.toContain("If you ");
        expect(brief.markdown).not.toContain("(stack)");
        expect(brief.markdown).not.toContain(" $0");
        expect(
          /^\s*-\s*\d+ watched conditions? breached\b/im.test(brief.markdown) &&
            /breached\*\*/.test(brief.markdown),
        ).toBe(false);
        const headingOrder = [
          "Answer",
          "Situation",
          "This week",
          "Recommended moves",
          "Warnings",
          "Biggest open risks",
          "Limits",
        ];
        const headings = brief.markdown
          .split("\n")
          .filter((line) => line.startsWith("## "))
          .map((line) => line.slice(3));
        expect(headings.every((heading) => headingOrder.includes(heading))).toBe(true);
        expect(headings.map((heading) => headingOrder.indexOf(heading))).toEqual(
          [...headings.map((heading) => headingOrder.indexOf(heading))].sort((a, b) => a - b),
        );
        const thisWeek = brief.markdown.match(/^## This week\n([^\n]*)/m)?.[1] ?? "";
        expect(thisWeek).not.toMatch(/^This week:/);
        const situation = brief.markdown.match(/^## Situation\n([^\n]*)/m)?.[1] ?? "";
        expect(situation).not.toContain("Question:");
        const wordCount = brief.markdown.trim().split(/\s+/).length;
        expect(wordCount, `${industry} · ${question}`).toBeLessThanOrEqual(900);
        for (const decision of brief.decisions) {
          expect(brief.markdown).toContain(decision.action);
        }
        if (question === DEFAULT_COACH_QUESTION) {
          expect(brief.markdown.startsWith("## Answer\n")).toBe(true);
          for (const step of run.steps) {
            expect(`${step.title}\n${step.detail}`).not.toContain("(stack)");
          }
          const step = run.steps.find(
            (item) => item.title === "Wrote the brief from Precog's rules",
          );
          expect(step?.detail).toMatch(
            new RegExp(`^${brief.decisions.length} recommended moves\\b`),
          );
          const answer = await answerPioneer(
            { question, profile: sampleProfile(industry), today: TODAY },
            { userId: "contract-test", grok: "no_api_key" },
          );
          if (!answer.ok) throw new Error(answer.error);
          expect(
            JSON.stringify({
              markdown: answer.markdown,
              details: answer.details,
              steps: answer.steps,
              evidence: answer.evidence,
              specialistNotes: answer.specialistNotes,
              decisions: answer.decisions,
            }),
          ).not.toContain("(stack)");
        }
      }
    }
  });

  it.each(SCENARIO_QUESTIONS)(
    "answers the $industry scenario prompt from the resolved template",
    ({ industry, question, ids }) => {
      const profile = sampleProfile(industry);
      const tpl = resolveTemplate(profile);
      const { brief } = localBrief(question, { profile, question, today: TODAY }, profile);
      const answer = brief.markdown.split("\n## Situation")[0];
      expect(answer).toContain("## Answer");
      expect(answer).toContain("**In your business now**");

      for (const id of ids) {
        const scenario = tpl.scenarios.find((item) => item.id === id);
        expect(scenario).toBeDefined();
        expect(answer).toContain(`### ${scenario?.title}`);
        expect(answer).toContain("**How it unfolds**");
        expect(answer).toContain("**What stops it:**");
        const result = runPrecogScenario(tpl, id, {
          staff: profile.staff,
          riskVariables: profile.riskVariables ?? DEFAULT_RISK_VARIABLES,
        });
        expect(result).not.toBeNull();
        if (!result) throw new Error(`Missing scenario ${id}`);
        expect(answer).toContain(
          `**Precog's assumptions:** ${describeScenarioFigures({
            retained: result.retainedImpact,
            timelineDays: result.timelineDays,
            dynamic: result.dynamic ?? null,
          })}.`,
        );
      }
    },
  );

  it("marks an unconfirmed starter scenario in an owner's answer", () => {
    const profile = pioneerProfileFrom(
      ownBusinessProfile(defaultProfile("dental"), {
        practiceName: "Northside",
        people: buildOwnTeam([
          { name: "Grace Kim", role: "Bookkeeper", duties: ["create_vendor", "release_payment"] },
        ]),
      }) as never,
    );
    const question = "Walk me through a write-off abuse scenario and its controls.";
    const { brief } = localBrief(question, { profile, question, today: TODAY }, profile);
    const scenario = resolveTemplate(profile).scenarios.find(
      (item) => item.id === "sc-writeoff-abuse",
    );
    expect(scenario).toBeDefined();
    expect(
      brief.markdown
        .split("\n")
        .some(
          (line) =>
            line.includes(scenario?.title ?? "") && line.includes("not counted in your totals"),
        ),
    ).toBe(true);
  });
});
