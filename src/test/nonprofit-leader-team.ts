/**
 * A nonprofit team whose leader carries no owner mark: a "President & CEO"
 * who, by title alone, reads as a sole owner. A nonprofit belongs to no one,
 * so every engine that is told the industry treats the leader as an employee
 * and counts the two conflicting duties they hold. Older stored profiles and
 * Pioneer requests reach the engines this way, without passing through the
 * setup grid or `withPeople`, which would clear the mark.
 */
import type { RoleAssignment } from "@/lib/precog/sod/assignments";
import type { Person } from "@/lib/precog/types";

/** The leader's id on this team. */
export const NONPROFIT_LEADER_ID = "np-1";

/** The people as a stored profile carries them: no `owner` mark on any of them. */
export function nonprofitLeaderPeople(): Person[] {
  return [
    {
      id: NONPROFIT_LEADER_ID,
      name: "Dana Whitfield",
      role: "President & CEO",
      active: true,
      entitlements: ["release_payment", "bank_reconcile", "approve_payroll", "view_reports_only"],
    },
    {
      id: "np-2",
      name: "Ravi Menon",
      role: "Finance Manager",
      active: true,
      entitlements: ["enter_invoices", "post_payments", "enter_payroll", "view_reports_only"],
    },
    {
      id: "np-3",
      name: "Lena Ortiz",
      role: "Development Director",
      active: true,
      entitlements: ["collect_cash", "view_reports_only"],
    },
    {
      id: "np-4",
      name: "Sam Okafor",
      role: "Program Director",
      active: true,
      entitlements: ["order_supplies", "approve_expenses", "view_reports_only"],
    },
  ];
}

/** The same team as the duty engines read it. */
export function nonprofitLeaderTeam(): RoleAssignment[] {
  return nonprofitLeaderPeople().map((p) => ({
    personId: p.id,
    personName: p.name,
    role: p.role,
    entitlements: [...(p.entitlements ?? [])] as RoleAssignment["entitlements"],
  }));
}
