ALTER TABLE jeungbaram_records
  DROP CONSTRAINT IF EXISTS jeungbaram_records_group_date_unique;

CREATE INDEX IF NOT EXISTS jeungbaram_records_group_date_created_idx
  ON jeungbaram_records(group_id, record_date DESC, created_at ASC);

COMMENT ON TABLE jeungbaram_records IS
'Friends-only Jeungbaram game session records. A group can now have multiple records per date; wins/losses determine total games and win rate.';
