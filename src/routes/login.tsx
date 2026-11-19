import { useEffect, useState, type FormEvent } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { authClient, authEnabled, signInErrorMessage } from "@/lib/auth/client";
import { emailAndPasswordEnabled, PASSWORD_MIN_LENGTH } from "@/lib/auth/email-password";
import { PILOT_OFFER, planAmounts, type PlanAmounts } from "@/lib/precog/firm/pricing";
import { getPlanPrices } from "@/lib/precog/billing/server";
import { LegalFooter } from "@/components/precog/legal-footer";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>): { error?: string } =>
    typeof search.error === "string" ? { error: search.error } : {},
  // The Firm plan's price as Stripe charges it, read before the page renders
  // so the first paint (and the served HTML) already carries the figure.
  // Null when the price service fails, so the page never prints a figure
  // Checkout would not charge.
  loader: () => getPlanPrices().catch(() => null),
  component: Login,
});

const inputCls =
  "mt-1 w-full rounded-lg border border-border bg-elevated px-3 py-2 text-sm text-fg placeholder:text-subtle focus:border-primary/50";
const labelCls = "block text-xs font-medium text-muted";

function Login() {
  // With Stripe connected only its own amount prints; without Stripe the
  // offer's own figure prints; while the price is unknown, no figure.
  const prices = Route.useLoaderData();
  const { error: searchError } = Route.useSearch();
  const amounts: PlanAmounts | null = prices ? planAmounts(prices.configured, prices.prices) : null;

  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-xl border border-border bg-surface p-6 shadow-sm">
        <p className="text-xs tracking-[0.2em] text-primary uppercase">Precog</p>
        <h1 className="mt-2 text-xl font-semibold tracking-tight">Sign in</h1>
        <p className="mt-1 text-sm text-muted">
          Your account keeps businesses, snapshots, and shared map links. Open them on any device
          where you sign in. Signing in is free. Advisors who manage several businesses can add the{" "}
          {PILOT_OFFER.monthlyLabel}
          {amounts ? ` (from ${amounts.monthly})` : ""}.{" "}
          <Link to="/pricing" className="underline-offset-4 hover:text-fg hover:underline">
            See pricing
          </Link>
          .
        </p>
        {authEnabled && emailAndPasswordEnabled ? (
          <EmailPasswordForm searchError={searchError} />
        ) : (
          <p className="mt-6 text-sm text-muted">Sign-in is off in this environment.</p>
        )}
        <Link
          to="/"
          className="mt-6 block text-center text-sm text-muted underline-offset-4 hover:text-fg hover:underline"
        >
          Continue without an account — your work stays in this browser
        </Link>
        <LegalFooter className="mt-4 justify-center" />
      </div>
    </main>
  );
}

/**
 * The account lives in this app's database. Where Precog can send email, a
 * new address is confirmed from a link before it signs in, and a forgotten
 * password is reset by email (`?token=` is the reset link coming back,
 * `?verified=1` the confirmation link).
 */
function EmailPasswordForm({ searchError }: { searchError?: string }) {
  const [mode, setMode] = useState<"sign-in" | "create" | "forgot" | "reset">("sign-in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [resetToken, setResetToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(() =>
    searchError ? signInErrorMessage(searchError) : null,
  );
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(true);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");
    if (token) {
      setResetToken(token);
      setMode("reset");
    } else if (params.get("verified") === "1" && !params.get("error")) {
      setNotice("Your email is confirmed. Sign in to continue.");
    }
  }, []);

  function switchTo(next: typeof mode) {
    setMode(next);
    setError(null);
    setNotice(null);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    if (mode === "forgot") return requestReset();
    if (password.length < PASSWORD_MIN_LENGTH) {
      setError(`Use a password of at least ${PASSWORD_MIN_LENGTH} characters.`);
      return;
    }
    if (mode === "reset") return setNewPassword();
    setBusy(true);
    try {
      const address = email.trim();
      const result =
        mode === "create"
          ? await authClient.signUp.email({
              name: name.trim() || address.split("@")[0],
              email: address,
              password,
              callbackURL: "/",
            })
          : await authClient.signIn.email({ email: address, password, callbackURL: "/" });
      if (result.error) {
        setError(
          result.error.code === "EMAIL_NOT_VERIFIED"
            ? `Confirm your email first. Precog sent a link to ${address}. Open it, then sign in. Precog now confirms every email, so older accounts must confirm once too.`
            : (result.error.message ??
                "Precog could not sign you in. Check the email and password."),
        );
        return;
      }
      if (mode === "create" && !result.data?.token) {
        setPassword("");
        switchTo("sign-in");
        setNotice(
          `Check your email. Precog sent a link to ${address}. Open it within 24 hours, then sign in. If no email arrives, this address may already have an account. Use Forgot password.`,
        );
        return;
      }
      window.location.href = "/";
    } catch {
      setError("Precog could not reach the sign-in service. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  }

  async function requestReset() {
    setBusy(true);
    try {
      const address = email.trim();
      const result = await authClient.requestPasswordReset({
        email: address,
        redirectTo: "/login",
      });
      if (result.error) {
        setError(
          result.error.code === "RESET_PASSWORD_DISABLED"
            ? "This copy of Precog cannot send email or reset passwords."
            : (result.error.message ?? "Precog could not send the link. Try again in a moment."),
        );
        return;
      }
      setNotice(
        `If ${address} has a Precog account, Precog sent a password reset link. It works for one hour.`,
      );
    } catch {
      setError("Precog could not reach the sign-in service. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  }

  async function setNewPassword() {
    if (!resetToken) return;
    setBusy(true);
    try {
      const result = await authClient.resetPassword({ newPassword: password, token: resetToken });
      if (result.error) {
        setError(
          result.error.code === "INVALID_TOKEN"
            ? signInErrorMessage("invalid_token")
            : (result.error.message ?? "Precog could not set the password. Try again."),
        );
        return;
      }
      window.history.replaceState(null, "", "/login");
      setResetToken(null);
      setPassword("");
      switchTo("sign-in");
      setNotice("Your new password is set. Sign in with it.");
    } catch {
      setError("Precog could not reach the sign-in service. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  }

  const heading =
    mode === "create"
      ? "Create an account"
      : mode === "forgot"
        ? "Forgot password"
        : mode === "reset"
          ? "Set a new password"
          : "Email and password";

  return (
    <form method="post" onSubmit={submit} className="mt-6 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium tracking-wide text-muted uppercase">{heading}</p>
        {mode !== "reset" && (
          <button
            type="button"
            className="text-xs text-primary underline-offset-4 hover:underline"
            onClick={() => switchTo(mode === "sign-in" ? "create" : "sign-in")}
          >
            {mode === "sign-in" ? "New here? Create one" : "I have an account"}
          </button>
        )}
      </div>
      {notice && (
        <p role="status" className="text-xs text-fg">
          {notice}
        </p>
      )}
      {mode === "create" && (
        <label className={labelCls}>
          Name
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
        </label>
      )}
      {mode !== "reset" && (
        <label className={labelCls}>
          Email
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
        </label>
      )}
      {mode !== "forgot" && (
        <label className={labelCls}>
          {mode === "sign-in"
            ? "Password"
            : `${mode === "reset" ? "New password" : "Password"} (at least ${PASSWORD_MIN_LENGTH} characters)`}
          <input
            className={inputCls}
            type="password"
            name="password"
            autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
            required
            minLength={PASSWORD_MIN_LENGTH}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
      )}
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
      <Button type="submit" className="w-full" disabled={busy || !hydrated}>
        {busy
          ? "One moment…"
          : mode === "create"
            ? "Create account"
            : mode === "forgot"
              ? "Email me a link"
              : mode === "reset"
                ? "Set password"
                : "Sign in with email"}
      </Button>
      {mode === "sign-in" && (
        <button
          type="button"
          className="block w-full text-center text-xs text-muted underline-offset-4 hover:text-fg hover:underline"
          onClick={() => switchTo("forgot")}
        >
          Forgot password?
        </button>
      )}
    </form>
  );
}
