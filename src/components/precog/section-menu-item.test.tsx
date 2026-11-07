import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TAB_WORDS } from "@/lib/precog/navigation";
import { SectionMenuItem } from "./home-shell-parts";

describe("section directory entries", () => {
  const render = (active: boolean) =>
    renderToStaticMarkup(
      <SectionMenuItem
        tab={{
          ...TAB_WORDS.find((t) => t.id === "knowledge")!,
          icon: () => null,
        }}
        label="Who knows what"
        active={active}
        descriptionId="knowledge-purpose"
        onPick={() => {}}
      />,
    );

  it("preserves the destination name and describes the job separately", () => {
    const html = render(false);
    expect(html).toContain('role="menuitem"');
    expect(html).toContain('data-tab-id="knowledge"');
    expect(html).toContain('aria-label="Who knows what"');
    expect(html).toContain('aria-describedby="knowledge-purpose"');
    expect(html).toContain('id="knowledge-purpose"');
    expect(html).toContain("Keep work moving when someone is away.");
  });

  it("marks the current section with accessible state and a visible check", () => {
    const html = render(true);
    expect(html).toContain('aria-current="page"');
    expect(html).toContain("lucide-check");
    expect(render(false)).not.toContain('aria-current="page"');
    expect(render(false)).not.toContain("lucide-check");
  });

  it("gives each entry a 44px minimum target and room for purpose text", () => {
    const html = render(false);
    const classes = html.match(/<button[^>]*class="([^"]*)"/)?.[1].split(" ");
    expect(classes).toContain("min-h-11");
    expect(html).toContain("whitespace-normal");
  });

  it("covers all 10 destinations with unique names and short purposes", () => {
    expect(TAB_WORDS).toHaveLength(10);
    expect(new Set(TAB_WORDS.map((t) => t.id)).size).toBe(10);
    for (const tab of TAB_WORDS) {
      expect(tab.description.length).toBeGreaterThan(10);
      expect(tab.description.length).toBeLessThan(90);
    }
  });
});
