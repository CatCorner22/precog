-- A business's firm link (businesses.firm_user_id, added in 0015 without a
-- key) now points at a firm that exists. Without the key, a firm owner who
-- deleted their account while accepting a client's invitation left the
-- business naming a firm that was gone: the owner's card showed no firm, yet
-- every new invitation was refused with "already works with a firm".
--
-- 1. Data change: a link to a firm that no longer exists is cleared, with the
--    shared-with-a-firm mark, as a hand-back clears both (handBackGranted).
--    Such a business works with no firm today (every screen joins firms), so
--    clearing the link changes nothing anyone sees.
update businesses b set firm_user_id = null, granted_at = null
where b.firm_user_id is not null
  and not exists (select 1 from firms f where f.user_id = b.firm_user_id);

-- 2. The key. Deleting a firm's row (with its owner's account) clears the
--    link on every business that names it, including the firm's retained,
--    removed clients. The account deletion refuses while a member still holds
--    clients for another firm, removed ones included, so a member's deletion
--    never strands them; an ownership transfer inserts the new firm row
--    before it deletes the old one and re-points the businesses first.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'businesses'::regclass and conname = 'businesses_firm_user_id_fkey'
  ) then
    alter table businesses
      add constraint businesses_firm_user_id_fkey
      foreign key (firm_user_id) references firms (user_id) on delete set null
      not valid;
  end if;
end $$;

-- 3. Checked against every existing row; step 1 leaves none that fails.
alter table businesses validate constraint businesses_firm_user_id_fkey;
