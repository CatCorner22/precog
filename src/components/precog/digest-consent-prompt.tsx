/* eslint-disable react-refresh/only-export-components -- the helpers next to the controls are tested on their own */
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Bell } from "lucide-react";
import { answerDigestAsk, getDigestAsk } from "@/lib/precog/reminders/digest-consent-server";
import { buttonClass } from "@/components/ui/button-variants";

export const DIGEST_ASK_QUESTION =
  "Send you a weekly note when something is due on your businesses?";
export const DIGEST_ASK_YES = "Yes, weekly";
export const DIGEST_ASK_NO = "No thanks";

/**
 * The one-line question above the tab strip, shown once per signed-in
 * account: nobody gets the weekly digest until they say yes here, on the
 * firm page or in the header. The server remembers the answer, so no
 * browser storage is involved and the question never comes back on another
 * device.
 */
export function DigestConsentPrompt() {
  const [ask, setAsk] = useState<{ asked: boolean; mailConfigured: boolean } | null>(null);
  useEffect(() => {
    let cancel = false;
    void getDigestAsk()
      .then((res) => {
        if (!cancel) setAsk(res);
      })
      .catch(() => undefined);
    return () => {
      cancel = true;
    };
  }, []);
  if (!ask) return null;
  return (
    <DigestConsentBanner
      asked={ask.asked}
      mailConfigured={ask.mailConfigured}
      onAnswer={(weeklyDigest) => answerDigest(weeklyDigest, () => setAsk({ ...ask, asked: true }))}
    />
  );
}

/** Records the answer and hides the question; a failed save keeps it up and says so. */
export async function answerDigest(weeklyDigest: boolean, hide: () => void): Promise<void> {
  try {
    await answerDigestAsk({ data: { weeklyDigest } });
    hide();
    if (weeklyDigest) toast.success("Precog will email you once a week when something is due.");
  } catch {
    toast.error("Precog did not save your answer. Try again in a moment.");
  }
}

/** The question itself; nothing when already answered or when no email can go out. */
export function DigestConsentBanner({
  asked,
  mailConfigured,
  onAnswer,
}: {
  asked: boolean;
  mailConfigured: boolean;
  onAnswer: (weeklyDigest: boolean) => void;
}) {
  if (asked || !mailConfigured) return null;
  return (
    <div
      role="region"
      aria-label="Weekly digest"
      className="mx-auto flex max-w-7xl flex-wrap items-center gap-2 px-4 pb-2 text-sm sm:px-6"
    >
      <Bell className="size-4 text-muted" aria-hidden />
      <span className="min-w-0 flex-1">{DIGEST_ASK_QUESTION}</span>
      <button
        type="button"
        onClick={() => onAnswer(true)}
        className={buttonClass({ variant: "secondary", size: "sm" })}
      >
        {DIGEST_ASK_YES}
      </button>
      <button
        type="button"
        onClick={() => onAnswer(false)}
        className={buttonClass({ variant: "ghost", size: "sm" })}
      >
        {DIGEST_ASK_NO}
      </button>
    </div>
  );
}
