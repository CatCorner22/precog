import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import type { Sql } from "@/lib/db";
import { postgresTransaction, toSql } from "@/lib/sql-transaction";
import { openTestDb } from "./pglite";

export interface SafetyDb {
  sql: Sql;
  pg: { exec(text: string): Promise<unknown> };
  seedUser(id: string): Promise<void>;
  close(): Promise<void>;
}
/** Real concurrency requires separate PostgreSQL connections, never a single WASM instance. */
export async function openSafetyDb(): Promise<SafetyDb> {
  if (process.env.PRECOG_LIFECYCLE_POSTGRES !== "1") return openTestDb();
  const connectionString = process.env.DATABASE_URL ?? "";
  const url = new URL(connectionString);
  if (!["localhost", "127.0.0.1", "postgres"].includes(url.hostname))
    throw new Error("Lifecycle tests only accept an isolated local PostgreSQL service");
  const schema = `precog_lifecycle_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({ connectionString, max: 1 });
  await admin.query(`create schema ${schema}`);
  const pool = new Pool({ connectionString, max: 8, options: `-c search_path=${schema}` });
  const sql = toSql(
    async <T>(text: string, params: unknown[]) => (await pool.query(text, params)).rows as T[],
  );
  sql.transaction = (work) => postgresTransaction(pool, work);
  const close = async () => {
    await pool.end();
    try {
      await admin.query(`drop schema ${schema} cascade`);
    } finally {
      await admin.end();
    }
  };
  try {
    for (const file of (await readdir("migrations")).filter((f) => f.endsWith(".sql")).sort())
      await pool.query(await readFile(join("migrations", file), "utf8"));
  } catch (error) {
    await close();
    throw error;
  }
  return {
    sql,
    pg: { exec: (text) => pool.query(text) },
    close,
    seedUser: async (id) => {
      await pool.query(
        `insert into "user" (id, name, email, "emailVerified", "createdAt", "updatedAt") values ($1,$1,$2,true,now(),now())`,
        [id, `${id}@example.test`],
      );
    },
  };
}
