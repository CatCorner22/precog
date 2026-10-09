import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { LegalFooter } from "@/components/precog/legal-footer";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { useRecordDisplayedAccount } from "@/lib/auth/use-record-displayed-account";
import { GROK_PROVIDERS, authEnabled, signIn } from "@/lib/auth/client";
import { emailAndPasswordEnabled } from "@/lib/auth/email-password";
import { acceptFirmInvite, checkFirmInvite, peekFirmInvite } from "@/lib/precog/firm/server";
import { clientErrorStatus } from "@/lib/request-errors";

export const Route = createFileRoute("/join/$token")({
  component: JoinPage,
  head: () => ({ meta: [{ title: "Join a firm · Precog" }] }),
});

/**
 * The invitation link a colleague receives. It shows the firm and role,
 * asks for sign-in when needed, and joins on one click.
 */
function JoinPage() {
  const { token } = Route.useParams();
  const { user, isPending } = useCurrentUserState();
  // The link opens outside the business workspace: record the account before
  // JoinAs checks the fit, or every signed-in call answers 409.
  useRecordDisplayedAccount(user?.id);
  const navigate = useNavigate();
  const [invite, setInvite] = useState<
    { firmName: string; role: string; email: string } | null | "loading" | "throttled"
  >("loading");
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancel = false;
    void peekFirmInvite({ data: { token } })
      .then((res) => {
        if (!cancel) setInvite(res.invite);
      })
      .catch((err) => {
        // A throttled visitor waits a minute; anyone else sees the closed page.
        if (!cancel) setInvite(clientErrorStatus(err) === 429 ? "throttled" : null);
      });
    return () => {
      cancel = true;
    };
  }, [token, attempt]);

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
        <p className="text-xs tracking-[0.2em] text-primary uppercase">Precog</p>
        {invite === "loading" ? (
          <p className="mt-4 text-sm text-muted">Checking the invitation…</p>
        ) : invite === "throttled" ? (
          <>
            <h1 className="mt-2 text-xl font-semibold tracking-tight">
              Too many opens from this address
            </h1>
            <p className="mt-2 text-sm text-muted">
              Wait one minute, then check this invitation again. The link stays the same.
            </p>
            <Button
              className="mt-4"
              onClick={() => {
                setInvite("loading");
                setAttempt((n) => n + 1);
              }}
            >
              Check again
            </Button>
          </>
        ) : invite === null ? (
          <>
            <h1 className="mt-2 text-xl font-semibold tracking-tight">
              This invitation is no longer open
            </h1>
            <p className="mt-2 text-sm text-muted">
              The link may have expired after two weeks, or someone may have used it. Ask the firm
              owner for a new link.
            </p>
          </>
        ) : (
          <>
            <h1 className="mt-2 text-xl font-semibold tracking-tight">Join {invite.firmName}</h1>
            <p className="mt-2 text-sm text-muted">
              The firm invited you as a <strong className="text-fg">{invite.role}</strong>. You can:
            </p>
            <ul className="mt-2 list-disc space-y-0.5 pl-5 text-sm text-muted">
              {[
                "Map clients and lock reports",
                "Record monthly review results and control checks",
                ...(invite.role === "reviewer"
                  ? ["Review control checks", "Approve reports someone else prepared"]
                  : []),
              ].map((duty) => (
                <li key={duty}>{duty}</li>
              ))}
            </ul>
            <p className="mt-2 text-sm text-muted">
              Only the firm owner can delete or restore a client.
            </p>
            {isPending ? (
              <p className="mt-4 text-sm text-muted">Checking your sign-in…</p>
            ) : user ? (
              <JoinAs
                token={token}
                invitedEmail={invite.email}
                accountLabel={user.displayName ?? user.primaryEmail ?? "this account"}
                busy={busy}
                onJoin={() => void join()}
              />
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
 * The join button for a signed-in visitor. Precog joins only when the
 * account's confirmed email is the invited address. Any other account is
 * refused, including one whose email is not confirmed.
 */
function JoinAs({
  token,
  invitedEmail,
  accountLabel,
  busy,
  onJoin,
}: {
  token: string;
  invitedEmail: string;
  accountLabel: string;
  busy: boolean;
  onJoin: () => void;
}) {
  const [fit, setFit] = useState<InviteFitResult | "loading">("loading");

  useEffect(() => {
    let cancel = false;
    void checkFirmInvite({ data: { token } })
      .then((res) => {
        if (!cancel) setFit(res.fit);
      })
      .catch(() => {
        if (!cancel) setFit(null);
      });
    return () => {
      cancel = true;
    };
  }, [token]);

  if (fit === "loading") return <p className="mt-4 text-sm text-muted">Checking your sign-in…</p>;
  if (fit?.fit !== "match") {
    return (
      <p className="mt-4 text-sm text-muted">
        {fit?.fit === "mismatch" ? (
          <>
            This invite was sent to <span className="text-fg">{invitedEmail}</span>. You are signed
            in as <span className="text-fg">{fit.accountEmail}</span>. Sign in with the invited
            address, or ask the firm owner to invite {fit.accountEmail}.
          </>
        ) : (
          <>
            Precog cannot confirm this account&rsquo;s email. Sign in with Google as{" "}
            <span className="text-fg">{invitedEmail}</span>, or use an email-and-password account
            with a confirmed address. Then reopen the invitation.
          </>
        )}
      </p>
    );
  }
  return (
    <>
      <p className="mt-4 text-sm text-muted">
        The firm sent this invitation to <span className="text-fg">{invitedEmail}</span>.
      </p>
      <Button className="mt-5 w-full" onClick={onJoin} disabled={busy}>
        {busy ? "Joining…" : `Join as ${accountLabel}`}
      </Button>
    </>
  );
}

type InviteFitResult = Awaited<ReturnType<typeof checkFirmInvite>>["fit"];

/**
 * Sign-in on the invitation itself, so the invitee comes back to this link
 * instead of the home page. Only Google is offered: an X sign-in carries no
 * confirmed address, so it could never join. The email form lives on the
 * sign-in page, which returns home, so that route says to come back.
 */
function SignInHere({ token, email }: { token: string; email: string }) {
  const here = `/join/${token}`;
  if (!authEnabled) {
    return <p className="mt-4 text-sm text-muted">Sign-in is off on this deployment.</p>;
  }
  return (
    <>
      <p className="mt-4 text-sm text-muted">
        Sign in to join. The firm sent this invite to <span className="text-fg">{email}</span>. Use
        Google or the invited email address to sign in.
      </p>
      <div className="mt-4 space-y-2">
        {GROK_PROVIDERS.filter((p) => p.providerId === "grok-google").map((p) => (
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
          Prefer email and password?{" "}
          <Link to="/login" className="underline-offset-4 hover:underline">
            Sign in with email
          </Link>
          , then open this invitation again.
        </p>
      )}
    </>
  );
}
