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
  it("opens with one sentence naming each kind of dollar figure and where it comes from", () => {
    const sentence = firstParagraph(costHtml("dental"));
    expect(sentence).toMatch(/^Precog shows three kinds of dollar figure: /);
    expect(sentence).toContain("real cases like yours");
    expect(sentence).toContain(
      "the fraud study’s median for organizations under 100 employees ($126,000)",
    );
    expect(sentence).toContain("Precog’s example scenarios under What could happen");
    expect(sentence).toContain(ILLUSTRATIVE_LABEL.toLowerCase());
    // One sentence: a single full stop, at the end.
    expect(sentence.match(/\.(\s|$)/g)?.length).toBe(1);
    expect(sentence).not.toMatch(/\bshould\b|\be\.g\.|\bthe app\b/i);
  });
});
