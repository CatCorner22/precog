-- A locked report version keeps the figures it printed, not only the profile:
-- the built report model, the scoring version that computed it and the
-- layout that printed it. Re-rendering the profile with later scoring code
-- would change the figures of a version a reviewer already signed off.
-- All three stay null on versions locked before this migration; those
-- versions recalculate and say so.

alter table report_versions
  add column if not exists scoring_version text,
  add column if not exists layout_version integer,
  add column if not exists report_model jsonb;
