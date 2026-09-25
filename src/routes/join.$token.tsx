import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { LegalFooter } from "@/components/precog/legal-footer";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
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
      toast.error(err instanceof Error ? err.message : "The invitation could not be accepted.");
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
              It may have expired (invitations last two weeks) or already been used. Ask the firm
              owner for a new link.
            </p>
          </>
        ) : (
          <>
            <h1 className="mt-2 text-xl font-semibold tracking-tight">Join {invite.firmName}</h1>
            <p className="mt-2 text-sm text-muted">
              You were invited as a <strong className="text-fg">{invite.role}</strong>. A preparer
              maps clients and locks reports; a reviewer also signs reports off.
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
              <>
                <p className="mt-4 text-sm text-muted">
                  Sign in first, then come back to this link to join. The invitation was sent to{" "}
                  <span className="text-fg">{invite.email}</span>; any account can use it.
                </p>
                <Link
                  to="/login"
                  className="mt-4 inline-flex h-9 w-full items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-fg"
                >
                  Sign in
                </Link>
              </>
            )}
          </>
        )}
        <LegalFooter className="mt-6 justify-center" />
      </div>
    </main>
  );
}
