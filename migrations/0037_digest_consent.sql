-- The weekly digest is off until the account says yes; nobody is opted in
-- by default. Rows already saved keep their value.
alter table notification_settings alter column weekly_digest set default false;
alter table notification_settings add column if not exists digest_asked_at timestamptz;
alter table notification_settings add column if not exists digest_token text;
create unique index if not exists notification_settings_digest_token_idx
  on notification_settings (digest_token) where digest_token is not null;
