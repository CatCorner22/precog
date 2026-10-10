#!/usr/bin/env node
/**
 * Disposable signed-in CPA firm fixture for Precog. Serves the compiled Vercel
 * build in-process on http://localhost:8089 with embedded PGlite (the
 * repository's own test server, scripts/lib/control-e2e-server.mjs), seeds a
 * firm (Reyes & Park CPAs: Sam Reyes, owner; Jordan Lee, preparer) with three
 * client businesses, and stays up until SIGINT/SIGTERM. Writes the sign-in
 * cookies to <UX_DIR>/cpa/cookies.json for ./drive.mjs.
 *
 * Run from the repository root after `npm run build` (the server resolves
 * .vercel/output from the working directory):
 *   env -u DATABASE_URL PRECOG_CONTROL_E2E=1 node scripts/ux/cpa/serve-firm.mjs
 */
import assert from "node:assert/strict";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { toJSONAsync } from "seroval";
import { serveControlTestBuild } from "../../lib/control-e2e-server.mjs";
import { serverFunctionIdOf } from "../../lib/server-fn-id.mjs";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const DIR = process.env.UX_DIR ?? resolve(HERE, "../../../.tmp/ux");

if (process.env.PRECOG_CONTROL_E2E !== "1" || process.env.DATABASE_URL?.trim())
  throw new Error("Embedded disposable fixture only: set PRECOG_CONTROL_E2E=1 and no DATABASE_URL");
const secret = randomBytes(32).toString("hex");
process.env.BETTER_AUTH_SECRET = secret;
process.env.BETTER_AUTH_URL = "http://localhost:8089";
process.env.VITE_AUTH_ENABLED = "true";
for (const k of [
  "XAI_API_KEY",
  "QBO_CLIENT_ID",
  "QBO_CLIENT_SECRET",
  "RESEND_API_KEY",
  "STRIPE_SECRET_KEY",
])
  delete process.env[k];

const TODAY = "2026-10-07";
const LAST = "2026-09";
const PREV = "2026-08";
const server = await serveControlTestBuild();
const { base } = server;
const stop = async () => {
  await server.stop().catch(() => {});
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);

await fetch(base + "/api/auth/get-session");
await globalThis.__pgBootstrapPromise__;
const pg = await globalThis.__pgliteInstance__;
assert.ok(pg, "compiled handler did not expose its embedded database");

const users = {
  sam: { id: "u_sam_reyes", name: "Sam Reyes", email: "sam@reyespark.example" },
  jordan: { id: "u_jordan_lee", name: "Jordan Lee", email: "jordan@reyespark.example" },
};
const cookies = {};
for (const [key, u] of Object.entries(users)) {
  const token = randomBytes(32).toString("hex");
  await pg.query(
    'insert into "user" (id,name,email,"emailVerified","createdAt","updatedAt") values ($1,$2,$3,true,now(),now())',
    [u.id, u.name, u.email],
  );
  await pg.query(
    'insert into "session" (id,"userId",token,"expiresAt","updatedAt") values ($1,$2,$3,now()+interval \'12 hours\',now())',
    [randomUUID(), u.id, token],
  );
  cookies[key] = {
    name: "__Host-grok-auth.session_token",
    value: encodeURIComponent(
      token + "." + createHmac("sha256", secret).update(token).digest("base64"),
    ),
    url: base.replace("http:", "https:") + "/",
    secure: true,
    httpOnly: true,
    sameSite: "Lax",
  };
}
const S = users.sam.id;
const J = users.jordan.id;
await pg.query("insert into firms(user_id,name,plan) values ($1,'Reyes & Park CPAs','monthly')", [
  S,
]);
await pg.query(
  "insert into firm_members(firm_user_id,member_user_id,role,joined_at) values ($1,$1,'owner',now()-interval '90 days'),($1,$2,'preparer',now()-interval '80 days')",
  [S, J],
);

const person = (id, name, role, entitlements, extra = {}) => ({
  id,
  name,
  role,
  active: true,
  entitlements,
  ...extra,
});
const clients = [
  {
    id: "biz_north_dental",
    name: "North Dental",
    industry: "dental",
    staff: {
      teamSize: 6,
      soleOwnerKnowledgeCount: 1,
      avgTenureYears: 6,
      segregationScore: 40,
      dualControlPayments: false,
      independentBankRec: false,
    },
    people: [
      person(
        "p1",
        "Dr. Alicia North",
        "Owner dentist",
        ["approve_invoices", "sign_checks", "approve_payroll"],
        { owner: true },
      ),
      person("p2", "Megan Ortiz", "Office manager", [
        "create_vendor",
        "enter_invoices",
        "release_payment",
        "bank_reconcile",
        "edit_payroll_master",
        "enter_payroll",
      ]),
      person("p3", "Tom Haskins", "Front desk", [
        "collect_cash",
        "post_payments",
        "prepare_deposit",
        "issue_refunds",
      ]),
      person("p4", "Priya Shah", "Billing coordinator", [
        "submit_claims",
        "post_adjustments",
        "approve_writeoffs",
        "post_payments",
      ]),
    ],
    scope: "Monthly internal-control monitoring and annual segregation-of-duties report, FY2026",
  },
  {
    id: "biz_harbor_auto",
    name: "Harbor Auto",
    industry: "automotive",
    staff: {
      teamSize: 9,
      soleOwnerKnowledgeCount: 2,
      avgTenureYears: 4,
      segregationScore: 35,
      dualControlPayments: false,
      independentBankRec: false,
    },
    people: [
      person("p1", "Rick Harbor", "Owner", ["approve_invoices", "sign_checks", "approve_payroll"], {
        owner: true,
      }),
      person("p2", "Dana Wells", "Bookkeeper", [
        "create_vendor",
        "approve_vendor",
        "enter_invoices",
        "release_payment",
        "bank_reconcile",
        "enter_payroll",
      ]),
      person("p3", "Luis Romero", "Service writer", [
        "collect_cash",
        "issue_refunds",
        "order_supplies",
      ]),
      person("p4", "Kim Tran", "Parts manager", [
        "order_supplies",
        "receive_goods",
        "hold_company_card",
      ]),
    ],
    scope: "Monthly internal-control monitoring, FY2026",
  },
  {
    id: "biz_pine_pantry",
    name: "Pine Street Pantry",
    industry: "nonprofit",
    staff: {
      teamSize: 4,
      soleOwnerKnowledgeCount: 0,
      avgTenureYears: 7,
      segregationScore: 70,
      dualControlPayments: true,
      independentBankRec: true,
    },
    people: [
      person(
        "p1",
        "Grace Liu",
        "Executive director",
        ["approve_invoices", "approve_payroll", "sign_checks"],
        { owner: true },
      ),
      person("p2", "Ben Adler", "Treasurer (board)", ["bank_reconcile", "review_card_statement"]),
      person("p3", "Nora Field", "Finance assistant", [
        "enter_invoices",
        "create_vendor",
        "enter_payroll",
        "prepare_deposit",
      ]),
    ],
    scope: "Monthly internal-control monitoring for the board finance committee, FY2026",
  },
];
// The same results the Monthly review screen keeps on the business profile
// (profile.monthlyReviews), mirrored into review_events below.
const AUG_KEYS = ["bank_statement", "cleared_checks", "payroll_headcount", "new_vendors"];
const NOTE_4417 =
  "Check #4417 for $2,850 coded to dental supplies is payable to M. Ortiz (office manager). No invoice on file. Asked Dr. North.";
const SEPT = {
  biz_north_dental: [
    ["bank_statement", "done", "Statement agreed to GL; no unusual items."],
    ["cleared_checks", "exception", NOTE_4417],
    ["new_vendors", "done", "One new lab vendor; W-9 and bank letter on file."],
  ],
  biz_harbor_auto: [],
  biz_pine_pantry: AUG_KEYS.map((k) => [k, "done", ""]),
};
const recordsFor = (id) => [
  ...AUG_KEYS.map((key, k) => ({
    key,
    period: PREV,
    result: "done",
    ownerName: "Jordan Lee",
    notes: "",
    recordedAt: `2026-09-0${3 + k}T15:00:00.000Z`,
  })),
  ...SEPT[id].map(([key, result, notes], k) => ({
    key,
    period: LAST,
    result,
    ownerName: "Jordan Lee",
    notes,
    recordedAt: `2026-10-0${2 + k}T16:00:00.000Z`,
  })),
];
for (const [i, c] of clients.entries()) {
  const profile = {
    monthlyReviews: recordsFor(c.id),
    businessId: c.id,
    practiceName: c.name,
    industry: c.industry,
    onboardingComplete: true,
    staff: c.staff,
    riskVariables: {},
    dualRelease: {},
    decisions: [],
    customPeople: c.people,
    customProcesses: [],
    customKnowledge: [],
    customRelations: [],
    updatedAt: new Date(Date.now() - i * 3600e3).toISOString(),
  };
  await pg.query(
    "insert into businesses(user_id,id,name,industry,profile,revision,firm_user_id,created_at,updated_at) values ($1,$2,$3,$4,$5::jsonb,1,$1,now()-interval '70 days',now()-($6 || ' hours')::interval)",
    [S, c.id, c.name, c.industry, JSON.stringify(profile), String(i)],
  );
  await pg.query(
    `insert into engagement_marks(user_id,business_id,started_at,map_completed_at,open_findings,accepted_findings,scope,period_start,period_end,status,preparer_user_id,reviewer_user_id)
     values ($1,$2,now()-interval '70 days',now()-interval '60 days',$3,0,$4,'2026-01-01','2026-12-31','active',$5,$1)`,
    [S, c.id, [3, 4, 1][i], c.scope, J],
  );
}
for (const id of [S, J])
  await pg.query(
    "insert into business_profiles(user_id,name,industry,profile) values ($1,'North Dental','dental',$2::jsonb)",
    [id, JSON.stringify({ businessId: "biz_north_dental", ownerUserId: S, pointerVersion: 2 })],
  );

// August: every client finished all four checks (recorded in early September).
for (const c of clients)
  for (const [k, key] of AUG_KEYS.entries())
    await pg.query(
      "insert into review_events(user_id,business_id,period,item_key,owner_name,due_on,result,notes,recorded_at,recorded_by) values ($1,$2,$3,$4,'Jordan Lee','2026-09-10','done','',$5,$6)",
      [S, c.id, PREV, key, `2026-09-0${3 + k}T15:00:00Z`, J],
    );

// Calls Precog's own server functions as a signed-in member.
async function call(who, file, name, data) {
  const res = await fetch(base + "/_serverFn/" + serverFunctionIdOf(file, name), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-tsr-serverFn": "true",
      Origin: base,
      Cookie: `${cookies[who].name}=${cookies[who].value}`,
    },
    body: JSON.stringify(await toJSONAsync({ data })),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${name} as ${who}: ${res.status} ${text.slice(0, 400)}`);
  return text;
}
const FIRM = "src/lib/precog/firm/server.ts";
const review = (businessId, itemKey, result, notes = "") =>
  call("jordan", FIRM, "recordMonthlyReview", {
    businessId,
    period: LAST,
    itemKey,
    ownerName: "Jordan Lee",
    dueOn: "2026-10-10",
    result,
    notes,
    today: TODAY,
  });
// September: North Dental partly recorded with one Exception; Pine Street all Done; Harbor Auto nothing.
for (const [id, rows] of Object.entries(SEPT))
  for (const [key, result, notes] of rows) await review(id, key, result, notes);

// North Dental: Jordan locks a report version and asks for review.
const locked = await call("jordan", FIRM, "lockReport", {
  businessId: "biz_north_dental",
  scopeNote:
    "Q3 2026 segregation-of-duties review. Includes the September cleared-check exception (check #4417).",
  today: TODAY,
});
const versionId = (
  await pg.query("select id from report_versions where business_id='biz_north_dental'")
).rows[0]?.id;
assert.ok(versionId, "lockReport created no version: " + locked.slice(0, 300));
await call("jordan", "src/lib/precog/firm/review-server.ts", "requestReportReview", {
  id: versionId,
});
const v = (
  await pg.query(
    "select version_no,prepared_by,review_requested_from,reviewed_at from report_versions where id=$1",
    [versionId],
  )
).rows[0];
assert.equal(v.prepared_by, J);
assert.equal(v.review_requested_from, S);

// Verify Sam's session.
const session = await (
  await fetch(base + "/api/auth/get-session", {
    headers: { Cookie: `${cookies.sam.name}=${cookies.sam.value}` },
  })
).json();
assert.equal(session?.user?.id, S, "get-session did not return Sam");
mkdirSync(`${DIR}/cpa`, { recursive: true });
writeFileSync(`${DIR}/cpa/cookies.json`, JSON.stringify(cookies, null, 2));
const counts = (
  await pg.query(
    "select business_id, period, count(*)::int n from review_events group by 1,2 order by 1,2",
  )
).rows;
console.log(
  JSON.stringify(
    {
      ready: true,
      base,
      today: TODAY,
      samSession: session.user,
      version: { id: versionId, ...v },
      reviewEvents: counts,
    },
    null,
    2,
  ),
);
console.log(`SAM COOKIE: ${cookies.sam.name}=${cookies.sam.value}`);
setInterval(() => {}, 1 << 30);
