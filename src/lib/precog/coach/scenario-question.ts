import type { ScenarioTemplate } from "../types";

const SCENARIO_TRIGGER =
  /\b(scenarios?|walk me through|compare|step by step|what happens (if|when))\b/i;
const SCENARIO_STOP_WORDS = new Set([
  "the",
  "a",
  "and",
  "or",
  "my",
  "our",
  "for",
  "its",
  "to",
  "of",
  "with",
  "walk",
  "me",
  "through",
  "compare",
  "scenario",
  "step",
  "by",
  "one",
  "person",
  "controls",
  "control",
  "store",
  "kitchen",
  "what",
  "happens",
  "if",
  "when",
]);

function stem(word: string): string {
  if (word.endsWith("ing")) return word.slice(0, -3);
  if (word.endsWith("ed")) return word.slice(0, -2);
  if (/(?:ss|x|z|ch|sh)es$/.test(word)) return word.slice(0, -2);
  if (word.endsWith("s")) return word.slice(0, -1);
  return word;
}

function words(value: string): string[] {
  return (
    value
      .toLowerCase()
      .replace(/-/g, "")
      .match(/[a-z0-9]+/g)
      ?.map(stem)
      .filter((word) => word.length > 0 && !SCENARIO_STOP_WORDS.has(word)) ?? []
  );
}

/** Return the strongest scenario matches for a question that asks for one. */
export function matchScenarios(
  question: string,
  scenarios: readonly ScenarioTemplate[],
): ScenarioTemplate[] {
  if (!SCENARIO_TRIGGER.test(question)) return [];

  const questionWords = new Set(words(question));
  const scored = scenarios
    .map((scenario, index) => {
      const slug = scenario.id.replace(/^sc-/, "").split("-");
      const keywords = new Set([...slug.flatMap(words), ...words(scenario.title)]);
      return {
        scenario,
        index,
        score: [...questionWords].filter((word) => keywords.has(word)).length,
      };
    })
    .filter((match) => match.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index);

  const pairRequested = /\bcompare\b|\s+vs\b/i.test(question);
  return scored.slice(0, pairRequested ? 2 : 1).map((match) => match.scenario);
}
