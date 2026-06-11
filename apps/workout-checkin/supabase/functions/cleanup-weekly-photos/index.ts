import { preflight, jsonResponse } from '../_shared/http.ts';
import { serviceClient, BUCKET } from '../_shared/supabase.ts';

Deno.serve(async (req) => {
  const pf = preflight(req); if (pf) return pf;
  if (Deno.env.get('CRON_SECRET') && req.headers.get('X-Cron-Secret') !== Deno.env.get('CRON_SECRET')) return jsonResponse({ error: 'unauthorized' }, { status: 401 });
  const supabase = serviceClient();
  const now = new Date().toISOString();
  const { data: images, error } = await supabase.from('certification_images').select('id, storage_key').lte('expires_at', now).is('deleted_at', null).limit(500);
  if (error) throw error;
  const keys = (images ?? []).map((row) => row.storage_key);
  if (!keys.length) return jsonResponse({ deleted: 0, failed: 0 });

  const removal = await supabase.storage.from(BUCKET).remove(keys);
  if (removal.error) {
    return jsonResponse({ deleted: 0, failed: keys.length, error: 'storage_delete_failed' }, { status: 502 });
  }

  await supabase.from('certification_images').update({ deleted_at: now }).in('id', (images ?? []).map((row) => row.id));
  return jsonResponse({ deleted: keys.length, failed: 0 });
});
