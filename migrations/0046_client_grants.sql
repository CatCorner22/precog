-- A business owner's invitation to a firm to work on their business, and the
-- record of its acceptance. The business stays the owner's (user_id); the
-- firm reaches it through businesses.firm_user_id while granted_at is set.
create table if not exists business_firm_grants (
  token text primary key,
  business_owner_id text not null references "user" ("id") on delete cascade,
  business_id text not null,
  kind text not null default 'grant',
  invited_email text not null,
  firm_user_id text references firms ("user_id") on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  accepted_by text references "user" ("id") on delete set null,
  accepted_at timestamptz,
  revoked_at timestamptz,
  constraint business_firm_grants_kind_check check (kind in ('grant', 'takeover')),
  constraint business_firm_grants_business_fk foreign key (business_owner_id, business_id)
    references businesses ("user_id", "id") on delete cascade
);
create index if not exists business_firm_grants_business_idx
  on business_firm_grants (business_owner_id, business_id, created_at desc);
alter table businesses add column if not exists granted_at timestamptz;
-- The firm a version was locked for, so a firm reads only its own versions
-- after a hand-back and a later grant to another firm. No FK: the value
-- outlives the firm owner's account. Null on versions locked before this.
alter table report_versions add column if not exists firm_user_id text;
