import { useState, type FormEvent } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { GROK_PROVIDERS, authClient, authEnabled, signIn } from "@/lib/auth/client";
import { emailAndPasswordEnabled, PASSWORD_MIN_LENGTH } from "@/lib/auth/email-password";
import { Button } from "@/components/ui/button";
import { LegalFooter } from "@/components/precog/legal-footer";

export const Route = createFileRoute("/login")({
  component: Login,
});

const inputCls =
  "w-full rounded-lg border border-border bg-elevated px-3 py-2 text-sm text-fg placeholder:text-subtle focus:border-primary/50";

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
        {authEnabled && emailAndPasswordEnabled && <EmailPasswordForm />}
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

/**
 * This app's own email and password, for firms that do not sign in with
 * Google or X. The account lives in this app's database alone.
 */
function EmailPasswordForm() {
  const [mode, setMode] = useState<"sign-in" | "create">("sign-in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (password.length < PASSWORD_MIN_LENGTH) {
      setError(`Use a password of at least ${PASSWORD_MIN_LENGTH} characters.`);
      return;
    }
    setBusy(true);
    try {
      const result =
        mode === "create"
          ? await authClient.signUp.email({
              name: name.trim() || email.split("@")[0],
              email: email.trim(),
              password,
              callbackURL: "/",
            })
          : await authClient.signIn.email({ email: email.trim(), password, callbackURL: "/" });
      if (result.error) {
        setError(result.error.message ?? "Sign-in failed. Check the email and password.");
        return;
      }
      window.location.href = "/";
    } catch {
      setError("Could not reach the sign-in service. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-5 space-y-3 border-t border-border pt-5">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium tracking-wide text-muted uppercase">
          {mode === "create" ? "Create an account" : "Or use email"}
        </p>
        <button
          type="button"
          className="text-xs text-primary underline-offset-4 hover:underline"
          onClick={() => {
            setMode(mode === "create" ? "sign-in" : "create");
            setError(null);
          }}
        >
          {mode === "create" ? "I have an account" : "New here? Create one"}
        </button>
      </div>
      {mode === "create" && (
        <input
          className={inputCls}
          type="text"
          name="name"
          autoComplete="name"
          placeholder="Your name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={80}
        />
      )}
      <input
        className={inputCls}
        type="email"
        name="email"
        autoComplete="email"
        placeholder="you@firm.com"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <input
        className={inputCls}
        type="password"
        name="password"
        autoComplete={mode === "create" ? "new-password" : "current-password"}
        placeholder={
          mode === "create" ? `Password (${PASSWORD_MIN_LENGTH}+ characters)` : "Password"
        }
        required
        minLength={PASSWORD_MIN_LENGTH}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
      <Button type="submit" className="w-full" disabled={busy}>
        {busy ? "One moment…" : mode === "create" ? "Create account" : "Sign in with email"}
      </Button>
    </form>
  );
}
