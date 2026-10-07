import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Home } from "lucide-react";
import { buttonClass } from "./button-variants";
import { MetricCard, MoreTabsMenu, TabStrip } from "@/components/precog/home-shell-parts";

// A touch screen gets controls at least 44px (Tailwind's 11) each way. The
// `pointer-coarse:` variant applies only there, so a mouse layout keeps its
// sizes.
const TOUCH_MIN = ["pointer-coarse:min-h-11", "pointer-coarse:min-w-11"];

function classesOf(html: string, tag: string, marker = ""): string[] {
  const re = new RegExp(
    `<${tag}[^>]*${marker}[^>]*class="([^"]*)"|<${tag}[^>]*class="([^"]*)"[^>]*${marker}`,
  );
  const m = html.match(re);
  return (m?.[1] ?? m?.[2] ?? "").replaceAll("&amp;", "&").split(" ");
}

describe("tap targets on a touch screen", () => {
  it("gives the small and icon button sizes a 44px minimum", () => {
    for (const size of ["sm", "icon"] as const) {
      const classes = buttonClass({ size }).split(" ");
      for (const c of TOUCH_MIN) expect(classes, size).toContain(c);
    }
  });

  it("leaves the default button size and mouse sizes as they were", () => {
    expect(buttonClass().split(" ")).toContain("h-10");
    expect(buttonClass({ size: "sm" }).split(" ")).toContain("h-8");
  });

  it("makes every tab in the strip at least 44px tall", () => {
    const html = renderToStaticMarkup(
      <TabStrip activeId="map" tabCount={1}>
        <button type="button" role="tab">
          Map
        </button>
      </TabStrip>,
    );
    expect(classesOf(html, "nav")).toContain("pointer-coarse:[&_[role=tab]]:min-h-11");
  });

  it("makes the Analyze trigger at least 44px tall", () => {
    const html = renderToStaticMarkup(
      <MoreTabsMenu
        tabs={[{ id: "map", label: "Map", tactical: "Map", icon: Home }]}
        activeId="map"
        label={(t) => t.label}
        onPick={() => {}}
      />,
    );
    expect(classesOf(html, "button", "data-more-tabs")).toContain("pointer-coarse:min-h-11");
  });

  it("makes a tappable metric card at least 44px tall", () => {
    const html = renderToStaticMarkup(
      <MetricCard label="Critical" value="2" hint="Open" tone="danger" onClick={() => {}} />,
    );
    expect(classesOf(html, "div", 'role="button"')).toContain("pointer-coarse:min-h-11");
  });
});
