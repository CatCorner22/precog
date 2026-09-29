import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { LegalFooter } from "@/components/precog/legal-footer";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { GROK_PROVIDERS, authEnabled, signIn } from "@/lib/auth/client";
import { emailAndPasswordEnabled } from "@/lib/auth/email-password";
import { acceptFirmInvite, peekFirmInvite } from "@/lib/precog/firm/server";

export const Route = createFileRoute("/join/$token")({
  component: JoinPage,
  head: () => ({ meta: [{ title: "Join a firm · Precog Pioneer" }] }),
});

/**
 * The invitation link a colleague receives. It shows the firm and role,
 * asks for sign-in when needed, and joins on one click.
 */
function JoinPage() {
  const { token } = Route.useParams();
  const { user, isPending } = useCurrentUserState();
  const navigate = useNavigate();
  const [invite, setInvite] = useState<
    { firmName: string; role: string; email: string } | null | "loading"
  >("loading");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancel = false;
    void peekFirmInvite({ data: { token } })
      .then((res) => {
        if (!cancel) setInvite(res.invite);
      })
      .catch(() => {
        if (!cancel) setInvite(null);
      });
    return () => {
      cancel = true;
    };
  }, [token]);

  async function join() {
    setBusy(true);
    try {
      const { firm } = await acceptFirmInvite({ data: { token } });
      toast.success(`You joined ${firm.name} as ${firm.role}.`);
      void navigate({ to: "/firm" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Precog could not accept the invitation.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="matrix-grid flex min-h-[calc(100dvh-var(--grok-banner-h,0px))] items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-xl border border-border bg-surface p-6 shadow-sm">
        <p className="text-xs tracking-[0.2em] text-primary uppercase">Precog Pioneer</p>
        {invite === "loading" ? (
          <p className="mt-4 text-sm text-muted">Checking the invitation…</p>
        ) : invite === null ? (
          <>
            <h1 className="mt-2 text-xl font-semibold tracking-tight">
              This invitation is no longer open
            </h1>
            <p className="mt-2 text-sm text-muted">
              It may have expired (invitations last two weeks), or someone may already have used it.
              Ask the firm owner for a new link.
            </p>
          </>
        ) : (
          <>
            <h1 className="mt-2 text-xl font-semibold tracking-tight">Join {invite.firmName}</h1>
            <p className="mt-2 text-sm text-muted">
              The firm invited you as a <strong className="text-fg">{invite.role}</strong>. A
              preparer maps clients and locks reports; a reviewer also signs reports off.
            </p>
            {isPending ? (
              <p className="mt-4 text-sm text-muted">Checking your sign-in…</p>
            ) : user ? (
              <Button className="mt-5 w-full" onClick={() => void join()} disabled={busy}>
                {busy
                  ? "Joining…"
                  : `Join as ${user.displayName ?? user.primaryEmail ?? "this account"}`}
              </Button>
            ) : (
              <SignInHere token={token} email={invite.email} />
            )}
          </>
        )}
        <LegalFooter className="mt-6 justify-center" />
      </div>
    </main>
  );
}

/**
 * Sign-in on the invitation itself, so the invitee comes back to this link
 * instead of the home page. The email form lives on the sign-in page, which
 * returns home, so that route says to come back.
 */
function SignInHere({ token, email }: { token: string; email: string }) {
  const here = `/join/${token}`;
  if (!authEnabled) {
    return <p className="mt-4 text-sm text-muted">Sign-in is off on this deployment.</p>;
  }
  return (
    <>
      <p className="mt-4 text-sm text-muted">
        Sign in to join. The firm sent the invitation to <span className="text-fg">{email}</span>;
        any account can use it.
      </p>
      <div className="mt-4 space-y-2">
        {GROK_PROVIDERS.map((p) => (
          <Button
            key={p.providerId}
            type="button"
            variant="secondary"
            className="w-full"
            onClick={() =>
              void signIn(p.providerId, { callbackURL: here, errorCallbackURL: here }).catch(
                (err: unknown) =>
                  toast.error(err instanceof Error ? err.message : "Sign-in did not finish."),
              )
            }
          >
            Continue with {p.label}
          </Button>
        ))}
      </div>
      {emailAndPasswordEnabled && (
        <p className="mt-3 text-xs text-muted">
          Use an email and password instead?{" "}
          <Link to="/login" className="underline-offset-4 hover:underline">
            Sign in with email
          </Link>
          , then open this invitation link again.
        </p>
      )}
    </>
  );
}
