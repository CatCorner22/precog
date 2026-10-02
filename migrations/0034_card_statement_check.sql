-- The monthly file gains a fifth check, the company card statement. 0026 left
-- the controlKey check unnamed, so Postgres named it itself; find it by its
-- definition, drop it, and add a named check that also allows
-- 'card_statement'. Records with the four earlier keys stay valid.
do $$
declare
  existing record;
begin
  for existing in
    select conname
    from pg_constraint
    where conrelid = 'control_execution_log'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) like '%controlKey%'
      and pg_get_constraintdef(oid) like '%new_vendors%'
  loop
    execute format('alter table control_execution_log drop constraint %I', existing.conname);
  end loop;
end
$$;
alter table control_execution_log add constraint control_execution_log_control_key_check
  check (record->>'controlKey' in (
    'bank_statement','cleared_checks','payroll_headcount','new_vendors','card_statement'
  ));
