-- One account, one firm: an account holds at most one membership that is not
-- an owner row. The membership writes already check this under one lock
-- order (lockFirmMembershipWrite in src/lib/precog/firm/store.ts); this index
-- makes the database refuse a second membership even if a write slips past.
--
-- Nothing here changes data. If an account already holds more than one such
-- membership, the migration stops with their ids and creates nothing, so the
-- owner decides which membership each keeps before the release goes out.
do $$
declare
  duplicates text;
begin
  select string_agg(member_user_id || ' (' || firms || ')', ', ' order by member_user_id)
  into duplicates
  from (
    select member_user_id, string_agg(firm_user_id, ', ' order by firm_user_id) as firms
    from firm_members
    where role <> 'owner'
    group by member_user_id
    having count(*) > 1
  ) d;
  if duplicates is not null then
    raise exception 'firm_members holds more than one membership for these accounts (member id (firm ids)): %. Remove the extra memberships, then deploy again.', duplicates;
  end if;
end $$;

create unique index if not exists firm_members_one_firm_per_member
  on firm_members (member_user_id)
  where role <> 'owner';
