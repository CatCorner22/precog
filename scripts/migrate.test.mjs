/**
 * The deploy gate in ./migrate.mjs, run as `npm run build` and
 * `npm run db:migrate` run it: a production deploy without its database or
 * signing secret must fail the build, and every other build must leave the
 * database alone.
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SCRIPT = fileURLToPath(new URL("./migrate.mjs", import.meta.url));

describe("migrate.mjs", () => {
  it("refuses a production build with neither DATABASE_URL nor BETTER_AUTH_SECRET", () => {
    const run = migrate({ VERCEL_ENV: "production" }, "--only-on-production");
    expect(run.status).toBe(1);
    expect(run.stderr).toContain("DATABASE_URL and BETTER_AUTH_SECRET are not set");
  });

  it("refuses a production build that has only DATABASE_URL", () => {
    const run = migrate({
      VERCEL_ENV: "production",
      DATABASE_URL: "postgresql://nobody@127.0.0.1:9/none",
      BETTER_AUTH_SECRET: "   ",
    });
    expect(run.status).toBe(1);
    expect(run.stderr).toContain("BETTER_AUTH_SECRET is not set");
    expect(run.stderr).not.toContain("DATABASE_URL and");
  });

  it("leaves the database alone on a preview build, even with DATABASE_URL set", () => {
    const run = migrate(
      { VERCEL_ENV: "preview", DATABASE_URL: "postgresql://nobody@127.0.0.1:9/none" },
      "--only-on-production",
    );
    expect(run.status).toBe(0);
    expect(run.stdout).toContain("not a production deploy");
  });

  it("skips without DATABASE_URL outside production", () => {
    const run = migrate({});
    expect(run.status).toBe(0);
    expect(run.stdout).toContain("DATABASE_URL not set — skipping");
  });

  it("warns about a missing cron secret and half-configured features on production", () => {
    const run = migrate({
      VERCEL_ENV: "production",
      BETTER_AUTH_SECRET: "s".repeat(32),
      DATABASE_URL: "postgresql://nobody@127.0.0.1:9/none",
      STRIPE_SECRET_KEY: "sk_test",
      QBO_CLIENT_ID: "a",
      QBO_CLIENT_SECRET: "b",
      INTEGRATION_KEY: "c",
    });
    expect(run.stderr).toContain("CRON_SECRET is not set");
    expect(run.stderr).toContain(
      "Billing is half set up: STRIPE_PRICE_ASSESSMENT, STRIPE_PRICE_MONTHLY, STRIPE_WEBHOOK_SECRET not set.",
    );
    expect(run.stderr).not.toContain("QuickBooks link is half set up");
    expect(run.stderr).not.toContain("Reminder email is half set up");
  });

  it("warns on production when no error tracker is set, and builds on", () => {
    const base = {
      VERCEL_ENV: "production",
      BETTER_AUTH_SECRET: "s".repeat(32),
      DATABASE_URL: "postgresql://nobody@127.0.0.1:9/none",
    };
    const bare = migrate(base);
    expect(bare.stderr).toContain(
      "warning: Neither SENTRY_DSN nor ERROR_REPORT_URL is set, so server errors go only to the server log",
    );
    expect(bare.stderr).not.toContain("Refusing a production build");
    expect(
      migrate({ ...base, SENTRY_DSN: "https://key@o1.ingest.sentry.io/2" }).stderr,
    ).not.toContain("Neither SENTRY_DSN");
    expect(
      migrate({ ...base, ERROR_REPORT_URL: "https://hooks.example/errors" }).stderr,
    ).not.toContain("Neither SENTRY_DSN");
  });
});

/** Runs the script with only PATH and `vars` in its environment. */
function migrate(vars, ...args) {
  return spawnSync(process.execPath, [SCRIPT, ...args], {
    env: { PATH: process.env.PATH, ...vars },
    encoding: "utf8",
    timeout: 20_000,
  });
}
