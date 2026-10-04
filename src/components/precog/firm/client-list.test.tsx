import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ClientList } from "./client-list";
import { openClientReport } from "./open-client-report";
import type { ClientEngagementRow } from "@/lib/precog/firm/store";

vi.mock("@/lib/precog/firm/server", () => ({
  restoreDeletedClient: vi.fn(),
  setClientOwnerEmail: vi.fn(),
}));

describe("Open report on the client list", () => {
  it("goes to the report only after the switch to that business succeeded", async () => {
    let finish!: (r: { ok: true }) => void;
    const switchBusiness = vi.fn(
      () => new Promise<{ ok: true } | { ok: false; reason: string }>((r) => (finish = r)),
    );
    const goToReport = vi.fn();
    const refused = vi.fn();
    const pending = openClientReport("biz_2", switchBusiness, goToReport, refused);
    expect(switchBusiness).toHaveBeenCalledWith("biz_2");
    await Promise.resolve();
    expect(goToReport).not.toHaveBeenCalled();
    finish({ ok: true });
    await expect(pending).resolves.toBe(true);
    expect(goToReport).toHaveBeenCalledTimes(1);
    expect(refused).not.toHaveBeenCalled();
  });

  it("stays on the page and reports why when the switch is refused", async () => {
    const goToReport = vi.fn();
    const refused = vi.fn();
    const ok = await openClientReport(
      "biz_2",
      async () => ({
        ok: false,
        reason: "Precog could not save the open business, so it stays open.",
      }),
      goToReport,
      refused,
    );
    expect(ok).toBe(false);
    expect(goToReport).not.toHaveBeenCalled();
    expect(refused).toHaveBeenCalledWith(
      "Precog could not save the open business, so it stays open.",
    );
  });

  it("shows an Open report button on every client row", () => {
    const row = {
      id: "biz_2",
      ownerUserId: "u1",
      name: "Second Dental",
      shared: false,
      lastReviewAt: null,
      reportSentAt: null,
      openFindings: 2,
      ownerEmail: null,
      ownerEmailStatus: null,
    } as unknown as ClientEngagementRow;
    const html = renderToStaticMarkup(
      <ClientList
        clients={[row, { ...row, id: "biz_1", name: "Open One" }]}
        deleted={[]}
        activeId="biz_1"
        onOpen={() => undefined}
        onOpenReport={() => undefined}
        onRestored={() => undefined}
        onClientsChange={() => undefined}
        canRestore
      />,
    );
    expect(html.match(/>Open report</g)).toHaveLength(2);
    expect(html).toContain('aria-label="Open the report for Second Dental"');
    // Open leads to each client's Monthly review, the open client's included.
    expect(html.match(/>Open</g)).toHaveLength(2);
    expect(html).toContain('aria-label="Open the Monthly review for Second Dental"');
    expect(html).toContain('aria-label="Open the Monthly review for Open One"');
  });

  it("shows the deleted list with Restore only to someone who may restore", () => {
    const deleted = [
      {
        id: "biz_gone",
        ownerUserId: "u1",
        name: "Gone Dental",
        industry: "dental",
        deletedAt: "2026-09-01T00:00:00.000Z",
        purgeOn: "2026-10-01T00:00:00.000Z",
      },
    ];
    const render = (canRestore: boolean) =>
      renderToStaticMarkup(
        <ClientList
          clients={[]}
          deleted={deleted}
          activeId="biz_1"
          onOpen={() => undefined}
          onOpenReport={() => undefined}
          onRestored={() => undefined}
          onClientsChange={() => undefined}
          canRestore={canRestore}
        />,
      );
    expect(render(true)).toContain('aria-label="Restore Gone Dental"');
    expect(render(true)).toContain("Recently deleted");
    expect(render(false)).not.toContain("Restore");
    expect(render(false)).not.toContain("Recently deleted");
  });
});
