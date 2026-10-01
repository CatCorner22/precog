import type { IntegrationDrift } from "../integrations/qbo/model";

/**
 * The two QuickBooks facts that sit next to the four monthly checks.
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
        detail: `No QuickBooks reading is stored. The four checks are the file until a reading is connected. ${ACCT_NOTE}`,
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
      label: "Left, but still paid",
      detail: left.length
        ? `${left.join(", ")} — marked left on the duty map, and payroll still pays them.`
        : "No person marked left is still paid in this reading.",
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
