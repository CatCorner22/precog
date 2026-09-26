/** Strictly isolated test targets; this module is never imported by the application. */
export function authTestEnvironment() {
  if (process.env.PRECOG_AUTH_TEST !== "1")
    throw new Error("Set PRECOG_AUTH_TEST=1 for the isolated test fixture");
  const databaseUrl = process.env.DATABASE_URL ?? "";
  const db = new URL(databaseUrl);
  if (
    !["localhost", "127.0.0.1", "postgres"].includes(db.hostname) ||
    db.pathname !== "/precog_safety_e2e"
  )
    throw new Error("Auth tests require the disposable local precog_safety_e2e database");
  const base = process.env.BETTER_AUTH_URL ?? "http://localhost:8080";
  const target = new URL(base);
  if (target.origin !== "http://localhost:8080")
    throw new Error("Auth test origin must be http://localhost:8080");
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret || secret.length < 32) throw new Error("A test-only auth secret is required");
  return { databaseUrl, base, secret };
}
