import type { ComponentType, ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  ASSESSMENT_INCLUDES,
  BILLING_TERMS_SENTENCE,
  FIRM_CLIENT_RULE,
  FIRM_INCLUDES,
  FREE_INCLUDES,
} from "@/lib/precog/firm/plan-contents";
import type { CheckoutPlan, PlanPrice } from "@/lib/precog/firm/pricing";

// The page renders outside a router and outside the auth provider: Link is a
// plain anchor, createFileRoute hands back its options with the loader's
// answer, and both sign-in gates render their children so each button shows.
type Prices = { configured: boolean; prices: Record<CheckoutPlan, PlanPrice> | null } | null;
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
    head: () => { meta: Array<{ title?: string; name?: string; content?: string }> };
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
    expect(html).toContain("$299 a month");
  });

  it("prints Stripe's own amounts with Stripe", () => {
    const html = render({
      configured: true,
      prices: {
        assessment: { amount: 1250, currency: "usd", interval: null },
        monthly: { amount: 349, currency: "usd", interval: "month" },
      },
    });
    expect(html).toContain("$1,250");
    expect(html).toContain("$349 a month");
    expect(html).not.toContain("$1,000");
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
