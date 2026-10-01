-- The daily model budget with extra scopes beside the user's own: the
-- calling address, and the shared share of accounts that have neither a
-- verified email nor a Google or X sign-in. Free accounts made in bulk then
-- cannot spend the whole global budget. Same admission rules as 0022: the
-- shared day is locked first (so callers never deadlock), then each extra
-- scope in the order given, then the user; a rejected call consumes nothing.
create or replace function precog_take_llm_daily_budget(
  p_user_id text,
  p_user_limit integer,
  p_global_limit integer,
  p_extra_scopes text[],
  p_extra_limits integer[]
) returns table (allowed boolean, user_calls integer, global_calls integer)
language plpgsql
as $$
declare
  v_scope text := 'user:' || p_user_id;
  v_day date := current_date;
  v_user integer;
  v_global integer;
  v_extra integer;
  v_full boolean := false;
  i integer;
begin
  if p_user_id is null or btrim(p_user_id) = ''
     or p_user_limit is null or p_user_limit < 1
     or p_global_limit is null or p_global_limit < 1
     or p_extra_scopes is null or p_extra_limits is null
     or coalesce(array_length(p_extra_scopes, 1), 0)
        <> coalesce(array_length(p_extra_limits, 1), 0) then
    raise exception 'Invalid daily budget arguments' using errcode = '22023';
  end if;
  for i in 1 .. coalesce(array_length(p_extra_scopes, 1), 0) loop
    if p_extra_scopes[i] is null or btrim(p_extra_scopes[i]) = ''
       or p_extra_scopes[i] = 'global' or p_extra_scopes[i] like 'user:%'
       or p_extra_limits[i] is null or p_extra_limits[i] < 1 then
      raise exception 'Invalid daily budget arguments' using errcode = '22023';
    end if;
  end loop;

  insert into llm_daily_usage (scope, day, calls)
    values ('global', v_day, 0)
    on conflict (scope, day) do nothing;
  select u.calls into v_global from llm_daily_usage u
    where u.scope = 'global' and u.day = v_day for update;

  for i in 1 .. coalesce(array_length(p_extra_scopes, 1), 0) loop
    insert into llm_daily_usage (scope, day, calls)
      values (p_extra_scopes[i], v_day, 0)
      on conflict (scope, day) do nothing;
    select u.calls into v_extra from llm_daily_usage u
      where u.scope = p_extra_scopes[i] and u.day = v_day for update;
    if v_extra >= p_extra_limits[i] then
      v_full := true;
    end if;
  end loop;

  insert into llm_daily_usage (scope, day, calls)
    values (v_scope, v_day, 0)
    on conflict (scope, day) do nothing;
  select u.calls into v_user from llm_daily_usage u
    where u.scope = v_scope and u.day = v_day for update;

  if v_full or v_user >= p_user_limit or v_global >= p_global_limit then
    return query select false, v_user, v_global;
    return;
  end if;

  update llm_daily_usage u set calls = u.calls + 1
    where u.day = v_day and u.scope in ('global', v_scope);
  update llm_daily_usage u set calls = u.calls + 1
    where u.day = v_day and u.scope = any(p_extra_scopes);
  return query select true, v_user + 1, v_global + 1;
end;
$$;
