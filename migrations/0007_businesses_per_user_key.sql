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
