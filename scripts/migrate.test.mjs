/**
 * The deploy gate in ./migrate.mjs, run as `npm run build` and
 * `npm run db:migrate` run it: a production deploy without its database, a
 * strong signing secret, an https public address or sign-in must fail the
 * build, and every other build must leave the database alone.
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

  it("refuses a short secret, a missing or plain-http address and sign-in turned off, one line each", () => {
    const run = migrate(
      {
        VERCEL_ENV: "production",
        DATABASE_URL: "postgresql://nobody@127.0.0.1:9/none",
        BETTER_AUTH_SECRET: "short-secret",
        VITE_AUTH_ENABLED: "false",
      },
      "--only-on-production",
    );
    expect(run.status).toBe(1);
    const refusals = run.stderr.split("\n").filter((line) => line.includes("Refusing"));
    expect(refusals).toEqual([
      expect.stringContaining("BETTER_AUTH_SECRET has fewer than 32 characters"),
      expect.stringContaining("BETTER_AUTH_URL is not set"),
      expect.stringContaining('VITE_AUTH_ENABLED is "false"'),
    ]);
    expect(run.stderr).not.toContain("short-secret");

    for (const address of ["http://precog.example.com", "precog.example.com"]) {
      const plain = migrate({ ...PRODUCTION, BETTER_AUTH_URL: address });
      expect(plain.status).toBe(1);
      expect(plain.stderr).toContain("BETTER_AUTH_URL is not an https address");
    }
  });

  it("builds a fully set production deploy, warning when Google and X sign-in lack their client", () => {
    // Port 9 refuses the connection, so a run that passes the gate fails only
    // when it reaches the database.
    const partial = migrate({ ...PRODUCTION, GROK_AUTH_CLIENT_ID: "client" });
    expect(partial.stderr).not.toContain("Refusing a production build");
    expect(partial.stderr).toContain(
      "warning: GROK_AUTH_CLIENT_ID and GROK_AUTH_CLIENT_SECRET are not both set",
    );
    expect(partial.stderr).toContain("[migrate] failed:");
    const full = migrate({
      ...PRODUCTION,
      GROK_AUTH_CLIENT_ID: "client",
      GROK_AUTH_CLIENT_SECRET: "secret",
    });
    expect(full.stderr).not.toContain("GROK_AUTH_CLIENT_ID");
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
      ...PRODUCTION,
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
    const base = PRODUCTION;
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

/** Every setting the production gate requires. */
const PRODUCTION = {
  VERCEL_ENV: "production",
  BETTER_AUTH_SECRET: "s".repeat(32),
  BETTER_AUTH_URL: "https://precog.example.com",
  DATABASE_URL: "postgresql://nobody@127.0.0.1:9/none",
};

/** Runs the script with only PATH and `vars` in its environment. */
function migrate(vars, ...args) {
  return spawnSync(process.execPath, [SCRIPT, ...args], {
    env: { PATH: process.env.PATH, ...vars },
    encoding: "utf8",
    timeout: 20_000,
  });
}
