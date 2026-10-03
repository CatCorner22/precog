import { describe, expect, it, vi } from "vitest";
import { Route as OwnerEmail } from "./owner-email";

// The leading "-api-routes.test.ts" covers the confirm and stop paths against
// PGLite; this file pins the broken-link page's text, with the consent lookup
// stubbed so no database boots.

vi.mock("@/lib/db", () => ({ getSql: async () => ({}) }));
vi.mock("@/lib/precog/reminders/owner-consent", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/precog/reminders/owner-consent")>();
  return { ...actual, findOwnerConsent: async () => null };
});

type Handler = (ctx: { request: Request }) => Promise<Response> | Response;
function handlers(route: unknown): Record<string, Handler> {
  return (route as { options: { server: { handlers: Record<string, Handler> } } }).options.server
    .handlers;
}

const url = (token: string) => `https://app.example/api/owner-email?do=stop&token=${token}`;

describe("owner email broken link", () => {
  it("answers 404 for an unknown token and names the support mailbox", async () => {
    const res = await handlers(OwnerEmail).GET({ request: new Request(url("ef".repeat(24))) });
    expect(res.status).toBe(404);
    const html = await res.text();
    expect(html).toContain("This link no longer works");
    expect(html).toContain(
      "The address may have changed since Precog sent the email. Ask the advisor who set up the reminders.",
    );
    expect(html).toContain("If you still get this page, write to [SUPPORT EMAIL].");
  });

  it("answers the same page for a malformed token", async () => {
    const res = await handlers(OwnerEmail).GET({ request: new Request(url("nope")) });
    expect(res.status).toBe(404);
    expect(await res.text()).toContain("If you still get this page, write to [SUPPORT EMAIL].");
  });
});
