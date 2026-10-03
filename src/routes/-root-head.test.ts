import { afterEach, describe, expect, it, vi } from "vitest";
import { Route } from "./__root";

// The leading "-" keeps this file out of the generated route tree.

type Meta = { title?: string; name?: string; property?: string; content?: string };
type Head = (ctx: { matches: Array<{ pathname: string }> }) => {
  meta: Meta[];
  links: Array<{ rel: string; href: string }>;
};

// The root head sees every match of the page, the root first and the page last.
const matchesFor = (path: string) => ({ matches: [{ pathname: "/" }, { pathname: path }] });

const head = (Route.options.head as unknown as Head)(matchesFor("/"));
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

describe("the share preview tags with the production host set", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  async function headWithHost(path: string) {
    vi.stubEnv("VITE_PUBLIC_HOSTNAME", "precog.example");
    vi.resetModules();
    const { Route: HostedRoute } = await import("./__root");
    return (HostedRoute.options.head as unknown as Head)(matchesFor(path));
  }

  it("name the page's own address, so /pricing is not a duplicate of the home page", async () => {
    const hosted = await headWithHost("/pricing");
    expect(hosted.meta.find((m) => m.property === "og:url")?.content).toBe(
      "https://precog.example/pricing",
    );
    expect(hosted.links.find((l) => l.rel === "canonical")?.href).toBe(
      "https://precog.example/pricing",
    );
  });

  it("name the home page itself at the root address, with both share pictures", async () => {
    const hosted = await headWithHost("/");
    expect(hosted.meta.find((m) => m.property === "og:url")?.content).toBe(
      "https://precog.example/",
    );
    expect(hosted.links.find((l) => l.rel === "canonical")?.href).toBe("https://precog.example/");
    const images = hosted.meta.filter((m) => m.property === "og:image").map((m) => m.content);
    expect(images).toHaveLength(2);
    expect(images[0]).toContain("https://og.grok.me/v1/card.png?host=precog.example");
    expect(images[1]).toBe("https://precog.example/og.svg");
  });
});
