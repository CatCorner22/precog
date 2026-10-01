-- Email/password sign-ups confirm their address by email. An unconfirmed
-- sign-up older than a day is removed so it cannot hold an address that
-- belongs to someone else. Accounts listed in unverified_sign_up_kept are
-- never removed that way: the ones that existed before confirmation began,
-- and the ones made while Precog could not send email. They confirm the next
-- time they sign in.

create table if not exists unverified_sign_up_kept (
  user_id text primary key references "user" ("id") on delete cascade,
  kept_at timestamptz not null default now()
);

insert into unverified_sign_up_kept (user_id)
select id from "user" where not "emailVerified"
on conflict do nothing;

-- Confirmation and password emails sent per account, so a stranger cannot
-- make Precog flood an inbox.
create table if not exists auth_email_log (
  id bigserial primary key,
  user_id text not null references "user" ("id") on delete cascade,
  kind text not null,
  sent_at timestamptz not null default now()
);

create index if not exists auth_email_log_user_idx on auth_email_log (user_id, kind, sent_at desc);
