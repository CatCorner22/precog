import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { diffSnapshots } from "@/lib/precog/integrations/qbo/model";
import { DriftList } from "./quickbooks-panel";

vi.mock("@/lib/precog/practice-context", () => ({ usePractice: vi.fn() }));
vi.mock("@/lib/precog/integrations/qbo/server", () => ({
  disconnectQuickBooks: vi.fn(),
  getQuickBooksStatus: vi.fn(),
  startQuickBooksConnect: vi.fn(),
  syncQuickBooksNow: vi.fn(),
}));

describe("QuickBooks drift wording", () => {
  const employee = { id: "e1", name: "Pat Lee", active: true, releasedOn: null };

  it("limits a departed person's signal to the active employee-list record", () => {
    const drift = diffSnapshots(
      null,
      { takenAt: "2026-10-06", vendors: [], employees: [employee] },
      [{ name: employee.name, active: false }],
    );
    const html = renderToStaticMarkup(<DriftList drift={drift} />);
    expect(html).toContain("Marked left here; still active in QuickBooks");
    expect(html).toContain("still active in the QuickBooks employee list");
    expect(html).toContain("Payment status not checked.");
    expect(html).toContain("Check the payroll register");
    expect(html).not.toMatch(/still paid|still pays|stopped their pay/i);
  });

  it("does not claim an unmatched employee is paid or a released employee's pay stopped", () => {
    const drift = diffSnapshots(
      null,
      {
        takenAt: "2026-10-06",
        vendors: [],
        employees: [employee, { ...employee, id: "e2", name: "Sam", active: false }],
      },
      [],
    );
    const html = renderToStaticMarkup(<DriftList drift={drift} />);
    expect(html).toContain("Active employee record not in Duty assignments");
    expect(html).toContain("Employee record inactive or released");
    expect(html).toContain("Payment status not checked.");
    expect(html).not.toMatch(/paid but|released from payroll|still paid|still pays/i);
  });

  it("does not turn an empty comparison into reassurance about payroll payments", () => {
    const snapshot = { takenAt: "2026-10-06", vendors: [], employees: [employee] };
    const drift = diffSnapshots(snapshot, snapshot, [{ name: employee.name }]);
    const html = renderToStaticMarkup(<DriftList drift={drift} />);
    expect(html).toContain("active employee names match Duty assignments");
    expect(html).toContain("Payment status not checked.");
    expect(html).not.toMatch(/no payment|still paid|books match/i);
  });
});
