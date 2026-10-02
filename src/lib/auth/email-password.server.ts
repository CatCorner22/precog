/**
 * The server half of email/password sign-in (see `./email-password` for the
 * switch). `server.ts` spreads these options into its Better Auth config.
 *
 * With email connected (RESEND_API_KEY and EMAIL_FROM), a new address must be
 * confirmed from a link before it can sign in, a password can be reset by
 * email, and an unconfirmed sign-up older than a day is removed so it cannot
 * hold an address that belongs to someone else (the real owner could then
 * neither sign up nor use Google with it). Accounts that never confirmed
 * before this existed are kept (migrations/0027): they get a fresh link each
 * time they try to sign in.
 *
 * Without email (the live preview), Precog cannot send a link, so sign-up
 * works unconfirmed as before and the server log says so.
 */
import type { BetterAuthOptions } from "better-auth";
import { createAuthMiddleware } from "better-auth/api";
import { getSql, type Sql } from "../db";
import { reportServerError } from "@/lib/observability/report.server";
import { mailConfigured, sendEmail } from "@/lib/precog/reminders/mailer.server";
import type { RenderedEmail } from "@/lib/precog/reminders/email";
import { renderPasswordReset, renderVerifyEmail } from "./auth-email";

/** How long an unconfirmed sign-up may hold its address. */
const UNCONFIRMED_HOLD_HOURS = 24;
/** Per account and kind of email, within an hour. */
const MAX_AUTH_EMAILS_PER_HOUR = 3;

const requireConfirmation = mailConfigured();
if (!requireConfirmation) {
  console.warn(
    "[auth] RESEND_API_KEY or EMAIL_FROM is not set, so Precog cannot send confirmation or " +
      "password emails. Email/password sign-ups work without confirming the address.",
  );
}

type AuthUser = { id: string; email: string; emailVerified: boolean };

/** Extra `emailAndPassword` options: confirmation required and password reset, with email. */
export const emailPasswordExtras: Partial<NonNullable<BetterAuthOptions["emailAndPassword"]>> =
  requireConfirmation
    ? {
        requireEmailVerification: true,
        resetPasswordTokenExpiresIn: 60 * 60,
        revokeSessionsOnPasswordReset: true,
        sendResetPassword: async ({ user, url }) => {
          await sendAuthEmail(await getSql(), sendEmail, {
            userId: user.id,
            kind: "reset",
            to: user.email,
            message: renderPasswordReset({ email: user.email, url }),
          });
        },
        // The reset link reached this inbox, which confirms the address too.
        onPasswordReset: async ({ user }) => {
          const sql = await getSql();
          await sql`update "user" set "emailVerified" = true where id = ${user.id}`;
        },
      }
    : {};

/** Top-level options: the confirmation email, the unconfirmed-account rules. */
export const emailVerificationOptions: Pick<
  BetterAuthOptions,
  "emailVerification" | "databaseHooks" | "hooks"
> = {
  ...(requireConfirmation
    ? {
        emailVerification: {
          sendOnSignUp: true,
          // Accounts made before confirmation began get their link here.
          sendOnSignIn: true,
          expiresIn: UNCONFIRMED_HOLD_HOURS * 60 * 60,
          sendVerificationEmail: async ({ user, url }) => {
            await sendAuthEmail(await getSql(), sendEmail, {
              userId: user.id,
              kind: "verify",
              to: user.email,
              message: renderVerifyEmail({ email: user.email, url: withLoginReturn(url) }),
            });
          },
        },
      }
    : {}),
  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          if (!requireConfirmation) await keepUnconfirmed(await getSql(), user);
        },
      },
    },
  },
  // Before anyone claims an address, free it from stale unconfirmed sign-ups.
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (!RELEASE_PATHS.has(ctx.path)) return;
      try {
        await releaseStaleSignUps(await getSql());
      } catch (err) {
        console.error("[auth] could not remove stale unconfirmed sign-ups", err);
      }
    }),
  },
};

const RELEASE_PATHS = new Set(["/sign-up/email", "/oauth2/callback/:providerId"]);

/**
 * The confirmation link lands on /login, which says the address is confirmed
 * (or why the link failed), instead of the home page.
 */
function withLoginReturn(url: string): string {
  const parsed = new URL(url);
  parsed.searchParams.set("callbackURL", "/login?verified=1");
  return parsed.toString();
}

/** A sign-up Precog could not ask to confirm is kept, not removed after a day. */
export async function keepUnconfirmed(sql: Sql, user: AuthUser): Promise<void> {
  if (user.emailVerified) return;
  await sql`
    insert into unverified_sign_up_kept (user_id) values (${user.id}) on conflict do nothing
  `;
}

/**
 * Removes password-only accounts that never confirmed their address within
 * the hold, except the kept ones and any that ever signed in or hold work
 * (an account made before confirmation was required could do both). Returns
 * how many went.
 */
export async function releaseStaleSignUps(sql: Sql): Promise<number> {
  const rows = await sql<{ id: string }>`
    delete from "user" u
    where not u."emailVerified"
      and u."createdAt" < now() - make_interval(hours => ${UNCONFIRMED_HOLD_HOURS})
      and not exists (select 1 from unverified_sign_up_kept k where k.user_id = u.id)
      and exists (
        select 1 from account a where a."userId" = u.id and a."providerId" = 'credential'
      )
      and not exists (
        select 1 from account a where a."userId" = u.id and a."providerId" <> 'credential'
      )
      -- Never an account that signed in (before confirmation was required,
      -- or while mail was off) or holds work: deleting the user would take
      -- its businesses, firm and links with it.
      and not exists (select 1 from session s where s."userId" = u.id)
      and not exists (select 1 from businesses b where b.user_id = u.id)
      and not exists (select 1 from business_profiles p where p.user_id = u.id)
      and not exists (select 1 from firms f where f.user_id = u.id)
      and not exists (select 1 from firm_members m where m.member_user_id = u.id)
    returning u.id
  `;
  return rows.length;
}

/**
 * Sends one confirmation or password email, at most a few per account an
 * hour, so a stranger who knows an address cannot flood it. A refused or
 * failed send is reported, not thrown: the person sees the same answer either
 * way, which also keeps Precog from saying which addresses have accounts.
 */
export async function sendAuthEmail(
  sql: Sql,
  send: (to: string, message: RenderedEmail) => Promise<void>,
  input: { userId: string; kind: "verify" | "reset"; to: string; message: RenderedEmail },
): Promise<boolean> {
  const recent = await sql<{ n: number | string }>`
    select count(*) as n from auth_email_log
    where user_id = ${input.userId} and kind = ${input.kind}
      and sent_at > now() - interval '1 hour'
  `;
  if (Number(recent[0]?.n ?? 0) >= MAX_AUTH_EMAILS_PER_HOUR) {
    console.warn(`[auth] ${input.kind} email to ${input.userId} skipped: hourly limit reached`);
    return false;
  }
  try {
    await send(input.to, input.message);
  } catch (err) {
    console.error(`[auth] ${input.kind} email to ${input.userId} failed`);
    await reportServerError(err, `auth-${input.kind}-email`);
    return false;
  }
  await sql`
    insert into auth_email_log (user_id, kind) values (${input.userId}, ${input.kind})
  `;
  return true;
}
