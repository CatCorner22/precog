import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { resolveTemplate } from "@/lib/precog/active-template";
import { defaultProfile } from "@/lib/precog/practice-profile";
import { ReadOnlyPracticeProvider } from "@/lib/precog/read-only-practice";
import { KnowledgeMap } from "./knowledge-map";

describe("KnowledgeMap", () => {
  it("uses lowercase not marked yet in the SVG for an unmarked starter item", () => {
    const customPeople = [
      {
        id: "own-1",
        name: "Ana Ruiz",
        role: "Owner",
        active: true,
        entitlements: [],
      },
    ];
    const base = {
      ...defaultProfile("dental"),
      customPeople,
      customRelations: [],
    };
    const markedId = resolveTemplate(base).knowledge[0].id;
    const profile = {
      ...base,
      customRelations: [{ personId: "own-1", knowledgeId: markedId, level: "expert" as const }],
    };
    const unmarked = resolveTemplate(profile).knowledge.find((item) => item.id !== markedId)!;
    const html = renderToStaticMarkup(
      <ReadOnlyPracticeProvider profile={profile}>
        <KnowledgeMap initialKnowledgeId={unmarked.id} />
      </ReadOnlyPracticeProvider>,
    ).replace(/&amp;/g, "&");

    expect(html).toContain(`aria-label="${unmarked.name}, not marked yet"`);
    expect(html).toContain("not marked yet</text>");
  });
});
