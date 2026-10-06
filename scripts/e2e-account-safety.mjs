#!/usr/bin/env node
/**
 * Real signed-session and account-boundary tests against the compiled server
 * (scripts/serve-built-test.mjs) and a disposable local PostgreSQL database.
 *
 * Usage: PRECOG_AUTH_TEST=1 DATABASE_URL=postgresql://…/precog_safety_e2e \
 *        BETTER_AUTH_SECRET=<32+ chars> node scripts/e2e-account-safety.mjs
 * (see the account-safety job in .github/workflows/ci.yml)
 */
import assert from "node:assert/strict";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { Pool } from "pg";
import { chromium } from "playwright";
import { toJSONAsync } from "seroval";
import { authTestEnvironment } from "./lib/auth-test-env.mjs";
import { profileStorageKey } from "./lib/e2e.mjs";
import { eventually, stepLogger } from "./lib/steps.mjs";
import { serverFunctionIdOf } from "./lib/server-fn-id.mjs";

const { databaseUrl, base, secret } = authTestEnvironment();
const db = new Pool({ connectionString: databaseUrl, max: 3 });
const run = randomUUID().replaceAll("-", "");
const a = `safety_a_${run}`,
  b = `safety_b_${run}`;
const businessA = "biz_safety_alpha",
  businessB = "biz_safety_beta";
const guestKey = profileStorageKey();
const PROFILE_SERVER = "src/lib/precog/profile-server.ts";
const IMAGE_SERVER = "src/lib/precog/procedures/image-server.ts";
const ids = {
  saveBusinessProfile: serverFunctionIdOf(PROFILE_SERVER, "saveBusinessProfile"),
  deleteBusiness: serverFunctionIdOf(PROFILE_SERVER, "deleteBusiness"),
  uploadProcedureImage: serverFunctionIdOf(IMAGE_SERVER, "uploadProcedureImage"),
};
/** A real 1×1 PNG. */
const PNG_1PX =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
const step = stepLogger();
const errors = [];
let browser, page;
async function seed(user, businessId, name) {
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
  const profile = {
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
      {
        id: `${user}_person`,
        name: `${name} Owner`,
        role: "Owner",
        active: true,
        owner: true,
        entitlements: [],
      },
    ],
    customProcesses: [],
    customKnowledge: [],
    customRelations: [],
    updatedAt: new Date().toISOString(),
  };
  await db.query(
    "insert into businesses (id,user_id,name,industry,profile,revision) values ($1,$2,$3,'dental',$4::jsonb,1)",
    [businessId, user, name, JSON.stringify(profile)],
  );
  await db.query(
    "insert into business_profiles (user_id,name,industry,profile) values ($1,$2,'dental',$3::jsonb)",
    [user, name, JSON.stringify({ businessId, ownerUserId: user, pointerVersion: 2 })],
  );
  return {
    name: "__Host-grok-auth.session_token",
    value: encodeURIComponent(`${token}.${signature}`),
    // Playwright derives Secure from the URL, overriding an explicit flag.
    // Seed this host-only cookie with HTTPS so the __Host- prefix stays valid;
    // localhost requests retain Chromium's normal secure-context treatment.
    url: base.replace("http:", "https:") + "/",
    secure: true,
    httpOnly: true,
    sameSite: "Lax",
  };
}
async function nameInDb(user, id) {
  return (await db.query("select name from businesses where user_id=$1 and id=$2", [user, id]))
    .rows[0]?.name;
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
/** Closes Business settings, so the rest of the page takes clicks again. */
async function closeBusinessSettings(p) {
  await p.keyboard.press("Escape");
  await p.getByRole("dialog", { name: "Business settings" }).waitFor({ state: "detached" });
}
async function requestBody(data, expected) {
  return JSON.stringify(
    await toJSONAsync({ data, context: { checkAccount: true, expectedAccountId: expected } }),
  );
}
try {
  const cookieA = await seed(a, businessA, "Safety Alpha");
  const cookieB = await seed(b, businessB, "Safety Beta");
  browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.addCookies([cookieA]);
  page = await context.newPage();
  page.setDefaultTimeout(30_000);
  page.on("pageerror", (e) => errors.push(e.message));
  step("A: genuine signed session resolves through Better Auth");
  let session = await context.request.get(`${base}/api/auth/get-session`);
  assert.equal((await session.json()).user.id, a);
  await page.goto(`${base}/`, { waitUntil: "networkidle" });
  const nameField = await openBusinessSettings(page);
  assert.equal(await nameField.inputValue(), "Safety Alpha");
  step("A: UI edit persists to PostgreSQL and survives reload");
  await nameField.fill("Safety Alpha edited");
  await nameField.blur();
  await eventually(
    async () => (await nameInDb(a, businessA)) === "Safety Alpha edited",
    "A's authenticated UI save did not reach PostgreSQL",
  );
  await page.reload({ waitUntil: "networkidle" });
  await openBusinessSettings(page);
  assert.equal(await nameField.inputValue(), "Safety Alpha edited");
  await closeBusinessSettings(page);
  const aProfile = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)),
    profileStorageKey(a),
  );
  assert.equal(aProfile.practiceName, "Safety Alpha edited");
  const aRevision = Number(
    (await db.query("select revision from businesses where user_id=$1 and id=$2", [a, businessA]))
      .rows[0].revision,
  );
  const oldRequest = await requestBody(
    { expectedAccountId: a, profile: aProfile, industry: "dental", baseRevision: aRevision },
    a,
  );

  step("A: sign-out hides this account in another already-open tab");
  const oldTab = await context.newPage();
  await oldTab.goto(`${base}/`, { waitUntil: "networkidle" });
  await openBusinessSettings(oldTab);
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  // Signed out with no business on this device, the home page goes on to the landing page.
  await page.waitForURL(/\/(welcome)?$/);
  await oldTab
    .getByText(/The signed-in account changed/)
    .first()
    .waitFor();
  assert.equal(
    await oldTab.getByRole("textbox", { name: "Business name", exact: true }).count(),
    0,
  );
  // A sign-out in this browser is not a session that ended: the old tab never
  // keeps the signed-out account's business on screen, not even read-only.
  assert.equal(await oldTab.getByText(/Your session ended/).count(), 0);
  session = await context.request.get(`${base}/api/auth/get-session`);
  assert.equal(await session.json(), null);
  step("sign-out removes confirmed active copies; does not expose them as guest work");
  assert.equal(await page.evaluate((key) => localStorage.getItem(key), profileStorageKey(a)), null);
  const guest = await page.evaluate((key) => localStorage.getItem(key), guestKey);
  assert.ok(!guest || !guest.includes("Safety Alpha"));

  step("B: same browser loads only B's account and never uploads A's business");
  await context.clearCookies();
  await context.addCookies([cookieB]);
  await page.goto(`${base}/`, { waitUntil: "networkidle" });
  await openBusinessSettings(page);
  assert.equal(await nameField.inputValue(), "Safety Beta");
  assert.equal(await page.getByText("Safety Alpha edited", { exact: true }).count(), 0);
  assert.equal(
    Number(
      (
        await db.query("select count(*) as n from businesses where user_id=$1 and id=$2", [
          b,
          businessA,
        ])
      ).rows[0].n,
    ),
    0,
  );
  step("B: replay of A's delayed save is rejected by the verified-session guard");
  const replay = await context.request.post(`${base}/_serverFn/${ids.saveBusinessProfile}`, {
    headers: { "content-type": "application/json", "x-tsr-serverFn": "true", Origin: base },
    data: oldRequest,
  });
  assert.equal(replay.status(), 409, await replay.text());
  assert.equal(await nameInDb(a, businessA), "Safety Alpha edited");
  assert.equal(await nameInDb(b, businessB), "Safety Beta");
  assert.equal(
    Number(
      (
        await db.query("select count(*) as n from businesses where user_id=$1 and id=$2", [
          b,
          businessA,
        ])
      ).rows[0].n,
    ),
    0,
  );

  step("B: a procedure picture is stored for B's business and shown only to B");
  const serverFn = (id, data) =>
    context.request.post(`${base}/_serverFn/${id}`, {
      headers: { "content-type": "application/json", "x-tsr-serverFn": "true", Origin: base },
      data,
    });
  const uploadFor = async (businessId, contentType, data) =>
    serverFn(
      ids.uploadProcedureImage,
      await requestBody({ expectedAccountId: b, businessId, contentType, data }, b),
    );
  const uploaded = await uploadFor(businessB, "image/png", PNG_1PX);
  assert.equal(uploaded.status(), 200, await uploaded.text());
  const imageId = (await uploaded.text()).match(/img_[a-z0-9_]+/)?.[0];
  assert.ok(imageId, "the upload did not return an image id");
  const stored = await db.query(
    "select user_id, content_type from procedure_images where id = $1",
    [imageId],
  );
  assert.deepEqual(stored.rows, [{ user_id: b, content_type: "image/png" }]);
  const picture = (businessId) =>
    context.request.get(`${base}/api/procedure-image?b=${businessId}&id=${imageId}`);
  const own = await picture(businessB);
  assert.equal(own.status(), 200);
  assert.equal(own.headers()["content-type"], "image/png");
  assert.equal(own.headers()["x-content-type-options"], "nosniff");
  step("B: an SVG, a mislabelled file, or A's business is refused");
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>').toString("base64");
  assert.equal((await uploadFor(businessB, "image/svg+xml", svg)).status(), 415);
  assert.equal((await uploadFor(businessB, "image/png", svg)).status(), 415);
  assert.equal((await uploadFor(businessA, "image/png", PNG_1PX)).status(), 409);
  step("A: cannot fetch B's picture under either business id; signed out gets nothing");
  await context.clearCookies();
  await context.addCookies([cookieA]);
  assert.equal((await picture(businessB)).status(), 404);
  assert.equal((await picture(businessA)).status(), 404);
  await context.clearCookies();
  assert.equal((await picture(businessB)).status(), 404);
  await context.addCookies([cookieB]);

  step("B: a picture added in the editor is hidden where marked, stored, and saved with the step");
  await page.goto(`${base}/?tab=procedures`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "New procedure" }).click();
  await page.getByLabel("Title").fill("Count the drawer");
  // Written to the writing standards, which a verification requires.
  await page.getByLabel("Module or screen").fill("Reports › Drawer");
  await page
    .getByLabel("Why it matters and what done looks like")
    .fill("Finds a shortage the same day. Done when the count matches the drawer report.");
  await page.getByLabel("When to do it").fill("Every day at close");
  await page.getByRole("button", { name: "Add step" }).click();
  await page.getByLabel("Step 1", { exact: true }).fill("Open the drawer report.");
  await page
    .locator('input[type="file"]')
    .first()
    .setInputFiles({
      name: "drawer.png",
      mimeType: "image/png",
      buffer: Buffer.from(PNG_1PX, "base64"),
    });
  const redact = page.getByRole("dialog");
  await redact.getByRole("button", { name: "Add a hidden area" }).click();
  await redact.getByRole("button", { name: "Save picture" }).click();
  await redact.waitFor({ state: "detached" });
  await page.getByRole("button", { name: "Save procedure" }).click();
  await page.getByRole("img", { name: "Picture 1 for step 1" }).waitFor();
  await eventually(async () => {
    const saved = (
      await db.query("select profile from businesses where user_id=$1 and id=$2", [b, businessB])
    ).rows[0]?.profile;
    const pictureId = saved?.procedures?.[0]?.steps?.[0]?.imageIds?.[0];
    if (!pictureId) return false;
    const row = await db.query(
      "select content_type from procedure_images where user_id=$1 and id=$2",
      [b, pictureId],
    );
    return row.rows[0]?.content_type === "image/webp";
  }, "the picture added in the editor was not stored and saved with its step");

  step("B: pressing the verify button records B's account with the verification");
  await page.getByRole("button", { name: /verified these steps today/ }).click();
  await eventually(async () => {
    const saved = (
      await db.query("select profile from businesses where user_id=$1 and id=$2", [b, businessB])
    ).rows[0]?.profile;
    const p = saved?.procedures?.[0];
    return Boolean(p?.verifiedAt) && p.verifiedByAccountId === b;
  }, "the verification was not saved under B's account");
  await page.getByText(`recorded by ${b}`).waitFor();

  step(
    "B: as a firm preparer, a save that verifies a procedure is refused; as a reviewer it is kept",
  );
  await db.query("insert into firms (user_id, name) values ($1, 'Safety Firm')", [a]);
  await db.query(
    "insert into firm_members (firm_user_id, member_user_id, role) values ($1, $2, 'preparer')",
    [a, b],
  );
  const storedB = async () =>
    (
      await db.query("select revision, profile from businesses where user_id=$1 and id=$2", [
        b,
        businessB,
      ])
    ).rows[0];
  const verifiedProcedure = (accountId) => ({
    id: "proc_safety_verify",
    industry: "dental",
    title: "Close the day",
    module: "Reports › Day sheet",
    purpose: "Closes the books for the day. Done when the day sheet prints.",
    trigger: "Every day at close",
    prerequisites: [],
    steps: [{ id: "step_safety_verify", text: "Print the day sheet." }],
    knowledgeIds: [],
    processIds: [],
    backupPersonIds: [],
    reviewEveryDays: 180,
    verifiedAt: "2026-09-01",
    verifiedBy: "owner",
    verifiedByAccountId: accountId,
    verifiedByAccountName: accountId,
    lastVerifiedAt: "2026-09-01",
    version: 1,
    changelog: [],
    proofs: [],
    createdAt: "2026-09-01",
    updatedAt: "2026-09-01",
  });
  const saveVerified = async (accountId) => {
    const current = await storedB();
    const others = (current.profile.procedures ?? []).filter((x) => x.id !== "proc_safety_verify");
    return context.request.post(`${base}/_serverFn/${ids.saveBusinessProfile}`, {
      headers: { "content-type": "application/json", "x-tsr-serverFn": "true", Origin: base },
      data: await requestBody(
        {
          expectedAccountId: b,
          profile: { ...current.profile, procedures: [...others, verifiedProcedure(accountId)] },
          industry: "dental",
          baseRevision: Number(current.revision),
        },
        b,
      ),
    });
  };
  const revisionBefore = Number((await storedB()).revision);
  const asPreparer = await saveVerified(b);
  assert.equal(asPreparer.status(), 403, await asPreparer.text());
  assert.match(await asPreparer.text(), /preparer cannot verify/);
  assert.equal(Number((await storedB()).revision), revisionBefore, "a refused save wrote nothing");
  await db.query("update firm_members set role = 'reviewer' where member_user_id = $1", [b]);
  const underOther = await saveVerified(a);
  assert.equal(underOther.status(), 403, await underOther.text());
  assert.match(await underOther.text(), /Another account recorded this verification/);
  const asReviewer = await saveVerified(b);
  assert.equal(asReviewer.status(), 200, await asReviewer.text());
  const kept = (await storedB()).profile.procedures.find((x) => x.id === "proc_safety_verify");
  assert.equal(kept.verifiedByAccountId, b);
  await db.query("delete from firms where user_id = $1", [a]);

  step("B: authenticated delete cannot be undone by an old save");
  const bProfile = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)),
    profileStorageKey(b),
  );
  const revision = Number(
    (await db.query("select revision from businesses where user_id=$1 and id=$2", [b, businessB]))
      .rows[0].revision,
  );
  const deleted = await context.request.post(`${base}/_serverFn/${ids.deleteBusiness}`, {
    headers: { "content-type": "application/json", "x-tsr-serverFn": "true", Origin: base },
    data: await requestBody({ id: businessB, expectedAccountId: b }, b),
  });
  assert.equal(deleted.status(), 200, await deleted.text());
  const stale = await context.request.post(`${base}/_serverFn/${ids.saveBusinessProfile}`, {
    headers: { "content-type": "application/json", "x-tsr-serverFn": "true", Origin: base },
    data: await requestBody(
      { expectedAccountId: b, profile: bProfile, industry: "dental", baseRevision: revision },
      b,
    ),
  });
  assert.equal(stale.status(), 409, await stale.text());
  const row = (
    await db.query("select deleted_at from businesses where user_id=$1 and id=$2", [b, businessB])
  ).rows[0];
  assert.ok(row.deleted_at);
  assert.deepEqual(errors, [], "uncaught page errors");
  console.log(
    JSON.stringify({
      ok: true,
      runtime: "compiled Vercel entry through local HTTP adapter",
      authentication: "real Better Auth signed test sessions, not external OAuth login",
      steps: step.names.length,
    }),
  );
} catch (error) {
  console.error(error);
  await mkdir("artifacts", { recursive: true });
  if (page)
    await page
      .screenshot({ path: "artifacts/account-safety-failure.png", fullPage: true })
      .catch(() => {});
  process.exitCode = 1;
} finally {
  await browser?.close();
  await db.query('delete from "user" where id = any($1::text[])', [[a, b]]).catch(() => {});
  await db.end();
}
