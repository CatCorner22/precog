import { createFileRoute, Link } from "@tanstack/react-router";
import { LegalFooter } from "@/components/precog/legal-footer";
import { SHARE_VIEW_RETENTION_DAYS } from "@/lib/precog/account-store";

export const Route = createFileRoute("/privacy")({
  component: PrivacyPage,
  head: () => ({
    meta: [
      { title: "Privacy · Precog Pioneer" },
      {
        name: "description",
        content:
          "What Precog stores in the browser, what is synced to your account, what is sent to the model, and how to export or delete it.",
      },
    ],
  }),
});

function PrivacyPage() {
  return (
    <main className="mx-auto min-h-[calc(100dvh-var(--grok-banner-h,0px))] max-w-2xl px-6 py-10">
      <p className="text-xs font-semibold tracking-[0.2em] text-muted uppercase">Precog Pioneer</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">Privacy</h1>
      <p className="mt-3 text-sm text-muted">
        Precog holds employee names, job titles, and a map of who can move money. That is personal
        data and a description of control weaknesses. This page says where each copy lives.
      </p>

      <section className="mt-8 space-y-3 text-sm">
        <h2 className="text-lg font-semibold">What stays in this browser</h2>
        <p>
          Until you sign in, the business profile, decision journal, monthly review notes, and
          access-import queue are stored in this browser only. A private window or a full site-data
          clear removes them. They are not sent to a server.
        </p>
      </section>

      <section className="mt-8 space-y-3 text-sm">
        <h2 className="text-lg font-semibold">What is synced when you sign in</h2>
        <p>
          Sign-in uses Google or X through the app’s auth broker. The session cookie stays on this
          app. A signed-in save stores the business profile, assessment snapshots, and firm
          workspace (firm name, client list, engagement stamps, and the monthly review log) in the
          database, tied to your account. Another customer’s account cannot read them.
        </p>
        <p>
          Shared map links are separate. Anyone with the link can open that frozen map until it
          expires or you revoke it. A passcode, when you set one, is stored as a hash. View logs
          keep a hash of the visitor address and the browser string for {SHARE_VIEW_RETENTION_DAYS}{" "}
          days, then they are deleted.
        </p>
      </section>

      <section className="mt-8 space-y-3 text-sm">
        <h2 className="text-lg font-semibold">What is sent to the model</h2>
        <p>
          The advisor answers on this device from your profile with no model call until you ask a
          question while signed in and a model key is configured. That question, plus the tool
          results it needs (names, duties, gaps, and notes you typed), is sent to xAI to write the
          brief. Logged-out use never makes that call. Do not paste patient, customer, or account
          numbers into notes or questions.
        </p>
      </section>

      <section className="mt-8 space-y-3 text-sm">
        <h2 className="text-lg font-semibold">Export and deletion</h2>
        <p>
          Signed in, <strong>Export data</strong> in the header downloads one JSON file of the
          account: businesses, snapshots, shares, the firm record, engagement stamps, and the review
          log. Passcode hashes are left out. <strong>Delete account</strong> removes the account and
          those rows. It asks you to type DELETE first. Clearing saved data on this device, from the
          error screen or after deletion, removes only the browser copy.
        </p>
      </section>

      <p className="mt-8 text-sm">
        <Link to="/" className="underline-offset-4 hover:underline">
          Back to the business
        </Link>
      </p>
      <LegalFooter className="mt-6" />
    </main>
  );
}
