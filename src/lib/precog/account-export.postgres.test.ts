import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AUDIT_BYPASS_SQL } from "@/test/pglite";
import { openSafetyDb, type SafetyDb } from "@/test/safety-db";
import {
  assembleAccountExport,
  inlineReportLogos,
  partArrivedWhole,
  type ExportPage,
  type ExportPartRequest,
} from "./account-export";
import { exportAccountPage, exportAccountRows } from "./account-store";
import { removeMember } from "./firm/store";

/** Every part of the plan `first` made, each checked against its plan as the browser checks it. */
async function fetchRest(
  db: SafetyDb,
  first: { page: ExportPage; parts: ExportPartRequest[] | null },
  budget?: number,
): Promise<ExportPage[]> {
  const pages: ExportPage[] = [first.page];
  for (const part of first.parts ?? []) {
    const { page } = await exportAccountPage(db.sql, "ua", null, part, budget);
    expect(partArrivedWhole(part, page)).toBe(true);
    if (budget !== undefined) {
      expect(Buffer.byteLength(JSON.stringify(page))).toBeLessThanOrEqual(budget);
    }
    pages.push(page);
  }
  return pages;
}

// A skip in the ordinary embedded suite is explicit; these run the paged
// export's byte-order keys and the departure's set-based statements on a
// real PostgreSQL server and its node-postgres driver.
describe.runIf(process.env.PRECOG_LIFECYCLE_POSTGRES === "1")(
  "real PostgreSQL account export in parts and a member's departure",
  () => {
    let db: SafetyDb;
    beforeAll(async () => {
      db = await openSafetyDb();
    }, 60_000);
    afterAll(async () => {
      await db?.close();
    });

    beforeEach(async () => {
      await db.pg.exec(`begin; ${AUDIT_BYPASS_SQL} delete from "user"; commit;`);
      for (const id of ["ua", "ub"]) await db.seedUser(id);
      await db.pg.exec(`
        insert into firms (user_id, name, logo_data_url)
          values ('ua', 'North', 'data:image/png;base64,${"L".repeat(50_000)}');
        insert into firm_members (firm_user_id, member_user_id, role)
          values ('ua', 'ua', 'owner'), ('ua', 'ub', 'preparer');
      `);
    });

    it("pages the export by byte-ordered keys into the single export's content", async () => {
      await db.pg.exec(`
        insert into businesses (id, user_id, name, industry, profile, revision, firm_user_id, updated_at)
          select 'Biz_' || g, 'ua', 'Client ' || g, 'dental',
            jsonb_build_object('notes', repeat('é', 200000)), 1, 'ua', now() - g * interval '1 hour'
          from generate_series(1, 5) as g;
        insert into report_versions (id, user_id, business_id, version_no, profile, firm_name,
            firm_logo_data_url)
          select 'rv_' || g, 'ua', 'Biz_' || (g % 5 + 1), g,
            jsonb_build_object('notes', repeat('"', 100000)), 'North',
            'data:image/png;base64,${"L".repeat(50_000)}'
          from generate_series(1, 40) as g;
        insert into review_events (user_id, business_id, period, item_key, result)
          select 'ua', 'Biz_1', '2026-09', 'bank_statement', 'done' from generate_series(1, 30);
      `);
      const budget = 1024 * 1024;
      const first = await exportAccountPage(db.sql, "ua", "ua", { section: "account" }, budget);
      const parts: ExportPartRequest[] = first.parts ?? [];
      const pages: ExportPage[] = [first.page];
      for (const part of parts) {
        const { page } = await exportAccountPage(db.sql, "ua", "ua", part, budget);
        expect(Buffer.byteLength(JSON.stringify(page))).toBeLessThanOrEqual(budget);
        pages.push(page);
      }
      expect(parts.filter((p) => p.section === "reportVersions").length).toBeGreaterThan(2);
      const file = assembleAccountExport(pages);
      expect(file.reportLogos).toHaveLength(1);
      expect(file.reportVersions).toHaveLength(40);
      const { exportedAt: pagedAt, ...paged } = inlineReportLogos(file);
      const { exportedAt: singleAt, ...single } = await exportAccountRows(db.sql, "ua", "ua");
      expect(typeof pagedAt).toBe(typeof singleAt);
      expect(paged).toEqual(single);
    }, 60_000);

    it("never drops a business saved on another connection while its download runs", async () => {
      await db.pg.exec(`
        insert into businesses (id, user_id, name, industry, profile, revision, updated_at)
          select 'Biz_' || g, 'ua', 'Client ' || g, 'dental', '{}'::jsonb, 1,
            now() - g * interval '1 hour'
          from generate_series(1, 6) as g;
      `);
      const ids = ["Biz_1", "Biz_2", "Biz_3", "Biz_4", "Biz_5", "Biz_6"];
      for (let round = 0; round < 8; round += 1) {
        const first = await exportAccountPage(db.sql, "ua", null, { section: "account" });
        let saving = true;
        let saved = 0;
        const saves = (async () => {
          while (saving) {
            const id = ids[saved % ids.length];
            await db.sql`
              update businesses set profile = ${JSON.stringify({ save: saved })}::jsonb,
                revision = revision + 1, updated_at = clock_timestamp()
              where user_id = 'ua' and id = ${id}
            `;
            saved += 1;
          }
        })();
        let pages: ExportPage[];
        try {
          pages = await fetchRest(db, first);
        } finally {
          saving = false;
          await saves;
        }
        expect(saved).toBeGreaterThan(0);
        const file = assembleAccountExport(pages);
        expect(file.businesses.map((b) => b.id).sort()).toEqual(ids);
        const times = file.businesses.map((b) => b.updatedAt);
        expect(times).toEqual([...times].sort().reverse());
      }
    }, 60_000);

    it("cuts a QuickBooks reading past the budget into slices that join to the single export", async () => {
      await db.pg.exec(`
        insert into businesses (id, user_id, name, industry, profile, revision)
          values ('Biz_1', 'ua', 'Client', 'dental', '{}'::jsonb, 1);
        insert into integration_snapshots (user_id, business_id, provider, vendors, employees)
        select 'ua', 'Biz_1', 'qbo',
          (select jsonb_agg(jsonb_build_object('id', g::text, 'name', 'Vendör "' || g || '" ' ||
              repeat('v', g % 50), 'active', true) order by g) from generate_series(1, 3000) as g),
          (select jsonb_agg(jsonb_build_object('id', g::text, 'name', 'Employee ' || g,
              'releasedOn', null) order by g) from generate_series(1, 3000) as g);
      `);
      const budget = 64 * 1024;
      const first = await exportAccountPage(db.sql, "ua", null, { section: "account" }, budget);
      const slices = (first.parts ?? []).filter((p) => p.section === "quickBooksSnapshots");
      expect(slices.length).toBeGreaterThan(4);
      const file = assembleAccountExport(await fetchRest(db, first, budget));
      const { exportedAt: pagedAt, ...paged } = inlineReportLogos(file);
      const { exportedAt: singleAt, ...single } = await exportAccountRows(db.sql, "ua");
      expect(typeof pagedAt).toBe(typeof singleAt);
      expect(paged).toEqual(single);
      expect(paged.quickBooksSnapshots[0].vendors).toHaveLength(3000);
    }, 60_000);

    it("moves all of a departing member's clients and their rows in set-based statements", async () => {
      await db.pg.exec(`
        insert into businesses (id, user_id, name, industry, profile, revision, firm_user_id)
          values ('biz_0', 'ua', 'Own', 'general', '{}'::jsonb, 1, 'ua');
        insert into businesses (id, user_id, name, industry, profile, revision, firm_user_id)
          select 'biz_' || g, 'ub', 'Client ' || g, 'general', '{}'::jsonb, 2, 'ua'
          from generate_series(0, 9) as g;
        insert into report_versions (id, user_id, business_id, version_no, profile)
          select 'rv_' || g, 'ub', 'biz_' || g, 1, '{}'::jsonb from generate_series(0, 9) as g;
        insert into business_profiles (user_id, profile)
          values ('ua', '{"businessId":"biz_3","ownerUserId":"ub"}'::jsonb);
      `);
      const moved = await removeMember(db.sql, "ua", "ub");
      expect(moved).toHaveLength(10);
      expect(moved?.[0]).toEqual({
        from: "biz_0",
        to: expect.stringMatching(/^biz_0-[0-9a-f]{8}$/),
        name: "Client 0",
      });
      const left = await db.sql<{ n: number }>`
        select count(*)::int as n from businesses where user_id = 'ub'
      `;
      expect(left[0].n).toBe(0);
      const versions = await db.sql<{ user_id: string; business_id: string }>`
        select user_id, business_id from report_versions order by id
      `;
      expect(versions.map((v) => v.user_id)).toEqual(Array(10).fill("ua"));
      expect(versions.map((v) => v.business_id)).toEqual(moved?.map((m) => m.to));
      const pointer = await db.sql<{ profile: unknown }>`
        select profile from business_profiles where user_id = 'ua'
      `;
      expect(pointer[0].profile).toEqual({ businessId: "biz_3", ownerUserId: "ua" });
    });
  },
);
