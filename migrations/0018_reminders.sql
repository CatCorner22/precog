-- Reminders leave the app by email. Each user chooses whether the weekly
-- digest goes out; each sent reminder is logged so a due item is announced
-- once per due date, not on every run.

create table if not exists notification_settings (
  user_id text primary key references "user" ("id") on delete cascade,
  weekly_digest boolean not null default true,
  owner_reminders boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists reminder_log (
  id bigserial primary key,
  user_id text not null references "user" ("id") on delete cascade,
  business_id text not null,
  item_key text not null,
  due_on date,
  recipient text not null,
  sent_at timestamptz not null default now(),
  constraint reminder_log_once unique (user_id, business_id, item_key, due_on, recipient)
);

create index if not exists reminder_log_user_idx on reminder_log (user_id, sent_at desc);
