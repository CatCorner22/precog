import { useEffect } from "react";
import { createRootRoute, HeadContent, Link, Outlet, Scripts } from "@tanstack/react-router";
import { AuthProvider } from "@/lib/auth/provider";
import { installGlobalErrorReporting } from "@/lib/observability/report.client";
import { PracticeProvider } from "@/lib/precog/practice-context";
import { PresentationProvider } from "@/lib/precog/presentation";
import { CreatedWithGrokBanner } from "@/components/created-with-grok-banner";
import { Toaster } from "sonner";
import appCss from "../styles.css?url";

const APP_NAME = "Precog Pioneer — Small Business Risk";
const host = import.meta.env.VITE_PUBLIC_HOSTNAME;
const ogImage = host
  ? `https://og.grok.me/v1/card.png?host=${encodeURIComponent(host)}&title=${encodeURIComponent(APP_NAME)}`
  : undefined;

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: APP_NAME },
      {
        name: "description",
        content:
          "Internal controls and residual risk management for small businesses — SoD detection, knowledge SPOFs, scenario modeling, and an AI advisor grounded in your data.",
      },
      ...(ogImage
        ? [
            { property: "og:image", content: ogImage },
            { property: "og:image:width", content: "1200" },
            { property: "og:image:height", content: "630" },
          ]
        : []),
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      // Inline icon so the browser stops requesting a /favicon.ico that does not exist.
      {
        rel: "icon",
        type: "image/svg+xml",
        href: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='7' fill='%230f172a'/%3E%3Ccircle cx='16' cy='16' r='7' fill='none' stroke='%2360a5fa' stroke-width='3'/%3E%3Ccircle cx='16' cy='16' r='2.5' fill='%2360a5fa'/%3E%3C/svg%3E",
      },
    ],
  }),
  component: RootDocument,
  notFoundComponent: NotFound,
});

/** An address with no page (a typo such as /reports): say so and offer the way back. */
function NotFound() {
  return (
    <main className="mx-auto flex min-h-[calc(100dvh-var(--grok-banner-h,0px))] max-w-xl flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-xs font-semibold tracking-[0.2em] text-muted uppercase">Page not found</p>
      <h1 className="text-2xl font-semibold tracking-tight">There is no page at this address</h1>
      <p className="text-sm text-muted">
        Check the link for a typo, or go back to your business. Nothing you saved has changed.
      </p>
      <nav className="flex flex-wrap justify-center gap-2" aria-label="Where to go">
        <Link
          to="/"
          className="inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-fg"
        >
          Go to Start here
        </Link>
        <Link
          to="/report"
          className="inline-flex h-10 items-center rounded-md border border-border px-4 text-sm font-medium text-fg hover:bg-elevated"
        >
          Open the report
        </Link>
      </nav>
    </main>
  );
}

function RootDocument() {
  useEffect(() => installGlobalErrorReporting(), []);
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body className="min-h-dvh bg-bg text-fg antialiased">
        <CreatedWithGrokBanner />
        <AuthProvider>
          <PresentationProvider>
            <PracticeProvider>
              <Outlet />
            </PracticeProvider>
          </PresentationProvider>
        </AuthProvider>
        <Toaster richColors position="bottom-right" />
        <Scripts />
      </body>
    </html>
  );
}
