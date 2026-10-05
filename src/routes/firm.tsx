import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { LegalFooter } from "@/components/precog/legal-footer";
import { Button } from "@/components/ui/button";
import { FirmMembers } from "@/components/precog/firm/firm-members";
import { removedMemberToasts } from "@/components/precog/firm/firm-members-text";
import { FirmBilling } from "@/components/precog/firm/firm-billing";
import { FirmLetterhead } from "@/components/precog/firm/firm-letterhead";
import { FirmRetention } from "@/components/precog/firm/firm-retention";
import { EngagementCard } from "@/components/precog/firm/engagement-card";
import { ClientList } from "@/components/precog/firm/client-list";
import {
  clientTableCsv,
  clientTableFileName,
  withEngagementStatus,
} from "@/components/precog/firm/client-table-csv";
import { openClientReport } from "@/components/precog/firm/open-client-report";
import { ClientHistory } from "@/components/precog/firm/client-history";
import { QuickBooksPanel } from "@/components/precog/firm/quickbooks-panel";
import { NotificationSettingsPanel } from "@/components/precog/firm/notification-settings";
import { usePractice } from "@/lib/precog/practice-context";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { detectSodConflicts, sodDetectionOptions } from "@/lib/precog/sod/detect";
import {
  advanceEngagement,
  isOwnTeam,
  pilotMetrics,
  pilotMetricsCsv,
} from "@/lib/precog/firm/engagement";
import { downloadText } from "@/lib/download";
import { partialDualReleaseCoverage } from "@/lib/precog/sod/open-findings";
import { PaymentOverdueBanner } from "@/components/precog/payment-overdue-banner";
import { getEntitlements, type EntitlementsAnswer } from "@/lib/precog/firm/entitlements-server";
import {
  closedToolsNote,
  planAmounts,
  type FirmPlan,
  type PlanPrices,
} from "@/lib/precog/firm/pricing";
import {
  getFirm,
  listDeletedClients,
  listFirmClients,
  recordEngagement,
  saveFirmProfile,
} from "@/lib/precog/firm/server";
import { getBillingStatus, getPlanPrices } from "@/lib/precog/billing/server";
import type { BillingAccount } from "@/lib/precog/firm/billing-store";
import type {
  ClientEngagementRow,
  FirmContext,
  FirmInvite,
  FirmMember,
} from "@/lib/precog/firm/store";
import type { DeletedBusinessRow } from "@/lib/precog/business-store";
import { formatPct } from "@/lib/utils";
import { DEFAULT_BUSINESS_ID } from "@/lib/precog/business-id";

export const Route = createFileRoute("/firm")({
  component: FirmPage,
  validateSearch: (search: Record<string, unknown>): { billing?: string; quickbooks?: string } => ({
    ...(typeof search.billing === "string" ? { billing: search.billing } : {}),
    ...(typeof search.quickbooks === "string" ? { quickbooks: search.quickbooks } : {}),
  }),
  head: () => ({
    meta: [
      { title: "Firm workspace · Precog" },
      {
        name: "description",
        content:
          "Firm workspace: firm members and roles, client list, plan and billing, reminders, change history and accounting connections.",
      },
    ],
  }),
});

// Loaded after the page itself, as the home screen loads them, so the firm
// workspace's first load does not carry the value proof and snapshot screens.
const ValueProofCenter = lazy(() =>
  import("@/components/precog/value-proof-center").then((module) => ({
    default: module.ValueProofCenter,
  })),
);
const AssessmentSnapshots = lazy(() =>
  import("@/components/precog/assessment-snapshots").then((module) => ({
    default: module.AssessmentSnapshots,
  })),
);

const QUICKBOOKS_MESSAGE: Record<string, string> = {
  connected: "QuickBooks is connected. Read the books now to take the first reading.",
  declined: "Someone declined the QuickBooks connection.",
  invalid: "The QuickBooks connection link was not valid. Start again from this page.",
  "signed-out": "Sign in, then connect QuickBooks again from this page.",
  "wrong-account":
    "Another Precog account started this QuickBooks connection, so Precog did not save it. Connect again from this page while signed in to your own account.",
  failed: "QuickBooks did not complete the connection. Try again.",
  "not-configured": "QuickBooks is not available on this deployment.",
};

function FirmPage() {
  const { user, isPending } = useCurrentUserState();
  const { profile, template, replaceProfile, switchBusiness } = usePractice();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const [firm, setFirm] = useState<FirmContext | null>(null);
  const [members, setMembers] = useState<FirmMember[]>([]);
  const [invites, setInvites] = useState<FirmInvite[]>([]);
  const [billing, setBilling] = useState<BillingAccount | null>(null);
  const [billingConfigured, setBillingConfigured] = useState(false);
  const [prices, setPrices] = useState<PlanPrices | null>(null);
  const [entitlements, setEntitlements] = useState<EntitlementsAnswer | null>(null);
  const [name, setName] = useState("");
  const [clients, setClients] = useState<ClientEngagementRow[]>([]);
  const [deleted, setDeleted] = useState<DeletedBusinessRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [awaitingStripe, setAwaitingStripe] = useState(false);
  const signedIn = Boolean(user) && !isPending;
  // The hook builds a new user object on every render, so the effects below
  // key on the id: keyed on the object, each answer re-ran the load.
  const userId = user?.id ?? null;

  const own = isOwnTeam(profile);
  const metrics = useMemo(() => {
    const conflicts = own
      ? detectSodConflicts(
          template,
          profile.staff,
          sodDetectionOptions(template, profile.dualRelease),
        ).conflicts
      : [];
    return pilotMetrics({
      engagement: profile.engagement,
      conflicts,
      partialCoverage: partialDualReleaseCoverage(profile.dualRelease, conflicts),
      decisions: profile.decisions,
      industry: profile.industry,
    });
  }, [
    own,
    template,
    profile.staff,
    profile.dualRelease,
    profile.engagement,
    profile.decisions,
    profile.industry,
  ]);

  useEffect(() => {
    const next = advanceEngagement(profile.engagement, {
      now: new Date().toISOString(),
      people: profile.customPeople,
      ownTeam: own,
    });
    if (!next || next === profile.engagement) return;
    replaceProfile({ ...profile, engagement: next });
  }, [own, profile, replaceProfile]);

  // The failed-payment email's link lands on the Plan card.
  useEffect(() => {
    if (search.billing !== "overdue" || !loaded || !firm) return;
    document.getElementById("plan")?.scrollIntoView({ block: "start" });
  }, [search.billing, loaded, firm]);

  useEffect(() => {
    if (search.billing === "success")
      toast.success("Checkout finished. The plan updates once Stripe confirms the payment.");
    if (search.billing === "cancelled") toast("You cancelled checkout.");
    if (search.quickbooks && QUICKBOOKS_MESSAGE[search.quickbooks]) {
      const message = QUICKBOOKS_MESSAGE[search.quickbooks];
      if (search.quickbooks === "connected") toast.success(message);
      else toast.error(message);
    }
  }, [search.billing, search.quickbooks]);

  useEffect(() => {
    if (isPending) return;
    if (!userId) {
      setLoaded(true);
      return;
    }
    let cancel = false;
    void (async () => {
      try {
        const [firmRes, clientRes, deletedRes, billingRes, priceRes, planRes] = await Promise.all([
          getFirm(),
          listFirmClients(),
          listDeletedClients(),
          getBillingStatus().catch(() => null),
          getPlanPrices().catch(() => null),
          getEntitlements().catch(() => null),
        ]);
        if (cancel) return;
        setFirm(firmRes.firm);
        setMembers(firmRes.members);
        setInvites(firmRes.invites);
        setBilling(billingRes?.account ?? firmRes.billing);
        setBillingConfigured(billingRes?.configured ?? false);
        setPrices(priceRes?.prices ?? null);
        setEntitlements(planRes);
        setName(firmRes.firm?.name ?? "");
        setClients(clientRes.clients);
        setDeleted(deletedRes.deleted);
      } catch {
        if (!cancel) toast.error("Precog could not load the firm workspace.");
      } finally {
        if (!cancel) setLoaded(true);
      }
    })();
    return () => {
      cancel = true;
    };
  }, [userId, isPending]);

  // Post only for a business saved to the account, and only when what the
  // client list holds for it differs from what this page measures.
  const savedRow = clients.find((c) => c.id === profile.businessId);
  const engagementStale =
    savedRow !== undefined &&
    (savedRow.startedAt !== (profile.engagement?.startedAt ?? null) ||
      savedRow.mapCompletedAt !== (profile.engagement?.mapCompletedAt ?? null) ||
      savedRow.reportSentAt !== (profile.engagement?.reportSentAt ?? null) ||
      savedRow.openFindings !== metrics.openFindings ||
      savedRow.acceptedFindings !== metrics.acceptedFindings);
  useEffect(() => {
    if (!userId || !loaded || !profile.businessId || !own || !engagementStale) return;
    const posted = {
      startedAt: profile.engagement?.startedAt ?? null,
      mapCompletedAt: profile.engagement?.mapCompletedAt ?? null,
      reportSentAt: profile.engagement?.reportSentAt ?? null,
      openFindings: metrics.openFindings,
      acceptedFindings: metrics.acceptedFindings,
    };
    const businessId = profile.businessId;
    void recordEngagement({ data: { businessId, ...posted } })
      .then(() =>
        setClients((cur) => cur.map((c) => (c.id === businessId ? { ...c, ...posted } : c))),
      )
      .catch(() => undefined);
  }, [
    userId,
    loaded,
    own,
    engagementStale,
    profile.businessId,
    profile.engagement?.startedAt,
    profile.engagement?.mapCompletedAt,
    profile.engagement?.reportSentAt,
    metrics.openFindings,
    metrics.acceptedFindings,
  ]);

  // Stripe's confirmation reaches the webhook after the browser comes back,
  // so the plan is read again for a short while until it shows the payment.
  useEffect(() => {
    if (search.billing !== "success" || !userId || !loaded) return;
    const before = billingSignature(billing);
    let cancel = false;
    let tries = 0;
    setAwaitingStripe(true);
    const timer = window.setInterval(() => {
      tries += 1;
      void getBillingStatus()
        .then((res) => {
          if (cancel) return;
          if (billingSignature(res.account) !== before) {
            setBilling(res.account);
            setAwaitingStripe(false);
            window.clearInterval(timer);
            toast.success("Stripe confirmed the payment.");
          }
        })
        .catch(() => undefined);
      if (tries >= BILLING_POLL_TRIES) {
        window.clearInterval(timer);
        if (!cancel) setAwaitingStripe(false);
      }
    }, BILLING_POLL_MS);
    return () => {
      cancel = true;
      window.clearInterval(timer);
    };
    // Poll once per return from checkout; `billing` is the value to compare against.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search.billing, userId, loaded]);

  async function leftFirm() {
    const wasShared = clients.some((c) => c.id === profile.businessId && c.shared);
    setFirm(null);
    setMembers([]);
    setInvites([]);
    toast.success("You left the firm.");
    try {
      const [clientRes, deletedRes] = await Promise.all([listFirmClients(), listDeletedClients()]);
      setClients(clientRes.clients);
      setDeleted(deletedRes.deleted);
      const ownBusiness = clientRes.clients.find((c) => !c.shared);
      if (wasShared && ownBusiness) await switchBusiness(ownBusiness.id, ownBusiness.ownerUserId);
    } catch {
      toast.error("Precog could not refresh the client list. Reload the page.");
    }
  }

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
      toast.error(err instanceof Error ? err.message : "Precog did not save the firm.");
    }
  }

  const activeId = profile.businessId ?? DEFAULT_BUSINESS_ID;
  const isOwner = firm?.role === "owner";
  // The firm's plan as the server computes it (a member sees the firm's state,
  // not their own empty billing row). The note prints while the plan closes
  // the tools and no failed payment is the reason (the banner says that).
  const closedNote =
    entitlements && !entitlements.features.quickbooks && !entitlements.closedAt
      ? closedToolsNote(billingConfigured ? planAmounts(true, prices) : null, entitlements)
      : null;

  return (
    <main className="mx-auto min-h-[calc(100dvh-var(--grok-banner-h,0px))] max-w-3xl px-6 py-8">
      <p className="text-xs font-semibold tracking-[0.2em] text-muted uppercase">Firm workspace</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">{firm?.name || "Firm"}</h1>
      <p className="mt-2 text-sm text-muted">
        One firm, its people, and each client kept apart. The open business is the one the history,
        value proof and accounting panels below work on. Its Monthly review and team are on its own
        screen.
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
            to keep a firm, invite colleagues and hold a client list. Value proof below still works
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
              Firm name and letterhead on reports
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
        {signedIn && firm && isOwner && <FirmLetterhead firm={firm} onSaved={setFirm} />}
        {signedIn && firm && isOwner && <FirmRetention />}
      </section>

      {signedIn && firm && (
        <div className="mt-4 space-y-4">
          {awaitingStripe && (
            <p className="text-sm text-muted" role="status">
              Waiting for Stripe to confirm the payment…
            </p>
          )}
          <PaymentOverdueBanner variant="firm" />
          <FirmBilling
            plan={firm.plan}
            billing={billing}
            billingConfigured={billingConfigured}
            prices={prices}
            entitlements={entitlements}
            canManage={isOwner}
            onMarkPlan={saveFirm}
          />
          <FirmMembers
            firm={firm}
            members={members}
            invites={invites}
            onChange={(next) => {
              if (next.left) {
                void leftFirm();
                return;
              }
              if (next.members) setMembers(next.members);
              if (next.invites) setInvites(next.invites);
              if (next.firm !== undefined) {
                // The firm changed owner: the caller is a reviewer now, with
                // no invitations or billing to see; the server says so.
                setFirm(next.firm);
                void getFirm()
                  .then((res) => {
                    setFirm(res.firm);
                    setMembers(res.members);
                    setInvites(res.invites);
                    setBilling(res.billing);
                  })
                  .catch(() => undefined);
              }
              if (next.removed) {
                for (const line of removedMemberToasts(next.removed.name, next.removed.moved)) {
                  toast.success(line);
                }
                // The handed-over clients, deleted ones included, now list
                // under the owner's account.
                void listFirmClients()
                  .then((res) => setClients(res.clients))
                  .catch(() => undefined);
                void listDeletedClients()
                  .then((res) => setDeleted(res.deleted))
                  .catch(() => undefined);
              }
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
        <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
          <Metric
            label="Hours to a complete map"
            value={metrics.hoursToMap === null ? "—" : String(metrics.hoursToMap)}
            hint={
              own && !metrics.startedAt
                ? "No start recorded: the map was complete before timing began."
                : "From the start of setup until two named people each hold a duty."
            }
          />
          <Metric
            label="Findings accepted"
            value={metrics.acceptanceRate === null ? "—" : formatPct(metrics.acceptanceRate)}
            hint="Duty conflicts with an accept-residual decision logged, out of all duty conflicts found. An accepted conflict stays open."
          />
          <Metric
            label="Findings acted on"
            value={own ? String(metrics.actedOnFindings) : "—"}
            hint="Duty conflicts closed by dual release, or with a remediate, monitor or insure decision logged. Not counted as accepted."
          />
          <Metric
            label="Open duty conflicts"
            value={own ? String(metrics.openFindings) : "—"}
            hint="Open as Start here and the report count them. A logged decision does not close a conflict."
          />
          <Metric
            label="Findings judged valid"
            value={metrics.validRate === null ? "—" : formatPct(metrics.validRate)}
            hint="Duty conflicts nobody judged not valid, out of all duty conflicts found. A critical one counts as valid until a second person agrees. A conflict judged not valid stays open."
          />
          <Metric label="Report sent" value={metrics.reportSent ? "Yes" : "Not yet"} />
        </dl>
        {own && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={() =>
              downloadText(
                `${profile.practiceName.replace(/\s+/g, "-").slice(0, 40)}-pilot-metrics.csv`,
                pilotMetricsCsv(profile.practiceName, metrics),
                "text/csv",
              )
            }
          >
            Export pilot metrics (CSV)
          </Button>
        )}
        {signedIn && firm && savedRow && (
          <EngagementCard
            key={savedRow.id}
            businessId={savedRow.id}
            businessName={savedRow.name}
            members={members}
            isOwner={isOwner}
            onEngagementChange={(engagement) =>
              setClients((cur) => withEngagementStatus(cur, savedRow, engagement))
            }
          />
        )}
      </section>

      {signedIn && (
        <div className="mt-4 space-y-4">
          <ClientList
            clients={clients}
            deleted={deleted}
            activeId={activeId}
            onOpen={(id) =>
              // Open a client on its Monthly review, once the switch to it succeeded.
              void openClientReport(
                id,
                switchBusiness,
                () => void navigate({ to: "/", search: { tab: "monthly" } }),
                (reason) => toast.error(reason),
              )
            }
            onOpenReport={(id) =>
              void openClientReport(
                id,
                switchBusiness,
                () => void navigate({ to: "/report" }),
                (reason) => toast.error(reason),
              )
            }
            onRestored={(id) => {
              setDeleted((cur) => cur.filter((d) => d.id !== id));
              void listFirmClients()
                .then((res) => setClients(res.clients))
                .catch(() => undefined);
            }}
            onClientsChange={setClients}
            onExport={(rows) =>
              downloadText(clientTableFileName(firm?.name ?? ""), clientTableCsv(rows), "text/csv")
            }
            canRestore={!firm || isOwner}
          />
          <NotificationSettingsPanel signedIn={signedIn} />
          {closedNote && (
            <p className="rounded-xl border border-border bg-surface p-4 text-sm text-muted">
              {closedNote}
            </p>
          )}
          <QuickBooksPanel signedIn={signedIn} />
        </div>
      )}

      {/* Outside the signed-in blocks: value proof is kept on this device, so a
          signed-out owner still sees and exports it here. */}
      <section id="value-proof" className="mt-8" aria-labelledby="value-proof-title">
        <h2 id="value-proof-title" className="mb-3 text-lg font-semibold">
          Value proof (this business)
        </h2>
        <Suspense fallback={<p className="text-sm text-muted">Loading value proof…</p>}>
          <ValueProofCenter headingLevel={3} />
        </Suspense>
      </section>

      <section id="history" className="mt-8" aria-labelledby="history-title">
        <h2 id="history-title" className="mb-3 text-lg font-semibold">
          History
        </h2>
        <div className="space-y-4">
          {signedIn && <ClientHistory signedIn={signedIn} />}
          {/* The component's own heading ("Preserve the decision record") is
              this part's h3, so the outline stays h1 > h2 > h3. */}
          <section aria-label="Assessment snapshots">
            <Suspense fallback={<p className="text-sm text-muted">Loading snapshots…</p>}>
              <AssessmentSnapshots headingLevel={3} />
            </Suspense>
          </section>
        </div>
      </section>

      <p className="mt-8 text-sm">
        <Link to="/" className="underline-offset-4 hover:underline">
          Back to the business
        </Link>
      </p>
      <LegalFooter className="mt-6" hideFirmLink />
    </main>
  );
}

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-1 font-medium">{value}</dd>
      {hint && <dd className="mt-0.5 text-xs text-muted">{hint}</dd>}
    </div>
  );
}

/** What changes on the billing account when Stripe confirms a payment. */
function billingSignature(account: BillingAccount | null): string {
  return `${account?.assessmentPaidAt ?? ""}|${account?.subscriptionStatus ?? ""}`;
}

const BILLING_POLL_MS = 3_000;
const BILLING_POLL_TRIES = 10;
