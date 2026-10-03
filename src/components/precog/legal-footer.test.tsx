import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { LegalFooter } from "./legal-footer";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
}));

describe("legal footer", () => {
  it("links Privacy, Terms, the support mailbox and Pricing, in that order", () => {
    const html = renderToStaticMarkup(<LegalFooter />);
    expect(html).toContain('aria-label="Legal"');
    expect(html).toContain('href="mailto:[SUPPORT EMAIL]"');
    expect(html).toContain('href="/pricing"');
    const privacy = html.indexOf(">Privacy<");
    const terms = html.indexOf(">Terms<");
    const support = html.indexOf(">Support<");
    const pricing = html.indexOf(">Pricing<");
    expect(privacy).toBeGreaterThan(-1);
    expect(terms).toBeGreaterThan(privacy);
    expect(support).toBeGreaterThan(terms);
    expect(pricing).toBeGreaterThan(support);
    expect(html).toContain('href="/firm"');
  });

  it("drops the firm link on the firm workspace and keeps Support", () => {
    const html = renderToStaticMarkup(<LegalFooter hideFirmLink />);
    expect(html).not.toContain('href="/firm"');
    expect(html).toContain(">Support<");
  });
});
