import type { ComponentType, ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  ASSESSMENT_INCLUDES,
  BILLING_TERMS_SENTENCE,
  FIRM_CLIENT_RULE,
  FIRM_INCLUDES,
  FREE_INCLUDES,
  TIER_TABLE_NOTE,
} from "@/lib/precog/firm/plan-contents";
import type { PlanPrices } from "@/lib/precog/firm/pricing";

// The page renders outside a router and outside the auth provider: Link is a
// plain anchor, createFileRoute hands back its options with the loader's
// answer, and both sign-in gates render their children so each button shows.
type Prices = { configured: boolean; prices: PlanPrices | null } | null;
let loaded: Prices = null;

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => ({ options, useLoaderData: () => loaded }),
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
}));
vi.mock("@/lib/auth/gates", () => ({
  SignedIn: ({ children }: { children: ReactNode }) => <>{children}</>,
  SignedOut: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock("@/lib/precog/billing/server", () => ({ getPlanPrices: vi.fn() }));

import { Route } from "./pricing";

type RouteLike = {
  options: {
    component: ComponentType;
    head: () => {
      meta: Array<{ title?: string; name?: string; property?: string; content?: string }>;
    };
  };
};

function render(prices: Prices): string {
  loaded = prices;
  const Page = (Route as unknown as RouteLike).options.component;
  return renderToStaticMarkup(<Page />);
}

function headings(html: string): string[] {
  return [...html.matchAll(/<h2[^>]*>([^<]*)<\/h2>/g)].map((m) => m[1]);
}

describe("the pricing page", () => {
  const head = (Route as unknown as RouteLike).options.head().meta;

  it("is titled for Precog and describes itself", () => {
    expect(head.find((m) => m.title)?.title).toBe("Pricing · Precog");
    expect(head.find((m) => m.name === "description")?.content).toBe(
      "What Precog costs: free for one business, an Assessment for one client, the Firm plan for several.",
    );
  });

  it("unfurls as the pricing page, not as the home page", () => {
    // Meta is deduplicated by property with the deepest route winning, so
    // these replace the root's og:title and og:description on /pricing.
    expect(head.find((m) => m.property === "og:title")?.content).toBe("Pricing · Precog");
    expect(head.find((m) => m.property === "og:description")?.content).toBe(
      head.find((m) => m.name === "description")?.content,
    );
  });

  it("prints the eyebrow, the heading, the lead and the three plans", () => {
    const html = render(null);
    expect(html).toContain(">Precog</p>");
    expect(html).toContain("<h1");
    expect(html).toContain(">Pricing</h1>");
    expect(html).toContain("Precog is free for one business. A firm pays to run several.");
    expect(headings(html)).toEqual(["Free", "Assessment", "Firm plan"]);
  });

  it("says what each plan includes, from the shared lists", () => {
    const html = render(null);
    expect(html.match(/>Includes</g)).toHaveLength(3);
    for (const item of [...FREE_INCLUDES, ...ASSESSMENT_INCLUDES, ...FIRM_INCLUDES]) {
      expect(html).toContain(`<li>${item.replace(/'/g, "&#x27;")}</li>`);
    }
    expect(html).toContain(FIRM_CLIENT_RULE);
    expect(html).toContain(BILLING_TERMS_SENTENCE);
    expect(html).not.toMatch(/unlocks/i);
  });

  it("prints the offer's figures without Stripe", () => {
    const html = render({ configured: false, prices: null });
    expect(html).toContain("$1,000");
    expect(html).toContain("from $299 a month");
  });

  const tierRows = (html: string) =>
    [
      ...html.matchAll(
        /<tr[^>]*><th scope="row"[^>]*>([^<]*)<\/th>((?:<td[^>]*>[^<]*<\/td>)*)<\/tr>/g,
      ),
    ].map((m) => [m[1], ...[...m[2].matchAll(/<td[^>]*>([^<]*)<\/td>/g)].map((c) => c[1])]);

  it("prints the Firm plan's tier table under its card, with the rule and the yearly note", () => {
    const html = render({ configured: false, prices: null });
    expect(html).toContain("Firm plan tiers</caption>");
    for (const header of ["Tier", "Client businesses", "Monthly", "Yearly"]) {
      expect(html).toContain(`>${header}</th>`);
    }
    // Without Stripe the offer prices Starter only; the other tiers wait for the owner's figures.
    expect(tierRows(html)).toEqual([
      ["Starter", "1–5", "$299 a month", "$2,990 a year"],
      ["Practice", "6–20", "Write to Support", "Write to Support"],
      ["Firm", "21–50", "Write to Support", "Write to Support"],
    ]);
    expect(html).toContain(TIER_TABLE_NOTE.replace(/'/g, "&#x27;"));
    expect(html).toContain("Yearly is ten months&#x27; price.");
    expect(html).toContain(FIRM_CLIENT_RULE);
    expect(headings(html)).toEqual(["Free", "Assessment", "Firm plan"]);
  });

  it("prints Stripe's own amounts with Stripe", () => {
    const html = render({
      configured: true,
      prices: {
        assessment: { amount: 1250, currency: "usd", interval: null },
        monthly: { amount: 349, currency: "usd", interval: "month" },
        tiers: {
          1: {
            month: { amount: 349, currency: "usd", interval: "month" },
            year: { amount: 3490, currency: "usd", interval: "year" },
          },
          2: { month: { amount: 699, currency: "usd", interval: "month" }, year: null },
          3: { month: null, year: null },
        },
      },
    });
    expect(html).toContain("$1,250");
    expect(html).toContain("from $349 a month");
    expect(html).not.toContain("$1,000");
    expect(tierRows(html)).toEqual([
      ["Starter", "1–5", "$349 a month", "$3,490 a year"],
      ["Practice", "6–20", "$699 a month", "Write to Support"],
      ["Firm", "21–50", "Write to Support", "Write to Support"],
    ]);
  });

  it("prints no figure while the price is unknown", () => {
    for (const html of [render(null), render({ configured: true, prices: null })]) {
      expect(html).not.toContain("$");
      expect(headings(html)).toEqual(["Free", "Assessment", "Firm plan"]);
    }
  });

  it("offers sign-in to a visitor and the Firm page to an account, with the footer", () => {
    const html = render(null);
    expect(html).toContain('href="/login"');
    expect(html).toContain("Sign in to start");
    expect(html).toContain('href="/firm"');
    expect(html).toContain("Open the Firm page");
    expect(html).toContain('aria-label="Legal"');
  });
});
