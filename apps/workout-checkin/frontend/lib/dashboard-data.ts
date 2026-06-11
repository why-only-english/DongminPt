export type MemberSummary = {
  nickname: string;
  approved_days: number;
  remaining_required: number;
  status: 'safe' | 'normal' | 'emergency' | 'penalty_due';
  status_label: string;
  expected_penalty: number;
};

export type ReactionCounts = Record<'👍' | '🔥' | '😂' | '🚨', number>;

export type PhotoComment = {
  id?: string;
  author: string;
  text: string;
  created_at?: string;
};

export type PhotoItem = {
  image_id?: string;
  nickname: string;
  image_url?: string;
  image_url_expires_at?: string;
  status: 'approved' | 'duplicate_ignored';
  exercise_date: string;
  comment_count?: number;
  reaction_counts?: Partial<ReactionCounts>;
};

export type PhotoDay = {
  date: string;
  photos: PhotoItem[];
};

export type AttendanceDay = {
  date: string;
  members: string[];
};

export type DashboardSummary = {
  week_start: string;
  week_end: string;
  required_days: number;
  penalty_amount_krw: number;
  members: MemberSummary[];
};

const mockMembers: MemberSummary[] = [
  { nickname: '민수', approved_days: 3, remaining_required: 0, status: 'safe', status_label: '완료 ✅', expected_penalty: 0 },
  { nickname: '지훈', approved_days: 2, remaining_required: 1, status: 'normal', status_label: '진행중', expected_penalty: 0 },
  { nickname: '영희', approved_days: 1, remaining_required: 2, status: 'emergency', status_label: '비상!! 🚨', expected_penalty: 30000 },
  { nickname: '철수', approved_days: 0, remaining_required: 3, status: 'emergency', status_label: '비상!! 🚨', expected_penalty: 30000 },
];

const mockToday: PhotoItem[] = [
  { image_id: 'mock-minsu-today', nickname: '민수', status: 'approved', exercise_date: '2026-06-08', image_url: '/checkin-test.png', comment_count: 1, reaction_counts: { '👍': 2, '🔥': 1 } },
  { image_id: 'mock-younghee-today', nickname: '영희', status: 'approved', exercise_date: '2026-06-08', image_url: 'https://images.unsplash.com/photo-1518611012118-696072aa579a?auto=format&fit=crop&w=900&q=80', comment_count: 1, reaction_counts: { '👍': 1, '🚨': 1 } },
  { image_id: 'mock-jihoon-today', nickname: '지훈', status: 'approved', exercise_date: '2026-06-08', image_url: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?auto=format&fit=crop&w=900&q=80', comment_count: 0, reaction_counts: { '👍': 1 } },
];

const mockDates = ['2026-06-08', '2026-06-09', '2026-06-10', '2026-06-11', '2026-06-12', '2026-06-13', '2026-06-14'];
const mockWeek: PhotoDay[] = mockDates.map((date, index) => ({
  date,
  photos: index === 0 ? mockToday : index === 1 ? [
    { ...mockToday[0], image_id: `mock-minsu-${date}`, exercise_date: date },
    { ...mockToday[2], image_id: `mock-jihoon-${date}`, exercise_date: date },
  ] : index === 2 ? [{ ...mockToday[1], image_id: `mock-younghee-${date}`, exercise_date: date }] : [],
}));

const mockMonthDays: AttendanceDay[] = Array.from({ length: 30 }, (_, index) => {
  const day = index + 1;
  const date = `2026-06-${String(day).padStart(2, '0')}`;
  const weekly = mockWeek.find((item) => item.date === date);
  if (weekly) return { date, members: weekly.photos.map((photo) => photo.nickname) };
  const members =
    day % 6 === 0 ? ['민수', '지훈'] :
    day % 5 === 0 ? ['영희'] :
    day % 4 === 0 ? ['민수'] :
    [];
  return { date, members };
});

export type DashboardData = {
  summary: DashboardSummary;
  todayPhotos: PhotoItem[];
  weekDays: PhotoDay[];
  monthDays: AttendanceDay[];
  source: 'api' | 'mock';
};

export function emptyDashboardData(source: 'api' | 'mock' = 'api'): DashboardData {
  return {
    source,
    summary: {
      week_start: '',
      week_end: '',
      required_days: 3,
      penalty_amount_krw: 30000,
      members: [],
    },
    todayPhotos: [],
    weekDays: [],
    monthDays: [],
  };
}

export type LoginResponse = { token: string; expires_at: string; nickname: string };
export type UploadCheckinResponse = { status: 'approved' | 'duplicate_ignored'; message: string; exercise_date?: string; image_id?: string };
export type NotificationSubscriptionResponse = { ok: boolean; status: 'active' | 'revoked' };

export function getApiBaseUrl(): string | null {
  return process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, '') || null;
}

export async function getDashboardData(_slug: string): Promise<DashboardData> {
  return process.env.NEXT_PUBLIC_API_BASE_URL ? emptyDashboardData('api') : mockDashboardData('mock');
}

export function mockDashboardData(source: 'api' | 'mock' = 'mock'): DashboardData {
  return {
    source,
    summary: {
      week_start: '2026-06-08',
      week_end: '2026-06-15',
      required_days: 3,
      penalty_amount_krw: 30000,
      members: mockMembers,
    },
    todayPhotos: mockToday,
    weekDays: mockWeek,
    monthDays: mockMonthDays,
  };
}

export async function loginDashboard(slug: string, nickname: string, accessCode: string): Promise<LoginResponse> {
  const base = requireApiBaseUrl();
  return fetchJson<LoginResponse>(`${base}/login`, {
    method: 'POST',
    body: JSON.stringify({ slug, nickname, accessCode }),
  });
}

export async function fetchDashboardData(slug: string, token: string): Promise<DashboardData> {
  const base = requireApiBaseUrl();
  const encodedSlug = encodeURIComponent(slug);
  const [summary, today, weekly, monthly] = await Promise.all([
    fetchJson<DashboardSummary>(`${base}/groups/${encodedSlug}/summary`, { token }),
    fetchJson<{ photos: PhotoItem[] }>(`${base}/groups/${encodedSlug}/today-photos`, { token }),
    fetchJson<{ days: PhotoDay[] }>(`${base}/groups/${encodedSlug}/weekly-photos`, { token }),
    fetchJson<{ days: AttendanceDay[] }>(`${base}/groups/${encodedSlug}/monthly-attendance`, { token }),
  ]);
  return { source: 'api', summary, todayPhotos: today.photos, weekDays: weekly.days, monthDays: monthly.days };
}

export async function fetchPhotoComments(slug: string, imageId: string, token: string): Promise<PhotoComment[]> {
  const base = requireApiBaseUrl();
  const result = await fetchJson<{ comments: PhotoComment[] }>(`${base}/groups/${encodeURIComponent(slug)}/photos/${encodeURIComponent(imageId)}/comments`, { token });
  return result.comments;
}

export async function addPhotoComment(slug: string, imageId: string, token: string, text: string): Promise<PhotoComment> {
  const base = requireApiBaseUrl();
  const result = await fetchJson<{ comment: PhotoComment }>(`${base}/groups/${encodeURIComponent(slug)}/photos/${encodeURIComponent(imageId)}/comments`, {
    token,
    method: 'POST',
    body: JSON.stringify({ text }),
  });
  return result.comment;
}

export async function saveNotificationSubscription(slug: string, token: string, subscription: PushSubscription, platform: string): Promise<NotificationSubscriptionResponse> {
  const base = requireApiBaseUrl();
  return fetchJson<NotificationSubscriptionResponse>(`${base}/groups/${encodeURIComponent(slug)}/notifications/subscribe`, {
    token,
    method: 'POST',
    body: JSON.stringify({ subscription: subscription.toJSON(), platform }),
  });
}

export async function uploadCheckinPhoto(slug: string, token: string, file: File): Promise<UploadCheckinResponse> {
  const base = requireApiBaseUrl();
  const form = new FormData();
  form.append('photo', file);
  const response = await fetch(`${base}/groups/${encodeURIComponent(slug)}/checkins`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  if (!response.ok) throw new Error(`dashboard upload failed: ${response.status}`);
  return response.json() as Promise<UploadCheckinResponse>;
}

export async function addPhotoReaction(slug: string, imageId: string, token: string, reaction: keyof ReactionCounts): Promise<ReactionCounts> {
  const base = requireApiBaseUrl();
  const result = await fetchJson<{ ok: boolean; reaction_counts: ReactionCounts }>(`${base}/groups/${encodeURIComponent(slug)}/photos/${encodeURIComponent(imageId)}/reactions`, {
    token,
    method: 'POST',
    body: JSON.stringify({ reaction }),
  });
  return result.reaction_counts;
}

function requireApiBaseUrl(): string {
  const base = getApiBaseUrl();
  if (!base) throw new Error('NEXT_PUBLIC_API_BASE_URL is not configured');
  return base;
}

type FetchOptions = RequestInit & { token?: string };

async function fetchJson<T>(url: string, options: FetchOptions = {}): Promise<T> {
  const { token, headers, ...init } = options;
  const response = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(headers ?? {}),
    },
  });
  if (!response.ok) {
    throw new Error(`dashboard api failed: ${response.status}`);
  }
  return response.json() as Promise<T>;
}
