#!/usr/bin/env node
/**
 * Save failures in a real browser, against the compiled server
 * (scripts/serve-built-test.mjs) and the disposable local PostgreSQL
 * database the account-safety job uses:
 *   1. the account load fails at page open: sign-out offers the recovery
 *      download, and once the account answers, edits reach the database;
 *   2. a save meets a newer release (unknown server function, 404): the
 *      "Precog was updated" notice appears and the edit stays in this browser;
 *   3. this browser refuses the list of businesses: Precog says so rather
 *      than claiming a copy is kept;
 *   4. browser storage fills up: the badge reads "Not saved on this device"
 *      and a notice says so, and pagehide writes the edit once there is room.
 *
 * Usage: PRECOG_AUTH_TEST=1 DATABASE_URL=postgresql://…/precog_safety_e2e \
 *        BETTER_AUTH_SECRET=<32+ chars> node scripts/e2e-save-safety.mjs
 */
import assert from "node:assert/strict";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { Pool } from "pg";
import { chromium } from "playwright";
import { authTestEnvironment } from "./lib/auth-test-env.mjs";
import { profileStorageKey } from "./lib/e2e.mjs";
import { eventually, stepLogger } from "./lib/steps.mjs";
import { serverFunctionIdOf } from "./lib/server-fn-id.mjs";

const { databaseUrl, base, secret } = authTestEnvironment();
const db = new Pool({ connectionString: databaseUrl, max: 3 });
const run = randomUUID().replaceAll("-", "");
const user = `save_safety_${run}`;
const businessId = "biz_save_safety";
const PROFILE_SERVER = "src/lib/precog/profile-server.ts";
const ids = {
  loadBusinessProfile: serverFunctionIdOf(PROFILE_SERVER, "loadBusinessProfile"),
  saveBusinessProfile: serverFunctionIdOf(PROFILE_SERVER, "saveBusinessProfile"),
};
/** Copied from src/lib/precog/stale-deploy.ts (plain Node cannot import TypeScript). */
const UPDATED = "Precog was updated. Reload to keep saving. Your work is kept on this device.";
/** Copied from LOCAL_FULL_MESSAGE in src/lib/precog/use-cloud-sync.ts. */
const FULL =
  "Precog could not save your latest changes on this device because browser storage is full. Download a recovery copy, then remove a business you no longer need.";
const step = stepLogger();
const errors = [];
let browser, page;

function profile(name) {
  return {
    businessId,
    practiceName: name,
    industry: "dental",
    onboardingComplete: true,
    staff: {
      teamSize: 1,
      soleOwnerKnowledgeCount: 0,
      avgTenureYears: 5,
      segregationScore: 60,
      dualControlPayments: false,
      independentBankRec: false,
    },
    riskVariables: {},
    dualRelease: {},
    decisions: [],
    customPeople: [
      { id: "save_safety_owner", name: `${name} Owner`, role: "Owner", active: true, owner: true },
    ],
    customProcesses: [],
    customKnowledge: [],
    customRelations: [],
    updatedAt: new Date().toISOString(),
  };
}

/**
 * A signed session for `user` whose account holds `seeded`, as the
 * account-safety suite seeds it.
 */
async function seed(seeded) {
  const name = seeded.practiceName;
  const token = randomBytes(32).toString("hex");
  const signature = createHmac("sha256", secret).update(token).digest("base64");
  await db.query(
    'insert into "user" (id,name,email,"emailVerified","createdAt","updatedAt") values ($1,$1,$2,true,now(),now())',
    [user, `${user}@example.test`],
  );
  await db.query(
    'insert into "session" (id,"userId",token,"expiresAt","updatedAt") values ($1,$2,$3,now()+interval \'1 hour\',now())',
    [randomUUID(), user, token],
  );
  await db.query(
    "insert into businesses (id,user_id,name,industry,profile,revision) values ($1,$2,$3,'dental',$4::jsonb,1)",
    [businessId, user, name, JSON.stringify(seeded)],
  );
  await db.query(
    "insert into business_profiles (user_id,name,industry,profile) values ($1,$2,'dental',$3::jsonb)",
    [user, name, JSON.stringify({ businessId, ownerUserId: user, pointerVersion: 2 })],
  );
  return {
    name: "__Host-grok-auth.session_token",
    value: encodeURIComponent(`${token}.${signature}`),
    url: base.replace("http:", "https:") + "/",
    secure: true,
    httpOnly: true,
    sameSite: "Lax",
  };
}

async function nameInDb() {
  return (
    await db.query("select name from businesses where user_id=$1 and id=$2", [user, businessId])
  ).rows[0]?.name;
}

/**
 * Opens Business settings from the business menu in the header and returns
 * its "Business name" field, scoped to the dialog.
 */
async function openBusinessSettings(p) {
  await p.getByRole("button", { name: /switch business/ }).click();
  await p.getByRole("button", { name: "Business settings", exact: true }).click();
  const field = p
    .getByRole("dialog", { name: "Business settings" })
    .getByRole("textbox", { name: "Business name", exact: true });
  await field.waitFor();
  return field;
}

async function newPage(cookie) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  if (cookie) await context.addCookies([cookie]);
  const opened = await context.newPage();
  opened.setDefaultTimeout(30_000);
  opened.on("pageerror", (e) => errors.push(e.message));
  return opened;
}

try {
  const seeded = profile("Save Safety");
  const cookie = await seed(seeded);
  browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });

  step("account load fails at page open: Precog says so and offers to try again");
  page = await newPage(cookie);
  // A returning owner: this browser already holds the account's copy.
  await page.addInitScript(
    ([key, stored]) => {
      if (!localStorage.getItem(key)) localStorage.setItem(key, stored);
    },
    [profileStorageKey(user), JSON.stringify(seeded)],
  );
  let failLoads = true;
  await page.route(`**/_serverFn/${ids.loadBusinessProfile}**`, (route) =>
    failLoads ? route.abort("failed") : route.fallback(),
  );
  await page.goto(`${base}/`, { waitUntil: "networkidle" });
  await page.getByText("Could not reach your account").first().waitFor();

  step("sign-out while the account copy is unread offers the recovery download");
  const asked = new Promise((resolve) =>
    page.once("dialog", async (dialog) => {
      resolve(dialog.message());
      await dialog.dismiss();
    }),
  );
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  assert.match(await asked, /Some work has not synced/);

  step("the account answers again: the load retries and edits reach PostgreSQL");
  failLoads = false;
  // The connection coming back retries at once, without waiting for the next try.
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await page.getByText("Saved to your account").first().waitFor();
  const nameField = await openBusinessSettings(page);
  await nameField.fill("Save Safety recovered");
  await nameField.blur();
  await eventually(
    async () => (await nameInDb()) === "Save Safety recovered",
    "the edit after the retried load did not reach PostgreSQL",
    20_000,
  );
  await page.context().close();

  step("a save meets a newer release: the update notice appears and the edit stays here");
  page = await newPage(cookie);
  await page.route(`**/_serverFn/${ids.saveBusinessProfile}**`, (route) =>
    route.fulfill({ status: 404, contentType: "text/plain; charset=utf-8", body: "Not found" }),
  );
  await page.goto(`${base}/`, { waitUntil: "networkidle" });
  const field = await openBusinessSettings(page);
  await field.fill("Save Safety after a release");
  await field.blur();
  await page.getByText(UPDATED).waitFor();
  await page.getByRole("button", { name: "Reload", exact: true }).waitFor();
  const kept = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key) ?? "null"),
    profileStorageKey(user),
  );
  assert.equal(kept?.practiceName, "Save Safety after a release");
  assert.equal(await nameInDb(), "Save Safety recovered", "the refused save wrote nothing");
  await page.context().close();

  step("this browser refuses the list of businesses: Precog says so");
  page = await newPage(null);
  await page.addInitScript(
    ([key, stored]) => {
      if (!localStorage.getItem(key)) localStorage.setItem(key, stored);
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function (name, value) {
        if (name.endsWith(":precog.portfolio.v1"))
          throw new DOMException("Test quota", "QuotaExceededError");
        return original.call(this, name, value);
      };
    },
    [profileStorageKey(), JSON.stringify(profile("Guest Safety"))],
  );
  await page.goto(`${base}/`, { waitUntil: "networkidle" });
  const guestField = await openBusinessSettings(page);
  await guestField.fill("Guest Safety edited");
  await guestField.blur();
  await page.getByText("This browser did not keep your list of businesses").waitFor();
  // The warning can show as the page loads, before the edit; the name field
  // stores its edit a moment after it changes, so wait for the edit itself.
  await eventually(
    async () =>
      (
        await page.evaluate(
          (key) => JSON.parse(localStorage.getItem(key) ?? "null"),
          profileStorageKey(),
        )
      )?.practiceName === "Guest Safety edited",
    "the open business is still kept",
    10_000,
  );
  await page.context().close();

  step("browser storage fills up: the badge says the edit is not saved, and pagehide writes it");
  page = await newPage(null);
  await page.addInitScript(
    ([key, stored]) => {
      if (!localStorage.getItem(key)) localStorage.setItem(key, stored);
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function (name, value) {
        if (window.__precogStorageFull && name === key)
          throw new DOMException("Test quota", "QuotaExceededError");
        return original.call(this, name, value);
      };
    },
    [profileStorageKey(), JSON.stringify(profile("Full Safety"))],
  );
  await page.goto(`${base}/`, { waitUntil: "networkidle" });
  await page.getByText("Saved on this device").first().waitFor();
  const fullField = await openBusinessSettings(page);
  await page.evaluate(() => {
    window.__precogStorageFull = true;
  });
  await fullField.fill("Full Safety edited");
  await fullField.blur();
  await page.getByText(FULL).waitFor();
  await page.getByText("Not saved on this device").first().waitFor();
  const storedName = async () =>
    (
      await page.evaluate(
        (key) => JSON.parse(localStorage.getItem(key) ?? "null"),
        profileStorageKey(),
      )
    )?.practiceName;
  assert.equal(await storedName(), "Full Safety", "the refused write stored nothing");
  await page.evaluate(() => {
    window.__precogStorageFull = false;
    window.dispatchEvent(new Event("pagehide"));
  });
  await eventually(
    async () => (await storedName()) === "Full Safety edited",
    "pagehide did not write the edit the full browser refused",
    10_000,
  );
  await page.getByText("Saved on this device").first().waitFor();

  assert.deepEqual(errors, [], "uncaught page errors");
  console.log(JSON.stringify({ ok: true, steps: step.names.length }));
} catch (error) {
  console.error(error);
  await mkdir("artifacts", { recursive: true });
  if (page)
    await page
      .screenshot({ path: "artifacts/save-safety-failure.png", fullPage: true })
      .catch(() => {});
  process.exitCode = 1;
} finally {
  await browser?.close();
  await db.query('delete from "user" where id = $1', [user]).catch(() => {});
  await db.end();
}
