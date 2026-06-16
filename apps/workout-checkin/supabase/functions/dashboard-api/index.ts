import { preflight, jsonResponse, bearerToken } from '../_shared/http.ts';
import { serviceClient, BUCKET } from '../_shared/supabase.ts';
import { accessCodeHash, createSessionToken, hashSessionToken } from '../_shared/auth.ts';
import { sha256Hex } from '../_shared/crypto.ts';
import { PHOTO_SIGNED_URL_TTL_SECONDS, requiredEnv } from '../_shared/env.ts';
import webpush from 'npm:web-push@3.6.7';
import { addDays, mondayCleanupExpiresAt, monthDates, monthEndDate, todayKst, weekStartKst } from '../_shared/dates.ts';

type MemberSummary = {
  nickname: string;
  approved_days: number;
  remaining_required: number;
  status: 'safe' | 'normal' | 'emergency' | 'penalty_due';
  status_label: string;
  expected_penalty: number;
};

type ServiceClient = ReturnType<typeof serviceClient>;

type PushSubscriptionPayload = {
  endpoint?: string;
  keys?: { p256dh?: string; auth?: string };
};


const JEUNGBARAM_PARTICIPANTS = [
  '죽는거잘해요',
  'Messi',
  '갑도징어',
  '이런4가지없는너미',
  '수돗물',
  '21Climax',
  'dlwltjd',
  '외부인',
] as const;

function isDateString(value: string): boolean {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
}

function isMonthString(value: string): boolean {
  const match = value.match(/^(\d{4})-(\d{2})$/);
  if (!match) return false;
  const month = Number(match[2]);
  return month >= 1 && month <= 12;
}

function jeungbaramRecord(row: any) {
  const wins = Number(row.wins ?? 0);
  const losses = Number(row.losses ?? 0);
  const totalGames = wins + losses;
  return {
    id: row.id,
    date: row.record_date,
    wins,
    losses,
    total_games: totalGames,
    win_rate: totalGames ? Math.round((wins / totalGames) * 1000) / 10 : 0,
    participants: Array.isArray(row.participants) ? row.participants : [],
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function validateJeungbaramBody(body: any) {
  const wins = Number(body?.wins);
  const losses = Number(body?.losses);
  const participants = Array.isArray(body?.participants)
    ? body.participants.map((item: unknown) => String(item).trim()).filter(Boolean)
    : [];
  const allowed = new Set<string>(JEUNGBARAM_PARTICIPANTS);
  const uniqueParticipants = [...new Set(participants)];

  if (!Number.isInteger(wins) || !Number.isInteger(losses) || wins < 0 || losses < 0) {
    throw new Response('invalid_wins_losses', { status: 400 });
  }
  if (wins + losses <= 0) throw new Response('games_required', { status: 400 });
  if (uniqueParticipants.length < 1 || uniqueParticipants.length > 5) {
    throw new Response('participants_must_be_1_to_5', { status: 400 });
  }
  if (uniqueParticipants.some((participant) => !allowed.has(participant))) {
    throw new Response('invalid_participant', { status: 400 });
  }

  return { wins, losses, participants: uniqueParticipants };
}

function kstDayStartIso(dateString: string): string {
  return new Date(Date.parse(`${dateString}T00:00:00+09:00`)).toISOString();
}

function daysLeftInWeekKst(weekStart: string): number {
  const today = todayKst();
  return Math.max(0, 7 - Math.floor((Date.parse(`${today}T00:00:00+09:00`) - Date.parse(`${weekStart}T00:00:00+09:00`)) / 86400000));
}

function configureWebPush() {
  webpush.setVapidDetails(
    Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@workout-checkin-pt.vercel.app',
    requiredEnv('VAPID_PUBLIC_KEY'),
    requiredEnv('VAPID_PRIVATE_KEY'),
  );
}

function pathAfterFunction(req: Request): string {
  const url = new URL(req.url);
  return url.pathname.replace(/^.*\/dashboard-api\/?/, '/');
}

async function requireSession(req: Request, slug: string) {
  const token = bearerToken(req);
  if (!token) throw new Response('missing bearer token', { status: 401 });
  const supabase = serviceClient();
  const tokenHash = await hashSessionToken(token);
  const { data: session } = await supabase
    .from('dashboard_sessions')
    .select('id, nickname, user_id, group:groups!inner(id, dashboard_slug, weekly_required_days, penalty_amount_krw)')
    .eq('token_hash', tokenHash)
    .eq('status', 'active')
    .gt('expires_at', new Date().toISOString())
    .single();
  const group = Array.isArray(session?.group) ? session?.group[0] : session?.group;
  if (!session || !group || group.dashboard_slug !== slug) throw new Response('invalid session', { status: 401 });
  await supabase.from('dashboard_sessions').update({ last_seen_at: new Date().toISOString() }).eq('id', session.id);
  return { supabase, session, group };
}

async function groupMemberUsers(supabase: ServiceClient, groupId: string): Promise<Array<{ id: string; nickname: string }>> {
  const { data } = await supabase
    .from('group_members')
    .select('users!inner(id, nickname)')
    .eq('group_id', groupId)
    .order('joined_at', { ascending: true });
  return (data ?? []).map((m: any) => Array.isArray(m.users) ? m.users[0] : m.users).filter(Boolean);
}

async function requireImageInGroup(supabase: ServiceClient, imageId: string, memberIds: string[]) {
  if (!memberIds.length) throw new Response('image not found', { status: 404 });
  const { data: image } = await supabase
    .from('certification_images')
    .select('id, user_id')
    .eq('id', imageId)
    .in('user_id', memberIds)
    .is('deleted_at', null)
    .single();
  if (!image) throw new Response('image not found', { status: 404 });
  return image;
}

function sanitizeNickname(value: unknown): string {
  return String(value ?? '').trim().slice(0, 30);
}

function extensionFromMime(mimeType: string): string {
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/webp') return 'webp';
  if (mimeType === 'image/heic') return 'heic';
  if (mimeType === 'image/heif') return 'heif';
  return 'jpg';
}

async function ensureWebMember(supabase: ServiceClient, group: any, nicknameInput: unknown) {
  const nickname = sanitizeNickname(nicknameInput);
  if (!nickname) throw new Response('nickname_required', { status: 400 });

  const { data: existing } = await supabase.from('users').select('id, nickname').eq('nickname', nickname).maybeSingle();
  if (existing) {
    await supabase.from('group_members').upsert({ group_id: group.id, user_id: existing.id }, { onConflict: 'group_id,user_id' });
    return existing;
  }

  const userKeyHash = await sha256Hex(`web:${group.dashboard_slug}:${nickname.toLocaleLowerCase('ko-KR')}`);
  const { data: user, error } = await supabase
    .from('users')
    .upsert({ kakao_user_key_hash: userKeyHash, nickname, consented_at: new Date().toISOString() }, { onConflict: 'kakao_user_key_hash' })
    .select('id, nickname')
    .single();
  if (error) throw error;
  await supabase.from('group_members').upsert({ group_id: group.id, user_id: user.id }, { onConflict: 'group_id,user_id' });
  return user;
}

async function userForSession(supabase: ServiceClient, group: any, session: any) {
  if (session.user_id) {
    const { data: user } = await supabase.from('users').select('id, nickname').eq('id', session.user_id).single();
    if (user) return user;
  }
  return ensureWebMember(supabase, group, session.nickname);
}

function statusFor(approvedDays: number, requiredDays: number, weekStart: string, penalty: number): Omit<MemberSummary, 'nickname' | 'approved_days'> {
  const today = todayKst();
  const daysLeftIncludingToday = Math.max(0, 7 - Math.floor((Date.parse(`${today}T00:00:00+09:00`) - Date.parse(`${weekStart}T00:00:00+09:00`)) / 86400000));
  const remaining = Math.max(0, requiredDays - approvedDays);
  if (remaining === 0) return { remaining_required: 0, status: 'safe', status_label: '완료 ✅', expected_penalty: 0 };
  if (remaining > daysLeftIncludingToday) return { remaining_required: remaining, status: 'penalty_due', status_label: '벌금 확정', expected_penalty: penalty };
  if (remaining === daysLeftIncludingToday) return { remaining_required: remaining, status: 'emergency', status_label: '비상!! 🚨', expected_penalty: penalty };
  return { remaining_required: remaining, status: 'normal', status_label: '진행중', expected_penalty: 0 };
}

async function signedPhoto(supabase: ServiceClient, row: any) {
  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(row.storage_key, PHOTO_SIGNED_URL_TTL_SECONDS);
  const { data: reactions } = await supabase.from('photo_reactions').select('reaction').eq('image_id', row.id).gte('expires_at', new Date().toISOString());
  const reactionCounts = { '👍': 0, '🔥': 0, '😂': 0, '🚨': 0 } as Record<string, number>;
  for (const reaction of reactions ?? []) reactionCounts[reaction.reaction] = (reactionCounts[reaction.reaction] ?? 0) + 1;
  const { count: commentCount } = await supabase.from('photo_comments').select('*', { head: true, count: 'exact' }).eq('image_id', row.id).is('deleted_at', null);
  return {
    image_id: row.id,
    nickname: row.users?.nickname ?? row.nickname ?? '친구',
    image_url: data?.signedUrl,
    image_url_expires_at: new Date(Date.now() + PHOTO_SIGNED_URL_TTL_SECONDS * 1000).toISOString(),
    status: 'approved',
    exercise_date: row.exercise_date,
    comment_count: commentCount ?? 0,
    reaction_counts: reactionCounts,
  };
}

async function dashboardSummary(supabase: ServiceClient, group: any) {
  const start = weekStartKst();
  const end = addDays(start, 7);
  const userRows = await groupMemberUsers(supabase, group.id);
  const memberIds = userRows.map((user) => user.id);
  const recordsQuery = supabase
    .from('daily_workout_records')
    .select('user_id, exercise_date')
    .gte('exercise_date', start)
    .lt('exercise_date', end);
  const { data: records } = memberIds.length ? await recordsQuery.in('user_id', memberIds) : { data: [] };
  const counts = new Map<string, number>();
  for (const r of records ?? []) counts.set(r.user_id, (counts.get(r.user_id) ?? 0) + 1);
  const membersSummary = userRows.map((user: any) => ({
    nickname: user.nickname,
    approved_days: counts.get(user.id) ?? 0,
    ...statusFor(counts.get(user.id) ?? 0, group.weekly_required_days, start, group.penalty_amount_krw),
  })).sort((a: MemberSummary, b: MemberSummary) => b.approved_days - a.approved_days || a.nickname.localeCompare(b.nickname, 'ko'));
  return { week_start: start, week_end: end, required_days: group.weekly_required_days, penalty_amount_krw: group.penalty_amount_krw, members: membersSummary };
}


async function jeungbaramMonthly(supabase: ServiceClient, groupId: string, monthParam: string | null) {
  if (monthParam !== null && !isMonthString(monthParam)) throw new Response('invalid_month', { status: 400 });
  const month = monthParam ?? todayKst().slice(0, 7);
  const start = `${month}-01`;
  const endDate = monthEndDate(start);
  const { data } = await supabase
    .from('jeungbaram_records')
    .select('id, record_date, wins, losses, participants, created_at, updated_at')
    .eq('group_id', groupId)
    .gte('record_date', start)
    .lt('record_date', endDate)
    .order('record_date', { ascending: true })
    .order('created_at', { ascending: true });
  const records = new Map<string, any[]>();
  for (const row of data ?? []) {
    const date = (row as any).record_date;
    const dayRecords = records.get(date) ?? [];
    dayRecords.push(jeungbaramRecord(row));
    records.set(date, dayRecords);
  }
  return {
    month,
    days: monthDates(start).map((date) => {
      const dayRecords = records.get(date) ?? [];
      return { date, records: dayRecords, record: dayRecords[0] ?? null };
    }),
  };
}

async function jeungbaramStats(supabase: ServiceClient, groupId: string) {
  const { data } = await supabase
    .from('jeungbaram_records')
    .select('wins, losses')
    .eq('group_id', groupId);
  const wins = (data ?? []).reduce((sum, row: any) => sum + Number(row.wins ?? 0), 0);
  const losses = (data ?? []).reduce((sum, row: any) => sum + Number(row.losses ?? 0), 0);
  const totalGames = wins + losses;
  return {
    wins,
    losses,
    total_games: totalGames,
    win_rate: totalGames ? Math.round((wins / totalGames) * 1000) / 10 : 0,
  };
}

async function jeungbaramPlayerRanking(supabase: ServiceClient, groupId: string) {
  const { data } = await supabase
    .from('jeungbaram_records')
    .select('wins, losses, participants')
    .eq('group_id', groupId);
  const ranking = new Map<string, { nickname: string; total_games: number; session_count: number }>();
  for (const participant of JEUNGBARAM_PARTICIPANTS) {
    ranking.set(participant, { nickname: participant, total_games: 0, session_count: 0 });
  }
  for (const row of data ?? []) {
    const totalGames = Number((row as any).wins ?? 0) + Number((row as any).losses ?? 0);
    const participants = Array.isArray((row as any).participants) ? [...new Set((row as any).participants.map((item: unknown) => String(item)))] : [];
    for (const participant of participants) {
      const current = ranking.get(participant) ?? { nickname: participant, total_games: 0, session_count: 0 };
      current.total_games += totalGames;
      current.session_count += 1;
      ranking.set(participant, current);
    }
  }
  return {
    players: [...ranking.values()]
      .sort((a, b) => b.total_games - a.total_games || b.session_count - a.session_count || a.nickname.localeCompare(b.nickname, 'ko'))
      .map((player, index) => ({ rank: index + 1, ...player })),
  };
}

Deno.serve(async (req) => {
  const pf = preflight(req); if (pf) return pf;
  const path = pathAfterFunction(req);
  const supabase = serviceClient();

  try {
    if (req.method === 'POST' && path === '/login') {
      const { slug, accessCode, nickname } = await req.json();
      if (!slug || !accessCode || !nickname) return jsonResponse({ error: 'slug_access_code_nickname_required' }, { status: 400 });
      const { data: group } = await supabase.from('groups').select('*').eq('dashboard_slug', slug).single();
      if (!group) return jsonResponse({ error: 'group_not_found' }, { status: 404 });
      if (!group.access_code_hash) return jsonResponse({ error: 'access_code_not_configured' }, { status: 503 });
      const candidateHash = await accessCodeHash(slug, accessCode);
      if (group.access_code_hash !== candidateHash) return jsonResponse({ error: 'invalid_access_code' }, { status: 401 });
      const user = await ensureWebMember(supabase, group, nickname);
      const { token, tokenHash, expiresAt } = await createSessionToken();
      const { error } = await supabase.from('dashboard_sessions').insert({ group_id: group.id, user_id: user.id, nickname: user.nickname, token_hash: tokenHash, expires_at: expiresAt });
      if (error) throw error;
      return jsonResponse({ token, expires_at: expiresAt, nickname: user.nickname });
    }

    const groupMatch = path.match(/^\/groups\/([^/]+)\/(summary|today-photos|weekly-photos|monthly-attendance)$/);
    if (req.method === 'GET' && groupMatch) {
      const slug = decodeURIComponent(groupMatch[1]);
      const endpoint = groupMatch[2];
      const { supabase: client, group } = await requireSession(req, slug);
      const memberIds = (await groupMemberUsers(client, group.id)).map((user) => user.id);
      if (endpoint === 'summary') return jsonResponse(await dashboardSummary(client, group));

      const start = endpoint === 'monthly-attendance'
        ? `${new URL(req.url).searchParams.get('month') ?? todayKst().slice(0, 7)}-01`
        : weekStartKst();
      const end = endpoint === 'today-photos' ? addDays(todayKst(), 1) : endpoint === 'weekly-photos' ? addDays(start, 7) : addDays(start, 32);
      const lowerBound = endpoint === 'today-photos' ? todayKst() : start;

      if (endpoint === 'monthly-attendance') {
        const month = start.slice(0, 7);
        const endDate = monthEndDate(start);
        const recordsQuery = client.from('daily_workout_records').select('exercise_date, users!inner(nickname)').gte('exercise_date', start).lt('exercise_date', endDate);
        const { data } = memberIds.length ? await recordsQuery.in('user_id', memberIds) : { data: [] };
        const days: Record<string, string[]> = {};
        for (const date of monthDates(start)) days[date] = [];
        for (const row of data ?? []) {
          const u = Array.isArray((row as any).users) ? (row as any).users[0] : (row as any).users;
          days[(row as any).exercise_date]?.push(u.nickname);
        }
        return jsonResponse({ month, days: Object.entries(days).map(([date, members]) => ({ date, members })) });
      }

      const imageQuery = client.from('certification_images').select('id, storage_key, exercise_date, user_id, users!inner(nickname)').gte('exercise_date', lowerBound).lt('exercise_date', end).is('deleted_at', null).order('created_at', { ascending: false });
      const { data: rows } = memberIds.length ? await imageQuery.in('user_id', memberIds) : { data: [] };
      if (endpoint === 'today-photos') return jsonResponse({ photos: await Promise.all((rows ?? []).map((row) => signedPhoto(client, row))) });
      const days = Array.from({ length: 7 }, (_, i) => ({ date: addDays(start, i), photos: [] as unknown[] }));
      for (const row of rows ?? []) days.find((day) => day.date === row.exercise_date)?.photos.push(await signedPhoto(client, row));
      return jsonResponse({ days });
    }

    const jeungbaramCollectionMatch = path.match(/^\/groups\/([^/]+)\/jeungbaram\/(monthly|stats|participants|player-ranking)$/);
    if (req.method === 'GET' && jeungbaramCollectionMatch) {
      const slug = decodeURIComponent(jeungbaramCollectionMatch[1]);
      const endpoint = jeungbaramCollectionMatch[2];
      const { supabase: client, group } = await requireSession(req, slug);
      if (endpoint === 'monthly') return jsonResponse(await jeungbaramMonthly(client, group.id, new URL(req.url).searchParams.get('month')));
      if (endpoint === 'participants') return jsonResponse({ participants: JEUNGBARAM_PARTICIPANTS });
      if (endpoint === 'player-ranking') return jsonResponse(await jeungbaramPlayerRanking(client, group.id));
      return jsonResponse(await jeungbaramStats(client, group.id));
    }

    const jeungbaramRecordItemMatch = path.match(/^\/groups\/([^/]+)\/jeungbaram\/records\/(\d{4}-\d{2}-\d{2})\/([0-9a-fA-F-]{36})$/);
    if (jeungbaramRecordItemMatch && (req.method === 'PUT' || req.method === 'DELETE')) {
      const slug = decodeURIComponent(jeungbaramRecordItemMatch[1]);
      const recordDate = jeungbaramRecordItemMatch[2];
      const recordId = jeungbaramRecordItemMatch[3];
      if (!isDateString(recordDate)) return jsonResponse({ error: 'invalid_date' }, { status: 400 });
      const { supabase: client, session, group } = await requireSession(req, slug);
      const user = await userForSession(client, group, session);

      if (req.method === 'DELETE') {
        const { error } = await client
          .from('jeungbaram_records')
          .delete()
          .eq('group_id', group.id)
          .eq('record_date', recordDate)
          .eq('id', recordId);
        if (error) throw error;
        return jsonResponse({ ok: true, deleted: true, id: recordId, date: recordDate });
      }

      const payload = validateJeungbaramBody(await req.json());
      const { data, error } = await client
        .from('jeungbaram_records')
        .update({
          wins: payload.wins,
          losses: payload.losses,
          participants: payload.participants,
          updated_by_user_id: user.id,
          updated_at: new Date().toISOString(),
        })
        .eq('group_id', group.id)
        .eq('record_date', recordDate)
        .eq('id', recordId)
        .select('id, record_date, wins, losses, participants, created_at, updated_at')
        .single();
      if (error) throw error;
      return jsonResponse({ record: jeungbaramRecord(data) });
    }

    const jeungbaramRecordMatch = path.match(/^\/groups\/([^/]+)\/jeungbaram\/records\/(\d{4}-\d{2}-\d{2})$/);
    if (jeungbaramRecordMatch && (req.method === 'POST' || req.method === 'PUT')) {
      const slug = decodeURIComponent(jeungbaramRecordMatch[1]);
      const recordDate = jeungbaramRecordMatch[2];
      if (!isDateString(recordDate)) return jsonResponse({ error: 'invalid_date' }, { status: 400 });
      const { supabase: client, session, group } = await requireSession(req, slug);
      const user = await userForSession(client, group, session);

      const payload = validateJeungbaramBody(await req.json());
      const { data, error } = await client
        .from('jeungbaram_records')
        .insert({
          group_id: group.id,
          record_date: recordDate,
          wins: payload.wins,
          losses: payload.losses,
          participants: payload.participants,
          created_by_user_id: user.id,
          updated_by_user_id: user.id,
        })
        .select('id, record_date, wins, losses, participants, created_at, updated_at')
        .single();
      if (error) throw error;
      return jsonResponse({ record: jeungbaramRecord(data) });
    }

    const notificationMatch = path.match(/^\/groups\/([^/]+)\/notifications\/(subscribe|unsubscribe)$/);
    if (req.method === 'POST' && notificationMatch) {
      const slug = decodeURIComponent(notificationMatch[1]);
      const action = notificationMatch[2];
      const { supabase: client, session, group } = await requireSession(req, slug);
      const user = await userForSession(client, group, session);
      const body = await req.json();
      const subscription = body.subscription as PushSubscriptionPayload | undefined;
      const endpoint = subscription?.endpoint;
      if (!endpoint) return jsonResponse({ error: 'subscription_endpoint_required' }, { status: 400 });

      if (action === 'unsubscribe') {
        await client
          .from('notification_subscriptions')
          .update({ status: 'revoked', revoked_at: new Date().toISOString(), last_seen_at: new Date().toISOString() })
          .eq('endpoint', endpoint);
        return jsonResponse({ ok: true, status: 'revoked' });
      }

      const p256dh = subscription?.keys?.p256dh;
      const auth = subscription?.keys?.auth;
      if (!p256dh || !auth) return jsonResponse({ error: 'subscription_keys_required' }, { status: 400 });
      const { error } = await client.from('notification_subscriptions').upsert({
        group_id: group.id,
        user_id: user.id,
        endpoint,
        p256dh,
        auth,
        user_agent: req.headers.get('User-Agent'),
        platform: String(body.platform ?? '').slice(0, 60),
        status: 'active',
        revoked_at: null,
        last_seen_at: new Date().toISOString(),
      }, { onConflict: 'endpoint' });
      if (error) throw error;
      return jsonResponse({ ok: true, status: 'active' });
    }

    const uploadMatch = path.match(/^\/groups\/([^/]+)\/checkins$/);
    if (req.method === 'POST' && uploadMatch) {
      const slug = decodeURIComponent(uploadMatch[1]);
      const { supabase: client, session, group } = await requireSession(req, slug);
      const contentType = req.headers.get('Content-Type') ?? '';
      if (!contentType.includes('multipart/form-data')) return jsonResponse({ error: 'multipart_form_required' }, { status: 400 });
      const form = await req.formData();
      const file = form.get('photo');
      if (!(file instanceof File)) return jsonResponse({ error: 'photo_required' }, { status: 400 });
      if (!file.type.startsWith('image/')) return jsonResponse({ error: 'image_file_required' }, { status: 400 });
      if (file.size > 10 * 1024 * 1024) return jsonResponse({ error: 'image_too_large' }, { status: 413 });

      const user = await userForSession(client, group, session);
      const exerciseDate = todayKst();
      const bytes = new Uint8Array(await file.arrayBuffer());
      const extension = extensionFromMime(file.type);
      const storageKey = `weekly/${weekStartKst(exerciseDate)}/${user.id}/${crypto.randomUUID()}.${extension}`;
      let uploaded = false;
      let persisted = false;

      try {
        const upload = await client.storage.from(BUCKET).upload(storageKey, bytes, { contentType: file.type || 'image/jpeg', upsert: false });
        if (upload.error) throw upload.error;
        uploaded = true;
        const { data: result, error } = await client.rpc('record_web_checkin', {
          p_user_id: user.id,
          p_exercise_date: exerciseDate,
          p_storage_key: storageKey,
          p_width: null,
          p_height: null,
          p_mime_type: file.type || 'image/jpeg',
          p_expires_at: mondayCleanupExpiresAt(exerciseDate),
        });
        if (error) throw error;
        if (result?.status === 'duplicate_ignored') {
          await client.storage.from(BUCKET).remove([storageKey]);
          return jsonResponse({ status: 'duplicate_ignored', message: '오늘은 이미 출석 완료야. 하루 1회만 인정돼.' });
        }
        persisted = true;
        return jsonResponse({ status: 'approved', message: `${user.nickname} 오늘 출석 완료!`, exercise_date: exerciseDate, image_id: result?.image_id });
      } finally {
        if (uploaded && !persisted) await client.storage.from(BUCKET).remove([storageKey]);
      }
    }

    const commentMatch = path.match(/^\/groups\/([^/]+)\/photos\/([^/]+)\/(comments|reactions)$/);
    if (commentMatch) {
      const slug = decodeURIComponent(commentMatch[1]);
      const imageId = commentMatch[2];
      const { supabase: client, session, group } = await requireSession(req, slug);
      const memberIds = (await groupMemberUsers(client, group.id)).map((user) => user.id);
      await requireImageInGroup(client, imageId, memberIds);

      if (req.method === 'GET' && commentMatch[3] === 'comments') {
        const { data } = await client.from('photo_comments').select('id, author, text, created_at').eq('image_id', imageId).is('deleted_at', null).order('created_at', { ascending: true });
        return jsonResponse({ comments: data ?? [] });
      }
      if (req.method === 'POST' && commentMatch[3] === 'comments') {
        const { text } = await req.json();
        const safeAuthor = String(session.nickname || '친구').trim().slice(0, 30);
        const safeText = String(text || '').trim().slice(0, 300);
        if (!safeAuthor || !safeText) return jsonResponse({ error: 'text_required' }, { status: 400 });
        const { data, error } = await client.from('photo_comments').insert({ image_id: imageId, author: safeAuthor, text: safeText }).select('id, author, text, created_at').single();
        if (error) throw error;
        return jsonResponse({ comment: data });
      }
      if (req.method === 'POST' && commentMatch[3] === 'reactions') {
        const { reaction } = await req.json();
        if (!['👍', '🔥', '😂', '🚨'].includes(reaction)) return jsonResponse({ error: 'invalid_reaction' }, { status: 400 });
        await client.from('photo_reactions').upsert({ image_id: imageId, session_id: session.id, reaction }, { onConflict: 'image_id,session_id,reaction' });
        const { data: reactions } = await client.from('photo_reactions').select('reaction').eq('image_id', imageId).gte('expires_at', new Date().toISOString());
        const reaction_counts = { '👍': 0, '🔥': 0, '😂': 0, '🚨': 0 } as Record<string, number>;
        for (const item of reactions ?? []) reaction_counts[item.reaction] = (reaction_counts[item.reaction] ?? 0) + 1;
        return jsonResponse({ ok: true, reaction_counts });
      }
    }

    if (req.method === 'POST' && path === '/jobs/send-reminders') {
      if (req.headers.get('X-Cron-Secret') !== requiredEnv('CRON_SECRET')) return jsonResponse({ error: 'invalid_cron_secret' }, { status: 401 });
      configureWebPush();
      const today = todayKst();
      const todayStart = kstDayStartIso(today);
      const weekStart = weekStartKst(today);
      const weekEnd = addDays(weekStart, 7);
      const { data: groups } = await supabase.from('groups').select('id, dashboard_slug, weekly_required_days, penalty_amount_krw');
      let sent = 0;
      let skipped = 0;
      let failed = 0;

      for (const group of groups ?? []) {
        const users = await groupMemberUsers(supabase, group.id);
        const userIds = users.map((user) => user.id);
        if (!userIds.length) continue;
        const { data: records } = await supabase
          .from('daily_workout_records')
          .select('user_id, exercise_date')
          .in('user_id', userIds)
          .gte('exercise_date', weekStart)
          .lt('exercise_date', weekEnd);
        const weeklyCounts = new Map<string, number>();
        const checkedToday = new Set<string>();
        for (const record of records ?? []) {
          weeklyCounts.set(record.user_id, (weeklyCounts.get(record.user_id) ?? 0) + 1);
          if (record.exercise_date === today) checkedToday.add(record.user_id);
        }

        const { data: subscriptions } = await supabase
          .from('notification_subscriptions')
          .select('id, user_id, endpoint, p256dh, auth')
          .eq('group_id', group.id)
          .eq('status', 'active')
          .in('user_id', userIds);

        for (const user of users) {
          if (checkedToday.has(user.id)) { skipped++; continue; }
          const approved = weeklyCounts.get(user.id) ?? 0;
          if (approved >= group.weekly_required_days) { skipped++; continue; }
          const remaining = Math.max(0, group.weekly_required_days - approved);
          const emergency = remaining >= daysLeftInWeekKst(weekStart);
          const type = emergency ? 'emergency_reminder' : 'today_reminder';
          const { data: existingLog } = await supabase
            .from('notification_logs')
            .select('id')
            .eq('group_id', group.id)
            .eq('user_id', user.id)
            .eq('type', type)
            .gte('created_at', todayStart)
            .limit(1)
            .maybeSingle();
          if (existingLog) { skipped++; continue; }

          const title = emergency ? '비상!! 운동 출석 필요 🚨' : '오늘 운동 출석 안 했어 💪';
          const body = emergency
            ? `${user.nickname}, 이번 주 ${approved}/${group.weekly_required_days}회야. 오늘 안 하면 벌금 위험!`
            : `${user.nickname}, 사진 한 장 찍고 오늘 출석 끝내자.`;
          const payload = JSON.stringify({ title, body, url: `/d/${group.dashboard_slug}` });
          const userSubs = (subscriptions ?? []).filter((sub) => sub.user_id === user.id);
          if (!userSubs.length) { skipped++; continue; }
          for (const sub of userSubs) {
            try {
              await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload);
              await supabase.from('notification_logs').insert({ group_id: group.id, user_id: user.id, subscription_id: sub.id, type, title, body, status: 'sent' });
              sent++;
            } catch (error) {
              const statusCode = (error as any)?.statusCode;
              if (statusCode === 404 || statusCode === 410) {
                await supabase.from('notification_subscriptions').update({ status: 'revoked', revoked_at: new Date().toISOString() }).eq('id', sub.id);
              }
              await supabase.from('notification_logs').insert({ group_id: group.id, user_id: user.id, subscription_id: sub.id, type, title, body, status: 'failed', error: String((error as Error)?.message ?? error).slice(0, 500) });
              failed++;
            }
          }
        }
      }
      return jsonResponse({ sent, skipped, failed });
    }

    return jsonResponse({ error: 'not_found', path }, { status: 404 });
  } catch (error) {
    if (error instanceof Response) return jsonResponse({ error: await error.text() }, { status: error.status });
    console.error('dashboard-api-error', error instanceof Error ? error.message : error);
    return jsonResponse({ error: 'server_error' }, { status: 500 });
  }
});
