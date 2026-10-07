import type { IndustryId } from "../industry";
import { leaverAccessKeys, type LeaverAccessItemKey } from "./access-removal";

/**
 * The leaver checklist's wording, in each line of business's own words. Only
 * the Team tab's checklist shows these, so they live apart from
 * `access-removal.ts`, which every business page loads.
 */

/** One thing to check for someone who has left, in the words the checklist uses. */
export interface LeaverAccessItemDef extends LeaverAccessItemKey {
  label: string;
}

const OFF_PAYROLL = "Off payroll: no more pay runs or direct deposits to them";
const PAYROLL_LOGIN = "Payroll system sign-in removed";
const BANK = "Bank sign-ins and cards removed, and their name off the bank's signer list";
const OFFICE_KEYS = "Office keys returned and the alarm code changed";
const EMAIL_BOOKKEEPING = "Email and bookkeeping sign-ins removed";
const EMAIL_ACCOUNTING = "Email and accounting software sign-ins removed";

/** The words for each item, by line of business and item id (`leaverAccessKeys`). */
const LABELS: Record<IndustryId, Readonly<Record<string, string>>> = {
  dental: {
    payroll: OFF_PAYROLL,
    bank: BANK,
    payroll_login: PAYROLL_LOGIN,
    practice_software:
      "Practice software sign-in removed (scheduling, billing and patient records)",
    insurance: "Insurance portal and claims clearinghouse sign-ins removed",
    keys: OFFICE_KEYS,
    email: EMAIL_BOOKKEEPING,
  },
  retail: {
    payroll: OFF_PAYROLL,
    bank: BANK,
    payroll_login: PAYROLL_LOGIN,
    pos: "Point-of-sale sign-in, PIN and any manager override code removed",
    online_store: "Online store and supplier account sign-ins removed",
    keys: "Store keys returned, and the alarm code and safe combination changed",
    email: EMAIL_BOOKKEEPING,
  },
  professional_services: {
    payroll: OFF_PAYROLL,
    bank: "Bank sign-ins and cards removed, including the client trust account, and their name off every signer list",
    payroll_login: PAYROLL_LOGIN,
    billing: "Time and billing, document and client portal sign-ins removed",
    agency: "Their access to tax agency and other government accounts through the firm removed",
    keys: OFFICE_KEYS,
    email: EMAIL_ACCOUNTING,
  },
  restaurant: {
    payroll: OFF_PAYROLL,
    bank: BANK,
    payroll_login: PAYROLL_LOGIN,
    pos: "POS PIN and manager card removed",
    safe: "Safe combination changed",
    keys: "Keys returned and the alarm code changed",
    ordering: "Delivery app, online ordering and supplier account sign-ins removed",
    email: EMAIL_ACCOUNTING,
  },
  construction: {
    payroll: OFF_PAYROLL,
    bank: BANK,
    payroll_login: PAYROLL_LOGIN,
    cards: "Fuel cards and supplier or lumber yard accounts closed to them",
    equipment:
      "Company vehicle, tools and equipment returned, and job site keys and lockbox codes changed",
    software: "Email, estimating, project and accounting software sign-ins removed",
  },
  automotive: {
    payroll: OFF_PAYROLL,
    bank: BANK,
    payroll_login: PAYROLL_LOGIN,
    shop_system: "Shop or dealer management system sign-in removed",
    parts: "Parts supplier, warranty portal and fuel card access removed",
    keys: "Building keys returned, the alarm code changed, and the customer key cabinet checked",
    email: EMAIL_ACCOUNTING,
  },
  nonprofit: {
    payroll: OFF_PAYROLL,
    bank: "Bank sign-ins and organization cards removed, and their name off the bank's signer list",
    payroll_login: PAYROLL_LOGIN,
    donors: "Donor database sign-in removed",
    giving:
      "Online giving platform sign-in removed, and its payouts still going to the organization's bank account",
    mail: "Mail and PO box key returned, and someone still here now receives the mailed checks",
    software: "Email and organization software sign-ins removed (accounting, grants)",
  },
  general: {
    payroll: OFF_PAYROLL,
    bank: BANK,
    payroll_login: PAYROLL_LOGIN,
    keys: "Keys returned, and any alarm code or safe combination they knew changed",
    software: EMAIL_ACCOUNTING,
  },
};

/** Each line of business's checklist with its wording, built once. */
const ITEMS: Partial<Record<IndustryId, readonly LeaverAccessItemDef[]>> = {};
for (const industry of Object.keys(LABELS) as IndustryId[]) {
  ITEMS[industry] = leaverAccessKeys(industry).map(({ id, short }) => ({
    id,
    label: LABELS[industry][id] ?? "",
    short,
  }));
}

/** The checklist for someone who has left this line of business, with its wording. */
export function leaverAccessItems(industry: IndustryId): readonly LeaverAccessItemDef[] {
  return ITEMS[industry] ?? ITEMS.general ?? [];
}
