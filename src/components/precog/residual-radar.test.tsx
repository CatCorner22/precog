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

describe("the residual tiles and register", () => {
  it("name the bands Severe, High and Moderate, and never say Fix first", () => {
    const html = radarText("dental");
    expect(html).toMatch(/>Severe<[\s\S]*?Residual 80 or more/);
    expect(html).toMatch(/>High<[\s\S]*?Residual 60–79/);
    expect(html).toMatch(/>Moderate<[\s\S]*?Residual 40–59; \d+ more Low/);
    expect(html).not.toMatch(/Fix first|Fix soon|Worth doing/);
  });

  it("says in plain words how a row is scored and that scenario figures are examples", () => {
    const html = radarText("dental");
    expect(html).not.toContain("Inherent × (1 − control effectiveness)");
    expect(html).not.toContain("not sized to your business, and never set its rank");
    expect(html).toContain(
      "A scenario’s dollar and day figures are examples, not from your books, and never change its place in the list.",
    );
    expect(html).not.toContain("weight trials");
  });
});
