/**
 * Shared application control designs. These are suggested practices, not
 * universal legal requirements or evidence that a business operates them.
 * Keep the preventive action identical in the blueprint, SOP and retrieval
 * guidance. A periodic review is complementary, never a substitute.
 */
export const PAYMENT_DESTINATION_CHANGE = {
  id: "payment-destination-change",
  verification:
    "Call a previously known, authorized supplier contact to verify new payment details before changing the record or paying.",
  caution:
    "Never use a phone number, link or contact supplied in the change request. Establish the contact's authority through trusted records.",
  secondReview:
    "Ask a second authorized person who did not enter the change to review the verification before approving it for use.",
  monitoring:
    "Review the change log for missing verification, approval or follow-up. A later review does not replace verification before each payment-destination change.",
  evidence: [
    "Original change request",
    "Contact verification record",
    "Independent approval and change log",
  ],
  source: {
    publisher: "Federal Bureau of Investigation",
    document: "Business Email Compromise",
    url: "https://www.fbi.gov/how-we-can-help-you/common-frauds-and-scams/business-email-compromise",
    reviewedOn: "2026-09-29",
    scope:
      "Independent payment-change verification is the cited principle. The approval, evidence and monitoring workflow is Precog's suggested design.",
  },
} as const;

export const RECEIPT_SETTLEMENT = {
  id: "receipt-settlement",
  reconciliation:
    "Reconcile gross receipts to bank deposits through fees, refunds, chargebacks, reserves and timing differences; investigate unexplained amounts.",
  evidence: [
    "Gross receipts report",
    "Processor settlement detail",
    "Bank statement",
    "Dated reconciliation and unresolved-item log",
  ],
  basis:
    "Application control design: distinguish receipt completeness from settlement timing and net adjustments. Confirm the processor's actual settlement terms.",
} as const;
