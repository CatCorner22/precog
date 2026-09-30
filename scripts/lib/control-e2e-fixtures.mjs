/** Test fixtures only; never imported by application code. */
import assert from "node:assert/strict";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
export const actor = {
  prep: "control_prep",
  reviewer: "control_reviewer",
  outside: "control_outside",
};
export const names = {
  prep: "Casey Preparer",
  reviewer: "Jordan Reviewer",
  outside: "Taylor Outside",
};
export const biz = "biz_control_e2e";
export async function seedControlFixture(base, secret) {
  if (process.env.PRECOG_CONTROL_E2E !== "1" || process.env.DATABASE_URL?.trim())
    throw new Error("Embedded test fixture only");
  // Loading the real handler initializes the exact embedded database used by its auth and APIs.
  await fetch(base + "/api/auth/get-session");
  await globalThis.__pgBootstrapPromise__;
  const pg = await globalThis.__pgliteInstance__;
  assert.ok(pg, "Compiled handler did not expose its test database");
  const cookies = {};
  for (const [role, id] of Object.entries(actor)) {
    const token = randomBytes(32).toString("hex");
    await pg.query(
      'insert into "user" (id,name,email,"emailVerified","createdAt","updatedAt") values ($1,$2,$3,true,now(),now())',
      [id, names[role], id + "@example.test"],
    );
    await pg.query(
      'insert into "session" (id,"userId",token,"expiresAt","updatedAt") values ($1,$2,$3,now()+interval \'1 hour\',now())',
      [randomUUID(), id, token],
    );
    cookies[role] = {
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
  await pg.query("insert into firms(user_id,name) values ($1,'Evidence Test Firm')", [
    actor.reviewer,
  ]);
  await pg.query(
    "insert into firm_members(firm_user_id,member_user_id,role) values ($1,$1,'owner'),($1,$2,'preparer')",
    [actor.reviewer, actor.prep],
  );
  const profile = {
    businessId: biz,
    practiceName: "Evidence Test Business",
    industry: "general",
    onboardingComplete: true,
    staff: {
      teamSize: 2,
      soleOwnerKnowledgeCount: 0,
      avgTenureYears: 5,
      segregationScore: 50,
      dualControlPayments: false,
      independentBankRec: false,
    },
    riskVariables: {},
    dualRelease: {},
    decisions: [],
    customPeople: [
      {
        id: "p1",
        name: names.prep,
        role: "Bookkeeper",
        active: true,
        entitlements: ["enter_invoices"],
      },
      {
        id: "p2",
        name: names.reviewer,
        role: "Owner",
        owner: true,
        active: true,
        entitlements: ["approve_invoices"],
      },
    ],
    customProcesses: [],
    customKnowledge: [],
    customRelations: [],
    updatedAt: new Date().toISOString(),
  };
  await pg.query(
    "insert into businesses(user_id,id,name,industry,profile,revision,firm_user_id) values ($1,$2,$3,'general',$4::jsonb,1,$1)",
    [actor.reviewer, biz, profile.practiceName, JSON.stringify(profile)],
  );
  for (const id of [actor.prep, actor.reviewer])
    await pg.query(
      "insert into business_profiles(user_id,name,industry,profile) values ($1,$2,'general',$3::jsonb)",
      [
        id,
        profile.practiceName,
        JSON.stringify({ businessId: biz, ownerUserId: actor.reviewer, pointerVersion: 2 }),
      ],
    );
  return { pg, cookies };
}
