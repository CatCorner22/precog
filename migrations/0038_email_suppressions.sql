-- Addresses Resend reported as bounced (hard) or complained about. The
-- digest and the owner notes skip them, so a dead or unwilling address is
-- not emailed again every week. One row per address; the first reason stays.
create table if not exists email_suppressions (
  email text primary key,
  reason text not null check (reason in ('bounced', 'complained')),
  provider_event_id text,
  created_at timestamptz not null default now()
);
