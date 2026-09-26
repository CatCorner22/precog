/** Real signed-session and account-boundary tests against the compiled server + disposable PostgreSQL. */
import assert from "node:assert/strict";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { readdir, readFile, mkdir } from "node:fs/promises";
import { Pool } from "pg";
import { chromium } from "playwright";
import { toJSONAsync } from "seroval";
import { authTestEnvironment } from "./lib/auth-test-env.mjs";

const { databaseUrl, base, secret } = authTestEnvironment();
const db = new Pool({ connectionString: databaseUrl, max: 3 });
const run = randomUUID().replaceAll("-", "");
const a = `safety_a_${run}`,
  b = `safety_b_${run}`;
const businessA = "biz_safety_alpha",
  businessB = "biz_safety_beta";
const profileKey = (id) =>
  `precog.workspace.v2:account:${encodeURIComponent(id)}:precog.practiceProfile.v2`;
const guestKey = "precog.workspace.v2:guest:precog.practiceProfile.v2";
const steps = [];
const step = (name) => {
  steps.push(name);
  console.log(`· ${name}`);
};
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
    url: base,
    secure: true,
    httpOnly: true,
    sameSite: "Lax",
  };
}
async function eventually(check, message) {
  for (let i = 0; i < 120; i++) {
    if (await check()) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(message);
}
async function nameInDb(user, id) {
  return (await db.query("select name from businesses where user_id=$1 and id=$2", [user, id]))
    .rows[0]?.name;
}
const fnDir = ".vercel/output/functions/__server.func/_ssr";
const fnSource = await readFile(
  `${fnDir}/${(await readdir(fnDir)).find((f) => /^profile-server-.*\.mjs$/.test(f))}`,
  "utf8",
);
const ids = Object.fromEntries(
  [...fnSource.matchAll(/id: "([a-f0-9]+)",\s+name: "([^"]+)"/g)].map((m) => [m[2], m[1]]),
);
assert.ok(
  ids.saveBusinessProfile && ids.deleteBusiness,
  "compiled server function metadata available",
);
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
  await page.goto(`${base}/?tab=command`, { waitUntil: "networkidle" });
  const nameField = page.getByRole("textbox", { name: "Business name", exact: true });
  await nameField.waitFor();
  assert.equal(await nameField.inputValue(), "Safety Alpha");
  step("A: UI edit persists to PostgreSQL and survives reload");
  await nameField.fill("Safety Alpha edited");
  await nameField.blur();
  await eventually(
    async () => (await nameInDb(a, businessA)) === "Safety Alpha edited",
    "A's authenticated UI save did not reach PostgreSQL",
  );
  await page.reload({ waitUntil: "networkidle" });
  assert.equal(await nameField.inputValue(), "Safety Alpha edited");
  const aProfile = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)),
    profileKey(a),
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
  await oldTab.goto(`${base}/?tab=command`, { waitUntil: "networkidle" });
  await oldTab.getByRole("textbox", { name: "Business name", exact: true }).waitFor();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await page.waitForURL(base + "/");
  await oldTab
    .getByText(/The account changed/)
    .first()
    .waitFor();
  assert.equal(
    await oldTab.getByRole("textbox", { name: "Business name", exact: true }).count(),
    0,
  );
  session = await context.request.get(`${base}/api/auth/get-session`);
  assert.equal(await session.json(), null);
  step("sign-out removes confirmed active copies; does not expose them as guest work");
  assert.equal(await page.evaluate((key) => localStorage.getItem(key), profileKey(a)), null);
  const guest = await page.evaluate((key) => localStorage.getItem(key), guestKey);
  assert.ok(!guest || !guest.includes("Safety Alpha"));

  step("B: same browser loads only B's account and never uploads A's business");
  await context.clearCookies();
  await context.addCookies([cookieB]);
  await page.goto(`${base}/?tab=command`, { waitUntil: "networkidle" });
  await nameField.waitFor();
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

  step("B: authenticated delete cannot be undone by an old save");
  const bProfile = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)),
    profileKey(b),
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
      steps: steps.length,
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
