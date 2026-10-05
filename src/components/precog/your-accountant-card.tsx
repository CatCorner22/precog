/* eslint-disable react-refresh/only-export-components -- the texts and prompts next to the card are tested on their own */
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { formatDay } from "@/lib/precog/dates";
import {
  endFirmAccess,
  getBusinessGrant,
  inviteFirmToBusiness,
} from "@/lib/precog/firm/grant-server";

export const YOUR_ACCOUNTANT = "Your accountant";
export const ACCOUNTANT_INTRO =
  "Invite your accountant's firm to work on this business in Precog. The firm can read and change your team, duty map, procedures and Monthly review, connect QuickBooks, download the business's past versions, and lock and share reports under its name. The business stays yours, and you can end the firm's access at any time.";
export const FIRM_OWNER_EMAIL = "Firm owner's email";
export const INVITE_THE_FIRM = "Invite the firm";
export const END_FIRM_ACCESS = "End the firm's access";
export const FIRM_ACCESS_ENDED = "The firm's access has ended.";
/** The toasts when a call fails with no message of its own. */
export const INVITE_NOT_SENT = "Precog could not send the invitation.";
export const ACCESS_NOT_ENDED = "Precog could not end the firm's access.";

export function invitationSentText(email: string, expiresAt: string): string {
  return `Invitation sent to ${email}; it expires on ${formatDay(expiresAt)}.`;
}

export function invitationUnmailedText(url: string): string {
  return `Precog could not email it. Send this link yourself: ${url}`;
}

export function invitationWaitingText(email: string, expiresAt: string): string {
  return `Waiting for ${email} to accept; the invitation expires on ${formatDay(expiresAt)}.`;
}

export function firmWorkingText(firm: string, since: string): string {
  return `${firm} has worked on this business since ${formatDay(since)}.`;
}

/** The question before the owner ends a firm's access. */
export function endFirmAccessPrompt(firm: string, business: string): string {
  return `End ${firm}'s access to ${business}? The firm loses access to this business and to the report versions it locked; you keep them.`;
}

export type AccountantGrant =
  { firmName: string; since: string } | { pendingEmail: string; expiresAt: string } | null;

/** What the owner just sent, for the line under the form. */
export type SentInvitation = { email: string; expiresAt: string; emailed: boolean; url: string };

interface ViewProps {
  grant: AccountantGrant;
  sent: SentInvitation | null;
  busy?: boolean;
  onInvite?: (email: string) => void;
  onEnd?: () => void;
}

/** The card as drawn for each state: no firm yet, an invitation waiting, a firm at work. */
export function YourAccountantView({ grant, sent, busy = false, onInvite, onEnd }: ViewProps) {
  const [email, setEmail] = useState("");
  const working = grant && "firmName" in grant ? grant : null;
  const waiting = grant && "pendingEmail" in grant ? grant : null;
  return (
    <section
      aria-labelledby="your-accountant-heading"
      className="mb-4 rounded-xl border border-border bg-surface p-4"
    >
      <h2 id="your-accountant-heading" className="text-base font-semibold">
        {YOUR_ACCOUNTANT}
      </h2>
      {working ? (
        <>
          <p className="mt-1 text-sm text-muted">
            {firmWorkingText(working.firmName, working.since)}
          </p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="mt-3"
            disabled={busy}
            onClick={() => onEnd?.()}
          >
            {END_FIRM_ACCESS}
          </Button>
        </>
      ) : (
        <>
          <p className="mt-1 text-sm text-muted">{ACCOUNTANT_INTRO}</p>
          <form
            className="mt-3 flex flex-wrap items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (email.trim()) onInvite?.(email.trim());
            }}
          >
            <label className="block min-w-0 flex-1 text-xs text-muted">
              {FIRM_OWNER_EMAIL}
              <input
                type="email"
                required
                autoComplete="email"
                className="mt-1 w-full rounded-md border border-border bg-bg px-2 py-1.5 text-sm text-fg"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <Button type="submit" size="sm" disabled={busy}>
              {INVITE_THE_FIRM}
            </Button>
          </form>
          <p className="mt-2 text-sm text-muted break-words" role="status">
            {sent
              ? sent.emailed
                ? invitationSentText(sent.email, sent.expiresAt)
                : invitationUnmailedText(sent.url)
              : waiting
                ? invitationWaitingText(waiting.pendingEmail, waiting.expiresAt)
                : ""}
          </p>
        </>
      )}
    </section>
  );
}

/**
 * "Your accountant" on Start here, for the business's own account: invite a
 * firm, see the invitation waiting or the firm at work, and end its access.
 * Loads once per business after sign-in, and shows nothing for a business
 * the viewer reaches through a firm, or when the load fails.
 */
export function YourAccountantCard({
  businessId,
  businessName,
}: {
  businessId: string;
  businessName: string;
}) {
  const [grant, setGrant] = useState<AccountantGrant | undefined>(undefined);
  const [sent, setSent] = useState<SentInvitation | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancel = false;
    setGrant(undefined);
    setSent(null);
    void getBusinessGrant({ data: { businessId } })
      .then((res) => {
        if (!cancel && res.canInvite) setGrant(res.grant);
      })
      .catch(() => undefined);
    return () => {
      cancel = true;
    };
  }, [businessId]);

  if (grant === undefined) return null;

  async function invite(email: string) {
    setBusy(true);
    try {
      const res = await inviteFirmToBusiness({ data: { businessId, email } });
      setSent(res);
      setGrant({ pendingEmail: res.email, expiresAt: res.expiresAt });
    } catch (err) {
      toast.error(err instanceof Error && err.message ? err.message : INVITE_NOT_SENT);
    } finally {
      setBusy(false);
    }
  }

  async function end(firmName: string) {
    if (!window.confirm(endFirmAccessPrompt(firmName, businessName))) return;
    setBusy(true);
    try {
      await endFirmAccess({ data: { businessId } });
      setGrant(null);
      setSent(null);
      toast.success(FIRM_ACCESS_ENDED);
    } catch (err) {
      toast.error(err instanceof Error && err.message ? err.message : ACCESS_NOT_ENDED);
    } finally {
      setBusy(false);
    }
  }

  return (
    <YourAccountantView
      grant={grant}
      sent={sent}
      busy={busy}
      onInvite={(email) => void invite(email)}
      onEnd={() => {
        if (grant && "firmName" in grant) void end(grant.firmName);
      }}
    />
  );
}
