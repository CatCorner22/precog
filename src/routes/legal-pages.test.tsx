import type { ComponentType, ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { Route as Terms } from "./terms";
import { Route as Privacy } from "./privacy";

// The pages are rendered outside a router: Link becomes a plain anchor and
// createFileRoute hands back its options, so the component and `head` are
// reachable.
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => ({ options }),
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
}));

type RouteLike = {
  options: { component: ComponentType; head: () => { meta: Array<{ title?: string }> } };
};

function render(route: unknown): { html: string; title: string | undefined } {
  const { options } = route as RouteLike;
  const Page = options.component;
  return {
    html: renderToStaticMarkup(<Page />),
    title: options.head().meta.find((m) => m.title)?.title,
  };
}

function headings(html: string): string[] {
  return [...html.matchAll(/<h2[^>]*>([^<]*)<\/h2>/g)].map((m) => m[1]);
}

const PLACEHOLDERS = [
  "[OPERATOR LEGAL NAME]",
  "[OPERATOR ADDRESS]",
  "[STATE]",
  "[SUPPORT EMAIL]",
  "[AUTH BROKER OPERATOR]",
  "[XAI API DATA POLICY URL]",
];

describe("Terms", () => {
  const { html, title } = render(Terms);

  it("is titled for Precog with the Precog eyebrow", () => {
    expect(title).toBe("Terms · Precog");
    expect(html).toContain(">Precog</p>");
    expect(html).not.toContain("Precog Pioneer");
    expect(html).not.toMatch(/draft/i);
  });

  it("has every section, in order", () => {
    expect(headings(html)).toEqual([
      "Operator",
      "What Precog is and is not",
      "Your account",
      "The firm and its clients",
      "Acceptable use and prohibited data",
      "Billing",
      "The printed report",
      "Case library",
      "No warranty",
      "Limitation of liability",
      "Indemnity",
      "Termination",
      "Governing law",
      "Changes to these terms",
    ]);
  });

  it("prints the operator placeholders until the owner enters the real values", () => {
    for (const placeholder of ["[OPERATOR LEGAL NAME]", "[OPERATOR ADDRESS]", "[STATE]"])
      expect(html).toContain(placeholder);
    expect(html).toContain("Precog is operated by [OPERATOR LEGAL NAME], [OPERATOR ADDRESS].");
    expect(html).toContain("Write to [SUPPORT EMAIL] about these terms.");
    expect(html).toContain("These terms are governed by the law of [STATE], and its courts");
  });

  it("says the plan renews each month and keeps the six original paragraphs", () => {
    expect(html).toContain("The Firm plan renews each month until you cancel it.");
    expect(html).not.toMatch(/yearly|each year/);
    expect(html).toContain("a started month is not refunded");
    expect(html).toContain("not refunded once a report version is locked");
    expect(html).toContain("An email-and-password sign-up that is not confirmed within 24 hours");
    expect(html).toContain("A standard data processing agreement is available on request from");
    expect(html).toContain("Precog is not a HIPAA business associate");
    expect(html).toContain("reviewed for issuance by the firm that prepared it");
    expect(html).toContain("A case names the defendant as the record names them.");
    expect(html).toContain("Precog helps an owner or advisor describe who holds which duties");
    expect(html).toContain("a month with no recorded loss is not evidence that any control");
  });
});

describe("Privacy", () => {
  const { html, title } = render(Privacy);

  it("is titled for Precog with the Precog eyebrow", () => {
    expect(title).toBe("Privacy · Precog");
    expect(html).toContain(">Precog</p>");
    expect(html).not.toContain("Precog Pioneer");
  });

  it("has every section, in order", () => {
    expect(headings(html)).toEqual([
      "What stays in this browser",
      "What Precog syncs when you sign in",
      "Who processes your data",
      "How long Precog keeps it",
      "Firm members",
      "Control evidence log",
      "What Precog sends to the model",
      "Export and deletion",
    ]);
  });

  it("prints the placeholders and the xAI policy as text, not a link, while it is one", () => {
    for (const placeholder of ["[SUPPORT EMAIL]", "[AUTH BROKER OPERATOR]"])
      expect(html).toContain(placeholder);
    expect(html).toContain("xAI&#x27;s own policy for API data is at [XAI API DATA POLICY URL].");
    expect(html).not.toContain('href="[XAI API DATA POLICY URL]"');
    expect(html).toContain("auth broker, operated by [AUTH BROKER OPERATOR]");
  });

  it("states the model cap, the processors and what deletion refuses", () => {
    expect(html).toContain("150 unless this deployment sets another limit");
    expect(html).toContain("Precog does not use what you enter to train a model");
    expect(html).toContain("Sentry or the error relay Precog&#x27;s operator sets");
    expect(html).toContain("A security summary with this list is available from [SUPPORT EMAIL].");
    expect(html).toContain("Precog refuses to delete an account while its Firm plan is active");
    expect(html).toContain("Deleting your account deletes the Stripe customer record.");
    expect(html).toContain(
      "Precog sends it only after you say yes, once, when you sign in; turn it off any time from Weekly digest in the header",
    );
    expect(html).toContain(
      "Data requests, including from a person named in a business who has no account, go to",
    );
  });

  it("lists the retention periods from the constants the code enforces", () => {
    expect(html).toContain("An unconfirmed email-and-password sign-up");
    expect(html).toContain("30 days, then purged");
    expect(html).toContain("90 days and at most 200 versions");
    expect(html).toContain("kept until the business is purged or the account is deleted");
    expect(html).toContain('<td class="py-1.5">90 days</td>');
    expect(html).toContain('<td class="py-1.5">30 days</td>');
    expect(html).toContain('<td class="py-1.5">35 days</td>');
    expect(html).toContain('<td class="py-1.5">24 hours</td>');
    expect(html).toContain("the last twelve, deleted on disconnect");
  });
});

describe("both pages", () => {
  it("know every placeholder the operator must replace", () => {
    const all = render(Terms).html + render(Privacy).html;
    for (const placeholder of PLACEHOLDERS) expect(all).toContain(placeholder);
  });
});
