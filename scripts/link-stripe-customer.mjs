#!/usr/bin/env node
/**
 * Links a Stripe customer to a Precog account (docs/OPERATIONS.md, "Link a
 * Stripe customer"):
 *
 *   npm run link:stripe-customer -- <email or user id> <cus_…> [--replace] [--yes]
 *
 * Needs DATABASE_URL and STRIPE_SECRET_KEY in the shell (the
 * STRIPE_PRICE_TIER_* ids too, to name the tier in the plan line). Without
 * --yes it prints the plan the account will have and writes nothing. It
 * refuses a customer another account holds, an account that holds another
 * customer (unless --replace), a member of a firm who is not its owner, and a
 * customer with no running subscription (create the subscription in Stripe
 * first, then link). See scripts/lib/link-stripe-customer.mjs.
 */
import pg from "pg";
import { linkCustomer, LinkRefused } from "./lib/link-stripe-customer.mjs";

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith("--")));
const [account, customerId] = args.filter((a) => !a.startsWith("--"));
const usage =
  "Usage: npm run link:stripe-customer -- <email or user id> <cus_…> [--replace] [--yes]";

if (!account || !customerId || !customerId.startsWith("cus_")) {
  console.error(usage);
  process.exit(2);
}
const unknown = [...flags].filter((f) => f !== "--replace" && f !== "--yes");
if (unknown.length > 0) {
  console.error(`Unknown option ${unknown.join(", ")}. ${usage}`);
  process.exit(2);
}
const databaseUrl = process.env.DATABASE_URL?.trim();
const secretKey = process.env.STRIPE_SECRET_KEY?.trim();
if (!databaseUrl || !secretKey) {
  console.error("Set DATABASE_URL and STRIPE_SECRET_KEY in this shell first.");
  process.exit(2);
}

async function stripe(method, path, form) {
  const res = await fetch(`https://api.stripe.com/v1${path}`, {
    method,
    headers: {
      authorization: `Bearer ${secretKey}`,
      "stripe-version": "2024-06-20",
      ...(form ? { "content-type": "application/x-www-form-urlencoded" } : {}),
    },
    body: form ? new URLSearchParams(form).toString() : undefined,
    signal: AbortSignal.timeout(10_000),
  });
  const body = await res.json();
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(body?.error?.message ?? `Stripe answered ${res.status}`);
  return body;
}

const pool = new pg.Pool({
  connectionString: databaseUrl,
  max: 1,
  connectionTimeoutMillis: 10_000,
});
const client = await pool.connect();
try {
  await linkCustomer({
    query: async (text, params) => (await client.query(text, params)).rows,
    stripeGet: (path) => stripe("GET", path),
    stripePost: (path, form) => stripe("POST", path, form),
    account,
    customerId,
    replace: flags.has("--replace"),
    yes: flags.has("--yes"),
  });
} catch (err) {
  if (err instanceof LinkRefused) {
    console.error(`Refused: ${err.message}`);
  } else {
    console.error("Failed:", err instanceof Error ? err.message : err);
  }
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
