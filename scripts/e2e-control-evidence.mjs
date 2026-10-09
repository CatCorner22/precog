#!/usr/bin/env node
/** Isolated compiled-server browser journey. Requires a build and PRECOG_CONTROL_E2E=1.
 * Uses signed fixture sessions and embedded PGlite, not external OAuth or hosted PostgreSQL.
 */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";
import { toJSONAsync } from "seroval";
import { seedControlFixture, actor, names, biz } from "./lib/control-e2e-fixtures.mjs";
import { serveControlTestBuild } from "./lib/control-e2e-server.mjs";
import { serverFunctionIdOf } from "./lib/server-fn-id.mjs";
if (
  process.env.PRECOG_CONTROL_E2E !== "1" ||
  process.env.DATABASE_URL?.trim() ||
  process.env.VERCEL_ENV === "production"
)
  throw new Error("Only opt-in embedded local tests are allowed.");
const secret = randomBytes(32).toString("hex");
process.env.BETTER_AUTH_SECRET = secret;
process.env.BETTER_AUTH_URL = "http://localhost:8089";
process.env.VITE_AUTH_ENABLED = "true";
for (const key of [
  "XAI_API_KEY",
  "QBO_CLIENT_ID",
  "QBO_CLIENT_SECRET",
  "RESEND_API_KEY",
  "STRIPE_SECRET_KEY",
])
  delete process.env[key];
const output = process.env.PRECOG_E2E_OUTPUT ?? "screenshots/control-evidence";
await mkdir(output, { recursive: true });
const server = await serveControlTestBuild();
const { base } = server;
let browser;
let page;
const errors = [];
let steps = 0;
const step = (s) => {
  steps += 1;
  console.log("[control-e2e] " + s);
};
const today = new Date().toISOString().slice(0, 10);
const period = today.slice(0, 7);
try {
  const { pg, cookies } = await seedControlFixture(base, secret);
  browser = await chromium.launch({
    headless: true,
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }
      : {}),
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.route("**/*", (route) =>
    new URL(route.request().url()).hostname === "localhost" ? route.continue() : route.abort(),
  );
  await context.addCookies([cookies.prep]);
  page = await context.newPage();
  page.setDefaultTimeout(30000);
  page.on("pageerror", (e) => errors.push(e.message));
  assert.equal(
    (await (await context.request.get(base + "/api/auth/get-session")).json()).user.id,
    actor.prep,
  );
  // Readiness comes from the loaded account-log controls, not global network silence.
  // The control evidence log lives in each business's Monthly review, not on
  // /firm, closed under the month's checks; its deep link opens it.
  await page.goto(base + "/?tab=monthly&item=evidence", { waitUntil: "domcontentloaded" });
  const panel = page.getByRole("region", { name: "Control evidence log" });
  await panel.getByText("Record a check with evidence", { exact: true }).waitFor();
  step("Real preparer session can open the control evidence log");
  // Stop the previous page before replacing its fixture session. Otherwise a
  // late response from that page can refresh the cookie after it was replaced.
  // Keep the browser context and storage; do not bypass the application's identity guard.
  const switchSession = async (key) => {
    await page.goto("about:blank");
    await context.clearCookies();
    await context.addCookies([cookies[key]]);
    assert.equal(
      (await (await context.request.get(base + "/api/auth/get-session")).json()).user.id,
      actor[key],
    );
    await page.goto(base + "/?tab=monthly&item=evidence", { waitUntil: "domcontentloaded" });
  };
  await panel.getByText("Record a check with evidence", { exact: true }).click();
  let form = panel.locator("form").first();
  await form
    .getByLabel("Population, period and items checked (or correction scope)")
    .fill("Complete statement population for " + period);
  await form
    .getByLabel("Evidence references (one per line, up to 8)")
    .fill("Restricted archive / reconciliation / v1");
  await form
    .getByLabel("Work performed and conclusion")
    .fill("Inspected all statement lines and documented each difference.");
  await form.getByRole("combobox", { name: "Method", exact: true }).selectOption("inspection");
  await form.getByRole("combobox", { name: "Result", exact: true }).selectOption("no_exception");
  await page.reload({ waitUntil: "domcontentloaded" });
  await panel.getByText("Record a check with evidence", { exact: true }).click();
  form = panel.locator("form").first();
  assert.equal(
    await form.getByLabel("Evidence references (one per line, up to 8)").inputValue(),
    "Restricted archive / reconciliation / v1",
  );
  step("Account-scoped draft survives reload");
  // Record the fifth monthly check, so the database accepts its key end to end.
  await form
    .getByRole("combobox", { name: "Control check", exact: true })
    .selectOption("card_statement");
  // Simulate a transport failure. It must neither invent a saved result nor erase the draft.
  await context.setOffline(true);
  await form.getByRole("button", { name: "Record check", exact: true }).click();
  await form.getByRole("alert").waitFor();
  assert.equal((await pg.query("select count(*)::int n from control_execution_log")).rows[0].n, 0);
  assert.match(await form.getByLabel("Work performed and conclusion").inputValue(), /Inspected/);
  await context.setOffline(false);
  await form.getByRole("button", { name: "Record check", exact: true }).click();
  await panel.getByText("Recorded — awaiting review", { exact: true }).waitFor();
  const first = (await pg.query("select record from control_execution_log")).rows[0].record;
  assert.equal(first.history[0].actor.id, actor.prep);
  assert.equal(first.revision, 1);
  assert.equal(first.controlKey, "card_statement");
  step("Offline failure retains draft; retry writes exactly one event with server identity");
  assert.equal(await panel.getByText("Review this check", { exact: true }).count(), 0);
  await page.screenshot({ path: output + "/01-preparer.png", fullPage: true });
  const actionUrl =
    base +
    "/_serverFn/" +
    serverFunctionIdOf("src/lib/precog/controls/executions/server.ts", "recordControlExecution");
  const body = async (id, command, expected = id) =>
    JSON.stringify(
      await toJSONAsync({
        data: { businessId: biz, expectedAccountId: expected, command },
        context: { checkAccount: true, expectedAccountId: expected },
      }),
    );
  const review = {
    action: "review",
    commandId: "e2e_review",
    runId: first.id,
    baseRevision: 1,
    method: "inspection",
    evidenceRefs: ["Review worksheet"],
    result: "no_exception",
    note: "Read the independently obtained statement.",
    independenceConfirmed: true,
  };
  const call = async (command, id = actor.prep, expected = id) =>
    context.request.post(actionUrl, {
      headers: { "Content-Type": "application/json", "x-tsr-serverFn": "true", Origin: base },
      data: await body(id, command, expected),
    });
  assert.equal((await call(review)).status(), 403);
  step("Direct API self-review/preparer approval rejected");
  await switchSession("reviewer");
  await panel.getByText("Review this check", { exact: true }).click();
  let reviewForm = panel.locator("article form");
  await reviewForm.getByRole("combobox", { name: "Method", exact: true }).selectOption("inquiry");
  await reviewForm
    .getByRole("combobox", { name: "Result", exact: true })
    .selectOption("no_exception");
  await reviewForm
    .getByLabel("Evidence references (one per line, up to 8)")
    .fill("Reviewer worksheet / v1");
  await reviewForm
    .getByLabel("Work performed and conclusion")
    .fill("Asked the preparer about the check.");
  await reviewForm.getByRole("checkbox").check();
  await reviewForm.getByRole("button", { name: "Record review conclusion" }).click();
  await reviewForm
    .getByRole("alert")
    .filter({ hasText: /Inquiry alone/ })
    .waitFor();
  assert.equal((await pg.query("select revision from control_execution_log")).rows[0].revision, 1);
  step("Inquiry-only no-exception conclusion is rejected by server");
  await reviewForm
    .getByRole("combobox", { name: "Method", exact: true })
    .selectOption("inspection");
  await reviewForm.getByRole("combobox", { name: "Result", exact: true }).selectOption("exception");
  await reviewForm
    .getByLabel("Work performed and conclusion")
    .fill("A reconciliation item lacks a supporting explanation.");
  await reviewForm.getByLabel("Follow-up owner", { exact: true }).fill(names.prep);
  await reviewForm.getByLabel("Follow-up due date").fill(today);
  await reviewForm.getByRole("button", { name: "Record review conclusion" }).click();
  await panel.getByText("Exception — correction needed", { exact: true }).waitFor();
  step("Independent reviewer records an exception with owner and due date");
  await switchSession("prep");
  await panel.getByText("Record a correction", { exact: true }).click();
  const correction = panel.locator("article form");
  await correction
    .getByLabel("Population, period and items checked (or correction scope)")
    .fill("Corrected the single unsupported reconciliation item");
  await correction
    .getByLabel("Evidence references (one per line, up to 8)")
    .fill("Correction worksheet / v2");
  await correction
    .getByLabel("What you corrected and how")
    .fill("Traced the difference and documented the supported resolution.");
  await correction.getByRole("button", { name: "Record correction for retest" }).click();
  await panel.getByText("Correction recorded — retest needed", { exact: true }).waitFor();
  step("Correction does not close the exception without a retest");
  await switchSession("reviewer");
  await panel.getByText("Review this check", { exact: true }).click();
  reviewForm = panel.locator("article form");
  await reviewForm
    .getByRole("combobox", { name: "Method", exact: true })
    .selectOption("reperformance");
  await reviewForm
    .getByRole("combobox", { name: "Result", exact: true })
    .selectOption("no_exception");
  await reviewForm
    .getByLabel("Evidence references (one per line, up to 8)")
    .fill("Independent retest worksheet / v3");
  await reviewForm
    .getByLabel("Work performed and conclusion")
    .fill("Reperformed the reconciliation and inspected the supported correction.");
  await reviewForm.getByRole("checkbox").check();
  await page.reload({ waitUntil: "domcontentloaded" });
  await panel.getByText("Review this check", { exact: true }).click();
  reviewForm = panel.locator("article form");
  assert.equal(await reviewForm.getByRole("checkbox").isChecked(), false);
  assert.equal(
    await reviewForm.getByLabel("Evidence references (one per line, up to 8)").inputValue(),
    "Independent retest worksheet / v3",
  );
  await reviewForm.getByRole("checkbox").check();
  await reviewForm.getByRole("button", { name: "Record review conclusion" }).click();
  await panel.getByText("Reviewed — no exception reported", { exact: true }).waitFor();
  step("Attestation is not restored; separate reperformance concludes the scoped check");
  const saved = (await pg.query("select record from control_execution_log")).rows[0].record;
  assert.equal(saved.revision, 4);
  assert.equal(saved.history.length, 4);
  assert.deepEqual(saved.history[0], first.history[0]);
  assert.equal((await call(review, actor.reviewer)).status(), 409);
  assert.equal(
    (await call({ ...review, baseRevision: 4 }, actor.reviewer, actor.prep)).status(),
    409,
  );
  step("Stale revisions and expected-account mismatches are rejected");
  await panel.getByText("Evidence and history (4)", { exact: true }).click();
  await panel.scrollIntoViewIfNeeded();
  await page.screenshot({ path: output + "/02-reviewed-history.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: output + "/03-mobile.png", fullPage: true });
  assert.ok(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
    "Mobile horizontal overflow",
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
  // A sample control confirmed under Who controls what > Controls counts at
  // once: How Precog scores > What is still exposed leaves out one fewer. The
  // reviewer owns the fixture business, so the confirmation is theirs.
  const leftOutLine = /Precog leaves out sample controls \((\d+)\)/;
  const leftOut = async () => {
    await page.goto(base + "/?tab=residual", { waitUntil: "domcontentloaded" });
    await page
      .getByLabel(/Risks left after your controls|Residual risk register/)
      .first()
      .waitFor();
    const line = page.getByText(leftOutLine);
    if ((await line.count()) === 0) return 0;
    return Number((await line.first().innerText()).match(leftOutLine)[1]);
  };
  const before = await leftOut();
  assert.ok(before > 0, "The fixture business has unconfirmed sample controls");
  await page.goto(base + "/?tab=sod&item=controls", { waitUntil: "domcontentloaded" });
  const confirm = page.getByRole("button", { name: "This runs here" });
  await confirm.first().waitFor();
  const unconfirmed = await confirm.count();
  await confirm.first().click();
  // The Decisions log entry is written once the button leaves that control.
  await page.waitForFunction(
    (n) =>
      [...document.querySelectorAll("button")].filter((b) =>
        b.textContent?.includes("This runs here"),
      ).length < n,
    unconfirmed,
  );
  const after = await leftOut();
  assert.ok(after < before, `Sample controls left out: ${before} before, ${after} after`);
  step("A sample control confirmed under Controls leaves What is still exposed");
  await page.goto("about:blank");
  await context.clearCookies();
  await context.addCookies([cookies.outside]);
  assert.equal((await call(review, actor.outside)).status(), 404);
  await context.clearCookies();
  assert.equal((await call(review, actor.outside)).status(), 401);
  step("Unrelated account and signed-out writes are rejected");
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      result: "passed",
      steps,
      runtime: "compiled Vercel handler",
      database: "embedded PGlite",
      externalOAuth: false,
      liveModel: false,
      source: "local working tree",
    }),
  );
} catch (error) {
  if (page) {
    await page.screenshot({ path: output + "/failure.png", fullPage: true }).catch(() => {});
    console.error(
      (
        await page
          .locator("body")
          .innerText()
          .catch(() => "")
      ).slice(-9000),
    );
  }
  throw error;
} finally {
  await browser?.close();
  await server.stop();
}
