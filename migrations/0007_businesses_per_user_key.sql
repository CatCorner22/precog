-- A business id is chosen in the browser, so it is only unique per owner.
-- Keying the table on (user_id, id) means two owners whose profiles both carry
-- the legacy "biz_default" id no longer fight over one row, and a save can
-- never touch a row that belongs to someone else.

alter table businesses drop constraint if exists businesses_pkey;
alter table businesses add primary key (user_id, id);
-- A business belongs to one user, and its id is generated on the client — so
-- the same id can legitimately exist for two different users. Under the old
-- `id text primary key`, the first user to save a given id (in practice the
-- legacy sentinel 'biz_default') owned it globally and every other user's save
-- hit the `where businesses.user_id = …` guard, matched nothing, and failed.
--
-- Key the table by (user_id, id) instead. No duplicates can exist yet, because
-- the old key already forced id to be unique, so this is safe on live data.
alter table businesses drop constraint if exists businesses_pkey;
alter table businesses add constraint businesses_pkey primary key (user_id, id);
