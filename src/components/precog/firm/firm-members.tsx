import { useState } from "react";
import { toast } from "sonner";
import { Copy, Crown, UserMinus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  inviteFirmMember,
  leaveFirm,
  removeFirmMember,
  revokeFirmInvite,
  setFirmMemberRole,
  transferFirmOwnership,
} from "@/lib/precog/firm/server";
import type {
  FirmContext,
  FirmInvite,
  FirmMember,
  FirmRole,
  InviteRole,
} from "@/lib/precog/firm/store";
import type { MovedBusiness } from "@/lib/precog/business-store";
import { formatDay } from "@/lib/precog/dates";
import { fieldCls } from "@/components/ui/field-classes";

const ROLE_LABEL: Record<FirmRole, string> = {
  owner: "Owner",
  preparer: "Preparer",
  reviewer: "Reviewer",
};

/**
 * Who is in the firm and in which role. The owner invites by email (the app
 * sends the link when email is connected; otherwise the owner copies it and
 * sends it), changes roles and removes members; a member can leave.
 */
export function FirmMembers({
  firm,
  members,
  invites,
  onChange,
}: {
  firm: FirmContext;
  members: FirmMember[];
  invites: FirmInvite[];
  onChange: (next: {
    members?: FirmMember[];
    invites?: FirmInvite[];
    left?: boolean;
    /** A member was removed: who, and the client businesses handed to the owner. */
    removed?: { name: string; moved: MovedBusiness[] };
    /** The firm changed owner: the caller's firm as it now stands (they are a reviewer). */
    firm?: FirmContext | null;
  }) => void;
}) {
  const owner = firm.role === "owner";
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<InviteRole>("preparer");
  const [busy, setBusy] = useState(false);

  function inviteLink(token: string): string {
    return `${window.location.origin}/join/${token}`;
  }

  async function copyLink(token: string) {
    try {
      await navigator.clipboard.writeText(inviteLink(token));
      toast.success("Invitation link copied. Send it to the firm member you are inviting.");
    } catch {
      window.prompt("Copy this invitation link:", inviteLink(token));
    }
  }

  async function invite() {
    setBusy(true);
    try {
      const { invite: created, emailed } = await inviteFirmMember({
        data: { email: email.trim(), role },
      });
      onChange({ invites: [created, ...invites.filter((i) => i.email !== created.email)] });
      setEmail("");
      if (emailed) toast.success(`We emailed the invitation to ${created.email}.`);
      else await copyLink(created.token);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Precog did not create the invitation.");
    } finally {
      setBusy(false);
    }
  }

  async function revoke(token: string) {
    try {
      await revokeFirmInvite({ data: { token } });
      onChange({ invites: invites.filter((i) => i.token !== token) });
    } catch {
      toast.error("Precog did not revoke the invitation.");
    }
  }

  async function changeRole(userId: string, next: InviteRole) {
    try {
      const res = await setFirmMemberRole({ data: { userId, role: next } });
      onChange({ members: res.members });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Precog did not change the role.");
    }
  }

  async function remove(userId: string, name: string) {
    if (
      !window.confirm(
        `Remove ${name} from ${firm.name}? They lose access to the firm's clients, their share links to those clients stop working, and the client businesses they set up stay with the firm under your account.`,
      )
    )
      return;
    try {
      const res = await removeFirmMember({ data: { userId } });
      onChange({ members: res.members, removed: { name, moved: res.moved } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Precog did not remove the member.");
    }
  }

  async function makeOwner(userId: string, name: string) {
    if (
      !window.confirm(
        `Make ${name} the owner of ${firm.name}? They take the firm's clients, members, invitations and billing, and you stay on as a reviewer. Stripe's receipts and payment emails go to them from now on, and owner reminders for the firm's clients follow their settings. You cannot undo this.`,
      )
    )
      return;
    try {
      const res = await transferFirmOwnership({ data: { userId } });
      toast.success(`${name} now owns ${firm.name}.`);
      onChange({ firm: res.firm, members: res.members });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Precog did not change the firm's owner.");
    }
  }

  async function leave() {
    if (
      !window.confirm(
        `Leave ${firm.name}? You lose access to the firm's clients, your share links to those clients stop working, and the client businesses you set up stay with the firm. Businesses you kept outside the firm stay yours.`,
      )
    )
      return;
    try {
      await leaveFirm();
      onChange({ left: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not leave the firm.");
    }
  }

  return (
    <section className="rounded-xl border border-border bg-surface p-4">
      <h2 className="text-lg font-semibold">People at the firm</h2>
      <p className="mt-1 text-sm text-muted">
        A preparer maps clients, records monthly review results and control checks, and locks
        reports. A reviewer does the same, reviews control checks, and reviews for issuance reports
        that someone else prepared. Every member sees every client of the firm. Only the owner
        deletes or restores a client, invites and removes members, and hands the firm to a
        colleague.
      </p>
      <ul className="mt-3 divide-y divide-border">
        {members.map((m) => (
          <li
            key={m.userId}
            className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
          >
            <div className="min-w-0">
              <p className="font-medium">{m.name || m.email}</p>
              <p className="text-xs text-muted">
                {m.email} · joined {formatDay(m.joinedAt)}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {owner && m.role !== "owner" ? (
                <select
                  className={fieldCls}
                  value={m.role}
                  onChange={(e) => void changeRole(m.userId, e.target.value as InviteRole)}
                  aria-label={`Role for ${m.name || m.email}`}
                >
                  <option value="preparer">Preparer</option>
                  <option value="reviewer">Reviewer</option>
                </select>
              ) : (
                <span className="rounded-md border border-border px-2 py-1 text-xs">
                  {ROLE_LABEL[m.role]}
                </span>
              )}
              {owner && m.role !== "owner" && (
                <>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-elevated"
                    aria-label={`Make ${m.name || m.email} the owner`}
                    onClick={() => void makeOwner(m.userId, m.name || m.email)}
                  >
                    <Crown className="size-3.5" aria-hidden /> Make owner
                  </button>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-elevated"
                    aria-label={`Remove ${m.name || m.email}`}
                    onClick={() => void remove(m.userId, m.name || m.email)}
                  >
                    <UserMinus className="size-3.5" aria-hidden /> Remove
                  </button>
                </>
              )}
            </div>
          </li>
        ))}
      </ul>

      {owner ? (
        <>
          <form
            className="mt-4 flex flex-wrap items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void invite();
            }}
          >
            <label className="min-w-[14rem] flex-1 text-xs text-muted">
              Firm member's email
              <input
                className={`${fieldCls} mt-1 w-full`}
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="associate@firm.com"
              />
            </label>
            <label className="text-xs text-muted">
              Role
              <select
                className={`${fieldCls} mt-1 block`}
                value={role}
                onChange={(e) => setRole(e.target.value as InviteRole)}
              >
                <option value="preparer">Preparer</option>
                <option value="reviewer">Reviewer</option>
              </select>
            </label>
            <Button type="submit" size="sm" disabled={busy}>
              Create invitation
            </Button>
          </form>
          <p className="mt-1 text-xs text-subtle">
            We email the link when email is connected; otherwise we copy it and you send it. It
            works once, for two weeks.
          </p>
          {invites.length > 0 && (
            <ul className="mt-3 divide-y divide-border">
              {invites.map((i) => (
                <li
                  key={i.token}
                  className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
                >
                  <div>
                    <p>
                      {i.email} · {ROLE_LABEL[i.role]}
                    </p>
                    <p className="text-xs text-muted">Open until {i.expiresAt.slice(0, 10)}</p>
                  </div>
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-elevated"
                      aria-label={`Copy the invitation link for ${i.email}`}
                      onClick={() => void copyLink(i.token)}
                    >
                      <Copy className="size-3.5" aria-hidden /> Copy link
                    </button>
                    <button
                      type="button"
                      className="rounded-md border border-border px-2 py-1 text-xs hover:bg-elevated"
                      aria-label={`Revoke the invitation for ${i.email}`}
                      onClick={() => void revoke(i.token)}
                    >
                      Revoke
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <p className="mt-3 text-sm">
          You are a {ROLE_LABEL[firm.role].toLowerCase()} at {firm.name}.{" "}
          <button
            type="button"
            className="text-primary underline-offset-4 hover:underline"
            onClick={() => void leave()}
          >
            Leave the firm
          </button>
        </p>
      )}
    </section>
  );
}
