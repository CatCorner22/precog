/* eslint-disable react-refresh/only-export-components -- the texts and the confirm prompt next to the card are tested on their own */
import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { formatDay } from "@/lib/precog/dates";
import {
  ENGAGEMENT_SCOPE_MAX,
  type EngagementRecord,
  type EngagementStatus,
} from "@/lib/precog/firm/engagement-row";
import {
  getEngagement,
  saveEngagement,
  setEngagementStatus,
} from "@/lib/precog/firm/engagement-server";
import type { FirmMember } from "@/lib/precog/firm/store";

export const ENGAGEMENT_HEADING = "Engagement";
export const SCOPE_LABEL = "Scope";
export const PERIOD_FROM_LABEL = "Period from";
export const PERIOD_TO_LABEL = "Period to";
export const PREPARER_LABEL = "Preparer";
export const REVIEWER_LABEL = "Reviewer";
export const NOT_SET = "Not set";
export const SAVE_ENGAGEMENT = "Save engagement";
export const END_ENGAGEMENT = "End engagement";
export const REOPEN_ENGAGEMENT = "Reopen engagement";
export const ENGAGEMENT_SAVED = "Engagement saved.";
export const ENGAGEMENT_ENDED_TOAST = "Engagement ended.";
export const ENGAGEMENT_REOPENED = "Engagement reopened.";
/** The toast when a save fails with no message of its own. */
export const ENGAGEMENT_NOT_SAVED = "Precog did not save the engagement.";

/** "Status: Active", or "Status: Ended on Oct 4, 2026". */
export function engagementStatusText(e: Pick<EngagementRecord, "status" | "endedAt">): string {
  return e.status === "ended"
    ? e.endedAt
      ? `Status: Ended on ${formatDay(e.endedAt)}`
      : "Status: Ended"
    : "Status: Active";
}

/** The question before ending; reversible, so not the irreversible warning. */
export function endEngagementPrompt(business: string): string {
  return `End the engagement with ${business}? The firm's members can then read its map, Monthly review and locked versions but not change them, until the firm owner reopens it.`;
}

const EMPTY: EngagementRecord = {
  scope: "",
  periodStart: null,
  periodEnd: null,
  status: "active",
  endedAt: null,
  preparerUserId: null,
  reviewerUserId: null,
};

interface FormProps {
  businessName: string;
  members: readonly FirmMember[];
  isOwner: boolean;
  engagement: EngagementRecord;
  busy?: boolean;
  onSave?: (next: EngagementRecord) => void;
  onStatus?: (status: EngagementStatus) => void;
}

/** The engagement fields of the open client; inputs are disabled while it has ended. */
export function EngagementForm({
  businessName,
  members,
  isOwner,
  engagement,
  busy = false,
  onSave,
  onStatus,
}: FormProps) {
  const [draft, setDraft] = useState(engagement);
  useEffect(() => setDraft(engagement), [engagement]);
  const ended = engagement.status === "ended";
  const input = "mt-1 w-full rounded-md border border-border bg-bg px-2 py-1.5 text-sm text-fg";

  function memberSelect(
    label: string,
    value: string | null,
    set: (id: string | null) => void,
  ): ReactNode {
    return (
      <label className="block text-xs text-muted">
        {label}
        <select
          className={input}
          value={value ?? ""}
          disabled={ended}
          onChange={(e) => set(e.target.value || null)}
        >
          <option value="">{NOT_SET}</option>
          {members.map((m) => (
            <option key={m.userId} value={m.userId}>
              {m.name || m.email}
            </option>
          ))}
        </select>
      </label>
    );
  }

  return (
    <form
      className="mt-4 space-y-3 border-t border-border pt-4"
      aria-label={ENGAGEMENT_HEADING}
      onSubmit={(e) => {
        e.preventDefault();
        onSave?.(draft);
      }}
    >
      <h3 className="text-base font-semibold">{ENGAGEMENT_HEADING}</h3>
      <p className="text-sm" role="status">
        {engagementStatusText(engagement)}
      </p>
      <label className="block text-xs text-muted">
        {SCOPE_LABEL}
        <textarea
          className={input}
          rows={3}
          maxLength={ENGAGEMENT_SCOPE_MAX}
          disabled={ended}
          value={draft.scope}
          onChange={(e) => setDraft({ ...draft, scope: e.target.value })}
        />
        <span className="mt-0.5 block text-right">
          {draft.scope.length}/{ENGAGEMENT_SCOPE_MAX}
        </span>
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-xs text-muted">
          {PERIOD_FROM_LABEL}
          <input
            type="date"
            className={input}
            disabled={ended}
            value={draft.periodStart ?? ""}
            onChange={(e) => setDraft({ ...draft, periodStart: e.target.value || null })}
          />
        </label>
        <label className="block text-xs text-muted">
          {PERIOD_TO_LABEL}
          <input
            type="date"
            className={input}
            disabled={ended}
            value={draft.periodEnd ?? ""}
            onChange={(e) => setDraft({ ...draft, periodEnd: e.target.value || null })}
          />
        </label>
        {memberSelect(PREPARER_LABEL, draft.preparerUserId, (id) =>
          setDraft({ ...draft, preparerUserId: id }),
        )}
        {memberSelect(REVIEWER_LABEL, draft.reviewerUserId, (id) =>
          setDraft({ ...draft, reviewerUserId: id }),
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" disabled={ended || busy}>
          {SAVE_ENGAGEMENT}
        </Button>
        {isOwner &&
          (ended ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => onStatus?.("active")}
            >
              {REOPEN_ENGAGEMENT}
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => {
                if (window.confirm(endEngagementPrompt(businessName))) onStatus?.("ended");
              }}
            >
              {END_ENGAGEMENT}
            </Button>
          ))}
      </div>
    </form>
  );
}

/**
 * The open client's engagement on the firm page. Loads after sign-in only,
 * and shows nothing for a business with no firm or when the load fails.
 */
export function EngagementCard({
  businessId,
  businessName,
  members,
  isOwner,
}: {
  businessId: string;
  businessName: string;
  members: readonly FirmMember[];
  isOwner: boolean;
}) {
  const [engagement, setEngagement] = useState<EngagementRecord | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancel = false;
    setEngagement(null);
    void getEngagement({ data: { businessId } })
      .then((res) => {
        if (!cancel && res.firmClient) setEngagement(res.engagement ?? EMPTY);
      })
      .catch(() => undefined);
    return () => {
      cancel = true;
    };
  }, [businessId]);

  if (!engagement) return null;

  async function run(work: () => Promise<{ engagement: EngagementRecord }>, done: string) {
    setBusy(true);
    try {
      setEngagement((await work()).engagement);
      toast.success(done);
    } catch (err) {
      toast.error(err instanceof Error && err.message ? err.message : ENGAGEMENT_NOT_SAVED);
    } finally {
      setBusy(false);
    }
  }

  return (
    <EngagementForm
      businessName={businessName}
      members={members}
      isOwner={isOwner}
      engagement={engagement}
      busy={busy}
      onSave={(next) =>
        void run(
          () =>
            saveEngagement({
              data: {
                businessId,
                scope: next.scope,
                periodStart: next.periodStart,
                periodEnd: next.periodEnd,
                preparerUserId: next.preparerUserId,
                reviewerUserId: next.reviewerUserId,
              },
            }),
          ENGAGEMENT_SAVED,
        )
      }
      onStatus={(status) =>
        void run(
          () => setEngagementStatus({ data: { businessId, status } }),
          status === "ended" ? ENGAGEMENT_ENDED_TOAST : ENGAGEMENT_REOPENED,
        )
      }
    />
  );
}
