-- Additive migration. No historical migration is renamed or rewritten.
-- All functions are SECURITY INVOKER: application authentication still supplies
-- the verified account id. Row locks serialize short mutations, not network I/O.
CREATE TABLE IF NOT EXISTS business_tombstones (
  user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  business_id TEXT NOT NULL,
  deleted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, business_id)
);

CREATE TABLE IF NOT EXISTS llm_daily_rejections (
  scope TEXT NOT NULL,
  day DATE NOT NULL,
  attempts BIGINT NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  PRIMARY KEY (scope, day)
);

CREATE OR REPLACE FUNCTION precog_save_business(
  p_user TEXT, p_id TEXT, p_name TEXT, p_industry TEXT,
  p_profile JSONB, p_base BIGINT, p_limit INTEGER, p_activate BOOLEAN DEFAULT FALSE
) RETURNS JSONB LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  old_row businesses%ROWTYPE;
  saved_row businesses%ROWTYPE;
BEGIN
  IF p_limit < 1 OR (p_base IS NOT NULL AND p_base < 1) THEN
    RAISE EXCEPTION 'Invalid business revision or limit' USING ERRCODE = '22023';
  END IF;
  PERFORM id FROM "user" WHERE id = p_user FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Account no longer exists' USING ERRCODE = '23503';
  END IF;
  SELECT * INTO old_row FROM businesses WHERE user_id = p_user AND id = p_id;
  IF NOT FOUND THEN
    IF p_base IS NOT NULL OR EXISTS (
      SELECT 1 FROM business_tombstones WHERE user_id = p_user AND business_id = p_id
    ) THEN
      RETURN jsonb_build_object('ok', FALSE, 'deleted', TRUE);
    END IF;
    IF (SELECT count(*) FROM businesses WHERE user_id = p_user) >= p_limit THEN
      RETURN jsonb_build_object('ok', FALSE, 'limit', TRUE);
    END IF;
    INSERT INTO businesses (id, user_id, name, industry, profile, revision, updated_at)
    VALUES (p_id, p_user, p_name, p_industry, p_profile, 1, now())
    RETURNING * INTO saved_row;
  ELSE
    IF p_base IS NULL OR old_row.revision <> p_base THEN
      RETURN jsonb_build_object('ok', FALSE, 'conflict', TRUE, 'existing',
        jsonb_build_object('revision', old_row.revision, 'profile', old_row.profile,
          'industry', old_row.industry, 'name', old_row.name, 'updated_at', old_row.updated_at));
    END IF;
    UPDATE businesses SET name = p_name, industry = p_industry, profile = p_profile,
      revision = revision + 1, updated_at = now()
    WHERE user_id = p_user AND id = p_id RETURNING * INTO saved_row;
  END IF;
  IF p_activate THEN
    INSERT INTO business_profiles (user_id, name, industry, profile, updated_at)
    VALUES (p_user, saved_row.name, saved_row.industry,
      saved_row.profile || jsonb_build_object('businessId', p_id), saved_row.updated_at)
    ON CONFLICT (user_id) DO UPDATE SET name = excluded.name, industry = excluded.industry,
      profile = excluded.profile, updated_at = excluded.updated_at;
  END IF;
  RETURN jsonb_build_object('ok', TRUE, 'revision', saved_row.revision,
    'updatedAt', saved_row.updated_at);
END;
$$;

CREATE OR REPLACE FUNCTION precog_set_active_business(
  p_user TEXT, p_id TEXT, p_name TEXT, p_industry TEXT, p_profile JSONB
) RETURNS VOID LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  saved_row businesses%ROWTYPE;
BEGIN
  PERFORM id FROM "user" WHERE id = p_user FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Account no longer exists' USING ERRCODE = '23503';
  END IF;
  IF EXISTS (SELECT 1 FROM business_tombstones WHERE user_id = p_user AND business_id = p_id) THEN
    RAISE EXCEPTION 'Business was deleted' USING ERRCODE = 'P0002';
  END IF;
  SELECT * INTO saved_row FROM businesses WHERE user_id = p_user AND id = p_id;
  IF FOUND THEN
    p_name := saved_row.name;
    p_industry := saved_row.industry;
    p_profile := saved_row.profile;
  ELSIF EXISTS (SELECT 1 FROM businesses WHERE user_id = p_user)
     OR EXISTS (SELECT 1 FROM business_tombstones WHERE user_id = p_user) THEN
    RAISE EXCEPTION 'Business does not exist' USING ERRCODE = 'P0002';
  END IF;
  INSERT INTO business_profiles (user_id, name, industry, profile, updated_at)
  VALUES (p_user, p_name, p_industry, p_profile || jsonb_build_object('businessId', p_id), now())
  ON CONFLICT (user_id) DO UPDATE SET name = excluded.name, industry = excluded.industry,
    profile = excluded.profile, updated_at = excluded.updated_at;
END;
$$;

CREATE OR REPLACE FUNCTION precog_delete_business(p_user TEXT, p_id TEXT)
RETURNS VOID LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  PERFORM id FROM "user" WHERE id = p_user FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  IF EXISTS (SELECT 1 FROM businesses WHERE user_id = p_user AND id = p_id)
     OR EXISTS (SELECT 1 FROM business_profiles WHERE user_id = p_user
       AND coalesce(profile->>'businessId', 'biz_default') = p_id) THEN
    INSERT INTO business_tombstones (user_id, business_id) VALUES (p_user, p_id)
    ON CONFLICT (user_id, business_id) DO NOTHING;
  END IF;
  DELETE FROM business_profiles WHERE user_id = p_user
    AND coalesce(profile->>'businessId', 'biz_default') = p_id;
  DELETE FROM businesses WHERE user_id = p_user AND id = p_id;
END;
$$;

-- Count only admitted requests. All callers lock global before user, so a
-- denied user's attempts cannot spend another user's allowance. UTC day is
-- captured once, even if a request waits across midnight.
CREATE OR REPLACE FUNCTION precog_take_daily_budget(
  p_user_scope TEXT, p_user_limit INTEGER, p_global_limit INTEGER
) RETURNS JSONB LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  budget_day DATE := (now() AT TIME ZONE 'UTC')::date;
  global_count BIGINT;
  user_count BIGINT;
BEGIN
  IF p_user_scope NOT LIKE 'user:%' OR p_user_limit < 1 OR p_global_limit < 1 THEN
    RAISE EXCEPTION 'Invalid daily budget' USING ERRCODE = '22023';
  END IF;
  INSERT INTO llm_daily_usage (scope, day, calls) VALUES ('global', budget_day, 0)
  ON CONFLICT (scope, day) DO NOTHING;
  SELECT calls INTO global_count FROM llm_daily_usage
    WHERE scope = 'global' AND day = budget_day FOR UPDATE;
  INSERT INTO llm_daily_usage (scope, day, calls) VALUES (p_user_scope, budget_day, 0)
  ON CONFLICT (scope, day) DO NOTHING;
  SELECT calls INTO user_count FROM llm_daily_usage
    WHERE scope = p_user_scope AND day = budget_day FOR UPDATE;
  IF user_count >= p_user_limit OR global_count >= p_global_limit THEN
    INSERT INTO llm_daily_rejections (scope, day, attempts) VALUES (p_user_scope, budget_day, 1)
    ON CONFLICT (scope, day) DO UPDATE SET attempts = llm_daily_rejections.attempts + 1;
    RETURN jsonb_build_object('allowed', FALSE, 'userCalls', user_count, 'globalCalls', global_count);
  END IF;
  UPDATE llm_daily_usage SET calls = calls + 1
    WHERE day = budget_day AND scope IN ('global', p_user_scope);
  RETURN jsonb_build_object('allowed', TRUE, 'userCalls', user_count + 1, 'globalCalls', global_count + 1);
END;
$$;
