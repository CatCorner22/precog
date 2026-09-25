-- Admission, not attempts: rejected calls must not consume another user's
-- allowance. One function call is one transaction on a single connection.
-- Lock the shared day first, then the user, consistently across all callers.
create or replace function precog_take_llm_daily_budget(
  p_user_id text,
  p_user_limit integer,
  p_global_limit integer
) returns table (allowed boolean, user_calls integer, global_calls integer)
language plpgsql
as $$
declare
  v_scope text := 'user:' || p_user_id;
  v_day date := current_date;
  v_user integer;
  v_global integer;
begin
  if p_user_id is null or btrim(p_user_id) = ''
     or p_user_limit is null or p_user_limit < 1
     or p_global_limit is null or p_global_limit < 1 then
    raise exception 'Invalid daily budget arguments' using errcode = '22023';
  end if;

  insert into llm_daily_usage (scope, day, calls)
    values ('global', v_day, 0)
    on conflict (scope, day) do nothing;
  select u.calls into v_global from llm_daily_usage u
    where u.scope = 'global' and u.day = v_day for update;

  insert into llm_daily_usage (scope, day, calls)
    values (v_scope, v_day, 0)
    on conflict (scope, day) do nothing;
  select u.calls into v_user from llm_daily_usage u
    where u.scope = v_scope and u.day = v_day for update;

  if v_user >= p_user_limit or v_global >= p_global_limit then
    return query select false, v_user, v_global;
    return;
  end if;

  update llm_daily_usage u set calls = u.calls + 1
    where u.day = v_day and u.scope in ('global', v_scope);
  return query select true, v_user + 1, v_global + 1;
end;
$$;
