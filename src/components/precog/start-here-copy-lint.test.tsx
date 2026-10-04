import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
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
    firstSteps: renderToStaticMarkup(<StartHereFirstStepsSection model={model.firstSteps} />),
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

describe("Home, Do these first", () => {
  const source = readFileSync(
    fileURLToPath(new URL("./start-here-first-steps-section.tsx", import.meta.url)),
    "utf8",
  );

  it("points at the cases below, since the cost and the case list now follow it", () => {
    expect(source).not.toMatch(/\babove\b/);
    // Case titles quote court records ("paid herself above her salary"), so
    // the rendered check looks only at Precog's own pointers to the cases.
    for (const industry of INDUSTRIES.map((i) => i.id)) {
      const html = render(industry).firstSteps;
      expect(html).not.toMatch(/(cases?|real cases) above/);
      expect(html).toContain("real cases below");
    }
  });

  it("calls the duty matrix the duty assignments", () => {
    expect(source).not.toMatch(/duty map/i);
    expect(source).toContain("Books vs your duty assignments");
    expect(source).toContain(
      "Match payroll and access exports to your duty assignments under Team",
    );
    for (const industry of INDUSTRIES.map((i) => i.id)) {
      expect(render(industry).firstSteps).not.toMatch(/duty map/i);
    }
  });
});

describe("Home, continuity before anyone is marked", () => {
  it("shows one line and a button to mark who can do each", () => {
    const profile = defaultProfile("dental");
    const model = buildStartHereModel({
      profile,
      template: resolveTemplate(profile),
      today: new Date(2026, 8, 26),
    });
    const html = renderToStaticMarkup(
      <StartHereContinuitySection
        model={{ ...model.continuity, registerReady: false }}
        onOpenDetail={() => {}}
      />,
    );
    expect(html).toContain("Not assessed yet.");
    expect(html).toContain("Mark who can do each");
    expect(html).not.toContain("Written down");
  });

  it("names the documentation figure as the planner does", () => {
    const { continuity } = render("dental");
    expect(continuity).toContain("Written down");
    expect(continuity).not.toContain("Written and findable");
  });
});

describe("Start here's note on duties from job titles", () => {
  it("asks the owner to confirm them on the duty-conflict tab", () => {
    const profile = defaultProfile("general");
    const model = buildStartHereModel({
      profile,
      template: resolveTemplate(profile),
      today: new Date(2026, 8, 26),
    });
    const html = renderToStaticMarkup(
      <StartHereExposureSection
        model={{
          ...model.exposure,
          titleDuties: "2 of your 5 people carry the usual duties for their job titles.",
        }}
        onOpenDetail={() => {}}
      />,
    );
    expect(html).toContain("2 of your 5 people carry the usual duties for their job titles.");
    expect(html).toContain("Confirm them in Who controls what.");
    expect(html).not.toContain("Check them in");
  });
});
