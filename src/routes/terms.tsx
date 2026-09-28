import { createFileRoute, Link } from "@tanstack/react-router";
import { LegalFooter } from "@/components/precog/legal-footer";
import { formatDay } from "@/lib/precog/dates";
import { LEGAL_EFFECTIVE } from "@/lib/precog/legal";

export const Route = createFileRoute("/terms")({
  component: TermsPage,
  head: () => ({
    meta: [
      { title: "Terms · Precog Pioneer" },
      {
        name: "description",
        content:
          "Precog is decision support for internal controls. It is not an audit, a legal opinion, or a guarantee that fraud will not occur.",
      },
    ],
  }),
});

function TermsPage() {
  return (
    <main className="mx-auto min-h-[calc(100dvh-var(--grok-banner-h,0px))] max-w-2xl px-6 py-10">
      <p className="text-xs font-semibold tracking-[0.2em] text-muted uppercase">Precog Pioneer</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">Terms</h1>
      <p className="mt-1 text-xs text-muted">Effective {formatDay(LEGAL_EFFECTIVE)}</p>
      <div className="mt-6 space-y-4 text-sm">
        <p>
          Precog helps an owner or advisor describe who holds which duties, which combinations
          conflict, and what a monthly review checks. Scores are this application’s own indexes.
          Scenario figures are assumptions. Case amounts are losses stated in public sources about
          other businesses. None of these is a measurement of your business, a forecast, or an
          insurance quote.
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
          firm plan), time to a complete map, how many gaps received a decision, and whether a
          report was marked sent. A firm can pay for the assessment or the firm plan through
          Stripe’s checkout. Stripe takes the card; Precog never sees a card number. An invoice you
          mark by hand is your own record.
        </p>
        <p>
          You are responsible for the accuracy of what you enter, for who you share a link with, and
          for not placing patient, customer, or payment-card data in free-text fields. The monthly
          review log is a record of what you marked done. It is not a substitute for the bank
          statement, the payroll register, or an accountant’s work.
        </p>
        <p>
          The service is provided as available. A control designed here can still fail, and a month
          with no recorded loss is not evidence that loss was prevented.
        </p>
      </div>
      <p className="mt-8 text-sm">
        <Link to="/privacy" className="underline-offset-4 hover:underline">
          Privacy
        </Link>
      </p>
      <LegalFooter className="mt-6" />
    </main>
  );
}
