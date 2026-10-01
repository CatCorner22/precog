-- A client owner's address receives reminders only after its owner confirms
-- it from an email, and every reminder carries a link that stops them. One
-- token per address serves both links; a new address gets a new token.

alter table engagement_marks add column if not exists owner_email_token text;
alter table engagement_marks add column if not exists owner_email_confirmed_at timestamptz;
alter table engagement_marks add column if not exists owner_email_unsubscribed_at timestamptz;

create unique index if not exists engagement_marks_owner_email_token_idx
  on engagement_marks (owner_email_token) where owner_email_token is not null;

-- Each confirmation request, by the account that set the address, for the
-- daily limit.
create table if not exists owner_email_requests (
  id bigserial primary key,
  user_id text not null references "user" ("id") on delete cascade,
  requested_at timestamptz not null default now()
);

create index if not exists owner_email_requests_user_idx
  on owner_email_requests (user_id, requested_at desc);
