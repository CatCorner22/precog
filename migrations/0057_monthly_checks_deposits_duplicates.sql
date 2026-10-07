-- The monthly file gains two checks from November 2026: matching each deposit
-- to what was taken in that day, and looking for an invoice paid twice. As in
-- 0034, find the controlKey check by its definition (0034 named it
-- control_execution_log_control_key_check), drop it, and add the same named
-- check with all seven keys. Records with the five earlier keys stay valid.
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
    'bank_statement','cleared_checks','payroll_headcount','new_vendors','card_statement',
    'deposits_match','duplicate_payments'
  ));
