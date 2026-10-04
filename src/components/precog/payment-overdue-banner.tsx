/* eslint-disable react-refresh/only-export-components -- the notice next to the loader is tested on its own */
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle } from "lucide-react";
import { getEntitlements, type EntitlementsAnswer } from "@/lib/precog/firm/entitlements-server";
import { openBillingPortal } from "@/lib/precog/billing/server";
import { buttonClass } from "@/components/ui/button-variants";

/**
 * The failed-payment notice for the firm owner and every member, on the
 * home page and the firm page: while the grace runs, when it closes, and
 * when the start is unknown. Mounted only for a signed-in viewer (its one
 * read answers 401 to anyone else) and shows nothing while the plan is in
 * good standing.
 */
export function PaymentOverdueBanner({ variant }: { variant: "home" | "firm" }) {
  const [answer, setAnswer] = useState<EntitlementsAnswer | null>(null);
  useEffect(() => {
    let cancel = false;
    void getEntitlements()
      .then((res) => {
        if (!cancel) setAnswer(res);
      })
      .catch(() => undefined);
    return () => {
      cancel = true;
    };
  }, []);
  if (!answer) return null;
  return <PaymentOverdueNotice entitlements={answer} variant={variant} onFix={fixPayment} />;
}

/** Opens Manage billing; a failure says so and leaves the notice up. */
export async function fixPayment(): Promise<void> {
  try {
    const { url } = await openBillingPortal();
    window.location.href = url;
  } catch (err) {
    toast.error(err instanceof Error ? err.message : "Precog could not open the billing portal.");
  }
}

/** What the notice says, by who reads it and where the episode stands; null in good standing. */
export function overdueNotice(
  e: Pick<
    EntitlementsAnswer,
    "pastDueSince" | "graceEndsAt" | "closedAt" | "isOwner" | "firmOwnerName"
  >,
): { text: string; action: "fix" | "ask" } | null {
  if (!e.pastDueSince && !e.closedAt) return null;
  const owner = e.firmOwnerName ?? "the firm owner";
  const ask = `Ask ${owner} to fix it in Manage billing.`;
  if (e.closedAt) {
    const closed = `The Firm plan closed on ${day(e.closedAt)} because the payment failed. The QuickBooks link, new locked report versions, member invitations and owner reminder emails are closed until it is fixed; the Monthly review and every locked version you already hold stay open.`;
    return e.isOwner
      ? { text: closed, action: "fix" }
      : { text: `${closed} ${ask}`, action: "ask" };
  }
  const since = e.pastDueSince ? day(e.pastDueSince) : "";
  if (e.isOwner) {
    return {
      text: e.graceEndsAt
        ? `Your Firm plan's card payment failed on ${since}. Precog keeps the plan open until ${day(e.graceEndsAt)}; fix the payment in Manage billing before then.`
        : `Your Firm plan's card payment failed on ${since}. Precog keeps the plan open while Stripe retries the card; fix the payment in Manage billing.`,
      action: "fix",
    };
  }
  return {
    text: e.graceEndsAt
      ? `The firm's card payment failed on ${since}. Precog keeps the Firm plan open until ${day(e.graceEndsAt)}. ${ask}`
      : `The firm's card payment failed on ${since}. Precog keeps the Firm plan open while Stripe retries the card. ${ask}`,
    action: "ask",
  };
}

export function PaymentOverdueNotice({
  entitlements,
  variant,
  onFix,
}: {
  entitlements: Parameters<typeof overdueNotice>[0];
  variant: "home" | "firm";
  onFix: () => void;
}) {
  const notice = overdueNotice(entitlements);
  if (!notice) return null;
  return (
    <div
      role="region"
      aria-label="Firm plan payment"
      className={
        variant === "home"
          ? "mx-auto flex max-w-7xl flex-wrap items-center gap-2 px-4 pb-2 text-sm sm:px-6"
          : "flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface p-4 text-sm"
      }
    >
      <AlertTriangle className="size-4 shrink-0 text-muted" aria-hidden />
      <span className="min-w-0 flex-1">{notice.text}</span>
      {notice.action === "fix" && (
        <button
          type="button"
          className={buttonClass({ size: "sm", variant: "secondary" })}
          onClick={onFix}
        >
          Fix payment
        </button>
      )}
    </div>
  );
}

function day(stamp: string): string {
  return stamp.slice(0, 10);
}
