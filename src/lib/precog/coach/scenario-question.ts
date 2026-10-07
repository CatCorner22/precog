import type { ScenarioTemplate } from "../types";

const SCENARIO_TRIGGER =
  /\b(?:scenarios?|walk me through|compare|step by step|what happens (?:if|when)|how (?:would|could|does|do)\b.*\b(?:unfold|happen|play out)\b|what would happen)\b/i;
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
  "leave",
  "quit",
  "away",
  "absent",
  "sick",
  "out",
]);

/** Owner words for a scenario that its title and id do not contain. */
const SCENARIO_SYNONYMS: Readonly<Record<string, readonly string[]>> = {
  "sc-cash-sod-failure": ["skim"],
};

function stem(word: string): string {
  const suffix = word.endsWith("ing") ? 3 : word.endsWith("ed") ? 2 : 0;
  if (suffix > 0) {
    return word.slice(0, -suffix).replace(/([bcdghjkmnpqrtvwxy])\1$/i, "$1");
  }
  if (/(?:ss|x|z|ch|sh)es$/.test(word)) return word.slice(0, -2);
  if (word.endsWith("s")) return word.slice(0, -1);
  return word;
}

function wordTokens(value: string): { word: string; position: number }[] {
  const tokens: { word: string; position: number }[] = [];
  for (const match of value.matchAll(/[a-z0-9]+(?:-[a-z0-9]+)*/gi)) {
    const position = match.index ?? 0;
    const raw = match[0].toLowerCase();
    const candidates = raw.includes("-") ? [...raw.split("-"), raw.replace(/-/g, "")] : [raw];
    for (const candidate of candidates) {
      const word = stem(candidate);
      if (word.length > 0 && !SCENARIO_STOP_WORDS.has(word)) tokens.push({ word, position });
    }
  }
  return tokens;
}

function words(value: string): string[] {
  return wordTokens(value).map(({ word }) => word);
}

function scenarioKeywords(scenario: ScenarioTemplate): Set<string> {
  const slug = scenario.id.replace(/^sc-/, "").split("-");
  const keywords = new Set([...slug.flatMap(words), ...words(scenario.title)]);
  for (const keyword of SCENARIO_SYNONYMS[scenario.id] ?? []) keywords.add(keyword);
  return keywords;
}

/** Whether a piece of text (a move, say) shares a keyword with the scenario. */
export function mentionsScenario(text: string, scenario: ScenarioTemplate): boolean {
  const keywords = scenarioKeywords(scenario);
  return words(text).some((word) => keywords.has(word));
}

/** Return the strongest scenario matches for a question that asks for one. */
export function matchScenarios(
  question: string,
  scenarios: readonly ScenarioTemplate[],
): ScenarioTemplate[] {
  if (!SCENARIO_TRIGGER.test(question)) return [];

  const questionTokens = wordTokens(question);
  const questionWords = new Set(questionTokens.map(({ word }) => word));
  const keywordFrequency = new Map<string, number>();
  for (const scenario of scenarios) {
    for (const keyword of scenarioKeywords(scenario)) {
      keywordFrequency.set(keyword, (keywordFrequency.get(keyword) ?? 0) + 1);
    }
  }
  const scored = scenarios
    .map((scenario, index) => {
      const keywords = scenarioKeywords(scenario);
      const matched = [...keywords].filter((word) => questionWords.has(word));
      return {
        scenario,
        index,
        position: Math.min(
          ...questionTokens
            .filter((token) => keywords.has(token.word))
            .map((token) => token.position),
        ),
        score: matched.reduce((total, word) => total + 1 / (keywordFrequency.get(word) ?? 1), 0),
      };
    })
    .filter((match) => match.score > 0)
    .sort((a, b) => b.score - a.score || a.position - b.position || a.index - b.index);

  const pairRequested = /\bcompare\b|\s+vs\b/i.test(question);
  const selected = scored.slice(0, pairRequested ? 2 : 1);
  if (pairRequested) {
    selected.sort((a, b) => a.position - b.position || a.index - b.index);
  }
  return selected.map((match) => match.scenario);
}
