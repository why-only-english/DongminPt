CREATE OR REPLACE FUNCTION upsert_jeungbaram_record(
  p_group_id UUID,
  p_record_date DATE,
  p_wins INT,
  p_losses INT,
  p_participants TEXT[],
  p_user_id UUID
)
RETURNS TABLE (
  id UUID,
  record_date DATE,
  wins INT,
  losses INT,
  participants TEXT[],
  updated_at TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO jeungbaram_records(
    group_id,
    record_date,
    wins,
    losses,
    participants,
    created_by_user_id,
    updated_by_user_id
  )
  VALUES (
    p_group_id,
    p_record_date,
    p_wins,
    p_losses,
    p_participants,
    p_user_id,
    p_user_id
  )
  ON CONFLICT ON CONSTRAINT jeungbaram_records_group_date_unique DO UPDATE SET
    wins = EXCLUDED.wins,
    losses = EXCLUDED.losses,
    participants = EXCLUDED.participants,
    updated_by_user_id = EXCLUDED.updated_by_user_id,
    updated_at = NOW()
  RETURNING
    jeungbaram_records.id,
    jeungbaram_records.record_date,
    jeungbaram_records.wins,
    jeungbaram_records.losses,
    jeungbaram_records.participants,
    jeungbaram_records.updated_at;
$$;

COMMENT ON FUNCTION upsert_jeungbaram_record(UUID, DATE, INT, INT, TEXT[], UUID) IS
'Atomic Jeungbaram daily record upsert. Preserves created_by_user_id on conflict and updates only game values plus updater metadata.';

REVOKE ALL ON FUNCTION upsert_jeungbaram_record(UUID, DATE, INT, INT, TEXT[], UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION upsert_jeungbaram_record(UUID, DATE, INT, INT, TEXT[], UUID) TO service_role;
