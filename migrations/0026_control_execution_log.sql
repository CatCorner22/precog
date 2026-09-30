-- Server-owned control checks. The application only appends history through
-- validated commands; references point to evidence, not uploaded evidence bytes.
-- Restoring a profile/snapshot cannot rewrite this separate log. Hard deletion
-- follows the owning business; soft-deleted businesses remain inaccessible.
create table if not exists control_execution_log (
  user_id text not null,
  business_id text not null,
  id text not null,
  period text not null,
  revision integer not null,
  record jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, business_id, id),
  foreign key (user_id, business_id) references businesses(user_id, id) on delete cascade,
  check (period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  check (revision between 1 and 200),
  check (jsonb_typeof(record) = 'object'),
  check (record ?& array['id','period','revision','status','history','controlKey','sourceBusinessRevision']),
  check (jsonb_typeof(record->'id') = 'string'),
  check (jsonb_typeof(record->'period') = 'string'),
  check (jsonb_typeof(record->'revision') = 'number'),
  check (jsonb_typeof(record->'sourceBusinessRevision') = 'number'),
  check ((record->>'sourceBusinessRevision')::bigint >= 0),
  check (jsonb_typeof(record->'status') = 'string'),
  check (jsonb_typeof(record->'controlKey') = 'string'),
  check (record->>'controlKey' in ('bank_statement','cleared_checks','payroll_headcount','new_vendors')),
  check (octet_length(record::text) <= 350000),
  check (record->>'status' in ('awaiting_review','needs_correction','awaiting_retest','reviewed')),
  check (record->>'id' = id),
  check (record->>'period' = period),
  check ((record->>'revision')::integer = revision),
  check (jsonb_typeof(record->'history') = 'array'),
  check (jsonb_array_length(record->'history') = revision)
);
create index if not exists control_execution_period_idx
  on control_execution_log (user_id, business_id, period, created_at desc, id desc);
