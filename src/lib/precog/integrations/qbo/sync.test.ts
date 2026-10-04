import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { openTestDb, type TestDb } from "@/test/pglite";
import { defaultProfile } from "../../practice-profile";
import { decryptSecret, encryptSecret } from "./client.server";
import {
  deleteConnection,
  listConnectionsDue,
  listSnapshots,
  loadConnection,
  saveConnection,
  statusOf,
} from "./store";
import {
  recordReadingFailure,
  removeConnection,
  syncConnection,
  syncDueConnections,
} from "./sync.server";

const report = vi.hoisted(() => ({
  error: vi.fn(async (_err: unknown, _at?: string | null) => {}),
}));
vi.mock("@/lib/observability/report.server", () => ({ reportServerError: report.error }));

/** A stand-in for Intuit: named-list rows by entity, and every query it was asked. */
function fakeIntuit(books: { Vendor: object[]; Employee: object[] }) {
  const queries: string[] = [];
  const fetchStub = vi.fn(async (input: string | URL | Request) => {
    const url = new URL(
      typeof input === "string" ? input : input instanceof URL ? input : input.url,
    );
    if (url.pathname.endsWith("/tokens/bearer")) {
      return Response.json({
        access_token: "access-2",
        refresh_token: "refresh-2",
        expires_in: 3600,
        x_refresh_token_expires_in: 8_640_000,
      });
    }
    if (url.pathname.endsWith("/revoke")) return new Response(null, { status: 200 });
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

async function connect(
  sql: TestDb["sql"],
  {
    accessExpiresAt = "2099-01-01T00:00:00.000Z",
    refreshExpiresAt = "2099-01-01T00:00:00.000Z",
  } = {},
) {
  await saveConnection(sql, {
    ownerUserId: "own",
    businessId: "biz_1",
    realmId: "123",
    accessTokenEnc: encryptSecret("access-1"),
    refreshTokenEnc: encryptSecret("refresh-1"),
    accessExpiresAt,
    refreshExpiresAt,
    connectedBy: "own",
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

  it("keeps the change a reading found when the books are read again unchanged", async () => {
    const books = {
      Vendor: [{ Id: "v1", DisplayName: "Acme", Active: true, AcctNum: "A-100" }],
      Employee: [],
    };
    vi.stubGlobal("fetch", fakeIntuit(books).fetchStub);
    await syncConnection(db.sql, await connect(db.sql));
    books.Vendor[0] = { ...books.Vendor[0], AcctNum: "B-200" };
    const found = await syncConnection(db.sql, (await loadConnection(db.sql, "own", "biz_1"))!);
    const again = await syncConnection(db.sql, (await loadConnection(db.sql, "own", "biz_1"))!);
    expect(found.vendorsChanged.map((c) => c.fields)).toEqual([["accountNumber"]]);
    expect(again.vendorsChanged.map((c) => c.fields)).toEqual([["accountNumber"]]);
    expect(await listSnapshots(db.sql, "own", "biz_1", 12)).toHaveLength(2);
  });

  it("stores account numbers, addresses and emails as digests only", async () => {
    vi.stubGlobal(
      "fetch",
      fakeIntuit({
        Vendor: [
          {
            Id: "v1",
            DisplayName: "Acme",
            AcctNum: "ACCT-99887766",
            PrimaryEmailAddr: { Address: "ap@acme.test" },
            BillAddr: { Line1: "1 Main St" },
          },
        ],
        Employee: [
          { Id: "e1", DisplayName: "Ada", PrimaryEmailAddr: { Address: "ada@shop.test" } },
        ],
      }).fetchStub,
    );
    await syncConnection(db.sql, await connect(db.sql));
    const raw = await db.sql<{ body: string }>`
      select vendors::text || employees::text as body from integration_snapshots
    `;
    expect(raw[0].body).not.toMatch(/ACCT-99887766|ap@acme\.test|1 Main St|ada@shop\.test/);
    expect(raw[0].body).toContain("Acme");
  });

  it("refreshes a lapsing token once and never overwrites a newer pair", async () => {
    vi.stubGlobal("fetch", fakeIntuit({ Vendor: [], Employee: [] }).fetchStub);
    const stale = await connect(db.sql, { accessExpiresAt: "2020-01-01T00:00:00.000Z" });
    await syncConnection(db.sql, stale);
    const after = (await loadConnection(db.sql, "own", "biz_1"))!;
    expect(decryptSecret(after.refreshTokenEnc)).toBe("refresh-2");

    // A second reading that started from the same old row loses the write.
    await db.sql`update integration_connections set refresh_token_enc = ${encryptSecret("refresh-3")}`;
    await syncConnection(db.sql, stale);
    const final = (await loadConnection(db.sql, "own", "biz_1"))!;
    expect(decryptSecret(final.refreshTokenEnc)).toBe("refresh-3");
  });

  it("records a failed scheduled reading as a sentence and keeps the last read time", async () => {
    const connection = await connect(db.sql, { accessExpiresAt: "2020-01-01T00:00:00.000Z" });
    await db.sql`update integration_connections set refresh_token_enc = 'not.a.token'`;
    vi.stubGlobal("fetch", fakeIntuit({ Vendor: [], Employee: [] }).fetchStub);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(await syncDueConnections(db.sql)).toEqual({
      synced: 0,
      failed: 1,
      stopped: false,
      remaining: 0,
    });
    const row = (await loadConnection(db.sql, "own", "biz_1"))!;
    expect(row.lastError).toBe(
      "QuickBooks no longer accepts this connection. Disconnect and connect again.",
    );
    expect(row.lastSyncedAt).toBe(connection.lastSyncedAt);
  });

  it("tells the advisor to disconnect only when Intuit refuses the grant itself", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const intuit = fakeIntuit({ Vendor: [], Employee: [] });
    const failure = async (tokenAnswer: () => Response | Promise<Response>) => {
      await connect(db.sql, { accessExpiresAt: "2020-01-01T00:00:00.000Z" });
      vi.stubGlobal(
        "fetch",
        vi.fn(async (input: string | URL | Request) =>
          String(input).endsWith("/tokens/bearer") ? tokenAnswer() : intuit.fetchStub(input),
        ),
      );
      await syncDueConnections(db.sql);
      return (await loadConnection(db.sql, "own", "biz_1"))!.lastError;
    };
    const later = "QuickBooks refused the request. Try again later.";
    const reconnect = "QuickBooks no longer accepts this connection. Disconnect and connect again.";

    expect(await failure(() => new Response("Service Unavailable", { status: 503 }))).toBe(later);
    expect(await failure(() => Promise.reject(new TypeError("fetch failed")))).toBe(later);
    expect(await failure(() => Response.json({ error: "invalid_grant" }, { status: 400 }))).toBe(
      reconnect,
    );
  });

  it("waits for the error report before it records a failed reading", async () => {
    const connection = await connect(db.sql);
    let deliver = () => {};
    report.error.mockImplementationOnce(() => new Promise<void>((resolve) => (deliver = resolve)));
    let settled = false;
    const recorded = recordReadingFailure(db.sql, connection, new Error("boom")).then((text) => {
      settled = true;
      return text;
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(settled).toBe(false);
    deliver();
    await recorded;
    expect(report.error).toHaveBeenCalledWith(expect.any(Error), "qbo-reading");
  });

  it("skips expired connections in the scheduled pass and flags them for reconnecting", async () => {
    const connection = await connect(db.sql, { refreshExpiresAt: "2020-01-01T00:00:00.000Z" });
    expect(await listConnectionsDue(db.sql, 28)).toEqual([]);
    expect(statusOf(connection).needsReconnect).toBe(true);
    expect(statusOf({ ...connection, refreshExpiresAt: "2099-01-01T00:00:00.000Z" })).toEqual({
      connectedAt: connection.connectedAt,
      lastSyncedAt: null,
      lastError: null,
      needsReconnect: false,
    });
  });

  it("removes a connection whose token can no longer be read, with its readings", async () => {
    vi.stubGlobal("fetch", fakeIntuit({ Vendor: [], Employee: [] }).fetchStub);
    await syncConnection(db.sql, await connect(db.sql));
    await db.sql`update integration_connections set refresh_token_enc = 'bad.tag.body'`;
    await removeConnection(db.sql, (await loadConnection(db.sql, "own", "biz_1"))!);
    expect(await loadConnection(db.sql, "own", "biz_1")).toBeNull();
    expect(await listSnapshots(db.sql, "own", "biz_1", 12)).toEqual([]);
  });

  it("keeps the connection and its readings together when a delete fails", async () => {
    vi.stubGlobal("fetch", fakeIntuit({ Vendor: [], Employee: [] }).fetchStub);
    await syncConnection(db.sql, await connect(db.sql));
    const failing = Object.assign(
      async () => {
        throw new Error("not used");
      },
      {
        transaction: <T>(work: (tx: TestDb["sql"]) => Promise<T>) =>
          db.sql.transaction!(async (tx) => {
            let calls = 0;
            const flaky = (async (strings: TemplateStringsArray, ...values: unknown[]) => {
              calls += 1;
              if (calls === 2) throw new Error("connection lost");
              return tx(strings, ...values);
            }) as unknown as TestDb["sql"];
            return work(flaky);
          }),
      },
    ) as unknown as TestDb["sql"];
    await expect(deleteConnection(failing, "own", "biz_1")).rejects.toThrow("connection lost");
    expect(await loadConnection(db.sql, "own", "biz_1")).not.toBeNull();
    expect(await listSnapshots(db.sql, "own", "biz_1", 12)).toHaveLength(1);
  });

  it("stops before the next connection once the deadline has passed, and says how many are left", async () => {
    await connect(db.sql);
    const intuit = fakeIntuit({ Vendor: [], Employee: [] });
    vi.stubGlobal("fetch", intuit.fetchStub);
    expect(await syncDueConnections(db.sql, { deadline: Date.now() - 1 })).toEqual({
      synced: 0,
      failed: 0,
      stopped: true,
      remaining: 1,
    });
    expect(intuit.fetchStub).not.toHaveBeenCalled();
    expect(await syncDueConnections(db.sql, { deadline: Date.now() + 60_000 })).toEqual({
      synced: 1,
      failed: 0,
      stopped: false,
      remaining: 0,
    });
  });

  it("records who connected, and who connected again, without changing whose books they are", async () => {
    const first = await connect(db.sql);
    expect(first.connectedBy).toBe("own");
    expect(first.ownerUserId).toBe("own");
    await saveConnection(db.sql, {
      ownerUserId: "own",
      businessId: "biz_1",
      realmId: "123",
      accessTokenEnc: encryptSecret("access-3"),
      refreshTokenEnc: encryptSecret("refresh-3"),
      accessExpiresAt: "2099-01-01T00:00:00.000Z",
      refreshExpiresAt: "2099-01-01T00:00:00.000Z",
      connectedBy: "firm-reviewer",
    });
    const again = await loadConnection(db.sql, "own", "biz_1");
    expect(again).toMatchObject({ ownerUserId: "own", connectedBy: "firm-reviewer" });
    // A row stored before connected_by was written reads as null.
    await db.sql`update integration_connections set connected_by = null`;
    expect((await loadConnection(db.sql, "own", "biz_1"))?.connectedBy).toBeNull();
  });

  it("scopes each connection to its account, even when business ids match", async () => {
    await db.seedUser("two");
    await db.pg.query(
      `insert into businesses (id, user_id, name, industry, profile, revision)
       values ('biz_1', 'two', 'Other Shop', 'general', '{}'::jsonb, 1)`,
    );
    await saveConnection(db.sql, {
      ownerUserId: "two",
      businessId: "biz_1",
      realmId: "456",
      accessTokenEnc: encryptSecret("access-two"),
      refreshTokenEnc: encryptSecret("refresh-two"),
      accessExpiresAt: "2020-01-01T00:00:00.000Z",
      refreshExpiresAt: "2099-01-01T00:00:00.000Z",
      connectedBy: "two",
    });
    expect(await loadConnection(db.sql, "own", "biz_1")).toBeNull();
    vi.stubGlobal("fetch", fakeIntuit({ Vendor: [], Employee: [] }).fetchStub);
    await syncConnection(
      db.sql,
      await connect(db.sql, { accessExpiresAt: "2020-01-01T00:00:00.000Z" }),
    );
    const other = (await loadConnection(db.sql, "two", "biz_1"))!;
    expect(decryptSecret(other.refreshTokenEnc)).toBe("refresh-two");
    expect(other.realmId).toBe("456");
    expect(await listSnapshots(db.sql, "two", "biz_1")).toEqual([]);
  });
});
