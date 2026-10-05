import type { ComponentType } from "react";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({
  user: null as null | { id: string },
  isPending: false,
}));
const status = vi.hoisted(() => ({ getOperatorStatus: vi.fn() }));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => ({ options }),
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));
vi.mock("@/lib/auth/use-current-user", () => ({
  useCurrentUserState: () => session,
}));
vi.mock("@/lib/precog/operator/server", () => ({
  getOperatorStatus: status.getOperatorStatus,
  findOperatorAccount: vi.fn(),
  runOperatorCount: vi.fn(),
  linkStripeCustomerForAccount: vi.fn(),
  liftDailyCapToday: vi.fn(),
}));

const { Route } = await import("./operator");
const ui = await import("@/components/precog/operator/operator-console");
const texts = await import("@/lib/precog/operator/texts");

type RouteLike = {
  options: {
    component: ComponentType;
    head: () => { meta: Array<{ title?: string; name?: string; content?: string }> };
  };
};
const route = Route as unknown as RouteLike;
const flat = (text: string) => text.replace(/\s+/g, " ");
const pageSource = flat(readFileSync(new URL("./operator.tsx", import.meta.url), "utf8"));
const rootSource = flat(readFileSync(new URL("./__root.tsx", import.meta.url), "utf8"));

describe("the operator page", () => {
  it("keeps the root's title for anyone else, titles the tab only for the operator, and stays out of search engines", () => {
    const meta = route.options.head().meta;
    // Any unknown address keeps the root's title; so does this page's head
    // (decision 22). The console sets the operator's title once it shows.
    expect(meta.some((m) => "title" in m)).toBe(false);
    expect(meta).toContainEqual({ name: "robots", content: "noindex, nofollow" });
    expect(texts.OPERATOR_TITLE).toBe("Operator · Precog");
    const consoleSource = flat(
      readFileSync(
        new URL("../components/precog/operator/operator-console.tsx", import.meta.url),
        "utf8",
      ),
    );
    expect(consoleSource).toContain("document.title = OPERATOR_TITLE;");
    expect(consoleSource).toContain(
      "if (document.title === OPERATOR_TITLE) document.title = before;",
    );
  });

  it("prints the not-found text of any unknown address to a signed-out visitor, with no call", () => {
    session.user = null;
    const Page = route.options.component;
    const html = renderToStaticMarkup(<Page />);
    expect(html).toContain("Page not found");
    expect(html).toContain("There is no page at this address");
    expect(html).toContain(
      "Check the link for a typo, or go back to your business. Nothing you saved has changed.",
    );
    expect(html).not.toContain("Find an account");
    expect(status.getOperatorStatus).not.toHaveBeenCalled();
  });

  it("uses the root's own not-found words", () => {
    for (const text of [texts.NOT_FOUND_EYEBROW, texts.NOT_FOUND_HEADING, texts.NOT_FOUND_BODY]) {
      expect(rootSource).toContain(text);
    }
    expect(rootSource).toContain("Go to Start here");
    expect(rootSource).toContain("Open the report");
  });

  it("shows the console only after the status answers for this account, and swallows a refusal", () => {
    session.user = { id: "op" };
    const Page = route.options.component;
    // The first render, before the status call answers, is the not-found text.
    expect(renderToStaticMarkup(<Page />)).toContain("There is no page at this address");
    expect(pageSource).toContain("void getOperatorStatus()");
    // The page records the account it shows before asking, as the business
    // workspace does on its pages; without it every signed-in call on a
    // direct load answers 409 "The signed-in account changed".
    expect(pageSource).toContain(
      "setDisplayedAccount(userId); let cancel = false; void getOperatorStatus()",
    );
    expect(pageSource).toContain(".catch(() => null)");
    expect(pageSource).toContain("[userId]");
    expect(pageSource).toContain(
      "userId !== null && operatorFor === userId ? <OperatorConsole /> : <OperatorNotFound />",
    );
  });

  it("imports nothing from the business engine", () => {
    const consoleSource = readFileSync(
      new URL("../components/precog/operator/operator-console.tsx", import.meta.url),
      "utf8",
    );
    for (const source of [pageSource, consoleSource]) {
      expect(source).not.toContain("practice-context");
      expect(source).not.toContain("@/lib/precog/engine");
    }
  });
});

describe("the operator console", () => {
  it("prints its headings, fields and buttons", () => {
    const html = renderToStaticMarkup(<ui.OperatorConsole />);
    expect(html).toContain(">Operator</h1>");
    expect(html).toContain("Find an account");
    expect(html).toContain("Email address");
    expect(html).toContain(">Find</button>");
    expect(html).toContain("Standing counts");
    for (const c of texts.OPERATOR_COUNTS) expect(html).toContain(c.label);
  });

  it("names the miss, the link form and the cap lift", () => {
    expect(texts.NO_ACCOUNT).toBe("No account uses that address.");
    const form = renderToStaticMarkup(<ui.LinkCustomerForm />);
    expect(form).toContain("Link a Stripe customer");
    expect(form).toContain("Stripe customer id (cus_…)");
    expect(form).toContain(
      "Replace the customer this account has (also links a customer with no running subscription)",
    );
    expect(form).toContain(">Link</button>");
    const details = renderToStaticMarkup(
      <ui.AccountDetails
        account={{
          userId: "fo",
          name: "Fay Owner",
          email: "fay@firm.test",
          emailVerified: true,
          providers: ["grok-google"],
          createdAt: "2026-09-01",
          firm: { firmUserId: "fo", name: "North", role: "owner" },
          businesses: { live: 2, deleted: 0 },
          stripeCustomerId: null,
          subscriptionLabel: "None",
          planLabel: "Free",
          lastDigest: null,
          suppression: null,
          quickBooksFailure: null,
          modelCalls: { today: 3, limit: 100 },
          milestones: [],
        }}
      />,
    );
    expect(details).toContain("Fay Owner</h3>");
    expect(details).toContain("Plan: Free");
    expect(details).toContain("Firm: North (owner)");
    expect(details).toContain("Model calls today: 3 of 100");
    expect(details).toContain("Lift today&#x27;s cap");
  });

  it("starts the link form empty for each account found, clears it after a link and shows the account as the link left it", () => {
    const consoleSource = flat(
      readFileSync(
        new URL("../components/precog/operator/operator-console.tsx", import.meta.url),
        "utf8",
      ),
    );
    // Keyed on the account: a customer id or a Replace tick typed for one
    // account never stays armed on the next.
    expect(consoleSource).toContain("<LinkCustomerForm key={found.account.userId}");
    expect(consoleSource).toContain('if (!linked) return; setCustomerId(""); setReplace(false);');
    // The card is replaced by the account the link answers, Subscription line included.
    expect(consoleSource).toContain('setFound({ kind: "found", account: res.account });');
  });

  it("prints a one-cell count as a figure, a table otherwise, and an empty one as nothing to list", () => {
    const figure = renderToStaticMarkup(
      <ui.CountResultView
        result={{ name: "past-due", label: "Firm plans past due", columns: ["n"], rows: [[3]] }}
      />,
    );
    expect(figure).toContain(">3</p>");
    const table = renderToStaticMarkup(
      <ui.CountResultView
        result={{
          name: "hand-marked",
          label: "Firms marked monthly by hand with no billing row",
          columns: ["user_id", "name"],
          rows: [["hm", "Hand"]],
        }}
      />,
    );
    expect(table).toContain('<th scope="col"');
    expect(table).toContain(">Hand</td>");
    const empty = renderToStaticMarkup(
      <ui.CountResultView result={{ name: "hand-marked", label: "x", columns: [], rows: [] }} />,
    );
    expect(empty).toContain("Nothing to list.");
  });
});
