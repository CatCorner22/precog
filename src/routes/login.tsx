import { createFileRoute, Link } from "@tanstack/react-router";
import { GROK_PROVIDERS, authEnabled, signIn } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";
import { LegalFooter } from "@/components/precog/legal-footer";

export const Route = createFileRoute("/login")({
  component: Login,
});

function Login() {
  return (
    <main className="matrix-grid flex min-h-[calc(100dvh-var(--grok-banner-h,0px))] items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-xl border border-border bg-surface p-6 shadow-sm">
        <p className="text-xs tracking-[0.2em] text-primary uppercase">Precog Pioneer</p>
        <h1 className="mt-2 text-xl font-semibold tracking-tight">Sign in</h1>
        <p className="mt-1 text-sm text-muted">
          Sync your business profile, decision journal, and control settings across devices.
        </p>
        <div className="mt-6 space-y-2">
          {authEnabled ? (
            GROK_PROVIDERS.map((p) => (
              <Button
                key={p.providerId}
                type="button"
                variant="secondary"
                className="w-full"
                onClick={() => signIn(p.providerId, { callbackURL: "/" })}
              >
                Continue with {p.label}
              </Button>
            ))
          ) : (
            <p className="text-sm text-muted">Sign-in is disabled in this environment.</p>
          )}
        </div>
        <Link
          to="/"
          className="mt-6 block text-center text-sm text-muted underline-offset-4 hover:text-fg hover:underline"
        >
          Continue as guest demo
        </Link>
        <LegalFooter className="mt-4 justify-center" />
      </div>
    </main>
  );
}
