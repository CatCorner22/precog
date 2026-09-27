import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { resolveTemplate } from "@/lib/precog/active-template";
import { INDUSTRIES } from "@/lib/precog/industry";
import { defaultProfile } from "@/lib/precog/practice-profile";
import { INDEX_BASIS } from "@/lib/precog/scoring/bands";
import { buildStartHereModel } from "@/lib/precog/start-here/model";
import { StartHereContinuitySection } from "./start-here-continuity-section";
import { StartHereCostSection } from "./start-here-cost-section";
import { StartHereExposureSection } from "./start-here-exposure-section";
import { StartHereFirstStepsSection } from "./start-here-first-steps-section";
import { EvidenceFooter } from "./start-here-parts";

/** Words the owner asked to keep off customer screens, as whole words. */
const JARGON = [
  /\bSoD\b/,
  /\bentitlements?\b/i,
  /\bresidual\b/i,
  /\binherent\b/i,
  /\bCOSO\b/,
  /\bSPOFs?\b/,
  /\bCoR\b/,
  /\bAO:/,
  /WHITE HOT/,
  /demo priors/i,
  /\(s\)/,
];

function render(industry: (typeof INDUSTRIES)[number]["id"]) {
  const profile = defaultProfile(industry);
  const template = resolveTemplate(profile);
  const model = buildStartHereModel({ profile, template, today: new Date(2026, 8, 26) });
  const open = () => {};
  return {
    continuity: renderToStaticMarkup(
      <StartHereContinuitySection model={model.continuity} onOpenDetail={open} />,
    ),
    rest: renderToStaticMarkup(
      <>
        <StartHereExposureSection model={model.exposure} onOpenDetail={open} />
        <StartHereCostSection model={model.cost} />
        <StartHereFirstStepsSection model={model.firstSteps} />
        <EvidenceFooter model={model.footer} />
      </>,
    ),
  };
}

describe("Start here copy", () => {
  it.each(INDUSTRIES.map((i) => i.id))("%s sample: no jargon on the page", (industry) => {
    const { continuity, rest } = render(industry);
    for (const word of JARGON) {
      expect(continuity).not.toMatch(word);
      expect(rest).not.toMatch(word);
    }
  });

  it.each(INDUSTRIES.map((i) => i.id))(
    "%s sample: the continuity percentages say they are the app's indices",
    (industry) => {
      const { continuity } = render(industry);
      expect(continuity).toContain(INDEX_BASIS.replaceAll("'", "&#x27;"));
    },
  );
});
