import type { Sql } from "@/lib/db";
import { inTransaction } from "@/lib/sql-transaction";
import { RequestError } from "@/lib/request-errors";
import { isBusinessId } from "../../profile-input";
import { applyCommand, parseCommand, type Actor, type ControlExecution } from "./model";

const PAGE_SIZE = 20;
const MAX_CHECKS = 5000;
interface Access {
  user_id: string;
  revision: number | string;
  firm_user_id: string | null;
  role: string | null;
  name: string;
}

/** Authorization is evaluated against the business's firm, not a caller-supplied role or owner. */
async function access(
  sql: Sql,
  actorId: string,
  businessId: string,
  write = true,
): Promise<Access> {
  // Reserved by auth/verify.server.ts; the shared preview user is never evidence of identity.
  if (actorId === "dev-user")
    throw new RequestError(
      401,
      "Use an individual signed-in account for the control evidence log.",
    );
  if (!isBusinessId(businessId)) throw new RequestError(400, "Unknown business id.");
  const rows = await sql<Access>`
    select b.user_id, b.revision, b.firm_user_id, m.role, coalesce(nullif(u.name,''),u.email) as name
    from businesses b
    join "user" u on u.id = ${actorId}
    left join firm_members m on m.firm_user_id=b.firm_user_id and m.member_user_id=${actorId}
    where b.id=${businessId} and b.deleted_at is null
      and (b.user_id=${actorId} or m.member_user_id is not null)
    order by (b.user_id=${actorId}) desc, b.user_id
    limit 2
  `;
  const candidate = rows[0];
  if (!candidate)
    throw new RequestError(404, "Save this business to your account first, or ask for access.");
  if (candidate.user_id !== actorId && rows.length > 1) {
    throw new RequestError(
      409,
      "More than one shared client has this business id. Resolve the duplicate client ids before logging evidence.",
    );
  }
  // The candidate only identifies a business; it never supplies final authority.
  // Lock the parent FIRST. A SELECT joining membership before a lock wait can
  // carry an obsolete role in its statement snapshot under Read Committed.
  // Shared locks let readers coexist; writes remain serialized per business.
  const [business] = await sql.query<Pick<Access, "user_id" | "revision" | "firm_user_id">>(
    `select b.user_id, b.revision, b.firm_user_id from businesses b
     where b.user_id=$1 and b.id=$2 and b.deleted_at is null
     ${write ? "for update of b" : "for share of b"}`,
    [candidate.user_id, businessId],
  );
  if (!business)
    throw new RequestError(404, "This business is no longer available to this account.");
  // A fresh statement AFTER the parent lock reads the current membership.
  // FOR SHARE, unlike FOR KEY SHARE, also blocks role updates until commit.
  // An operation admitted first may finish while a later revocation waits.
  const members = business.firm_user_id
    ? await sql<{ role: string }>`select m.role from firm_members m
        where m.firm_user_id=${business.firm_user_id} and m.member_user_id=${actorId}
        for share of m`
    : [];
  const role = members[0]?.role ?? null;
  if (business.user_id !== actorId && role === null)
    throw new RequestError(404, "This business is no longer available to this account.");
  const [user] = await sql<{ name: string }>`select coalesce(nullif(name,''),email) as name
    from "user" where id=${actorId}`;
  if (!user) throw new RequestError(401, "Sign in to an individual account again.");
  return { ...business, role, name: user.name };
}
const actorFor = (row: Access, id: string): Actor => ({
  id,
  name: row.name.trim().slice(0, 120),
  canReview: row.firm_user_id === null || row.role === "reviewer" || row.role === "owner",
});

/** One transaction checks access, locks the business, checks the revision, and appends the event. */
export async function executeControlCommand(
  sql: Sql,
  actorId: string,
  businessId: string,
  input: unknown,
): Promise<ControlExecution> {
  const command = parseCommand(input);
  return inTransaction(sql, async (tx) => {
    // This parent lock also serializes first inserts/quota checks with deletion and other commands.
    const owner = await access(tx, actorId, businessId);
    const [row] = await tx<{ record: ControlExecution }>`
      select record from control_execution_log
      where user_id=${owner.user_id} and business_id=${businessId} and id=${command.runId}
    `;
    const previous = row?.record ?? null;
    if (!previous) {
      if (command.action !== "record")
        throw new RequestError(404, "That control check does not exist.");
      const [usage] = await tx<{ n: number | string }>`
        select count(*)::int as n from control_execution_log
        where user_id=${owner.user_id} and business_id=${businessId}
      `;
      if (Number(usage.n) >= MAX_CHECKS)
        throw new RequestError(
          409,
          `This business has ${MAX_CHECKS.toLocaleString("en-US")} recorded checks, the most Precog holds, and Precog removed no earlier entries. The business owner can export them with Export data in the account menu.`,
        );
    }
    if (command.action === "review" && command.soleIssuer) {
      if (owner.firm_user_id) {
        const others = await tx`
          select 1 from firm_members
          where firm_user_id = ${owner.firm_user_id} and member_user_id <> ${actorId}
          limit 1
        `;
        if (others.length)
          throw new RequestError(403, "A different person at the firm must review this check.");
      }
    }
    const next = applyCommand(
      previous,
      command,
      actorFor(owner, actorId),
      new Date().toISOString(),
      Number(owner.revision),
    );
    if (next === previous) return next; // A retry of an acknowledged command never appends twice.
    const json = JSON.stringify(next);
    // Bound retained history and page payloads without truncating earlier events.
    if (new TextEncoder().encode(json).length > 300_000) {
      throw new RequestError(
        413,
        "This check's evidence history is full. Start a new check referencing it; no earlier events were removed.",
      );
    }
    if (!previous) {
      await tx`insert into control_execution_log(user_id,business_id,id,period,revision,record)
        values (${owner.user_id},${businessId},${next.id},${next.period},${next.revision},${json}::jsonb)`;
    } else {
      const changed = await tx<{ id: string }>`update control_execution_log
        set record=${json}::jsonb, revision=${next.revision}, updated_at=now()
        where user_id=${owner.user_id} and business_id=${businessId} and id=${next.id}
          and revision=${previous.revision} returning id`;
      if (changed.length !== 1) throw new RequestError(409, "This check changed. Reload the log.");
    }
    return next;
  });
}

/**
 * Keyset pagination is anchored to an existing row in this account/business/month.
 * New inserts do not shift previously returned rows across page boundaries.
 * This is a live log, not a point-in-time snapshot; reload page one for newer work.
 */
export async function listControlExecutions(
  sql: Sql,
  actorId: string,
  businessId: string,
  period: string,
  cursor: string | null,
): Promise<{
  entries: ControlExecution[];
  more: boolean;
  nextCursor: string | null;
  canReview: boolean;
}> {
  if (
    !/^\d{4}-(0[1-9]|1[0-2])$/.test(period) ||
    (cursor !== null && (typeof cursor !== "string" || !/^[A-Za-z0-9_-]{1,80}$/.test(cursor)))
  )
    throw new RequestError(400, "Choose a valid month and log position.");
  return inTransaction(sql, async (tx) => {
    const owner = await access(tx, actorId, businessId, false);
    let rows: { record: ControlExecution }[];
    if (cursor !== null) {
      // Keep PostgreSQL timestamp precision: do not round-trip through JS Date.
      const [anchor] = await tx<{ created_at: string }>`select created_at::text as created_at
        from control_execution_log where user_id=${owner.user_id} and business_id=${businessId}
        and period=${period} and id=${cursor}`;
      if (!anchor)
        throw new RequestError(
          409,
          "This log position is unavailable. Reload from the first page.",
        );
      rows = await tx<{ record: ControlExecution }>`select record from control_execution_log
        where user_id=${owner.user_id} and business_id=${businessId} and period=${period}
          and (created_at,id) < (${anchor.created_at}::timestamptz,${cursor})
        order by created_at desc,id desc limit ${PAGE_SIZE + 1}`;
    } else {
      rows = await tx<{ record: ControlExecution }>`select record from control_execution_log
        where user_id=${owner.user_id} and business_id=${businessId} and period=${period}
        order by created_at desc,id desc limit ${PAGE_SIZE + 1}`;
    }
    const entries = rows.slice(0, PAGE_SIZE).map((r) => r.record);
    const more = rows.length > PAGE_SIZE;
    return {
      entries,
      more,
      nextCursor: more ? entries.at(-1)!.id : null,
      canReview: actorFor(owner, actorId).canReview,
    };
  });
}
