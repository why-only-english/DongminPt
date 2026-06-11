CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$ BEGIN
  CREATE TYPE certification_status AS ENUM ('approved', 'duplicate_ignored');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE dashboard_session_status AS ENUM ('active', 'revoked');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  dashboard_slug TEXT NOT NULL UNIQUE,
  weekly_required_days INT NOT NULL DEFAULT 3 CHECK (weekly_required_days BETWEEN 1 AND 7),
  penalty_amount_krw INT NOT NULL DEFAULT 30000 CHECK (penalty_amount_krw >= 0),
  access_code_hash TEXT,
  access_code_rotated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE groups ADD COLUMN IF NOT EXISTS access_code_hash TEXT;
ALTER TABLE groups ADD COLUMN IF NOT EXISTS access_code_rotated_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kakao_user_key_hash TEXT NOT NULL UNIQUE,
  nickname TEXT NOT NULL UNIQUE,
  consented_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS group_members (
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member', 'admin')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(group_id, user_id)
);

CREATE TABLE IF NOT EXISTS certification_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  exercise_date DATE NOT NULL,
  status certification_status NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS daily_workout_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  exercise_date DATE NOT NULL,
  source_attempt_id UUID REFERENCES certification_attempts(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, exercise_date)
);

CREATE TABLE IF NOT EXISTS certification_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id UUID NOT NULL REFERENCES certification_attempts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  exercise_date DATE NOT NULL,
  storage_key TEXT NOT NULL UNIQUE,
  width INT,
  height INT,
  mime_type TEXT NOT NULL DEFAULT 'image/jpeg',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS dashboard_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  nickname TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  status dashboard_session_status NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS photo_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  image_id UUID NOT NULL REFERENCES certification_images(id) ON DELETE CASCADE,
  author TEXT NOT NULL CHECK (char_length(author) BETWEEN 1 AND 30),
  text TEXT NOT NULL CHECK (char_length(text) BETWEEN 1 AND 300),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '90 days'),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS photo_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  image_id UUID NOT NULL REFERENCES certification_images(id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES dashboard_sessions(id) ON DELETE CASCADE,
  reaction TEXT NOT NULL CHECK (reaction IN ('👍', '🔥', '😂', '🚨')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '90 days'),
  UNIQUE(image_id, session_id, reaction)
);

CREATE INDEX IF NOT EXISTS certification_attempts_user_date_idx ON certification_attempts(user_id, exercise_date, created_at DESC);
CREATE INDEX IF NOT EXISTS daily_workout_records_date_idx ON daily_workout_records(exercise_date);
CREATE INDEX IF NOT EXISTS certification_images_week_idx ON certification_images(exercise_date, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS certification_images_expiry_idx ON certification_images(expires_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS dashboard_sessions_token_idx ON dashboard_sessions(token_hash) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS dashboard_sessions_expiry_idx ON dashboard_sessions(expires_at) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS photo_comments_image_idx ON photo_comments(image_id, created_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS photo_comments_expiry_idx ON photo_comments(expires_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS photo_reactions_image_idx ON photo_reactions(image_id, reaction);
CREATE INDEX IF NOT EXISTS photo_reactions_expiry_idx ON photo_reactions(expires_at);

CREATE OR REPLACE FUNCTION record_kakao_checkin(
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

COMMENT ON FUNCTION record_kakao_checkin(UUID, DATE, TEXT, INT, INT, TEXT, TIMESTAMPTZ) IS
'Atomic Kakao photo check-in. First valid photo of the day creates an approved daily record and image metadata; later same-day photos create duplicate_ignored attempts only.';

CREATE OR REPLACE FUNCTION week_start_kst(p_date DATE DEFAULT CURRENT_DATE)
RETURNS DATE
LANGUAGE SQL
IMMUTABLE
AS $$
  SELECT (p_date - (((EXTRACT(DOW FROM p_date)::INT + 6) % 7) * INTERVAL '1 day'))::DATE;
$$;

REVOKE ALL ON FUNCTION record_kakao_checkin(UUID, DATE, TEXT, INT, INT, TEXT, TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION record_kakao_checkin(UUID, DATE, TEXT, INT, INT, TEXT, TIMESTAMPTZ) TO service_role;

-- Supabase Storage setup for weekly workout photos.
-- Run in the Supabase SQL editor after `supabase/schema.sql`.
-- Bucket is private: no anon/select policy is created. Edge Functions use the service-role key
-- to upload/delete objects and issue 24-hour signed URLs only after dashboard auth.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'workout-cert-images',
  'workout-cert-images',
  false,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Deliberately no public read policy.
-- If you enable RLS policies on storage.objects, keep object access service-role-only.
