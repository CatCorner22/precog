import { createFileRoute, Link } from "@tanstack/react-router";
import { LegalFooter } from "@/components/precog/legal-footer";
import { DELETED_RETENTION_DAYS, HISTORY_RETENTION_DAYS } from "@/lib/precog/business-retention";
import { formatDay } from "@/lib/precog/dates";
import { RETENTION_YEARS_MAX, RETENTION_YEARS_MIN } from "@/lib/precog/firm/engagement-row";
import { LEGAL_EFFECTIVE } from "@/lib/precog/legal";
import {
  AUTH_BROKER_OPERATOR,
  SUPPORT_EMAIL,
  XAI_API_DATA_POLICY_URL,
  isPlaceholder,
} from "@/lib/precog/legal/operator";
import { PASSCODE_ATTEMPT_RETENTION_DAYS } from "@/lib/precog/share/share-attempts";
import { SHARE_VIEW_RETENTION_DAYS } from "@/lib/precog/share/share-store";

export const Route = createFileRoute("/privacy")({
  component: PrivacyPage,
  head: () => ({
    meta: [
      { title: "Privacy · Precog" },
      {
        name: "description",
        content:
          "What Precog stores in the browser, what it syncs to your account, what it sends to the model, and how to export or delete it.",
      },
    ],
  }),
});

/**
 * Figures the page prints as literals, because their constants live in
 * server-only modules or are not worth an import: UNREFERENCED_GRACE_DAYS
 * (src/lib/precog/procedures/image-store.server.ts), UNCONFIRMED_HOLD_HOURS
 * (src/lib/auth/email-password.server.ts), purgeOldDailyUsage's keepDays
 * (src/lib/precog/llm/daily-usage.ts), MAX_HISTORY_PER_BUSINESS
 * (src/lib/precog/business-retention.ts), the defaults of LLM_DAILY_PER_USER
 * and LLM_DAILY_PER_USER_PAID (src/lib/precog/llm/daily-usage.ts),
 * LLM_USAGE_RETENTION_MONTHS (src/lib/precog/llm/usage-log.server.ts) and
 * Better Auth's session length (seven days, refreshed daily; the default
 * src/lib/auth/server.ts keeps). The retention row's "seven years unless the
 * firm chose up to fifteen" spells out RETENTION_YEARS_DEFAULT and
 * RETENTION_YEARS_MAX (src/lib/precog/firm/engagement-row.ts). Change those
 * and this page together.
 */
const UNREFERENCED_PICTURE_DAYS = 30;
const UNCONFIRMED_SIGNUP_HOURS = 24;
const MODEL_CALL_COUNT_DAYS = 35;
const MODEL_CALL_RECORD_MONTHS = 13;
const MAX_VERSIONS_PER_BUSINESS = 200;
const MODEL_CALLS_FREE_PER_DAY = 100;
const MODEL_CALLS_PAID_PER_DAY = 400;

/** Who handles data on Precog's behalf, and for what. */
const PROCESSORS: ReadonlyArray<readonly [string, string]> = [
  ["Vercel", "hosting"],
  ["Neon", "database"],
  [AUTH_BROKER_OPERATOR, "Google and X sign-in"],
  ["Google, X", "sign-in providers"],
  ["Resend", "email"],
  ["Stripe", "payment"],
  ["xAI", "model calls"],
  ["Intuit", "QuickBooks, only when connected"],
  ["Sentry or the error relay Precog's operator sets", "error reports without prompt text"],
];

/** What Precog keeps, and for how long. */
const RETENTION: ReadonlyArray<readonly [string, string]> = [
  [
    "A deleted business",
    `${DELETED_RETENTION_DAYS} days, then purged; a firm's client with a locked report version, unless its owner shared it with the firm, is kept for the firm's retention period (${RETENTION_YEARS_MIN} to ${RETENTION_YEARS_MAX} years), unseen and not restorable after ${DELETED_RETENTION_DAYS} days`,
  ],
  [
    "Past versions of a business",
    `${HISTORY_RETENTION_DAYS} days and at most ${MAX_VERSIONS_PER_BUSINESS} versions`,
  ],
  [
    "Locked report versions and the monthly review log of a firm's clients",
    `kept while the firm holds the client and, after the firm deletes a client that holds a locked version, for the period the firm sets (seven years unless the firm chose up to fifteen), then purged; deleting the account that set up the client removes them at once, and deleting the firm owner's account ends the period, so they are purged once ${DELETED_RETENTION_DAYS} days have passed since the client's deletion; a business its owner shared with a firm is the owner's, and is purged ${DELETED_RETENTION_DAYS} days after the owner deletes it`,
  ],
  [
    "A firm's activity log (who did what to the firm's file, with names as they were)",
    "each entry for the period the firm sets from the day it was written, then purged; deleted with the firm owner's account",
  ],
  [
    "When you first set up a business, locked a report version, marked a report sent or recorded a monthly review",
    "kept until the account is deleted",
  ],
  [
    "A firm's letterhead and logo",
    "until the firm changes them or the account is deleted; each locked version keeps the copy it was printed with",
  ],
  ["Pictures no step uses", `${UNREFERENCED_PICTURE_DAYS} days`],
  ["An unconfirmed email-and-password sign-up", `${UNCONFIRMED_SIGNUP_HOURS} hours`],
  [
    "Signed-in sessions",
    "seven days after Precog last refreshed the session, at most once a day while it is in use; end them from Sessions in the account menu",
  ],
  ["Share view logs", `${SHARE_VIEW_RETENTION_DAYS} days`],
  ["Failed passcode guesses", `${PASSCODE_ATTEMPT_RETENTION_DAYS} days`],
  ["Model-call counts", `${MODEL_CALL_COUNT_DAYS} days`],
  [
    "Model-call records (feature, model and token counts; no question or answer)",
    `${MODEL_CALL_RECORD_MONTHS} months`,
  ],
  ["QuickBooks readings", "the last twelve, deleted on disconnect"],
];

const headingCls = "text-lg font-semibold";
const sectionCls = "mt-8 space-y-3 text-sm";

function TwoColumnTable({
  caption,
  headers,
  rows,
}: {
  caption: string;
  headers: readonly [string, string];
  rows: ReadonlyArray<readonly [string, string]>;
}) {
  return (
    <table className="w-full border-collapse text-left text-sm">
      <caption className="sr-only">{caption}</caption>
      <thead>
        <tr className="border-b border-border text-xs text-muted">
          <th scope="col" className="py-1 pr-3 font-medium">
            {headers[0]}
          </th>
          <th scope="col" className="py-1 font-medium">
            {headers[1]}
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map(([what, detail]) => (
          <tr key={what} className="border-b border-border/60 align-top">
            <th scope="row" className="py-1.5 pr-3 font-normal">
              {what}
            </th>
            <td className="py-1.5">{detail}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function PrivacyPage() {
  return (
    <main className="mx-auto min-h-[calc(100dvh-var(--grok-banner-h,0px))] max-w-2xl px-6 py-10">
      <p className="text-xs font-semibold tracking-[0.2em] text-muted uppercase">Precog</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">Privacy</h1>
      <p className="mt-1 text-xs text-muted">Effective {formatDay(LEGAL_EFFECTIVE)}</p>
      <p className="mt-3 text-sm text-muted">
        Precog holds employee names, job titles, and a map of who can move money. That is personal
        data and a description of control weaknesses. This page says where each copy lives.
      </p>

      <section className={sectionCls}>
        <h2 className={headingCls}>What stays in this browser</h2>
        <p>
          Until you sign in, Precog stores the business profile, Decisions log, monthly review
          notes, and access-import queue in this browser only. A private window or a full site-data
          clear removes them. Precog does not save them on its server. When you sign in, Precog asks
          before it copies a business you set up while signed out into your account; it never copies
          one without asking.
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

      <section className={sectionCls}>
        <h2 className={headingCls}>What Precog syncs when you sign in</h2>
        <p>
          Sign-in uses Google or X through Precog’s auth broker, operated by {AUTH_BROKER_OPERATOR},
          or an email and password that Precog keeps. For an email account the database holds your
          name, your email address, and a hash of the password, never the password itself. The
          session cookie stays with Precog. A session ends seven days after Precog last refreshed
          it, which Precog does at most once a day while you use it; Sessions in the account menu
          ends your other sessions, or every session, and lists your signed-in devices within a day
          of signing in. A signed-in save stores the business profile, assessment snapshots, and
          firm workspace (firm name, client list, engagement stamps, and the monthly review log) in
          the database, tied to your account. Another customer’s account cannot read them.
        </p>
        <p>
          Precog also notes the day you first set up a business, first locked a report version,
          first marked a report sent and first recorded a monthly review, so Precog's operator can
          see whether new accounts get started. That note holds no names and no text you entered,
          and no analytics script runs in your browser.
        </p>
        <p>
          When you connect QuickBooks Online, the database keeps the connection tokens, encrypted,
          and the last twelve readings of the vendor and employee lists. Disconnecting deletes the
          tokens and those readings. When a reading fails or QuickBooks' permission is about to end,
          Precog emails the firm owner once per problem, whether or not the weekly digest is on.
        </p>
        <p>
          When a firm pays through Stripe, the database keeps the Stripe customer and subscription
          ids, the price the subscription runs on, the plan status, and the date the firm paid for
          the assessment. The card or bank account itself goes to Stripe; Precog never sees the card
          or account number. When a Firm plan payment fails, Precog emails the firm owner once and
          keeps the plan open for 14 days while Stripe retries the payment.
        </p>
        <p>
          Deleting your account deletes the Stripe customer record. Stripe keeps the invoices,
          receipts and tax records the law requires it to keep; Precog cannot remove those.
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
          sign-up that nobody confirms within a day. An account whose address Precog can vouch for
          (a confirmed email-and-password address, or a confirmed Google address) and a business of
          its own or of its firm gets a weekly digest at its sign-in address listing what is due. An
          X sign-in carries no address Precog can email. Precog sends it only after you say yes,
          once, when you sign in; turn it off any time from Weekly digest in the header or under
          Reminders in the firm workspace, or with the stop link in every digest. When you enter a
          client owner’s address on their client card, Precog emails the owner once to ask whether
          they agree to reminders, and sends that address nothing more until the owner agrees. Each
          reminder has a link that stops them. When a firm owner invites a colleague, or a business
          owner invites a firm, Precog emails the invitation.
        </p>
        <p>
          Shared map links are separate. Anyone with the link can open that frozen map until it
          expires or you revoke it. When you set a passcode, Precog stores it as a hash. View logs
          keep a hash of the visitor address and the browser string for {SHARE_VIEW_RETENTION_DAYS}{" "}
          days, then Precog deletes them.
        </p>
      </section>

      <section className={sectionCls}>
        <h2 className={headingCls}>Who processes your data</h2>
        <TwoColumnTable
          caption="Who processes your data"
          headers={["Processor", "What for"]}
          rows={PROCESSORS}
        />
        <p>A security summary with this list is available from {SUPPORT_EMAIL}.</p>
      </section>

      <section className={sectionCls}>
        <h2 className={headingCls}>How long Precog keeps it</h2>
        <TwoColumnTable
          caption="How long Precog keeps it"
          headers={["What", "How long"]}
          rows={RETENTION}
        />
      </section>

      <section className={sectionCls}>
        <h2 className={headingCls}>Firm members</h2>
        <p>
          Every member of a firm can open every client business the firm holds, including its
          evidence log. When a member is removed or leaves, the shared map links they made on the
          firm's clients are revoked, and the client businesses they set up move to the firm owner's
          account, as the Terms say. A business a member shared with the firm from their own account
          stays theirs, and so do their links to it. The firm owner can hand the firm, its clients,
          its invitations and its billing to a member; the previous owner stays on as a reviewer.
        </p>
        <p>
          When a business owner invites a firm, the firm works on that business as a client until
          either of them ends the access; the business stays the owner's. When the access ends, the
          firm can no longer open the business or the report versions it locked; the owner keeps
          them.
        </p>
        <p>
          Precog writes these events to the firm's activity log, which the firm owner can export:
          members invited, joining, leaving, removed and their roles; ownership transfers; clients
          deleted, restored, handed over, shared by their owners and handed back; engagements saved,
          ended and reopened; the retention period; share links; locked versions, review requests,
          returns, reviews for issuance and sends; QuickBooks connections; owner reminder addresses;
          the letterhead; exports; plan changes; and Precog's operator's lookups and changes. Edits
          to a business's map, Monthly review results and QuickBooks readings are kept in the
          business's own history and logs, not in the activity log. The log keeps the name of each
          person who acted (their address when the account has no name), for the period the firm
          sets, even after that person deletes their own account.
        </p>
        <p>
          Precog's operator can look up one account at a time by its exact address, to answer a
          support request or link a Stripe customer; on a firm's account, each lookup and change is
          written to the firm's activity log.
        </p>
      </section>

      <section className={sectionCls}>
        <h2 className={headingCls}>Control evidence log</h2>
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

      <section className={sectionCls}>
        <h2 className={headingCls}>What Precog sends to the model</h2>
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
          question or reply. Precog also keeps, for each model call, the feature, the model and the
          token counts, without the question or the answer, for {MODEL_CALL_RECORD_MONTHS} months.
          Do not paste patient, customer, or account numbers into notes or questions.
        </p>
        <p>
          Precog does not use what you enter to train a model, and sends xAI nothing for training.
          xAI's own policy for API data is at{" "}
          {isPlaceholder(XAI_API_DATA_POLICY_URL) ? (
            XAI_API_DATA_POLICY_URL
          ) : (
            <a
              href={XAI_API_DATA_POLICY_URL}
              className="underline-offset-4 hover:underline"
              rel="noreferrer"
            >
              {XAI_API_DATA_POLICY_URL}
            </a>
          )}
          . Precog caps model calls per account per day ({MODEL_CALLS_FREE_PER_DAY} on the free plan
          and {MODEL_CALLS_PAID_PER_DAY} on the Firm plan, unless this deployment sets other
          limits).
        </p>
      </section>

      <section className={sectionCls}>
        <h2 className={headingCls}>Export and deletion</h2>
        <p>
          Signed in, <strong>Export data</strong> in the header downloads one JSON file of the
          account: businesses, snapshots, shares, the firm record, engagement stamps, and the review
          log and, for a firm owner, a list of the client businesses its members set up; their past
          versions download through Download history. <strong>Download history</strong>, beside it,
          downloads each business’s past versions separately, one JSON file per business. For step
          pictures, the account file lists each picture’s details and the link that shows it while
          the account exists, not the picture itself. The file leaves out passcode hashes.{" "}
          <strong>Delete account</strong> removes the account and those rows. It asks you to type
          DELETE first. Precog refuses to delete an account while its Firm plan is active: cancel
          the plan with Manage billing first, or make a colleague the firm's owner. It also refuses
          while the account holds client businesses it set up for another firm: ask that firm's
          owner to remove you from the firm first (your client businesses stay with the firm), then
          delete the account. Data requests, including from a person named in a business who has no
          account, go to {SUPPORT_EMAIL}. Clearing saved data on this device, from the error screen
          or after deletion, removes only the browser copy.
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
