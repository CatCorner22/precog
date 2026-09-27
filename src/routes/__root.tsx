import { useEffect } from "react";
import {
  createRootRoute,
  HeadContent,
  Link,
  Outlet,
  Scripts,
  useMatches,
} from "@tanstack/react-router";
import { AuthProvider } from "@/lib/auth/provider";
import { installGlobalErrorReporting } from "@/lib/observability/report-browser";
import { PracticeProvider } from "@/lib/precog/practice-context";
import { WorkspaceRecovery } from "@/components/precog/workspace-recovery";
import { PresentationProvider } from "@/lib/precog/presentation";
import { needsPractice } from "@/lib/precog/route-scope";
import { CreatedWithGrokBanner } from "@/components/created-with-grok-banner";
import { Toaster } from "sonner";
import appCss from "../styles.css?url";
import { buttonClass } from "@/components/ui/button-variants";

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
          "Precog Pioneer shows a small-business owner who can move money alone, what one absence would stop, and which fix to make this week, with the prosecuted case behind each finding.",
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
        <Link to="/" className={buttonClass()}>
          Go to Start here
        </Link>
        <Link to="/report" className={buttonClass({ variant: "outline" })}>
          Open the report
        </Link>
      </nav>
    </main>
  );
}

function RootDocument() {
  useEffect(() => installGlobalErrorReporting(), []);
  const practicePage = useMatches({
    select: (matches) => needsPractice(matches.map((m) => m.routeId)),
  });
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body className="min-h-dvh bg-bg text-fg antialiased">
        <CreatedWithGrokBanner />
        <AuthProvider>
          <PresentationProvider>
            {!practicePage && <Outlet />}
            {/* Always mounted, so a save still pending when the owner opens a
                public page completes; hidden there, so its account check never
                stands in for that page. */}
            <div hidden={!practicePage}>
              <PracticeProvider>
                {practicePage && (
                  <>
                    <WorkspaceRecovery />
                    <Outlet />
                  </>
                )}
              </PracticeProvider>
            </div>
          </PresentationProvider>
        </AuthProvider>
        <Toaster richColors position="bottom-right" />
        <Scripts />
      </body>
    </html>
  );
}
