import { lazy, Suspense, useEffect, useState } from "react";
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
import { PresentationProvider } from "@/lib/precog/presentation";
import { isPracticePath, needsPractice } from "@/lib/precog/route-scope";
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
          "Precog Pioneer shows a small-business owner who can move money alone, what one absence would stop, and which fix to make this week, with prosecuted cases behind the findings where the record shows them.",
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
  beforeLoad: ({ location }) => preloadPracticeShell(location.pathname),
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

/** The business engine, loaded only by a tab that opens a business page. */
const loadPracticeShell = () => import("@/components/precog/practice-shell");
const PracticeShell = lazy(() =>
  loadPracticeShell().then((module) => ({ default: module.PracticeShell })),
);

/**
 * Start downloading the engine alongside the page's own code when the tab
 * opens on a business page or heads to one, so hydration does not wait for a
 * second round trip once it reaches the shell.
 */
function preloadPracticeShell(pathname: string) {
  if (typeof window !== "undefined" && isPracticePath(pathname)) void loadPracticeShell();
}
if (typeof window !== "undefined") preloadPracticeShell(window.location.pathname);

/** The provider's own first screen, shown while its code loads. */
function CheckingAccount() {
  return (
    <main className="p-6">
      <p role="status">Checking your account…</p>
    </main>
  );
}

function RootDocument() {
  useEffect(() => installGlobalErrorReporting(), []);
  const practicePage = useMatches({
    select: (matches) => needsPractice(matches.map((m) => m.routeId)),
  });
  // Sticky: once a business page opens in this tab, the workspace stays
  // mounted (hidden on public pages), so a save still pending there completes.
  // A tab that only ever shows public pages never loads it.
  const [practiceOpened, setPracticeOpened] = useState(practicePage);
  if (practicePage && !practiceOpened) setPracticeOpened(true);
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
            {/* Hidden on a public page, so its account check never stands in
                for that page. */}
            {practiceOpened && (
              <div hidden={!practicePage}>
                <Suspense fallback={<CheckingAccount />}>
                  <PracticeShell open={practicePage}>
                    <Outlet />
                  </PracticeShell>
                </Suspense>
              </div>
            )}
          </PresentationProvider>
        </AuthProvider>
        <Toaster richColors position="bottom-right" />
        <Scripts />
      </body>
    </html>
  );
}
