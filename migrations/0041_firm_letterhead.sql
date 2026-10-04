-- The firm's letterhead, printed on its clients' reports, and a copy frozen
-- into each locked version so a later change to the firm leaves an issued
-- version as it was printed. Null on versions locked before this migration.
alter table firms add column if not exists letterhead text not null default '';
alter table firms add column if not exists logo_data_url text;
alter table firms add column if not exists cover_page boolean not null default true;
alter table report_versions add column if not exists firm_name text;
alter table report_versions add column if not exists firm_letterhead text;
alter table report_versions add column if not exists firm_logo_data_url text;
