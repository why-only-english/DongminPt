CREATE TABLE IF NOT EXISTS jeungbaram_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  record_date DATE NOT NULL,
  wins INT NOT NULL CHECK (wins >= 0),
  losses INT NOT NULL CHECK (losses >= 0),
  participants TEXT[] NOT NULL CHECK (COALESCE(array_length(participants, 1), 0) BETWEEN 1 AND 5),
  created_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT jeungbaram_records_games_positive CHECK ((wins + losses) > 0),
  CONSTRAINT jeungbaram_records_group_date_unique UNIQUE (group_id, record_date)
);

CREATE INDEX IF NOT EXISTS jeungbaram_records_group_date_idx ON jeungbaram_records(group_id, record_date DESC);

COMMENT ON TABLE jeungbaram_records IS
'Friends-only Jeungbaram game daily aggregate records. One record per group/date; wins/losses determine total games and win rate.';
