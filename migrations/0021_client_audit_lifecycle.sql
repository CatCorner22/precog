-- Enforce new writes and cascade business deletion atomically. NOT VALID
-- preserves any historical orphan rows for an explicit recovery review rather
-- than silently deleting them during an upgrade. The release check reports them.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
    WHERE conname = 'engagement_marks_business_fk' AND conrelid = 'engagement_marks'::regclass) THEN
    ALTER TABLE engagement_marks ADD CONSTRAINT engagement_marks_business_fk
      FOREIGN KEY (user_id, business_id) REFERENCES businesses(user_id, id)
      ON DELETE CASCADE NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
    WHERE conname = 'review_events_business_fk' AND conrelid = 'review_events'::regclass) THEN
    ALTER TABLE review_events ADD CONSTRAINT review_events_business_fk
      FOREIGN KEY (user_id, business_id) REFERENCES businesses(user_id, id)
      ON DELETE CASCADE NOT VALID;
  END IF;
END;
$$;
