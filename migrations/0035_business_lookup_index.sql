-- Finding the owner of a business by its id (resolveBusinessOwner, on every
-- save, open and picture request) filters on id alone, which the
-- (user_id, id) primary key cannot serve. Ids are generated per business and
-- are nearly unique, so this index turns that lookup into one or two rows.

create index if not exists businesses_id_idx on businesses (id);
