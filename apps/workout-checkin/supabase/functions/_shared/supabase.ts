import { createClient } from '@supabase/supabase-js';
import { requiredEnv, optionalEnv } from './env.ts';

export const BUCKET = optionalEnv('STORAGE_BUCKET', optionalEnv('SUPABASE_STORAGE_BUCKET', 'workout-cert-images'));

export function serviceClient() {
  return createClient(requiredEnv('SUPABASE_URL'), requiredEnv('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
