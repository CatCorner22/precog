-- A business id is chosen in the browser, so it is only unique per owner.
-- Keying the table on (user_id, id) means two owners whose profiles both carry
-- the legacy "biz_default" id no longer fight over one row, and a save can
-- never touch a row that belongs to someone else.

alter table businesses drop constraint if exists businesses_pkey;
alter table businesses add primary key (user_id, id);
