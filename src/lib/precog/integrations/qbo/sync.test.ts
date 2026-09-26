import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { openTestDb, type TestDb } from "@/test/pglite";
import { defaultProfile } from "../../practice-profile";
import { encryptSecret } from "./client.server";
import { loadConnection, saveConnection } from "./store";
import { syncConnection } from "./sync.server";

/** A stand-in for Intuit: named-list rows by entity, and every query it was asked. */
function fakeIntuit(books: { Vendor: object[]; Employee: object[] }) {
  const queries: string[] = [];
  const fetchStub = vi.fn(async (input: string | URL | Request) => {
    const url = new URL(
      typeof input === "string" ? input : input instanceof URL ? input : input.url,
    );
    const statement = url.searchParams.get("query") ?? "";
    queries.push(statement);
    const entity = /from (\w+)/.exec(statement)?.[1] as "Vendor" | "Employee";
    const activeOnly = !/Active in \(true, false\)/i.test(statement);
    const start = Number(/startposition (\d+)/i.exec(statement)?.[1] ?? 1);
    const max = Number(/maxresults (\d+)/i.exec(statement)?.[1] ?? 100);
    const rows = books[entity]
      .filter((r) => !activeOnly || (r as { Active?: boolean }).Active !== false)
      .slice(start - 1, start - 1 + max);
    return Response.json({ QueryResponse: { [entity]: rows } });
  });
  return { fetchStub, queries };
}

async function connect(sql: TestDb["sql"], accessExpiresAt = "2099-01-01T00:00:00.000Z") {
  await saveConnection(sql, {
    ownerUserId: "own",
    businessId: "biz_1",
    realmId: "123",
    accessTokenEnc: encryptSecret("access-1"),
    refreshTokenEnc: encryptSecret("refresh-1"),
    accessExpiresAt,
    refreshExpiresAt: "2099-01-01T00:00:00.000Z",
  });
  const connection = await loadConnection(sql, "own", "biz_1");
  if (!connection) throw new Error("connection not saved");
  return connection;
}

describe("QuickBooks reading", () => {
  let db: TestDb;
  beforeAll(async () => {
    vi.stubEnv("INTEGRATION_KEY", "test-master-key");
    vi.stubEnv("QBO_CLIENT_ID", "cid");
    vi.stubEnv("QBO_CLIENT_SECRET", "csecret");
    db = await openTestDb();
  }, 60_000);
  afterAll(async () => {
    vi.unstubAllEnvs();
    await db.close();
  });
  beforeEach(async () => {
    await db.clear("integration_snapshots", "integration_connections", "businesses", '"user"');
    await db.seedUser("own");
    await db.pg.query(
      `insert into businesses (id, user_id, name, industry, profile, revision)
       values ('biz_1', 'own', 'Riverside Plumbing', 'general', $1::jsonb, 1)`,
      [JSON.stringify(defaultProfile("general"))],
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("asks for inactive rows too, so an employee made inactive shows as released", async () => {
    const books = {
      Vendor: [{ Id: "v1", DisplayName: "Acme", Active: true }],
      Employee: [
        { Id: "e1", DisplayName: "Ada Owner", Active: true },
        { Id: "e3", DisplayName: "Cy Gone", Active: true },
      ],
    };
    const intuit = fakeIntuit(books);
    vi.stubGlobal("fetch", intuit.fetchStub);
    await syncConnection(db.sql, await connect(db.sql));

    books.Employee[1] = { Id: "e3", DisplayName: "Cy Gone", Active: false };
    const drift = await syncConnection(db.sql, (await loadConnection(db.sql, "own", "biz_1"))!);
    expect(intuit.queries.every((q) => /where Active in \(true, false\)/.test(q))).toBe(true);
    expect(drift.employeesReleased.map((e) => e.name)).toEqual(["Cy Gone"]);
  });

  it("reads past the first thousand rows", async () => {
    const vendors = Array.from({ length: 1203 }, (_, i) => ({
      Id: `v${i}`,
      DisplayName: `Vendor ${i}`,
      Active: true,
    }));
    const intuit = fakeIntuit({ Vendor: vendors, Employee: [] });
    vi.stubGlobal("fetch", intuit.fetchStub);
    await syncConnection(db.sql, await connect(db.sql));
    const rows = await db.sql<{ n: number }>`
      select jsonb_array_length(vendors) as n from integration_snapshots
    `;
    expect(rows[0].n).toBe(1203);
  });
});
