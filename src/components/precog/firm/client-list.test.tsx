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
    const html = renderToStaticMarkup(
      <ClientList
        clients={[row, { ...row, id: "biz_1", name: "Open One" }]}
        deleted={[]}
        activeId="biz_1"
        onOpen={() => undefined}
        onOpenReport={() => undefined}
        onRestored={() => undefined}
        onClientsChange={() => undefined}
        onExport={() => undefined}
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
          onExport={() => undefined}
          canRestore={canRestore}
        />,
      );
    expect(render(true)).toContain('aria-label="Restore Gone Dental"');
    expect(render(true)).toContain("Recently deleted");
    expect(render(false)).not.toContain("Restore");
    expect(render(false)).not.toContain("Recently deleted");
  });
});

const row: ClientEngagementRow = {
  id: "biz_2",
  ownerUserId: "u1",
  name: "Second Dental",
  shared: false,
  startedAt: null,
  mapCompletedAt: null,
  reportSentAt: null,
  openFindings: 2,
  acceptedFindings: 0,
  lastReviewAt: null,
  ownerEmail: null,
  ownerEmailStatus: null,
  status: "active",
  endedAt: null,
  granted: false,
  months: [
    { period: "2026-09", done: 4, exceptions: 0, skipped: 0 },
    { period: "2026-10", done: 0, exceptions: 0, skipped: 0 },
  ],
  awaitingReview: 0,
};

/** The row with September's and October's counts. */
function counted(
  september: { done: number; exceptions?: number; skipped?: number },
  october: { done: number; exceptions?: number; skipped?: number },
): Pick<ClientEngagementRow, "months"> {
  return {
    months: [
      { period: "2026-09", exceptions: 0, skipped: 0, ...september },
      { period: "2026-10", exceptions: 0, skipped: 0, ...october },
    ],
  };
}

function table(clients: ClientEngagementRow[], today = "2026-10-12") {
  return renderToStaticMarkup(
    <ClientList
      clients={clients}
      deleted={[]}
      activeId="none"
      onOpen={() => undefined}
      onOpenReport={() => undefined}
      onRestored={() => undefined}
      onClientsChange={() => undefined}
      onExport={() => undefined}
      canRestore
      today={today}
    />,
  );
}

describe("client table", () => {
  it("heads each column, sorted by Exceptions first", () => {
    const html = table([row]);
    const headers = [...html.matchAll(/<th scope="col"[^>]*>(.*?)<\/th>/g)].map((m) =>
      m[1].replace(/<[^>]+>/g, ""),
    );
    expect(headers).toEqual([
      "Client",
      "Status",
      "Last review",
      "Last month",
      "This month",
      "Exceptions",
      "Skipped",
      "Open duty conflicts",
      "Awaiting review",
      "",
    ]);
    expect(html.match(/aria-sort="descending"/g)).toHaveLength(1);
    expect(html).toMatch(/aria-sort="descending"[^>]*><button[^>]*>Exceptions/);
    expect(html.match(/aria-sort="none"/g)).toHaveLength(8);
  });

  it("lists the clients with exceptions first, then the rest by name, until another column is chosen", () => {
    const html = table([
      { ...row, id: "z", name: "Zinc Works" },
      { ...row, id: "a", name: "Acme Dental" },
      { ...row, id: "m", name: "Mill Clinic", ...counted({ done: 3, exceptions: 1 }, { done: 0 }) },
    ]);
    expect(html.indexOf("Mill Clinic")).toBeLessThan(html.indexOf("Acme Dental"));
    expect(html.indexOf("Acme Dental")).toBeLessThan(html.indexOf("Zinc Works"));
  });

  it("prints the status, the client's own tag and each cell", () => {
    const html = table([
      {
        ...row,
        granted: true,
        shared: true,
        lastReviewAt: "2026-10-03T15:00:00.000Z",
        ...counted({ done: 2, skipped: 2 }, { done: 3, exceptions: 1, skipped: 1 }),
        awaitingReview: 2,
      },
      {
        ...row,
        id: "biz_3",
        name: "Member Shop",
        shared: true,
        status: "ended",
        endedAt: "2026-09-30T12:00:00.000Z",
        openFindings: null,
        ...counted({ done: 4 }, { done: 5 }),
      },
    ]);
    expect(html).toContain("Client&#x27;s own");
    expect(html.match(/another firm member&#x27;s/g)).toHaveLength(1);
    // Status, Last review, Last month, This month, Exceptions, Skipped, Open
    // duty conflicts, Awaiting review, row by row in the default order (the
    // client with exceptions first).
    const [granted, member] = cellsOf(html).map((cells) => cells.slice(1, 9));
    expect(granted).toEqual([
      "Active",
      "2026-10-03",
      "2 of 4 doneOverdue",
      "3 of 5 done",
      "1 this month",
      "2 last month, 1 this month",
      "2",
      "2",
    ]);
    expect(member[0]).toMatch(/^Ended Sep (29|30), 2026$/);
    expect(member.slice(1)).toEqual([
      "None",
      "4 of 4 done",
      "5 of 5 done",
      "None",
      "None",
      "Not counted yet",
      "None",
    ]);
  });

  it("tags only a row someone else holds", () => {
    // The viewer's own business, which they shared with a firm: no tag at all.
    const own = table([{ ...row, granted: true, shared: false }]);
    expect(own).not.toContain("Client&#x27;s own");
    expect(own).not.toContain("another firm member&#x27;s");
    // The same business seen by the firm it was shared with.
    const firmSide = table([{ ...row, granted: true, shared: true }]);
    expect(firmSide).toContain("Client&#x27;s own");
    expect(firmSide).not.toContain("another firm member&#x27;s");
  });

  it("badges last month Overdue only after its due day, the 10th", () => {
    const open = { ...row, ...counted({ done: 1 }, { done: 0 }) };
    expect(table([open], "2026-10-10")).toContain(">1 of 4 done<");
    expect(table([open], "2026-10-10")).not.toContain("Overdue<");
    expect(table([open], "2026-10-11")).toMatch(/>1 of 4 done<span[^>]*>Overdue<\/span>/);
    expect(table([row], "2026-10-11")).not.toContain("Overdue<");
  });

  it("totals the table, offers the CSV and says how to sort", () => {
    const html = table([
      { ...row, ...counted({ done: 4 }, { done: 2 }), awaitingReview: 1 },
      { ...row, id: "b2", name: "Other", ...counted({ done: 4 }, { done: 5 }), awaitingReview: 2 },
    ]);
    expect(html).toContain(
      "2 clients · 1 with this month&#x27;s review open · 0 with last month overdue · 0 with exceptions · 3 versions awaiting review",
    );
    expect(html).toContain("Last month and This month count Done checks only;");
    expect(html).toContain(">Export clients (CSV)<");
    expect(html).toContain("Sort by any column; Export clients (CSV) downloads the same columns.");
  });

  it("offers no CSV and no totals with no clients", () => {
    const html = table([]);
    expect(html).not.toContain("Export clients (CSV)</button>");
    expect(html).not.toContain(" clients · ");
    expect(html).not.toContain("Sort by any column");
    expect(html).toContain("Precog sends nothing else to it.</p>");
    expect(html).toContain("No saved clients yet.");
  });
});

/** The text of each body row's cells, tags stripped. */
function cellsOf(html: string): string[][] {
  const body = html.slice(html.indexOf("<tbody"));
  return [...body.matchAll(/<tr[^>]*>(.*?)<\/tr>/g)].map((r) =>
    [...r[1].matchAll(/<td[^>]*>(.*?)<\/td>/g)].map((c) => c[1].replace(/<[^>]+>/g, "")),
  );
}
