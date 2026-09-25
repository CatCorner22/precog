import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { LegalFooter } from "@/components/precog/legal-footer";
import { MonthlyReview } from "@/components/precog/monthly-review";
import { AccessReconcile } from "@/components/precog/access-reconcile";
import { FirmMembers } from "@/components/precog/firm/firm-members";
import { FirmBilling } from "@/components/precog/firm/firm-billing";
import { ClientList } from "@/components/precog/firm/client-list";
import { ClientHistory } from "@/components/precog/firm/client-history";
import { QuickBooksPanel } from "@/components/precog/firm/quickbooks-panel";
import { NotificationSettingsPanel } from "@/components/precog/firm/notification-settings";
import { usePractice } from "@/lib/precog/practice-context";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { detectSodConflicts } from "@/lib/precog/sod/detect";
import { advanceEngagement, isOwnTeam, pilotMetrics } from "@/lib/precog/firm/engagement";
import type { FirmPlan } from "@/lib/precog/firm/pricing";
import {
  getFirm,
  listDeletedClients,
  listFirmClients,
  recordEngagement,
  saveFirmProfile,
} from "@/lib/precog/firm/server";
import { getBillingStatus } from "@/lib/precog/billing/server";
import type { BillingAccount } from "@/lib/precog/firm/billing-store";
import type {
  ClientEngagementRow,
  FirmContext,
  FirmInvite,
  FirmMember,
} from "@/lib/precog/firm/store";
import type { DeletedBusinessRow } from "@/lib/precog/business-store";

export const Route = createFileRoute("/firm")({
  component: FirmPage,
  validateSearch: (search: Record<string, unknown>): { billing?: string; quickbooks?: string } => ({
    ...(typeof search.billing === "string" ? { billing: search.billing } : {}),
    ...(typeof search.quickbooks === "string" ? { quickbooks: search.quickbooks } : {}),
  }),
  head: () => ({
    meta: [
      { title: "Firm workspace · Precog Pioneer" },
      {
        name: "description",
        content:
          "Advisor workspace: firm members and roles, client list, plan and billing, reminders, change history and accounting connections.",
      },
    ],
  }),
});

const QUICKBOOKS_MESSAGE: Record<string, string> = {
  connected: "QuickBooks is connected. Read the books now to take the first reading.",
  declined: "The QuickBooks connection was declined.",
  invalid: "The QuickBooks connection link was not valid. Start again from this page.",
  failed: "QuickBooks did not complete the connection. Try again.",
  "not-configured": "QuickBooks is not available on this deployment.",
};

function FirmPage() {
  const { user, isPending } = useCurrentUserState();
  const { profile, template, replaceProfile, switchBusiness } = usePractice();
  const search = Route.useSearch();
  const [firm, setFirm] = useState<FirmContext | null>(null);
  const [members, setMembers] = useState<FirmMember[]>([]);
  const [invites, setInvites] = useState<FirmInvite[]>([]);
  const [billing, setBilling] = useState<BillingAccount | null>(null);
  const [billingConfigured, setBillingConfigured] = useState(false);
  const [name, setName] = useState("");
  const [clients, setClients] = useState<ClientEngagementRow[]>([]);
  const [deleted, setDeleted] = useState<DeletedBusinessRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const signedIn = Boolean(user) && !isPending;

  const own = isOwnTeam(profile);
  const metrics = useMemo(() => {
    const openFindings = own ? detectSodConflicts(template, profile.staff).conflicts.length : 0;
    return pilotMetrics({
      engagement: profile.engagement,
      openFindings,
      decisions: profile.decisions,
    });
  }, [own, template, profile.staff, profile.engagement, profile.decisions]);

  useEffect(() => {
    const next = advanceEngagement(profile.engagement, {
      now: new Date().toISOString(),
      people: profile.customPeople,
      ownTeam: own,
    });
    if (!next || next === profile.engagement) return;
    if (
      next.startedAt === profile.engagement?.startedAt &&
      next.mapCompletedAt === profile.engagement?.mapCompletedAt &&
      next.reportSentAt === profile.engagement?.reportSentAt
    ) {
      return;
    }
    replaceProfile({ ...profile, engagement: next });
  }, [own, profile, replaceProfile]);

  useEffect(() => {
    if (search.billing === "success")
      toast.success("Payment received. The plan updates once the payment provider confirms it.");
    if (search.billing === "cancelled") toast("Checkout was cancelled.");
    if (search.quickbooks && QUICKBOOKS_MESSAGE[search.quickbooks]) {
      const message = QUICKBOOKS_MESSAGE[search.quickbooks];
      if (search.quickbooks === "connected") toast.success(message);
      else toast.error(message);
    }
  }, [search.billing, search.quickbooks]);

  useEffect(() => {
    if (isPending) return;
    if (!user) {
      setLoaded(true);
      return;
    }
    let cancel = false;
    void (async () => {
      try {
        const [firmRes, clientRes, deletedRes, billingRes] = await Promise.all([
          getFirm(),
          listFirmClients(),
          listDeletedClients(),
          getBillingStatus().catch(() => null),
        ]);
        if (cancel) return;
        setFirm(firmRes.firm);
        setMembers(firmRes.members);
        setInvites(firmRes.invites);
        setBilling(billingRes?.account ?? firmRes.billing);
        setBillingConfigured(billingRes?.configured ?? false);
        setName(firmRes.firm?.name ?? "");
        setClients(clientRes.clients);
        setDeleted(deletedRes.deleted);
      } catch {
        if (!cancel) toast.error("The firm workspace could not be loaded.");
      } finally {
        if (!cancel) setLoaded(true);
      }
    })();
    return () => {
      cancel = true;
    };
  }, [user, isPending]);

  useEffect(() => {
    if (!user || !profile.businessId || !own) return;
    void recordEngagement({
      data: {
        businessId: profile.businessId,
        startedAt: profile.engagement?.startedAt ?? null,
        mapCompletedAt: profile.engagement?.mapCompletedAt ?? null,
        reportSentAt: profile.engagement?.reportSentAt ?? null,
        openFindings: metrics.openFindings,
        acceptedFindings: metrics.acceptedFindings,
      },
    }).catch(() => undefined);
  }, [
    user,
    own,
    profile.businessId,
    profile.engagement?.startedAt,
    profile.engagement?.mapCompletedAt,
    profile.engagement?.reportSentAt,
    metrics.openFindings,
    metrics.acceptedFindings,
  ]);

  async function saveFirm(plan: FirmPlan) {
    try {
      const saved = await saveFirmProfile({ data: { name: name.trim(), plan } });
      setFirm(saved.firm);
      if (!firm) {
        const [firmRes, clientRes] = await Promise.all([getFirm(), listFirmClients()]);
        setMembers(firmRes.members);
        setInvites(firmRes.invites);
        setClients(clientRes.clients);
      }
      toast.success(firm ? "Firm saved." : "Firm created. Your businesses are now its clients.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "The firm was not saved.");
    }
  }

  const activeId = profile.businessId ?? "biz_default";
  const isOwner = firm?.role === "owner";

  return (
    <main className="mx-auto min-h-[calc(100dvh-var(--grok-banner-h,0px))] max-w-3xl px-6 py-8">
      <p className="text-xs font-semibold tracking-[0.2em] text-muted uppercase">
        Advisor workspace
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">{firm?.name || "Firm"}</h1>
      <p className="mt-2 text-sm text-muted">
        One firm, its people, and each client kept apart. The open business is the one the review,
        import, history and accounting panels below work on; other clients open from the list.
      </p>

      <section className="mt-6 rounded-xl border border-border bg-surface p-4">
        <h2 className="text-lg font-semibold">{firm ? "Firm name" : "Set up the firm"}</h2>
        {isPending || !loaded ? (
          <p className="mt-3 text-sm text-muted">Loading the account…</p>
        ) : !user ? (
          <p className="mt-3 text-sm">
            <Link to="/login" className="underline-offset-4 hover:underline">
              Sign in
            </Link>{" "}
            to keep a firm, invite colleagues and hold a client list. The review below still works
            on this device.
          </p>
        ) : firm && !isOwner ? (
          <p className="mt-3 text-sm text-muted">
            You work at {firm.name} as a {firm.role}. The owner sets the name and plan.
          </p>
        ) : (
          <form
            className="mt-3 flex flex-wrap items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void saveFirm(firm?.plan ?? "assessment");
            }}
          >
            <label className="min-w-[16rem] flex-1 text-xs text-muted">
              Firm name on reports
              <input
                className="mt-1 w-full rounded-md border border-border bg-bg px-2 py-1.5 text-sm text-fg"
                value={name}
                onChange={(e) => setName(e.target.value)}
                aria-label="Firm name"
                required
              />
            </label>
            <button
              type="submit"
              className="rounded-md border border-border px-3 py-2 text-sm hover:bg-elevated"
            >
              {firm ? "Save name" : "Create the firm"}
            </button>
          </form>
        )}
      </section>

      {signedIn && firm && (
        <div className="mt-4 space-y-4">
          <FirmBilling
            plan={firm.plan}
            billing={billing}
            billingConfigured={billingConfigured}
            canManage={isOwner}
            onMarkPlan={saveFirm}
          />
          <FirmMembers
            firm={firm}
            members={members}
            invites={invites}
            onChange={(next) => {
              if (next.left) {
                setFirm(null);
                setMembers([]);
                setInvites([]);
                toast.success("You left the firm.");
                return;
              }
              if (next.members) setMembers(next.members);
              if (next.invites) setInvites(next.invites);
            }}
          />
        </div>
      )}

      <section className="mt-4 rounded-xl border border-border bg-surface p-4">
        <h2 className="text-lg font-semibold">This client</h2>
        <p className="mt-1 text-sm text-muted">{profile.practiceName}</p>
        {!own && (
          <p className="mt-2 text-sm text-muted">
            This is still a sample business. Pilot timing starts when you finish setup with your own
            team.
          </p>
        )}
        <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <Metric
            label="Hours to a complete map"
            value={metrics.hoursToMap === null ? "—" : String(metrics.hoursToMap)}
          />
          <Metric
            label="Findings accepted"
            value={
              metrics.acceptanceRate === null ? "—" : `${Math.round(metrics.acceptanceRate * 100)}%`
            }
          />
          <Metric label="Open conflicts" value={String(metrics.openFindings)} />
          <Metric label="Report sent" value={metrics.reportSent ? "Yes" : "Not yet"} />
        </dl>
      </section>

      {signedIn && (
        <div className="mt-4 space-y-4">
          <ClientList
            clients={clients}
            deleted={deleted}
            activeId={activeId}
            onOpen={(id) => void switchBusiness(id)}
            onRestored={(id) => {
              setDeleted((cur) => cur.filter((d) => d.id !== id));
              void listFirmClients()
                .then((res) => setClients(res.clients))
                .catch(() => undefined);
            }}
            onClientsChange={setClients}
          />
          <NotificationSettingsPanel signedIn={signedIn} />
          <QuickBooksPanel signedIn={signedIn} />
          <ClientHistory signedIn={signedIn} />
        </div>
      )}

      <div className="mt-4 space-y-4">
        <MonthlyReview />
        <AccessReconcile />
      </div>

      <p className="mt-8 text-sm">
        <Link to="/" className="underline-offset-4 hover:underline">
          Back to the business
        </Link>
      </p>
      <LegalFooter className="mt-6" />
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-1 font-medium">{value}</dd>
    </div>
  );
}
