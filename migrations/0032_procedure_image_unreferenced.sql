-- When a step picture stopped being named by any procedure of its business.
-- The grace period before the sweep deletes it counts from here, not from the
-- upload, so an undo or a history restore still finds a long-held picture
-- that was only just removed. A picture named again is cleared back to null.
-- Pictures with a value here do not count toward the business's quota.

alter table procedure_images add column if not exists unreferenced_since timestamptz;
