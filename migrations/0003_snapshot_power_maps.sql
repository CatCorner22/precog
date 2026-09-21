alter table assessment_snapshots
  add column if not exists power_map_json jsonb;
