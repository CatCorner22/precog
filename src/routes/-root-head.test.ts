import { describe, expect, it } from "vitest";
import { Route } from "./__root";

// The leading "-" keeps this file out of the generated route tree.

type Meta = { title?: string; name?: string; property?: string; content?: string };
type Head = () => { meta: Meta[]; links: Array<{ rel: string; href: string }> };

const head = (Route.options.head as unknown as Head)();
const byProperty = (property: string) => head.meta.filter((m) => m.property === property);
const byName = (name: string) => head.meta.find((m) => m.name === name);

describe("the share preview tags on every page", () => {
  it("repeat the title and description for a link unfurl, as a large card", () => {
    const title = head.meta.find((m) => m.title)?.title;
    expect(title).toBe("Precog — Small Business Risk");
    expect(byProperty("og:title")[0]?.content).toBe(title);
    expect(byProperty("og:description")[0]?.content).toBe(byName("description")?.content);
    expect(byName("description")?.content).toContain(
      "Precog shows a small-business owner who can move money alone",
    );
    expect(byName("twitter:card")?.content).toBe("summary_large_image");
  });

  it("carry no address or image until the production host is set", () => {
    // VITE_PUBLIC_HOSTNAME is unset in tests, CI and preview; the host-bound
    // tags (og:url, canonical, both og:image entries) appear only on deploy.
    expect(import.meta.env.VITE_PUBLIC_HOSTNAME).toBeUndefined();
    expect(byProperty("og:url")).toEqual([]);
    expect(byProperty("og:image")).toEqual([]);
    expect(head.links.find((l) => l.rel === "canonical")).toBeUndefined();
    expect(head.links.find((l) => l.rel === "stylesheet")).toBeDefined();
  });
});
