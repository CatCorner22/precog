import { describe, expect, it } from "vitest";
import { resolveTemplate } from "@/lib/precog/active-template";
import { INDUSTRIES, type IndustryId } from "@/lib/precog/industry";
import { defaultProfile } from "@/lib/precog/practice-profile";
import { buildControlReportModel } from "@/lib/precog/report/build-control-report";

/** Each sample's week, as the report prints it: the title, and a hand-off's first sentence. */
function weekFor(industry: IndustryId): string[] {
  const profile = defaultProfile(industry);
  const report = buildControlReportModel({
    tpl: resolveTemplate(profile),
    profile,
    mapCustomized: false,
    today: "2026-09-26",
    trackFreshness: false,
    mapReady: true,
    businessName: "Sample",
  });
  return report.actions.map((a) =>
    a.id.startsWith("map-heat-") ? `${a.title} | ${a.why.split(". ")[0]}.` : a.title,
  );
}

const PINNED: Record<IndustryId, string[]> = {
  dental: [
    "Start owner weekly bank reconciliation",
    "Have someone other than Maya enter write-offs | In Claims & denials, Maya can both approve write-offs and voids and enter write-offs.",
    "Have someone other than Maya approve write-offs and voids | Maya can both prepare bank deposit and approve write-offs and voids.",
    "Turn on dual release for payments",
    "Split reconcile the bank account from record payments received",
  ],
  retail: [
    "Start owner weekly bank reconciliation",
    "Have someone other than Sam approve write-offs and voids | Sam can both prepare bank deposit and approve write-offs and voids.",
    "Have someone other than Sam set up suppliers | In Accounts payable, Sam can both release payments and set up suppliers.",
    "Turn on dual release for payments",
    "Split reconcile the bank account from release payments",
  ],
  professional_services: [
    "Start owner weekly bank reconciliation",
    "Have someone other than Greg reconcile the bank account | In Operating cash & bank reconciliation, Greg can both record payments received and reconcile the bank account.",
    "Turn on dual release for payments",
    "Have someone other than Linda set up suppliers | In Vendor bills & expenses, Linda can both release payments and set up suppliers.",
    "Split reconcile the bank account from prepare bank deposit",
  ],
  restaurant: [
    "Start owner weekly bank reconciliation",
    "Have someone other than Keisha approve write-offs and voids | Keisha can both prepare bank deposit and approve write-offs and voids.",
    "Turn on dual release for payments",
    "Have someone other than Keisha release payments | Keisha can both enter payroll and release payments.",
    "Split reconcile the bank account from record payments received",
  ],
  construction: [
    "Start owner weekly bank reconciliation",
    "Have someone other than Dana set up suppliers | In Subcontractor & supplier payments, Dana can both release payments and set up suppliers.",
    "Turn on dual release for payments",
    "Split reconcile the bank account from prepare bank deposit",
    "Split reconcile the bank account from release payments",
  ],
  automotive: [
    "Start owner weekly bank reconciliation",
    "Have someone other than Linda reconcile the bank account | In Cashier, deposits & bank reconciliation, Linda can both record payments received and reconcile the bank account.",
    "Turn on dual release for payments",
    "Have someone other than Dwayne approve write-offs and voids | Dwayne can both take payment from customers and approve write-offs and voids.",
    "Split reconcile the bank account from prepare bank deposit",
  ],
  nonprofit: [
    "Have a board member read the bank statement each month",
    "Have someone other than Martin set up suppliers | In Vendor payments & organization cards, Martin can both release payments and set up suppliers.",
    "Turn on dual release for payments",
    "Split reconcile the bank account from prepare bank deposit",
    "Split reconcile the bank account from release payments",
  ],
  general: [
    "Start owner weekly bank reconciliation",
    "Have someone other than Maya prepare bank deposit | In Cash handling & deposits, Maya can both record payments received and prepare bank deposit.",
    "Have someone other than Maya release payments | In Accounts payable, Maya can both approve new suppliers and release payments.",
    "Turn on dual release for payments",
    "Split reconcile the bank account from record payments received",
  ],
};

describe("each sample's week", () => {
  for (const { id } of INDUSTRIES) {
    it(`is pinned for the ${id} sample`, () => {
      expect(weekFor(id as IndustryId)).toEqual(PINNED[id as IndustryId]);
    });
  }
});
