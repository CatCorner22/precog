import { describe, expect, it } from "vitest";
import {
  assembleAccountExport,
  continuesReading,
  ExportChangedError,
  exportFileChunks,
  partArrivedWhole,
  type AccountExportPart,
  type ExportPage,
  type PagedPartRequest,
} from "./account-export";

/**
 * The browser's half of the paged account export: joining the parts into
 * one file, checking each part against its plan, and writing the file in
 * pieces. The server's half is in account-store.test.ts.
 */
const account: AccountExportPart = {
  exportedAt: "2026-10-06T12:00:00.000Z",
  user: { id: "ua", name: "Ann", email: "ann@example.test", createdAt: "2026-01-01T00:00:00.000Z" },
  firmGrants: [],
  deletedBusinesses: [{ businessId: "biz_gone", deletedAt: "2026-09-01T00:00:00.000Z" }],
  firmMemberships: [],
  engagements: [],
  reminderSettings: null,
  billing: null,
  quickBooksConnections: [],
  activity: [],
  modelUsage: [],
};
const asOf = "2026-10-06T12:00:00.123456Z";
const business = (id: string, updatedAt: string) => ({
  id,
  name: `Client ${id}`,
  industry: "dental",
  revision: 1,
  updatedAt,
  deletedAt: null,
  grantedAt: null,
  profile: { notes: 'Quotes " and \\ and <tags>, a line\nbreak, and é ✓' },
});
const reading = (vendors: unknown[], employees: unknown[]) => ({
  businessId: "biz_1",
  takenAt: "2026-10-01T00:00:00.000Z",
  vendors,
  employees,
});
const part = (extra: Partial<PagedPartRequest> = {}): PagedPartRequest => ({
  section: "quickBooksSnapshots",
  first: "k",
  last: "k",
  count: 1,
  asOf,
  ...extra,
});

describe("joining the parts", () => {
  it("puts the businesses newest saved first, whatever order their parts came in", () => {
    const file = assembleAccountExport([
      { section: "account", data: account },
      { section: "businesses", rows: [business("biz_a", "2026-10-01T00:00:00.000Z")] },
      { section: "businesses", rows: [business("biz_b", "2026-10-03T00:00:00.000Z")] },
      { section: "businesses", rows: [business("biz_c", "2026-10-01T00:00:00.000Z")] },
    ]);
    // A tie on the time goes to the higher id, as the export always wrote it.
    expect(file.businesses.map((b) => b.id)).toEqual(["biz_b", "biz_c", "biz_a"]);
  });

  it("joins a QuickBooks reading's slices back into the one reading", () => {
    const file = assembleAccountExport([
      { section: "account", data: account },
      { section: "quickBooksSnapshots", rows: [reading([{ id: "v1" }, { id: "v2" }], [])] },
      {
        section: "quickBooksSnapshots",
        rows: [reading([{ id: "v3" }], [{ id: "e1" }])],
        continues: true,
      },
      { section: "quickBooksSnapshots", rows: [reading([], [{ id: "e2" }])], continues: true },
      {
        section: "quickBooksSnapshots",
        rows: [{ ...reading([{ id: "w1" }], []), takenAt: "2026-09-01T00:00:00.000Z" }],
      },
    ]);
    expect(file.quickBooksSnapshots).toEqual([
      reading([{ id: "v1" }, { id: "v2" }, { id: "v3" }], [{ id: "e1" }, { id: "e2" }]),
      { ...reading([{ id: "w1" }], []), takenAt: "2026-09-01T00:00:00.000Z" },
    ]);
  });

  it("refuses a slice that continues another reading, or nothing", () => {
    const start: ExportPage = {
      section: "quickBooksSnapshots",
      rows: [reading([{ id: "v1" }], [])],
    };
    const other: ExportPage = {
      section: "quickBooksSnapshots",
      rows: [{ ...reading([{ id: "v2" }], []), takenAt: "2026-09-01T00:00:00.000Z" }],
      continues: true,
    };
    const first: ExportPage = { section: "account", data: account };
    expect(() => assembleAccountExport([first, start, other])).toThrow(ExportChangedError);
    expect(() => assembleAccountExport([first, other])).toThrow(ExportChangedError);
  });
});

describe("checking a part against its plan", () => {
  it("accepts exactly the rows the plan counted, and a slice continuing where planned", () => {
    const one: ExportPage = { section: "quickBooksSnapshots", rows: [reading([], [])] };
    expect(partArrivedWhole(part(), one)).toBe(true);
    expect(partArrivedWhole(part({ count: 2 }), one)).toBe(false);
    expect(partArrivedWhole(part(), { section: "quickBooksSnapshots", rows: [] })).toBe(false);
    expect(partArrivedWhole(part(), { section: "reviews", rows: [] })).toBe(false);
    const sliced = part({ slice: { vendors: [5, 9], employees: [0, 0] } });
    expect(continuesReading(sliced)).toBe(true);
    expect(continuesReading(part({ slice: { vendors: [0, 5], employees: [0, 0] } }))).toBe(false);
    expect(partArrivedWhole(sliced, one)).toBe(false);
    expect(partArrivedWhole(sliced, { ...one, continues: true })).toBe(true);
    expect(partArrivedWhole({ section: "firm" }, { section: "account", data: account })).toBe(
      false,
    );
  });
});

describe("writing the file in pieces", () => {
  it("joins to exactly the pretty-printed file, one piece per row of each list", () => {
    const file = assembleAccountExport([
      { section: "account", data: account },
      {
        section: "firm",
        data: {
          firm: {
            name: "North",
            plan: "firm",
            letterhead: "1 Main St",
            logoDataUrl: null,
            coverPage: true,
            retentionYears: 7,
            updatedAt: "2026-10-01T00:00:00.000Z",
          },
          firmMembers: [],
          firmInvites: [],
          firmClients: [],
        },
      },
      {
        section: "businesses",
        rows: [
          business("biz_1", "2026-10-01T00:00:00.000Z"),
          business("biz_2", "2026-10-02T00:00:00.000Z"),
        ],
      },
      {
        section: "quickBooksSnapshots",
        rows: [reading([{ id: "v1", tags: [], extra: {} }, null, 7, "x"], [])],
      },
    ]);
    const chunks = exportFileChunks(file);
    expect(chunks.join("")).toBe(JSON.stringify(file, null, 2));
    expect(JSON.parse(chunks.join(""))).toEqual(file);
    // Each business is a piece of its own: no piece holds the whole list.
    expect(chunks.filter((c) => c.includes('"id": "biz_'))).toHaveLength(2);
    expect(exportFileChunks({} as Parameters<typeof exportFileChunks>[0]).join("")).toBe("{}");
  });
});
