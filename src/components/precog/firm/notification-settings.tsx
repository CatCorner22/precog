import { useEffect, useState } from "react";
import { toast } from "sonner";
import { getNotificationSettings, updateNotificationSettings } from "@/lib/precog/firm/server";
import type { NotificationSettings } from "@/lib/precog/firm/store";

/**
 * The two switches behind the reminder emails. On a deployment that cannot
 * send email the switches are shown off and disabled, with the reason.
 */
export function NotificationSettingsPanel({ signedIn }: { signedIn: boolean }) {
  const [state, setState] = useState<{
    settings: NotificationSettings;
    mailConfigured: boolean;
    controlsOwnerReminders: boolean;
  } | null>(null);

  useEffect(() => {
    if (!signedIn) return;
    let cancel = false;
    void getNotificationSettings()
      .then((res) => {
        if (!cancel) setState(res);
      })
      .catch(() => undefined);
    return () => {
      cancel = true;
    };
  }, [signedIn]);

  if (!signedIn || !state) return null;
  const { settings, mailConfigured, controlsOwnerReminders } = state;

  async function save(next: NotificationSettings) {
    const previous = settings;
    setState((cur) => (cur ? { ...cur, settings: next } : cur));
    try {
      await updateNotificationSettings({ data: next });
    } catch {
      setState((cur) => (cur ? { ...cur, settings: previous } : cur));
      toast.error("Precog did not save the reminder settings.");
    }
  }

  return (
    <section className="rounded-xl border border-border bg-surface p-4">
      <h2 className="text-lg font-semibold">Reminders</h2>
      <p className="mt-1 text-sm text-muted">
        Once a week, what is due across your clients arrives by email: decisions past their review
        date, people who have left whose logins are not yet confirmed removed, leave with nobody
        named to cover, and the monthly review still open. We announce each item once.
      </p>
      {!mailConfigured && (
        <p className="mt-2 text-sm text-warn">
          Email is not connected on this deployment, so no reminders go out.
        </p>
      )}
      <div className="mt-3 space-y-2 text-sm">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={mailConfigured && settings.weeklyDigest}
            disabled={!mailConfigured}
            onChange={(e) => void save({ ...settings, weeklyDigest: e.target.checked })}
          />
          Send me the weekly digest
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={mailConfigured && settings.ownerReminders}
            disabled={!mailConfigured}
            onChange={(e) => void save({ ...settings, ownerReminders: e.target.checked })}
          />
          Remind each client's owner at the confirmed address on their card
        </label>
      </div>
      <p className="mt-2 text-xs text-muted">
        {controlsOwnerReminders
          ? "Owner reminders go out whether or not you get the weekly digest."
          : "For the firm's clients, the firm owner's setting decides whether owners get reminders. Yours counts only for businesses you keep outside the firm."}
      </p>
    </section>
  );
}
