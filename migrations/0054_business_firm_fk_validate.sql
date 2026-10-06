-- Checks every existing business against the firm key that migration 0052
-- added NOT VALID (businesses.firm_user_id -> firms.user_id). A separate
-- file, so it runs in its own transaction after 0052 has committed: VALIDATE
-- takes a SHARE UPDATE EXCLUSIVE lock, so client saves and firm writes go on
-- while it reads the table. 0052 cleared every link to a firm that no longer
-- exists, so none fails. Nothing here changes data.
alter table businesses validate constraint businesses_firm_user_id_fkey;
