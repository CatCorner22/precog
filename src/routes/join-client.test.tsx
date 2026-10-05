import type { ComponentType } from "react";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const params = vi.hoisted(() => ({ token: "not-a-real-token" }));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => ({ options, useParams: () => params }),
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
  useNavigate: () => vi.fn(),
}));
vi.mock("@/lib/auth/use-current-user", () => ({
  useCurrentUserState: () => ({ user: null, isPending: false }),
}));
vi.mock("@/lib/precog/firm/grant-server", () => ({
  acceptClientGrant: vi.fn(),
  peekClientGrant: vi.fn(),
}));

const { Route } = await import("./join/client/$token");
const texts = await import("@/lib/precog/firm/grant-texts");

type RouteLike = {
  options: {
    component: ComponentType;
    head: () => { meta: Array<{ title?: string; name?: string; content?: string }> };
  };
};
const route = Route as unknown as RouteLike;
const source = readFileSync(new URL("./join/client/$token.tsx", import.meta.url), "utf8").replace(
  /\s+/g,
  " ",
);

describe("the client invitation page", () => {
  it("is titled for a client invitation and kept out of search engines", () => {
    expect(texts.CLIENT_INVITE_TITLE).toBe("Client invitation · Precog");
    const meta = route.options.head().meta;
    expect(meta).toContainEqual({ title: "Client invitation · Precog" });
    expect(meta).toContainEqual({ name: "robots", content: "noindex, nofollow" });
  });

  it("says what the invitation asks and that the business stays its owner's", () => {
    expect(texts.clientInviteSentence("Rosa Ortiz", "Ortiz Dental")).toBe(
      "Rosa Ortiz invites your firm to work on Ortiz Dental in Precog. Accept to add it to your firm's client list; the business stays its owner's.",
    );
    expect(source).toContain("{clientInviteSentence(state.ownerName, state.businessName)}");
    // The heading is the business's name.
    expect(source).toContain("{state.businessName}</h1>");
  });

  it("asks a signed-out visitor to sign in with Google or the invited address, offering Google alone", () => {
    expect(texts.GRANT_CONFIRM).toBe(
      "Sign in with Google or with the email address the invitation was sent to.",
    );
    expect(source).toContain("{GRANT_CONFIRM}");
    expect(source).toContain('GROK_PROVIDERS.filter((p) => p.providerId === "grok-google")');
  });

  it("accepts with one button and says the business joined", () => {
    expect(texts.ADD_TO_CLIENTS).toBe("Add to our clients");
    expect(source).toContain("{ADD_TO_CLIENTS}");
    expect(texts.clientJoinedToast("Ortiz Dental")).toBe("Ortiz Dental joined your client list.");
    expect(source).toContain('void navigate({ to: "/firm" })');
  });

  it("answers a link that is not a token with the closed page, before any call", () => {
    expect(texts.CLIENT_INVITE_UNAVAILABLE).toBe("Client invitation unavailable");
    expect(texts.GRANT_CLOSED).toBe(
      "This invitation has expired or was already used. Ask the business owner for a new one.",
    );
    params.token = "not-a-real-token";
    const Page = route.options.component;
    const html = renderToStaticMarkup(<Page />);
    expect(html).toContain("Client invitation unavailable");
    expect(html).toContain(
      "This invitation has expired or was already used. Ask the business owner for a new one.",
    );
    params.token = "ab".repeat(24);
    expect(renderToStaticMarkup(<Page />)).toContain("Checking the invitation…");
  });
});
