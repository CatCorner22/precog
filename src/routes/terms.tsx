import { createFileRoute, Link } from "@tanstack/react-router";
import { LegalFooter } from "@/components/precog/legal-footer";
import { formatDay } from "@/lib/precog/dates";
import { LEGAL_EFFECTIVE } from "@/lib/precog/legal";
import {
  GOVERNING_LAW,
  OPERATOR_ADDRESS,
  OPERATOR_LEGAL_NAME,
  SUPPORT_EMAIL,
} from "@/lib/precog/legal/operator";

export const Route = createFileRoute("/terms")({
  component: TermsPage,
  head: () => ({
    meta: [
      { title: "Terms · Precog" },
      {
        name: "description",
        content:
          "Precog is decision support for internal controls. It is not an audit, a legal opinion, or a guarantee that fraud will not occur.",
      },
    ],
  }),
});

const headingCls = "text-lg font-semibold";
const sectionCls = "mt-8 space-y-3 text-sm";

function TermsPage() {
  return (
    <main className="mx-auto min-h-[calc(100dvh-var(--grok-banner-h,0px))] max-w-2xl px-6 py-10">
      <p className="text-xs font-semibold tracking-[0.2em] text-muted uppercase">Precog</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">Terms</h1>
      <p className="mt-1 text-xs text-muted">Effective {formatDay(LEGAL_EFFECTIVE)}</p>

      <section className={sectionCls}>
        <h2 className={headingCls}>Operator</h2>
        <p>
          Precog is operated by {OPERATOR_LEGAL_NAME}, {OPERATOR_ADDRESS}. Write to {SUPPORT_EMAIL}{" "}
          about these terms.
        </p>
      </section>

      <section className={sectionCls}>
        <h2 className={headingCls}>What Precog is and is not</h2>
        <p>
          Precog helps an owner or advisor describe who holds which duties, which combinations
          conflict, and what a monthly review checks. Scores are Precog’s own indexes. Scenario
          figures are assumptions. Case amounts are losses stated in public sources about other
          businesses. None of these is a measurement of your business, a forecast, or an insurance
          quote.
        </p>
        <p>
          The duty map is what you enter or what a job title suggested. An access import compares a
          file you upload with that map, and it does not prove the file is complete. Unmatched rows
          stay in a queue until a person maps or dismisses them.
        </p>
        <p>
          When you connect QuickBooks Online, Precog asks Intuit for its accounting permission
          (com.intuit.quickbooks.accounting) and reads the vendor list and the employee list to
          compare them with your map. It does not write to QuickBooks. It keeps the connection
          tokens, encrypted, until you disconnect. Precog does not connect to Xero, a bank, or a
          payroll system.
        </p>
        <p>
          The firm workspace records a pilot offer (a fixed assessment that can convert to a monthly
          firm plan), time to a complete map, how many gaps received a decision, and whether you
          marked a report sent. A firm can pay for the assessment or the firm plan through Stripe’s
          checkout. Stripe takes the card; Precog never sees a card number. An invoice you mark by
          hand is your own record.
        </p>
        <p>
          You are responsible for the accuracy of what you enter, for who you share a link with, and
          for not placing patient, customer, or payment-card data in free-text fields. The monthly
          review log is a record of what you marked done. It is not a substitute for the bank
          statement, the payroll register, or an accountant’s work.
        </p>
        <p>
          Precog provides the service as available. A control designed here can still fail, and a
          month with no recorded loss is not evidence that any control prevented a loss.
        </p>
      </section>

      <section className={sectionCls}>
        <h2 className={headingCls}>Your account</h2>
        <p>
          You keep your sign-in to yourself and tell Precog at {SUPPORT_EMAIL} if someone else has
          used it. You are responsible for what is entered under your account. An email-and-password
          sign-up that is not confirmed within 24 hours is removed.
        </p>
      </section>

      <section className={sectionCls}>
        <h2 className={headingCls}>The firm and its clients</h2>
        <p>
          When a firm uses Precog for its client businesses, the firm is Precog's customer and the
          controller of the client data it enters; Precog processes that data on the firm's
          instructions and for no other purpose. Client data a firm member enters belongs to the
          firm, and stays with the firm when the member leaves. When a member leaves or is removed,
          the client businesses they set up move to the firm owner's account. A business a member
          shared with the firm from their own account stays theirs. A standard data processing
          agreement is available on request from {SUPPORT_EMAIL}.
        </p>
        <p>
          A business its owner shares with a firm stays the owner's; the firm acts for the owner
          under its engagement. When the owner ends the firm's access, or deletes the business or
          their account, the firm loses access to the business and to the report versions it locked
          for it.
        </p>
        <p>
          After the firm deletes a client that holds a locked report version, Precog keeps the
          client's locked report versions and monthly review log for the retention period the firm
          sets (seven years unless the firm chose longer), then purges them; the firm's activity log
          keeps each entry for that period from the day it was written.
        </p>
      </section>

      <section className={sectionCls}>
        <h2 className={headingCls}>Acceptable use and prohibited data</h2>
        <p>
          Do not enter protected health information, payment-card numbers, bank account numbers,
          government identifiers or passwords anywhere in Precog, including free-text fields, notes
          and pictures. Precog is not a HIPAA business associate and signs no business associate
          agreement. Do not use Precog to accuse a person, to scrape its case library, or to probe
          another account.
        </p>
      </section>

      <section className={sectionCls}>
        <h2 className={headingCls}>Billing</h2>
        <p>
          The Firm plan renews each month or each year, as you chose at Checkout, until you cancel
          it. Cancel any time with Manage billing on the Firm page; you keep access to the end of
          the period you paid for, and a started month or year is not refunded. The Firm plan's tier
          sets how many client businesses the firm can keep: Starter up to 5, Practice up to 20,
          Firm up to 50; the firm owner moves up a tier in Manage billing. The Assessment is a
          one-off payment, and it is not refunded once a report version is locked. An Assessment fee
          that has not been refunded is credited once, before tax, against the Firm plan's invoices
          when the account that paid it first starts the Firm plan. Prices are as shown at Checkout,
          plus applicable sales tax, which Stripe calculates from the billing address you give. You
          can pay by card or by US bank account; a bank payment that later fails is treated as a
          failed payment. Precog tells you by email before a price change applies to your next
          renewal.
        </p>
      </section>

      <section className={sectionCls}>
        <h2 className={headingCls}>The printed report</h2>
        <p>
          A locked report version is reviewed for issuance by the firm that prepared it. It is not
          an audit, review or attestation engagement under AICPA standards, and Precog verifies
          nothing it contains. The content of a report belongs to the account that produced it;
          Precog's name on it says only which tool prepared it.
        </p>
      </section>

      <section className={sectionCls}>
        <h2 className={headingCls}>Case library</h2>
        <p>
          Case facts come from government releases and published court records, cited on each case.
          A case names the defendant as the record names them. To ask for a correction, write to{" "}
          {SUPPORT_EMAIL} with the case and the source.
        </p>
      </section>

      <section className={sectionCls}>
        <h2 className={headingCls}>No warranty</h2>
        <p>
          Precog is provided as available and as is. Precog gives no warranty that it is error-free,
          that a control it describes will work, or that a loss will be found or prevented.
        </p>
      </section>

      <section className={sectionCls}>
        <h2 className={headingCls}>Limitation of liability</h2>
        <p>
          To the extent the law allows, Precog's total liability for any claim is the amount you
          paid Precog in the twelve months before the claim, and Precog is not liable for indirect,
          consequential or special loss, lost profits or lost data.
        </p>
      </section>

      <section className={sectionCls}>
        <h2 className={headingCls}>Indemnity</h2>
        <p>
          You indemnify Precog against claims that arise from data you entered without the right to
          enter it, or from your breach of these terms.
        </p>
      </section>

      <section className={sectionCls}>
        <h2 className={headingCls}>Termination</h2>
        <p>
          You can delete your account at any time from the header. Precog can suspend or end an
          account that breaks these terms, after notice by email where the law requires it. Sections
          that by their nature survive (billing, liability, indemnity, governing law) survive.
        </p>
      </section>

      <section className={sectionCls}>
        <h2 className={headingCls}>Governing law</h2>
        <p>
          These terms are governed by the law of {GOVERNING_LAW}, and its courts hear any dispute
          about them.
        </p>
      </section>

      <section className={sectionCls}>
        <h2 className={headingCls}>Changes to these terms</h2>
        <p>
          Precog posts a new effective date here when these terms change, and emails account holders
          before a change that reduces their rights takes effect.
        </p>
      </section>

      <p className="mt-8 text-sm">
        <Link to="/privacy" className="underline-offset-4 hover:underline">
          Privacy
        </Link>
      </p>
      <LegalFooter className="mt-6" />
    </main>
  );
}
