-- A firm is more than one sign-in. The owner's account keeps the firm row
-- (firms.user_id stays the owner and the firm's id); members join with a
-- role and see the firm's clients. A business carries the firm it belongs
-- to, so a member's saves and reviews reach the same rows the owner sees.

create table if not exists firm_members (
  firm_user_id text not null references firms ("user_id") on delete cascade,
  member_user_id text not null references "user" ("id") on delete cascade,
  role text not null default 'preparer',
  joined_at timestamptz not null default now(),
  primary key (firm_user_id, member_user_id),
  constraint firm_members_role_check check (role in ('owner', 'preparer', 'reviewer'))
);

create index if not exists firm_members_member_idx on firm_members (member_user_id);

create table if not exists firm_invites (
  token text primary key,
  firm_user_id text not null references firms ("user_id") on delete cascade,
  email text not null,
  role text not null default 'preparer',
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  accepted_by text references "user" ("id") on delete set null,
  accepted_at timestamptz,
  constraint firm_invites_role_check check (role in ('preparer', 'reviewer'))
);

create index if not exists firm_invites_firm_idx on firm_invites (firm_user_id, created_at desc);

-- Every existing firm owner is a member of their own firm.
insert into firm_members (firm_user_id, member_user_id, role)
select user_id, user_id, 'owner' from firms
on conflict do nothing;

alter table businesses add column if not exists firm_user_id text;
create index if not exists businesses_firm_idx on businesses (firm_user_id) where firm_user_id is not null;

-- Who recorded a review or an engagement mark, now that more than one person can.
alter table review_events add column if not exists recorded_by text;
alter table engagement_marks add column if not exists owner_email text;
