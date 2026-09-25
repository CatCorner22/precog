-- Passcode guesses on a shared map are counted on the share row itself, so a
-- guess reserves its place with one conditional UPDATE before the passcode is
-- checked. The count-then-insert on map_share_attempts let concurrent guesses
-- all read the same count before any of them recorded a failure. Postgres
-- re-checks an UPDATE's WHERE clause against the row version it has locked, so
-- no more than the limit of guesses can pass in one window, however many
-- arrive at once. map_share_attempts stays as a log of failed guesses.
alter table map_shares add column if not exists passcode_attempts integer not null default 0;
alter table map_shares add column if not exists passcode_window_started_at timestamptz;
