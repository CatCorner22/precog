#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import { authTestEnvironment } from "./lib/auth-test-env.mjs";
import { withPage } from "./lib/e2e.mjs";
import { stepLogger } from "./lib/steps.mjs";

const { databaseUrl, base, secret } = authTestEnvironment();
const db = new Pool({ connectionString: databaseUrl, max: 2 });
const user = `transcript_${randomUUID().replaceAll("-", "")}`;
const token = randomBytes(32).toString("hex");
const signature = createHmac("sha256", secret).update(token).digest("base64");
const step = stepLogger();
try {
  await db.query(
    'insert into "user" (id,name,email,"emailVerified","createdAt","updatedAt") values ($1,$1,$2,true,now(),now())',
    [user, `${user}@example.test`],
  );
  await db.query(
    'insert into "session" (id,"userId",token,"expiresAt","updatedAt") values ($1,$2,$3,now()+interval \'1 hour\',now())',
    [randomUUID(), user, token],
  );
  await db.query(
    "insert into firms (user_id,name,plan) values ($1,'Transcript Test Firm','assessment')",
    [user],
  );
  await db.query(
    "insert into firm_members (firm_user_id,member_user_id,role) values ($1,$1,'owner')",
    [user],
  );
  const [transcript, reference] = await Promise.all(
    ["transcript", "reference"].map((name) =>
      readFile(
        new URL(`../src/lib/precog/transcript-fixtures/${name}.txt`, import.meta.url),
        "utf8",
      ),
    ),
  );
  const passed = await withPage(
    { timeout: 45000, failureShot: "/home/ubuntu/transcript-check-failure.png" },
    async (page, errors) => {
      step("real signed firm session: open the lazy interview transcript check");
      await page.context().addCookies([
        {
          name: "__Host-precog-auth.session_token",
          value: encodeURIComponent(`${token}.${signature}`),
          url: base.replace("http:", "https:") + "/",
          secure: true,
          httpOnly: true,
          sameSite: "Lax",
        },
      ]);
      await page.goto(`${base}/firm`, { waitUntil: "networkidle" });
      await page.locator("#transcript-check > summary").click();
      const tool = page.getByRole("region", { name: "Interview transcript check", exact: true });
      await tool.getByRole("button", { name: "Compare wording", exact: true }).click();
      await tool.getByRole("alert").filter({ hasText: "Paste both texts" }).waitFor();
      step("paste fixtures: see negation, exact amount, date and name differences with positions");
      let uploaded = 0;
      page.on("request", (request) => {
        if (request.url().includes("TQ47") || request.postData()?.includes("TQ47")) uploaded++;
      });
      await tool.getByLabel("Transcript", { exact: true }).fill(transcript);
      await tool.getByLabel("Reference text", { exact: true }).fill(reference);
      await tool.getByRole("button", { name: "Compare wording", exact: true }).click();
      await tool.getByRole("status").filter({ hasText: "4 wording differences" }).waitFor();
      for (const kind of ["Negation", "Amount or number", "Date", "Capitalized name"]) {
        const item = tool.getByRole("listitem", { name: `${kind} difference`, exact: true });
        await item.waitFor();
        assert((await item.innerText()).includes("line 1, column"));
      }
      await tool
        .getByText("This check compares wording. It never judges whether anyone told the truth.", {
          exact: true,
        })
        .waitFor();
      assert.equal(await tool.getByRole("button", { name: /save/i }).count(), 0);
      assert.equal(uploaded, 0);
      assert.equal(
        await page.evaluate(() =>
          Object.values(localStorage).some((value) => value.includes("TQ47")),
        ),
        false,
      );
      if (process.env.E2E_TRANSCRIPT_SCREENSHOT)
        await tool.screenshot({ path: process.env.E2E_TRANSCRIPT_SCREENSHOT });
      step("reload: neither pasted text nor results were stored");
      await page.reload({ waitUntil: "networkidle" });
      await page.locator("#transcript-check > summary").click();
      assert.equal(await tool.getByLabel("Transcript", { exact: true }).inputValue(), "");
      assert.equal(await tool.getByLabel("Reference text", { exact: true }).inputValue(), "");
      assert.equal(await tool.getByRole("listitem").count(), 0);
      assert.equal(uploaded, 0);
      assert.deepEqual(errors, { page: [], console: [] });
    },
  );
  if (passed)
    console.log(JSON.stringify({ ok: true, steps: step.names.length, authenticated: true }));
} finally {
  await db.query('delete from "user" where id=$1', [user]);
  await db.end();
}
