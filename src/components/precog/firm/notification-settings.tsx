import { useEffect, useState } from "react";
import { toast } from "sonner";
import { getNotificationSettings, updateNotificationSettings } from "@/lib/precog/firm/server";
import type { NotificationSettings } from "@/lib/precog/firm/store";

/** The two switches behind the reminder emails. */
export function NotificationSettingsPanel({ signedIn }: { signedIn: boolean }) {
  const [settings, setSettings] = useState<NotificationSettings | null>(null);

  useEffect(() => {
    if (!signedIn) return;
    let cancel = false;
    void getNotificationSettings()
      .then((res) => {
        if (!cancel) setSettings(res.settings);
      })
      .catch(() => undefined);
    return () => {
      cancel = true;
    };
  }, [signedIn]);

  if (!signedIn || !settings) return null;

  async function save(next: NotificationSettings) {
    setSettings(next);
    try {
      await updateNotificationSettings({ data: next });
    } catch {
      toast.error("The reminder settings were not saved.");
    }
  }

  return (
    <section className="rounded-xl border border-border bg-surface p-4">
      <h2 className="text-lg font-semibold">Reminders</h2>
      <p className="mt-1 text-sm text-muted">
        Once a week, what is due across your clients arrives by email: decisions past their review
        date, leavers whose logins are not confirmed gone, leave with nobody named to cover, and the
        monthly review still open. Each item is announced once.
      </p>
      <div className="mt-3 space-y-2 text-sm">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={settings.weeklyDigest}
            onChange={(e) => void save({ ...settings, weeklyDigest: e.target.checked })}
          />
          Send me the weekly digest
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={settings.ownerReminders}
            onChange={(e) => void save({ ...settings, ownerReminders: e.target.checked })}
          />
          Also remind each client's owner at the address on their card
        </label>
      </div>
    </section>
  );
}
