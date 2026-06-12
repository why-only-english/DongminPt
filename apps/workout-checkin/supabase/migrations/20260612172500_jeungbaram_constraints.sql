DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'jeungbaram_records_participants_allowed'
  ) THEN
    ALTER TABLE jeungbaram_records
      ADD CONSTRAINT jeungbaram_records_participants_allowed
      CHECK (participants <@ ARRAY['죽는거잘해요','Messi','갑도징어','이런4가지없는너미','수돗물','21Climax','dlwltjd','외부인']::TEXT[]);
  END IF;
END $$;
