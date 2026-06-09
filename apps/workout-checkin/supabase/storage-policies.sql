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
