alter table assessment_snapshots
  add column if not exists value_case_json jsonb,
  add column if not exists value_evidence_json jsonb;
