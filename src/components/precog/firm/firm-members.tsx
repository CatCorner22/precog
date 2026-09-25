import { useState } from "react";
import { toast } from "sonner";
import { Copy, UserMinus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  inviteFirmMember,
  leaveFirm,
  removeFirmMember,
  revokeFirmInvite,
  setFirmMemberRole,
} from "@/lib/precog/firm/server";
import type { FirmContext, FirmInvite, FirmMember, FirmRole } from "@/lib/precog/firm/store";

const ROLE_LABEL: Record<FirmRole, string> = {
  owner: "Owner",
  preparer: "Preparer",
  reviewer: "Reviewer",
};

const inputCls =
  "rounded-md border border-border bg-bg px-2 py-1.5 text-sm text-fg placeholder:text-subtle";

/**
 * Who is in the firm and in which role. The owner invites by email (the link
 * is copied here and sent by the owner), changes roles and removes members;
 * a member can leave.
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
  onChange: (next: { members?: FirmMember[]; invites?: FirmInvite[]; left?: boolean }) => void;
}) {
  const owner = firm.role === "owner";
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Exclude<FirmRole, "owner">>("preparer");
  const [busy, setBusy] = useState(false);

  function inviteLink(token: string): string {
    return `${window.location.origin}/join/${token}`;
  }

  async function copyLink(token: string) {
    try {
      await navigator.clipboard.writeText(inviteLink(token));
      toast.success("Invitation link copied. Send it to your colleague.");
    } catch {
      window.prompt("Copy this invitation link:", inviteLink(token));
    }
  }

  async function invite() {
    setBusy(true);
    try {
      const { invite: created } = await inviteFirmMember({ data: { email: email.trim(), role } });
      onChange({ invites: [created, ...invites] });
      setEmail("");
      await copyLink(created.token);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "The invitation was not created.");
    } finally {
      setBusy(false);
    }
  }

  async function revoke(token: string) {
    try {
      await revokeFirmInvite({ data: { token } });
      onChange({ invites: invites.filter((i) => i.token !== token) });
    } catch {
      toast.error("The invitation was not revoked.");
    }
  }

  async function changeRole(userId: string, next: Exclude<FirmRole, "owner">) {
    try {
      const res = await setFirmMemberRole({ data: { userId, role: next } });
      onChange({ members: res.members });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "The role was not changed.");
    }
  }

  async function remove(userId: string, name: string) {
    if (!window.confirm(`Remove ${name} from ${firm.name}? Their own businesses stay theirs.`))
      return;
    try {
      const res = await removeFirmMember({ data: { userId } });
      onChange({ members: res.members });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "The member was not removed.");
    }
  }

  async function leave() {
    if (!window.confirm(`Leave ${firm.name}? You keep your own businesses.`)) return;
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
        A preparer maps clients, records reviews and locks reports. A reviewer does the same and
        signs off reports prepared by someone else. Every member sees every client of the firm.
      </p>
      <ul className="mt-3 divide-y divide-border">
        {members.map((m) => (
          <li
            key={m.userId}
            className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
          >
            <div className="min-w-0">
              <p className="font-medium">{m.name || m.email}</p>
              <p className="text-xs text-muted">{m.email}</p>
            </div>
            <div className="flex items-center gap-2">
              {owner && m.role !== "owner" ? (
                <select
                  className={inputCls}
                  value={m.role}
                  onChange={(e) =>
                    void changeRole(m.userId, e.target.value as Exclude<FirmRole, "owner">)
                  }
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
                <button
                  type="button"
                  className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-elevated"
                  onClick={() => void remove(m.userId, m.name || m.email)}
                >
                  <UserMinus className="size-3.5" aria-hidden /> Remove
                </button>
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
              Colleague's email
              <input
                className={`${inputCls} mt-1 w-full`}
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
                className={`${inputCls} mt-1 block`}
                value={role}
                onChange={(e) => setRole(e.target.value as Exclude<FirmRole, "owner">)}
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
            The link is copied for you to send; it works for two weeks and once.
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
                      onClick={() => void copyLink(i.token)}
                    >
                      <Copy className="size-3.5" aria-hidden /> Copy link
                    </button>
                    <button
                      type="button"
                      className="rounded-md border border-border px-2 py-1 text-xs hover:bg-elevated"
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
