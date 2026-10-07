import { PAYMENT_STATUS_NOTE, type IntegrationDrift } from "../integrations/qbo/model";

/**
 * The two QuickBooks facts that sit next to the monthly checks.
 * AcctNum on a vendor is the account number stored on the vendor record.
 * It is not the bank account a bill pays. This is not a review of who can sign in.
 */
export interface WorkpaperFact {
  id: string;
  label: string;
  detail: string;
}

const ACCT_NOTE =
  "QuickBooks AcctNum is the vendor's account number on the name record, not the bank account a bill pays. This is not a permission review.";

export function monthlyWorkpaperFacts(drift: IntegrationDrift | null): WorkpaperFact[] {
  if (!drift) {
    return [
      {
        id: "qbo-unread",
        label: "QuickBooks reading",
        detail: `No QuickBooks reading yet, so the monthly checks are the record. ${PAYMENT_STATUS_NOTE} ${ACCT_NOTE}`,
      },
    ];
  }
  const left = drift.leftButStillPaid.map((employee) => employee.name);
  const changed = drift.vendorsChanged.filter((change) =>
    change.fields.some((field) => field !== "active"),
  );
  return [
    {
      id: "left-paid",
      label: "Marked left here; still active in QuickBooks",
      detail:
        (left.length
          ? `${left.join(", ")} — marked left on the duty map, but still active in the QuickBooks employee list.`
          : "No person marked left on the duty map is still active in this QuickBooks employee-list reading.") +
        ` ${PAYMENT_STATUS_NOTE}`,
    },
    {
      id: "vendor-changed",
      label: "Vendor name, address, email, or account number changed",
      detail: changed.length
        ? `${changed
            .map((change) => {
              const fields = change.fields.filter((field) => field !== "active");
              return `${change.vendor.name}: ${fields.join(", ")}`;
            })
            .join("; ")}. ${ACCT_NOTE}`
        : `No vendor name, address, email, or account number changed in this reading. ${ACCT_NOTE}`,
    },
  ];
}
