#!/usr/bin/env node
/** Actual compiled server-function requests with genuine signed test sessions.
 * No browser UI claim: this verifies HTTP, auth, domain transitions and embedded database.
 */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { toJSONAsync, fromCrossJSON } from "seroval";
import { serveControlTestBuild } from "./lib/control-e2e-server.mjs";
import { seedControlFixture, actor, names, biz } from "./lib/control-e2e-fixtures.mjs";
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
const server = await serveControlTestBuild();
const { base } = server;
const today = new Date().toISOString().slice(0, 10);
const period = today.slice(0, 7);
let assertions = 0;
const same = (a, b) => {
  assert.deepEqual(a, b);
  assertions += 1;
};
try {
  const { pg, cookies } = await seedControlFixture(base, secret);
  const cookie = (role) => (role ? `${cookies[role].name}=${cookies[role].value}` : "");
  for (const role of Object.keys(actor)) {
    const response = await fetch(base + "/api/auth/get-session", {
      headers: { Cookie: cookie(role) },
    });
    same((await response.json()).user.id, actor[role]);
  }
  const url =
    base +
    "/_serverFn/" +
    serverFunctionIdOf("src/lib/precog/controls/executions/server.ts", "recordControlExecution");
  async function call(role, command, expected = actor[role] ?? actor.prep, origin = base) {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-tsr-serverFn": "true",
        Origin: origin,
        Cookie: cookie(role),
      },
      body: JSON.stringify(
        await toJSONAsync({
          data: { businessId: biz, expectedAccountId: expected, command },
          context: { checkAccount: true, expectedAccountId: expected },
        }),
      ),
    });
    const body = await response.text();
    if (response.status >= 500)
      console.error("Unexpected server error", response.status, body.slice(0, 2000));
    return response.status;
  }
  async function list(role, requestedPeriod = period) {
    const payload = JSON.stringify(
      await toJSONAsync({
        data: {
          businessId: biz,
          expectedAccountId: actor[role],
          period: requestedPeriod,
          cursor: null,
        },
        context: { checkAccount: true, expectedAccountId: actor[role] },
      }),
    );
    const response = await fetch(
      base +
        "/_serverFn/" +
        serverFunctionIdOf(
          "src/lib/precog/controls/executions/server.ts",
          "getControlExecutionLog",
        ) +
        "?" +
        new URLSearchParams({ payload }),
      {
        headers: {
          "x-tsr-serverFn": "true",
          Accept: "application/json",
          Origin: base,
          Cookie: cookie(role),
        },
      },
    );
    const raw = await response.text();
    return {
      status: response.status,
      body: response.ok ? fromCrossJSON(JSON.parse(raw), { refs: new Map() }) : null,
    };
  }
  const read = async () =>
    (await pg.query("select record from control_execution_log where id='http_check'")).rows[0]
      ?.record;
  const record = {
    action: "record",
    commandId: "http_record",
    runId: "http_check",
    baseRevision: 0,
    controlKey: "bank_statement",
    period,
    performedOn: today,
    performedBy: names.prep,
    method: "inspection",
    scope: "All statement lines for the stated month",
    evidenceRefs: ["Restricted statement archive v1"],
    result: "no_exception",
    note: "Compared every statement line to books and documented discrepancies.",
  };
  same(await call(null, record), 401);
  same(await call("prep", record, actor.reviewer), 409);
  same(await call("prep", record, actor.prep, "https://untrusted.example"), 403);
  same(await call("outside", record), 404);
  same(await call("prep", { ...record, actorId: actor.reviewer }), 400);
  same(await call("prep", record), 200);
  const first = await read();
  same(first.status, "awaiting_review");
  same(first.history[0].actor.id, actor.prep);
  same(await call("prep", record), 200);
  same((await read()).history.length, 1);
  console.log(
    "[control-http] Signed identities, CSRF/account fencing, access and idempotent create passed",
  );
  const listed = await list("reviewer");
  same(listed.status, 200);
  same(listed.body.result.entries[0].id, "http_check");
  same(listed.body.result.canReview, true);
  same((await list("prep")).body.result.canReview, false);
  same((await list("outside")).status, 404);
  same((await list("reviewer", "2026-13")).status, 400);
  const review = {
    action: "review",
    commandId: "http_review",
    runId: "http_check",
    baseRevision: 1,
    method: "inspection",
    evidenceRefs: ["Review workpaper v1"],
    result: "no_exception",
    note: "Independently reviewed statement and reconciliation.",
    independenceConfirmed: true,
  };
  same(await call("prep", review), 403);
  same(await call("reviewer", { ...review, independenceConfirmed: false }), 422);
  same(await call("reviewer", { ...review, method: "inquiry" }), 422);
  same((await read()).revision, 1);
  same(
    await call("reviewer", {
      ...review,
      result: "exception",
      followUpOwner: names.prep,
      dueOn: today,
    }),
    200,
  );
  same((await read()).status, "needs_correction");
  const correct = {
    action: "correct",
    commandId: "http_correct",
    runId: "http_check",
    baseRevision: 2,
    performedOn: today,
    performedBy: names.prep,
    scope: "Corrected unsupported reconciliation item",
    evidenceRefs: ["Corrected workpaper v2"],
    note: "Explained and corrected the difference with supporting records.",
  };
  same(await call("prep", correct), 200);
  same((await read()).status, "awaiting_retest");
  same(await call("reviewer", { ...review, commandId: "http_retest", baseRevision: 3 }), 422);
  same(
    await call("reviewer", {
      ...review,
      commandId: "http_retest",
      baseRevision: 3,
      method: "reperformance",
    }),
    200,
  );
  const after = await read();
  same(after.status, "reviewed");
  same(after.revision, 4);
  same(after.history[0], first.history[0]);
  console.log("[control-http] Independent review, exception, correction and reperformance passed");
  same(await call("reviewer", review), 409);
  const reopen = {
    action: "reopen",
    commandId: "http_reopen",
    runId: "http_check",
    baseRevision: 4,
    note: "New information requires another check",
    followUpOwner: names.prep,
    dueOn: today,
  };
  const attempts = await Promise.all([
    call("prep", reopen),
    call("reviewer", { ...reopen, commandId: "http_reopen2" }),
  ]);
  same(attempts.sort(), [200, 409]);
  same((await read()).history.length, 5);
  await pg.query("delete from firm_members where member_user_id=$1", [actor.prep]);
  same(await call("prep", { ...correct, baseRevision: 5, commandId: "revoked" }), 404);
  await pg.query("update businesses set deleted_at=now() where id=$1", [biz]);
  same(await call("reviewer", { ...correct, baseRevision: 5, commandId: "deleted" }), 404);
  same((await read()).history.length, 5);
  console.log(
    "[control-http] Stale/concurrent commands, membership revocation and deletion boundaries passed",
  );
  console.log(
    JSON.stringify({
      result: "passed",
      assertions,
      runtime: "compiled Vercel handler",
      database: "embedded PGlite",
      browser: false,
      externalOAuth: false,
      liveModel: false,
    }),
  );
} finally {
  await server.stop();
}
