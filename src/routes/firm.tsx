import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { LegalFooter } from "@/components/precog/legal-footer";
import { MonthlyReview } from "@/components/precog/monthly-review";
import { AccessReconcile } from "@/components/precog/access-reconcile";
import { usePractice } from "@/lib/precog/practice-context";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { detectSodConflicts } from "@/lib/precog/sod/detect";
import { advanceEngagement, isOwnTeam, pilotMetrics } from "@/lib/precog/firm/engagement";
import { PILOT_OFFER, type FirmPlan } from "@/lib/precog/firm/pricing";
import {
  getFirm,
  listFirmClients,
  recordEngagement,
  saveFirmProfile,
} from "@/lib/precog/firm/server";
import type { ClientEngagementRow, FirmRow } from "@/lib/precog/firm/store";

export const Route = createFileRoute("/firm")({
  component: FirmPage,
  head: () => ({
    meta: [
      { title: "Firm workspace · Precog Pioneer" },
      {
        name: "description",
        content:
          "Advisor workspace: client list, last review, pilot metrics, and the firm name that prints on the report.",
      },
    ],
  }),
});

function FirmPage() {
  const { user, isPending } = useCurrentUserState();
  const { profile, template, replaceProfile, switchBusiness } = usePractice();
  const [firm, setFirm] = useState<FirmRow | null>(null);
  const [name, setName] = useState("");
  const [clients, setClients] = useState<ClientEngagementRow[]>([]);
  const [loaded, setLoaded] = useState(false);

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
    if (!user) {
      setLoaded(true);
      return;
    }
    let cancel = false;
    void (async () => {
      try {
        const [firmRes, clientRes] = await Promise.all([getFirm(), listFirmClients()]);
        if (cancel) return;
        setFirm(firmRes.firm);
        setName(firmRes.firm?.name ?? "");
        setClients(clientRes.clients);
      } catch {
        if (!cancel) toast.error("The firm workspace could not be loaded.");
      } finally {
        if (!cancel) setLoaded(true);
      }
    })();
    return () => {
      cancel = true;
    };
  }, [user]);

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
      toast.success(plan === "monthly" ? "Marked as the monthly firm plan." : "Firm name saved.");
    } catch {
      toast.error("The firm name was not saved.");
    }
  }

  return (
    <main className="mx-auto min-h-[calc(100dvh-var(--grok-banner-h,0px))] max-w-3xl px-6 py-8">
      <p className="text-xs font-semibold tracking-[0.2em] text-muted uppercase">
        Advisor workspace
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">Firm</h1>
      <p className="mt-2 text-sm text-muted">
        One account, one firm, each client kept apart. The open business is the only profile on this
        page’s review and import. Other clients appear in the list and open on their own.
      </p>

      <section className="mt-6 rounded-xl border border-border bg-surface p-4">
        <h2 className="text-lg font-semibold">Pilot offer</h2>
        <p className="mt-1 text-sm text-muted">
          {PILOT_OFFER.assessmentLabel}: ${PILOT_OFFER.assessmentFeeUsd.toLocaleString()} —{" "}
          {PILOT_OFFER.assessmentDetail} It converts to the {PILOT_OFFER.monthlyLabel} at $
          {PILOT_OFFER.monthlyFeeUsd}/month for {PILOT_OFFER.monthlyClients} clients.{" "}
          {PILOT_OFFER.monthlyDetail} Payment is invoiced outside Precog; the buttons record the
          stage you are in.
        </p>
        {isPending || !loaded ? (
          <p className="mt-3 text-sm text-muted">Loading the account…</p>
        ) : !user ? (
          <p className="mt-3 text-sm">
            <Link to="/login" className="underline-offset-4 hover:underline">
              Sign in
            </Link>{" "}
            to keep a firm name and a client list. The review below still works on this device.
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
              />
            </label>
            <button
              type="submit"
              className="rounded-md border border-border px-3 py-2 text-sm hover:bg-elevated"
            >
              Save name
            </button>
            <button
              type="button"
              className="rounded-md border border-border px-3 py-2 text-sm hover:bg-elevated"
              onClick={() => void saveFirm("monthly")}
            >
              Mark converted to monthly
            </button>
          </form>
        )}
        {firm && (
          <p className="mt-2 text-xs text-muted">
            Current stage: {firm.plan === "monthly" ? "monthly firm plan" : "assessment"}.
          </p>
        )}
      </section>

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

      {user && (
        <section className="mt-4 rounded-xl border border-border bg-surface p-4">
          <h2 className="text-lg font-semibold">Clients</h2>
          <p className="mt-1 text-sm text-muted">
            Last review is the newest monthly result stored for that client. Opening a client loads
            only that business.
          </p>
          {clients.length === 0 ? (
            <p className="mt-3 text-sm text-muted">
              No saved clients yet. Sign in and save a business.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-border">
              {clients.map((client) => (
                <li
                  key={client.id}
                  className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
                >
                  <div>
                    <p className="font-medium">{client.name}</p>
                    <p className="text-xs text-muted">
                      Last review: {client.lastReviewAt ? client.lastReviewAt.slice(0, 10) : "none"}{" "}
                      · Report {client.reportSentAt ? "sent" : "not sent"}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="rounded-md border border-border px-2 py-1 text-xs hover:bg-elevated"
                    onClick={() => void switchBusiness(client.id)}
                  >
                    Open
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
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
