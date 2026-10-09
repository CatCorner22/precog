import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { resolveTemplate } from "@/lib/precog/active-template";
import { defaultProfile } from "@/lib/precog/practice-profile";
import { ILLUSTRATIVE_LABEL } from "@/lib/precog/scoring/scenario-level";
import { buildStartHereModel } from "@/lib/precog/start-here/model";
import { StartHereCostSection } from "./start-here-cost-section";

function costHtml(industry: Parameters<typeof defaultProfile>[0]) {
  const profile = defaultProfile(industry);
  const template = resolveTemplate(profile);
  const model = buildStartHereModel({ profile, template, today: new Date(2026, 8, 26) });
  return renderToStaticMarkup(<StartHereCostSection model={model.cost} />);
}

/** The text of the first paragraph after the section heading. */
function firstParagraph(html: string): string {
  const afterHeading = html.slice(html.indexOf("</h2>"));
  const match = /<p[^>]*>([\s\S]*?)<\/p>/.exec(afterHeading.slice(afterHeading.indexOf("</div>")));
  return (match?.[1] ?? "").replace(/<[^>]+>/g, "");
}

describe("StartHereCostSection", () => {
  it("names each kind of dollar figure, its source, and the study scope", () => {
    const sentence = firstParagraph(costHtml("dental"));
    expect(sentence).toContain("Precog shows three kinds of dollar figures.");
    expect(sentence).toContain("real prosecuted cases with the gaps above.");
    expect(sentence).toContain(
      "The fraud study’s median is the typical loss once a fraud is found for organizations under 100 employees ($126,000).",
    );
    expect(sentence).toContain("Example scenarios under What could happen carry");
    expect(sentence).toContain(ILLUSTRATIVE_LABEL.toLowerCase());
    expect(sentence).toContain("Use them to compare fixes.");
    expect(sentence).not.toMatch(/\bshould\b|\be\.g\.|\bthe app\b/i);
  });
});
