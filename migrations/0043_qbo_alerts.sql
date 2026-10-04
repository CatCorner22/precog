-- When a QuickBooks reading last failed, and whether the firm has been told:
-- one alert per failure episode (cleared by the next successful reading) and
-- one per approaching expiry of Intuit's permission (re-armed when a refresh
-- moves the expiry).
alter table integration_connections add column if not exists last_error_at timestamptz;
alter table integration_connections add column if not exists failure_alerted_at timestamptz;
alter table integration_connections add column if not exists expiry_alerted_for timestamptz;
