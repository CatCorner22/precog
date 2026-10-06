import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { defaultProfile } from "@/lib/precog/practice-profile";
import { ReadOnlyPracticeProvider } from "@/lib/precog/read-only-practice";
import { ILLUSTRATIVE_LABEL } from "@/lib/precog/scoring/scenario-level";
import { ResidualRadar } from "./residual-radar";

function radarText(industry: "dental" | "construction"): string {
  return renderToStaticMarkup(
    <ReadOnlyPracticeProvider profile={defaultProfile(industry)}>
      <ResidualRadar onNavigate={() => {}} />
    </ReadOnlyPracticeProvider>,
  ).replaceAll("<!-- -->", "");
}

describe("the selected risk's scenario dollars", () => {
  it("prints the illustrative loss as a rounded estimate, never to the dollar", () => {
    expect(radarText("dental")).toContain(
      `${ILLUSTRATIVE_LABEL}: a loss of about $77,000 and about 178 days until found.`,
    );
    expect(radarText("construction")).toContain(
      `${ILLUSTRATIVE_LABEL}: a loss of about $67,000 and about 155 days until found.`,
    );
    expect(radarText("dental")).not.toContain("$77,411");
  });
});
