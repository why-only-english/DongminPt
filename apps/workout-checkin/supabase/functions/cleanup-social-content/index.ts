import { preflight, jsonResponse } from '../_shared/http.ts';
import { serviceClient } from '../_shared/supabase.ts';

Deno.serve(async (req) => {
  const pf = preflight(req); if (pf) return pf;
  if (Deno.env.get('CRON_SECRET') && req.headers.get('X-Cron-Secret') !== Deno.env.get('CRON_SECRET')) return jsonResponse({ error: 'unauthorized' }, { status: 401 });
  const supabase = serviceClient();
  const now = new Date().toISOString();
  const { data: comments } = await supabase.from('photo_comments').update({ deleted_at: now }).lte('expires_at', now).is('deleted_at', null).select('id');
  const { data: reactions } = await supabase.from('photo_reactions').delete().lte('expires_at', now).select('id');
  const { data: sessions } = await supabase.from('dashboard_sessions').update({ status: 'revoked' }).lte('expires_at', now).eq('status', 'active').select('id');
  return jsonResponse({ comments: comments?.length ?? 0, reactions: reactions?.length ?? 0, sessions: sessions?.length ?? 0 });
});
