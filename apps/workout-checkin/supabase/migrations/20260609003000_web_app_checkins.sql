ALTER TABLE dashboard_sessions
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS dashboard_sessions_user_idx ON dashboard_sessions(user_id) WHERE status = 'active';

CREATE OR REPLACE FUNCTION record_web_checkin(
  p_user_id UUID,
  p_exercise_date DATE,
  p_storage_key TEXT,
  p_width INT DEFAULT NULL,
  p_height INT DEFAULT NULL,
  p_mime_type TEXT DEFAULT 'image/jpeg',
  p_expires_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_attempt_id UUID;
  v_record_id UUID;
  v_image_id UUID;
  v_status certification_status;
  v_expires_at TIMESTAMPTZ := COALESCE(
    p_expires_at,
    ((week_start_kst(p_exercise_date) + 7)::timestamp AT TIME ZONE 'Asia/Seoul')
  );
BEGIN
  IF p_storage_key IS NULL OR btrim(p_storage_key) = '' THEN
    RAISE EXCEPTION 'storage_key_required';
  END IF;

  INSERT INTO certification_attempts(user_id, exercise_date, status)
  VALUES (p_user_id, p_exercise_date, 'approved')
  RETURNING id INTO v_attempt_id;

  INSERT INTO daily_workout_records(user_id, exercise_date, source_attempt_id)
  VALUES (p_user_id, p_exercise_date, v_attempt_id)
  ON CONFLICT (user_id, exercise_date) DO NOTHING
  RETURNING id INTO v_record_id;

  IF v_record_id IS NULL THEN
    v_status := 'duplicate_ignored';
    UPDATE certification_attempts SET status = v_status WHERE id = v_attempt_id;
    RETURN jsonb_build_object(
      'attempt_id', v_attempt_id,
      'status', v_status,
      'image_id', NULL,
      'stored', false,
      'message', 'same_day_already_checked_in'
    );
  END IF;

  v_status := 'approved';
  INSERT INTO certification_images(attempt_id, user_id, exercise_date, storage_key, width, height, mime_type, expires_at)
  VALUES (v_attempt_id, p_user_id, p_exercise_date, p_storage_key, p_width, p_height, COALESCE(p_mime_type, 'image/jpeg'), v_expires_at)
  RETURNING id INTO v_image_id;

  RETURN jsonb_build_object(
    'attempt_id', v_attempt_id,
    'status', v_status,
    'image_id', v_image_id,
    'stored', true,
    'message', 'approved'
  );
END;
$$;

COMMENT ON FUNCTION record_web_checkin(UUID, DATE, TEXT, INT, INT, TEXT, TIMESTAMPTZ) IS
'Atomic web photo check-in. First photo of the day creates an approved daily record and image metadata; later same-day photos create duplicate_ignored attempts only.';

REVOKE ALL ON FUNCTION record_web_checkin(UUID, DATE, TEXT, INT, INT, TEXT, TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION record_web_checkin(UUID, DATE, TEXT, INT, INT, TEXT, TIMESTAMPTZ) TO service_role;
