import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AUDIT_BYPASS_SQL } from "@/test/pglite";
import { openSafetyDb, type SafetyDb } from "@/test/safety-db";
import {
  assembleAccountExport,
  inlineReportLogos,
  type ExportPage,
  type ExportPartRequest,
} from "./account-export";
import { exportAccountPage, exportAccountRows } from "./account-store";
import { removeMember } from "./firm/store";

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
