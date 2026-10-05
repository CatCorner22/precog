import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { LegalFooter } from "@/components/precog/legal-footer";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { useRecordDisplayedAccount } from "@/lib/auth/use-record-displayed-account";
import { GROK_PROVIDERS, authEnabled, signIn } from "@/lib/auth/client";
import { emailAndPasswordEnabled } from "@/lib/auth/email-password";
import { acceptClientGrant, peekClientGrant } from "@/lib/precog/firm/grant-server";
import {
  ADD_TO_CLIENTS,
  CLIENT_INVITE_TITLE,
  CLIENT_INVITE_UNAVAILABLE,
  clientInviteSentence,
  clientJoinedToast,
  GRANT_CLOSED,
  GRANT_CONFIRM,
} from "@/lib/precog/firm/grant-texts";
import { clientErrorStatus } from "@/lib/request-errors";

export const Route = createFileRoute("/join/client/$token")({
  component: ClientInvitePage,
  head: () => ({
    meta: [{ title: CLIENT_INVITE_TITLE }, { name: "robots", content: "noindex, nofollow" }],
  }),
});

/** A client invitation token: 48 lowercase hex characters, as the server makes them. */
const TOKEN = /^[a-f0-9]{48}$/;

type PeekState =
  | { kind: "loading" }
  | { kind: "open"; businessName: string; ownerName: string }
  | { kind: "closed"; message: string };

/**
 * The link a business owner sends their accountant's firm owner. It names
 * the business and its owner, asks for sign-in when needed, and adds the
 * business to the firm's client list on one click. A link that is not a
 * token never reaches the server.
 */
function ClientInvitePage() {
  const { token } = Route.useParams();
  const { user, isPending } = useCurrentUserState();
  // The link opens outside the business workspace: record the account before
  // the signed-in acceptance, or it answers 409.
  useRecordDisplayedAccount(user?.id);
  const navigate = useNavigate();
  const [state, setState] = useState<PeekState>(
    TOKEN.test(token) ? { kind: "loading" } : { kind: "closed", message: GRANT_CLOSED },
  );
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!TOKEN.test(token)) return;
    let cancel = false;
    void peekClientGrant({ data: { token } })
      .then((res) => {
        if (cancel) return;
        const grant = res.grant;
        setState(
          grant?.status === "open"
            ? { kind: "open", businessName: grant.businessName, ownerName: grant.ownerName }
            : { kind: "closed", message: GRANT_CLOSED },
        );
      })
      .catch((err: unknown) => {
        // A throttled visitor reads the wait; anyone else the closed link.
        if (cancel) return;
        setState({
          kind: "closed",
          message:
            clientErrorStatus(err) === 429 && err instanceof Error ? err.message : GRANT_CLOSED,
        });
      });
    return () => {
      cancel = true;
    };
  }, [token]);

  async function accept(businessName: string) {
    setBusy(true);
    try {
      await acceptClientGrant({ data: { token } });
      toast.success(clientJoinedToast(businessName));
      void navigate({ to: "/firm" });
    } catch (err) {
      setState({
        kind: "closed",
        message: err instanceof Error && err.message ? err.message : GRANT_CLOSED,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="matrix-grid flex min-h-[calc(100dvh-var(--grok-banner-h,0px))] items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-xl border border-border bg-surface p-6 shadow-sm">
        <p className="text-xs tracking-[0.2em] text-primary uppercase">Precog</p>
        {state.kind === "loading" ? (
          <p className="mt-4 text-sm text-muted">Checking the invitation…</p>
        ) : state.kind === "closed" ? (
          <>
            <h1 className="mt-2 text-xl font-semibold tracking-tight">
              {CLIENT_INVITE_UNAVAILABLE}
            </h1>
            <p className="mt-2 text-sm text-muted">{state.message}</p>
          </>
        ) : (
          <>
            <h1 className="mt-2 text-xl font-semibold tracking-tight">{state.businessName}</h1>
            <p className="mt-2 text-sm text-muted">
              {clientInviteSentence(state.ownerName, state.businessName)}
            </p>
            {isPending ? (
              <p className="mt-4 text-sm text-muted">Checking your sign-in…</p>
            ) : user ? (
              <Button
                className="mt-5 w-full"
                onClick={() => void accept(state.businessName)}
                disabled={busy}
              >
                {ADD_TO_CLIENTS}
              </Button>
            ) : (
              <SignInHere token={token} />
            )}
          </>
        )}
        <LegalFooter className="mt-6 justify-center" />
      </div>
    </main>
  );
}

/**
 * Sign-in on the invitation itself, so the firm owner comes back to this
 * link. Only Google is offered: an X sign-in carries no confirmed address,
 * so it could never accept. The email form lives on the sign-in page.
 */
function SignInHere({ token }: { token: string }) {
  const here = `/join/client/${token}`;
  if (!authEnabled) {
    return <p className="mt-4 text-sm text-muted">Sign-in is off on this deployment.</p>;
  }
  return (
    <>
      <p className="mt-4 text-sm text-muted">{GRANT_CONFIRM}</p>
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
