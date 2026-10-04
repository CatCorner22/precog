-- A share link can name a locked report version instead of carrying a map
-- payload; the page prints that version's stored figures, read-only. Null on
-- every link made before this column existed and on map links.
alter table map_shares add column if not exists report_version_id text
  references report_versions (id) on delete cascade;
create index if not exists map_shares_report_version_idx
  on map_shares (report_version_id) where report_version_id is not null;
