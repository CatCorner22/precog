import { createFileRoute, Link } from "@tanstack/react-router";
import { LegalFooter } from "@/components/precog/legal-footer";
import { formatDay } from "@/lib/precog/dates";
import { LEGAL_EFFECTIVE } from "@/lib/precog/legal";
import { SHARE_VIEW_RETENTION_DAYS } from "@/lib/precog/share/share-store";

export const Route = createFileRoute("/privacy")({
  component: PrivacyPage,
  head: () => ({
    meta: [
      { title: "Privacy · Precog Pioneer" },
      {
        name: "description",
        content:
          "What Precog stores in the browser, what it syncs to your account, what it sends to the model, and how to export or delete it.",
      },
    ],
  }),
});

function PrivacyPage() {
  return (
    <main className="mx-auto min-h-[calc(100dvh-var(--grok-banner-h,0px))] max-w-2xl px-6 py-10">
      <p className="text-xs font-semibold tracking-[0.2em] text-muted uppercase">Precog Pioneer</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">Privacy</h1>
      <p className="mt-1 text-xs text-muted">Effective {formatDay(LEGAL_EFFECTIVE)}</p>
      <p className="mt-3 text-sm text-muted">
        Precog holds employee names, job titles, and a map of who can move money. That is personal
        data and a description of control weaknesses. This page says where each copy lives.
      </p>

      <section className="mt-8 space-y-3 text-sm">
        <h2 className="text-lg font-semibold">What stays in this browser</h2>
        <p>
          Until you sign in, Precog stores the business profile, Decisions log, monthly review
          notes, and access-import queue in this browser only. A private window or a full site-data
          clear removes them. Precog does not save them on its server.
        </p>
        <p>
          Pioneer and the <strong>Review</strong>, <strong>Suggest</strong>, and{" "}
          <strong>Draft steps from notes</strong> buttons run on Precog’s server, whether or not you
          are signed in. When you use one of them, this browser sends the server the parts of the
          profile that feature needs. Pioneer, for example, sends the business name, team, duties,
          processes, risk inputs, planned absences, the Decisions log entries it reads, and which
          items have a written procedure. The server works out the answer and does not save what the
          browser sent.
        </p>
      </section>

      <section className="mt-8 space-y-3 text-sm">
        <h2 className="text-lg font-semibold">What Precog syncs when you sign in</h2>
        <p>
          Sign-in uses Google or X through Precog’s auth broker, or an email and password that
          Precog keeps. For an email account the database holds your name, your email address, and a
          hash of the password, never the password itself. The session cookie stays with Precog. A
          signed-in save stores the business profile, assessment snapshots, and firm workspace (firm
          name, client list, engagement stamps, and the monthly review log) in the database, tied to
          your account. Another customer’s account cannot read them.
        </p>
        <p>
          When you connect QuickBooks Online, the database keeps the connection tokens, encrypted,
          and the last twelve readings of the vendor and employee lists. Disconnecting deletes the
          tokens and those readings.
        </p>
        <p>
          When a firm pays through Stripe, the database keeps the Stripe customer and subscription
          ids, the plan status, and the date the firm paid for the assessment. The card itself goes
          to Stripe; Precog never sees the card number.
        </p>
        <p>
          When you add a picture to a procedure step, this browser turns it upright, shrinks it,
          covers what you marked, and re-encodes it before upload, which drops the file’s metadata
          (for example, the camera, GPS position, and owner names). The server checks the picture,
          strips any metadata again, and stores it with the business. Only signed-in people who can
          open the business can see it. When no step uses a picture any more, Precog keeps it for 30
          days, so an undo can bring it back, and then deletes it at the next save or upload. Each
          account can store up to 250 MB of pictures.
        </p>
        <p>
          Precog sends email through Resend. For an email account, Precog emails a link to confirm
          your address and, when you ask, a link to set a new password. Precog may remove a new
          sign-up that nobody confirms within a day. An account with a confirmed address, or a
          Google or X sign-in, and a business of its own or of its firm gets a weekly digest at its
          sign-in address listing what is due. Turn it off under Reminders in the firm workspace.
          When you enter a client owner’s address on their client card, Precog emails the owner once
          to ask whether they agree to reminders, and sends that address nothing more until the
          owner agrees. Each reminder has a link that stops them. When a firm owner invites a
          colleague, Precog emails the invitation. When someone joins with an invitation that Precog
          cannot match to their sign-in, Precog emails the firm owner.
        </p>
        <p>
          Shared map links are separate. Anyone with the link can open that frozen map until it
          expires or you revoke it. When you set a passcode, Precog stores it as a hash. View logs
          keep a hash of the visitor address and the browser string for {SHARE_VIEW_RETENTION_DAYS}{" "}
          days, then Precog deletes them.
        </p>
      </section>

      <section className="mt-8 space-y-3 text-sm">
        <h2 className="text-lg font-semibold">Control evidence log</h2>
        <p>
          Draft evidence forms stay in this tab's account-specific browser storage until you submit
          them. Closing the tab can remove an unsubmitted draft. Submitting a check stores its
          scope, reported performer, method, result and document references with the business.
          Review, correction and reopening events keep the recording account's id and name and a
          server timestamp. Precog does not fetch or upload the referenced documents through this
          log.
        </p>
        <p>
          Authorized members of the business's firm can read the log. A separate authorized reviewer
          records review conclusions. Export data includes logs for businesses your account owns.
          Permanently deleting the owning business or its account removes those logs. Deleting a
          contributor's account does not erase the attribution already recorded in another account's
          business log. Restoring an older business profile does not replace this separate history.
        </p>
      </section>

      <section className="mt-8 space-y-3 text-sm">
        <h2 className="text-lg font-semibold">What Precog sends to the model</h2>
        <p>
          Precog sends nothing to the model unless you are signed in and Precog has a model key.
          Signed out, or without a key, Pioneer, Review, Suggest, and Draft steps from notes answer
          from Precog’s rules.
        </p>
        <p>
          Pioneer builds its brief from your profile with Precog’s rules. When you ask Pioneer for a
          brief, Precog sends your question, plus the complete rule-based statements and their
          warnings and evidence references (which can include names, duties, gaps, and notes you
          typed), to xAI to select relevant details. Precog keeps the statements intact and
          withholds responses that do not follow this selection format.
        </p>
        <p>
          The other three features send text to xAI and show the model’s reply in its own words.
          Precog trims its length but does not check what it says. <strong>Review</strong> on the
          How work flows tab sends the business name, industry, and team size, the map’s health
          figures and warnings, each process’s name, owners’ names, and top risk title, and the
          names and roles of people who carry too much work. <strong>Suggest</strong> sends a
          process’s name, description, owners’ roles, and existing risk and idea titles, the
          industry, and the names of the available controls. <strong>Draft steps from notes</strong>{" "}
          sends your notes, the procedure’s title, place, and module, and the industry, after Precog
          masks anything that looks like a password, card number, or code; Precog masks the draft
          that comes back too.
        </p>
        <p>
          Precog counts model calls per account, per day, and, where it can tell, per network
          address, which it keeps only as a one-way hash, to cap their use. The count holds no
          question or reply. Do not paste patient, customer, or account numbers into notes or
          questions.
        </p>
      </section>

      <section className="mt-8 space-y-3 text-sm">
        <h2 className="text-lg font-semibold">Export and deletion</h2>
        <p>
          Signed in, <strong>Export data</strong> in the header downloads one JSON file of the
          account: businesses, snapshots, shares, the firm record, engagement stamps, and the review
          log. For step pictures, the file lists each picture’s details and the link that shows it
          while the account exists, not the picture itself. The file leaves out passcode hashes.{" "}
          <strong>Delete account</strong> removes the account and those rows. It asks you to type
          DELETE first. Clearing saved data on this device, from the error screen or after deletion,
          removes only the browser copy.
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
