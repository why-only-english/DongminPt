'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import {
  addPhotoComment,
  addPhotoReaction,
  saveNotificationSubscription,
  uploadCheckinPhoto,
  fetchDashboardData,
  fetchPhotoComments,
  loginDashboard,
  mockDashboardData,
  type AttendanceDay,
  type DashboardData,
  type DashboardSummary,
  type PhotoComment,
  type PhotoDay,
  type PhotoItem,
  type MemberSummary,
} from '@/lib/dashboard-data';

type DashboardClientProps = {
  slug: string;
  source: 'api' | 'mock';
  summary: DashboardSummary;
  todayPhotos: PhotoItem[];
  weekDays: PhotoDay[];
  monthDays: AttendanceDay[];
};

const reactionLabels = ['👍', '🔥', '😂', '🚨'] as const;
type ReactionLabel = typeof reactionLabels[number];

function statusClass(status: MemberSummary['status']) {
  if (status === 'safe') return 'safe';
  if (status === 'normal') return 'warn';
  return 'danger';
}

function statusHelp(member: MemberSummary) {
  if (member.status === 'safe') return 'GOAL CLEARED';
  if (member.status === 'emergency') return 'NO MISS LEFT';
  if (member.status === 'penalty_due') return 'PENALTY DUE';
  return `${member.remaining_required} CHECK-IN LEFT`;
}

function formatWeekday(date: string) {
  const parsed = new Date(`${date}T00:00:00+09:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  return new Intl.DateTimeFormat('ko-KR', { weekday: 'short' }).format(parsed);
}

function formatDay(date: string) {
  const parsed = new Date(`${date}T00:00:00+09:00`);
  if (Number.isNaN(parsed.getTime())) return '';
  return String(parsed.getDate()).padStart(2, '0');
}

function formatCommentTime(value?: string) {
  if (!value) return '방금';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '방금';
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: false,
  }).format(parsed);
}

function formatMonthTitle(days: AttendanceDay[]) {
  const firstDay = days[0]?.date;
  if (!firstDay) return '이번 달';
  const parsed = new Date(`${firstDay}T00:00:00+09:00`);
  if (Number.isNaN(parsed.getTime())) return '이번 달';
  return new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: 'long' }).format(parsed);
}

function mondayFirstBlankCount(days: AttendanceDay[]) {
  const firstDay = days[0]?.date;
  if (!firstDay) return 0;
  const parsed = new Date(`${firstDay}T00:00:00+09:00`);
  if (Number.isNaN(parsed.getTime())) return 0;
  return (parsed.getDay() + 6) % 7;
}

function initials(name: string) {
  return name.slice(0, 1).toUpperCase();
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

function detectMobilePlatform() {
  if (typeof navigator === 'undefined') return 'unknown';
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua)) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  return 'web';
}

function isStandaloneWebApp() {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(display-mode: standalone)').matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
}

function msUntilNextKstMidnight() {
  const now = new Date();
  const kstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const nextKstMidnightUtcMs = Date.UTC(kstNow.getUTCFullYear(), kstNow.getUTCMonth(), kstNow.getUTCDate() + 1) - 9 * 60 * 60 * 1000;
  return Math.max(1000, nextKstMidnightUtcMs - now.getTime());
}


function photoKey(photo: Pick<PhotoItem, 'nickname' | 'exercise_date'>) {
  return `${photo.exercise_date}:${photo.nickname}`;
}

function starterComments(photo: Pick<PhotoItem, 'nickname' | 'exercise_date'>): PhotoComment[] {
  const day = Number(photo.exercise_date.slice(-2));
  if (photo.nickname === '민수') return [{ author: '영희', text: '이건 인정. 오늘 제대로 했네 🔥', created_at: new Date().toISOString() }];
  if (photo.nickname === '영희') return [{ author: '민수', text: '오 오늘도 출석 완료!', created_at: new Date().toISOString() }];
  if (day % 2 === 0) return [{ author: '지훈', text: '수고했다. 내일도 가자', created_at: new Date().toISOString() }];
  return [];
}

function starterReactionCounts(photo: Pick<PhotoItem, 'nickname' | 'exercise_date'>): Record<ReactionLabel, number> {
  const seed = photo.nickname.charCodeAt(0) + Number(photo.exercise_date.slice(-2));
  return {
    '👍': 1 + (seed % 3),
    '🔥': seed % 2,
    '😂': seed % 4 === 0 ? 1 : 0,
    '🚨': photo.nickname === '영희' ? 1 : 0,
  };
}

function photoVisual(photo: PhotoItem, large = false) {
  if (photo.image_url) {
    return <img className={large ? 'spotlight-img' : 'photo-img'} src={photo.image_url} alt={`${photo.nickname} 운동 인증`} />;
  }
  return (
    <div className={large ? 'spotlight-placeholder' : 'photo'}>
      <span>PHOTO</span>
      <strong>{large ? photo.nickname : 'CHECK-IN'}</strong>
    </div>
  );
}

export function DashboardClient({
  slug,
  source,
  summary: initialSummary,
  todayPhotos: initialTodayPhotos,
  weekDays: initialWeekDays,
  monthDays: initialMonthDays,
}: DashboardClientProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isMonthOpen, setIsMonthOpen] = useState(false);
  const [selectedDay, setSelectedDay] = useState<PhotoDay | null>(null);
  const [selectedPhoto, setSelectedPhoto] = useState<PhotoItem | null>(null);
  const [dashboardData, setDashboardData] = useState<DashboardData>({
    source,
    summary: initialSummary,
    todayPhotos: initialTodayPhotos,
    weekDays: initialWeekDays,
    monthDays: initialMonthDays,
  });
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [sessionNickname, setSessionNickname] = useState('');
  const [loginNickname, setLoginNickname] = useState('');
  const [accessCode, setAccessCode] = useState('');
  const [authStatus, setAuthStatus] = useState<'checking' | 'ready' | 'loading' | 'authenticated' | 'error'>(
    source === 'api' ? 'checking' : 'authenticated',
  );
  const [authError, setAuthError] = useState('');
  const commentTextRef = useRef<HTMLTextAreaElement>(null);
  const [commentsByPhoto, setCommentsByPhoto] = useState<Record<string, PhotoComment[]>>({});
  const [reactionCounts, setReactionCounts] = useState<Record<string, Partial<Record<ReactionLabel, number>>>>({});
  const [detailError, setDetailError] = useState('');
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'uploading' | 'success' | 'duplicate' | 'error'>('idle');
  const [uploadMessage, setUploadMessage] = useState('');
  const [notificationStatus, setNotificationStatus] = useState<'idle' | 'unsupported' | 'needs-home-screen' | 'requesting' | 'enabled' | 'denied' | 'error'>('idle');
  const [notificationMessage, setNotificationMessage] = useState('');
  const modalHistoryRef = useRef(false);
  const { summary, todayPhotos, weekDays, monthDays } = dashboardData;
  const safeTodayPhotos = todayPhotos.length ? todayPhotos : [];
  const activePhoto = safeTodayPhotos[activeIndex % Math.max(1, safeTodayPhotos.length)];
  const currentNickname = (sessionNickname || loginNickname).trim();
  const hasMyTodayCheckin = Boolean(currentNickname && todayPhotos.some((photo) => photo.nickname === currentNickname));

  const sessionStorageKey = `workout-dashboard-session:${slug}`;

  function clearOverlayState() {
    setIsMonthOpen(false);
    setSelectedDay(null);
    setSelectedPhoto(null);
  }

  function openOverlayHistory() {
    if (modalHistoryRef.current || typeof window === 'undefined') return;
    window.history.pushState({ workoutOverlay: true }, '', window.location.href);
    modalHistoryRef.current = true;
  }

  function closeOverlay() {
    if (modalHistoryRef.current && typeof window !== 'undefined') {
      window.history.back();
      return;
    }
    clearOverlayState();
  }

  function openMonthCalendar() {
    openOverlayHistory();
    setIsMonthOpen(true);
    setSelectedDay(null);
    setSelectedPhoto(null);
  }

  function openDayPhotos(day: PhotoDay) {
    openOverlayHistory();
    setSelectedDay(day);
    setIsMonthOpen(false);
    setSelectedPhoto(null);
  }

  useEffect(() => {
    if (source !== 'api') return;
    try {
      const raw = window.localStorage.getItem(sessionStorageKey);
      if (!raw) {
        setAuthStatus('ready');
        return;
      }
      const saved = JSON.parse(raw) as { token?: string; expires_at?: string; nickname?: string };
      if (!saved.token || !saved.expires_at || new Date(saved.expires_at).getTime() <= Date.now()) {
        window.localStorage.removeItem(sessionStorageKey);
        setAuthStatus('ready');
        return;
      }
      setSessionToken(saved.token);
      setSessionNickname(saved.nickname ?? '');
      setLoginNickname(saved.nickname ?? '');
    } catch {
      window.localStorage.removeItem(sessionStorageKey);
      setAuthStatus('ready');
    }
  }, [sessionStorageKey, source]);

  useEffect(() => {
    if (source !== 'api' || !sessionToken) return;
    setAuthStatus('loading');
    fetchDashboardData(slug, sessionToken)
      .then((data) => {
        setDashboardData(data);
        setAuthStatus('authenticated');
        setAuthError('');
      })
      .catch(() => {
        window.localStorage.removeItem(sessionStorageKey);
        setSessionToken(null);
        setAuthStatus('error');
        setAuthError('로그인이 만료됐거나 접근코드가 바뀐 것 같아. 다시 들어와줘.');
        setDashboardData(mockDashboardData('api'));
      });
  }, [sessionStorageKey, sessionToken, slug, source]);

  useEffect(() => {
    if (source !== 'api' || !sessionToken) return;
    const refresh = () => {
      void fetchDashboardData(slug, sessionToken)
        .then((data) => setDashboardData(data))
        .catch(() => undefined);
    };
    const midnightTimer = window.setTimeout(refresh, msUntilNextKstMidnight() + 1500);
    window.addEventListener('focus', refresh);
    return () => {
      window.clearTimeout(midnightTimer);
      window.removeEventListener('focus', refresh);
    };
  }, [sessionToken, slug, source, todayPhotos]);

  useEffect(() => {
    if (safeTodayPhotos.length <= 1) return;
    const id = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % safeTodayPhotos.length);
    }, 3600);
    return () => window.clearInterval(id);
  }, [safeTodayPhotos.length]);

  useEffect(() => {
    const onPopState = () => {
      if (!modalHistoryRef.current) return;
      modalHistoryRef.current = false;
      clearOverlayState();
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  useEffect(() => {
    if (!isMonthOpen && !selectedDay && !selectedPhoto) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeOverlay();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isMonthOpen, selectedDay, selectedPhoto]);


  useEffect(() => {
    if (!selectedPhoto || typeof window === 'undefined') return;
    const viewport = window.visualViewport;
    const updateKeyboardSpace = () => {
      const keyboardOffset = viewport
        ? Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop)
        : 0;
      document.documentElement.style.setProperty('--keyboard-offset', `${Math.round(keyboardOffset)}px`);
      if (document.activeElement === commentTextRef.current) scrollCommentInputIntoView();
    };
    updateKeyboardSpace();
    viewport?.addEventListener('resize', updateKeyboardSpace);
    viewport?.addEventListener('scroll', updateKeyboardSpace);
    window.addEventListener('resize', updateKeyboardSpace);
    return () => {
      document.documentElement.style.removeProperty('--keyboard-offset');
      viewport?.removeEventListener('resize', updateKeyboardSpace);
      viewport?.removeEventListener('scroll', updateKeyboardSpace);
      window.removeEventListener('resize', updateKeyboardSpace);
    };
  }, [selectedPhoto]);

  const stats = useMemo(() => {
    const completedMembers = summary.members.filter((m) => m.status === 'safe');
    const emergencyMembers = summary.members.filter((m) => m.status === 'emergency' || m.status === 'penalty_due');
    const expectedPenalty = summary.members.reduce((sum, m) => sum + m.expected_penalty, 0);
    const totalDone = summary.members.reduce((sum, m) => sum + m.approved_days, 0);
    const totalTarget = summary.members.length * summary.required_days;
    const remaining = Math.max(0, totalTarget - totalDone);
    const progress = totalTarget ? Math.min(100, Math.round((totalDone / totalTarget) * 100)) : 0;
    return { completedMembers, emergencyMembers, expectedPenalty, totalDone, totalTarget, remaining, progress };
  }, [summary.members, summary.required_days]);

  const monthTitle = formatMonthTitle(monthDays);
  const monthBlankCount = mondayFirstBlankCount(monthDays);
  const monthTotalChecks = monthDays.reduce((sum, day) => sum + day.members.length, 0);
  const weekdayLabels = ['월', '화', '수', '목', '금', '토', '일'];
  const weeklyPhotos = weekDays.flatMap((day) => day.photos.map((photo) => ({ ...photo, exercise_date: day.date })));
  const selectedPhotoKey = selectedPhoto ? photoKey(selectedPhoto) : '';
  const selectedComments = selectedPhoto ? (commentsByPhoto[selectedPhotoKey] ?? starterComments(selectedPhoto)) : [];

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nickname = loginNickname.trim();
    const code = accessCode.trim();
    if (!nickname || !code) {
      setAuthError('닉네임과 접근코드를 둘 다 입력해줘.');
      return;
    }
    setAuthStatus('loading');
    setAuthError('');
    try {
      const session = await loginDashboard(slug, nickname, code);
      window.localStorage.setItem(sessionStorageKey, JSON.stringify(session));
      setSessionToken(session.token);
      setSessionNickname(session.nickname);
      setAccessCode('');
    } catch {
      setAuthStatus('error');
      setAuthError('접근코드가 맞지 않아. 친구들끼리 정한 코드를 확인해줘.');
    }
  }

  async function enableNotifications() {
    if (!sessionToken) return;
    const platform = detectMobilePlatform();
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
      setNotificationStatus('unsupported');
      setNotificationMessage('이 브라우저는 웹 알림을 지원하지 않아. 안드로이드는 Chrome, 아이폰은 Chrome/Safari에서 홈 화면에 추가한 앱으로 열어줘.');
      return;
    }
    if (platform === 'ios' && !isStandaloneWebApp()) {
      setNotificationStatus('needs-home-screen');
      setNotificationMessage('아이폰은 Chrome/Safari 브라우저 탭에서는 알림이 안 떠. 공유 버튼 → 홈 화면에 추가 후, 홈 화면 아이콘으로 다시 열어줘.');
      return;
    }
    const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!publicKey) {
      setNotificationStatus('error');
      setNotificationMessage('알림 키 설정이 아직 없어. 잠시 뒤 다시 시도해줘.');
      return;
    }

    setNotificationStatus('requesting');
    setNotificationMessage('알림 권한 확인 중...');
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setNotificationStatus('denied');
        setNotificationMessage('알림 권한이 꺼져 있어. 브라우저/휴대폰 알림 설정에서 허용해줘.');
        return;
      }
      const registration = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;
      const existing = await registration.pushManager.getSubscription();
      const subscription = existing ?? await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
      await saveNotificationSubscription(slug, sessionToken, subscription, platform);
      setNotificationStatus('enabled');
      setNotificationMessage('알림 설정 완료! 운동 안 한 날 핸드폰 알림으로 알려줄게.');
    } catch {
      setNotificationStatus('error');
      setNotificationMessage('알림 설정에 실패했어. 홈 화면 앱/브라우저 알림 권한을 확인해줘.');
    }
  }

  async function handlePhotoSelected(file: File | null | undefined) {
    if (!file || !sessionToken) return;
    setUploadStatus('uploading');
    setUploadMessage('사진 올리는 중...');
    try {
      const result = await uploadCheckinPhoto(slug, sessionToken, file);
      setUploadStatus(result.status === 'duplicate_ignored' ? 'duplicate' : 'success');
      setUploadMessage(result.message);
      const data = await fetchDashboardData(slug, sessionToken);
      setDashboardData(data);
      setActiveIndex(0);
    } catch {
      setUploadStatus('error');
      setUploadMessage('업로드 실패. 사진 용량이 너무 크거나 잠시 연결이 불안정할 수 있어.');
    } finally {
      if (cameraInputRef.current) cameraInputRef.current.value = '';
    }
  }

  function openPhotoDetail(photo: PhotoItem) {
    openOverlayHistory();
    setSelectedPhoto(photo);
    setSelectedDay(null);
    setDetailError('');
    const key = photoKey(photo);
    setCommentsByPhoto((current) => current[key] ? current : { ...current, [key]: starterComments(photo) });
    setReactionCounts((current) => current[key] ? current : { ...current, [key]: { ...starterReactionCounts(photo), ...photo.reaction_counts } });
    if (source === 'api' && sessionToken && photo.image_id) {
      fetchPhotoComments(slug, photo.image_id, sessionToken)
        .then((comments) => setCommentsByPhoto((current) => ({ ...current, [key]: comments })))
        .catch(() => undefined);
    }
  }

  function addReaction(label: ReactionLabel) {
    if (!selectedPhoto) return;
    const key = photoKey(selectedPhoto);
    if (source === 'api' && sessionToken && selectedPhoto.image_id) {
      void addPhotoReaction(slug, selectedPhoto.image_id, sessionToken, label)
        .then((counts) => setReactionCounts((current) => ({ ...current, [key]: counts })))
        .catch(() => setDetailError('반응 저장에 실패했어. 잠시 뒤 다시 눌러줘.'));
      return;
    }
    setReactionCounts((current) => ({
      ...current,
      [key]: {
        ...starterReactionCounts(selectedPhoto),
        ...current[key],
        [label]: (current[key]?.[label] ?? starterReactionCounts(selectedPhoto)[label]) + 1,
      },
    }));
  }

  function scrollCommentInputIntoView() {
    window.setTimeout(() => {
      commentTextRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 80);
    window.setTimeout(() => {
      commentTextRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 320);
  }

  function addComment() {
    if (!selectedPhoto) return;
    const author = (sessionNickname || loginNickname || '친구').trim();
    const text = commentTextRef.current?.value.trim() ?? '';
    if (!text) return;
    const key = photoKey(selectedPhoto);
    const insertComment = (comment: PhotoComment) => {
      setCommentsByPhoto((current) => ({
        ...current,
        [key]: [...(current[key] ?? starterComments(selectedPhoto)), comment],
      }));
    };
    if (source === 'api' && sessionToken && selectedPhoto.image_id) {
      void addPhotoComment(slug, selectedPhoto.image_id, sessionToken, text)
        .then(insertComment)
        .catch(() => setDetailError('댓글 저장에 실패했어. 새로고침 전에 다시 등록해줘.'));
    } else {
      insertComment({ author, text, created_at: new Date().toISOString() });
    }
    if (commentTextRef.current) commentTextRef.current.value = '';
  }

  if (source === 'api' && authStatus !== 'authenticated' && authStatus !== 'loading') {
    return (
      <main className="page">
        <div className="shell">
          <section className="login-panel">
            <div>
              <span>PRIVATE BOARD</span>
              <h1>친구 운동 출석판</h1>
              <p>사진은 로그인한 친구만 볼 수 있고, signed URL은 24시간 동안만 열려요.</p>
            </div>
            <form className="login-form" onSubmit={handleLogin}>
              <input value={loginNickname} onChange={(event) => setLoginNickname(event.target.value)} placeholder="닉네임" autoComplete="nickname" />
              <input value={accessCode} onChange={(event) => setAccessCode(event.target.value)} placeholder="접근코드" type="password" autoComplete="current-password" />
              <button type="submit">입장</button>
            </form>
            {authError && <p className="login-error">{authError}</p>}
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="page">
      <div className="shell">
        <section className={`mobile-checkin-panel ${hasMyTodayCheckin ? 'is-complete' : ''}`} aria-label="모바일 사진 출석">
          <div className="checkin-copy">
            <span>{hasMyTodayCheckin ? 'TODAY COMPLETE' : 'MOBILE CHECK-IN'}</span>
            <h1>{hasMyTodayCheckin ? <>오늘 출석<br />완료</> : <>사진 찍고<br />바로 출석</>}</h1>
            <p>{hasMyTodayCheckin ? `${currentNickname} 오늘 사진 출석은 끝났어요. 내일 00시에 다시 열려요.` : `${currentNickname} 오늘 운동 사진을 카메라로 찍어 올리면 하루 1회 출석돼요.`}</p>
          </div>
          {!hasMyTodayCheckin && (
            <div className="checkin-actions">
              <input ref={cameraInputRef} className="file-input" type="file" accept="image/*" capture onChange={(event) => void handlePhotoSelected(event.target.files?.[0])} />
              <button type="button" className="camera-cta" onClick={() => cameraInputRef.current?.click()} disabled={uploadStatus === 'uploading'}>
                <span>📸</span>
                {uploadStatus === 'uploading' ? '업로드 중' : '사진 찍어서 출석'}
              </button>
            </div>
          )}
          {uploadMessage && !hasMyTodayCheckin && <div className={`upload-message ${uploadStatus}`}>{uploadMessage}</div>}
        </section>

        <section className="spotlight-hero">
          <div className="spotlight-copy title-only">
            <h1>TODAY<br />CHECK-IN</h1>
          </div>

          <div className="spotlight-photo-card" aria-live="polite">
            {activePhoto ? photoVisual(activePhoto, true) : <div className="spotlight-placeholder"><span>WAITING</span><strong>첫 인증 대기</strong></div>}
            <div className="spotlight-overlay">
              <span>NOW ON BOARD</span>
              <strong>{activePhoto ? activePhoto.nickname : '아직 없음'}</strong>
              <em>{activePhoto ? '오늘 사진 출석 완료' : '오늘 첫 사진을 기다리는 중'}</em>
            </div>
            {safeTodayPhotos.length > 1 && (
              <div className="carousel-dots" aria-label="오늘 인증 사진 순서">
                {safeTodayPhotos.map((photo, index) => (
                  <button
                    type="button"
                    key={`${photo.nickname}-${photo.exercise_date}-${index}`}
                    className={index === activeIndex ? 'active' : ''}
                    aria-label={`${photo.nickname} 사진 보기`}
                    onClick={() => setActiveIndex(index)}
                  />
                ))}
              </div>
            )}
          </div>
        </section>

        <section className="momentum-panel" aria-label="이번 주 운동 진행 상황">
          <div className="momentum-main">
            <span>CREW PROGRESS</span>
            <strong>{stats.totalDone}<em>/{stats.totalTarget}</em></strong>
            <p>전체 남은 운동일수 <b>{stats.remaining}</b>회</p>
          </div>
          <div className="progress-area">
            <div className="progress-track"><div className="progress-fill" style={{ width: `${stats.progress}%` }} /></div>
            <div className="progress-labels"><span>{stats.progress}% COMPLETE</span><span>{stats.remaining} LEFT</span></div>
          </div>
          <div className="momentum-chip danger people-chip"><span>비상</span><strong>{stats.emergencyMembers.length ? stats.emergencyMembers.map((m) => m.nickname).join(', ') : '없음'}</strong></div>
          <div className="momentum-chip people-chip"><span>목표 완료</span><strong>{stats.completedMembers.length ? stats.completedMembers.map((m) => m.nickname).join(', ') : '아직 없음'}</strong></div>
        </section>

        <section className="stats" aria-label="이번 주 요약">
          <div className="metric-card people-card"><span>GOAL HIT</span><strong>{stats.completedMembers.length ? stats.completedMembers.map((m) => m.nickname).join(', ') : '아직 없음'}</strong><em>3일 채운 친구</em></div>
          <div className="metric-card"><span>TODAY</span><strong>{todayPhotos.length}</strong><em>사진 출석</em></div>
          <div className="metric-card danger people-card"><span>EMERGENCY</span><strong>{stats.emergencyMembers.length ? stats.emergencyMembers.map((m) => m.nickname).join(', ') : '없음'}</strong><em>{stats.emergencyMembers.length ? '오늘부터 비상' : '다들 안전'}</em></div>
          <div className="metric-card money"><span>PENALTY RISK</span><strong>{stats.expectedPenalty.toLocaleString()}</strong><em>KRW</em></div>
        </section>

        <section className="grid">
          <div className="main-column">
            <div className="panel calendar-panel">
              <div className="section-title with-action">
                <div>
                  <span>WEEK CALENDAR</span>
                  <h2>이번 주 출석</h2>
                  <p>골드 표시 날짜를 누르면 그날 사진이 떠요</p>
                </div>
                <button className="calendar-open" type="button" onClick={openMonthCalendar} aria-label="월간 운동 캘린더 열기">
                  <span className="calendar-icon" aria-hidden="true" />
                  <span>월간 보기</span>
                </button>
              </div>
              <div className="calendar-grid" aria-label="주간 운동 출석 캘린더">
                {weekDays.map((day) => {
                  const hasPhotos = day.photos.length > 0;
                  const content = (
                    <>
                      <span>{formatWeekday(day.date)}</span>
                      <strong>{formatDay(day.date) || day.date}</strong>
                      <em>{hasPhotos ? `${day.photos.length}명` : 'REST'}</em>
                      <div className="calendar-names">
                        {day.photos.slice(0, 4).map((photo) => <b key={`${day.date}-${photo.nickname}`}>{initials(photo.nickname)}</b>)}
                      </div>
                      {hasPhotos && <div className="calendar-attendees">{day.photos.map((photo) => <i key={`${day.date}-${photo.nickname}-name`}>{photo.nickname}</i>)}</div>}
                      {hasPhotos && <small>사진 보기</small>}
                    </>
                  );
                  return hasPhotos ? (
                    <button className="calendar-day done is-clickable" type="button" key={day.date} onClick={() => openDayPhotos(day)} aria-label={`${day.date} 인증 사진 보기`}>
                      {content}
                    </button>
                  ) : (
                    <div className="calendar-day" key={day.date}>{content}</div>
                  );
                })}
              </div>
            </div>

            <div className="panel photo-panel">
              <div className="section-title"><div><span>WEEK PHOTO QUEUE</span><h2>주간 올라온 사진</h2></div><p>이번 주 인증 사진 전체를 모아봤어요</p></div>
              <div className="photo-grid compact-photos">
                {weeklyPhotos.length ? weeklyPhotos.map((photo, index) => (
                  <button className={`photo-card photo-card-button ${photo.exercise_date === activePhoto?.exercise_date && photo.nickname === activePhoto?.nickname ? 'selected' : ''}`} type="button" key={`${photo.nickname}-${photo.exercise_date}-${index}`} onClick={() => openPhotoDetail(photo)} aria-label={`${photo.nickname} ${photo.exercise_date} 인증 사진 상세 보기`}>
                    {photoVisual(photo)}
                    <div className="photo-meta">
                      <div><div className="photo-name">{photo.nickname}</div><div className="photo-type">{formatWeekday(photo.exercise_date)} {formatDay(photo.exercise_date)} CHECKED IN</div></div>
                      <span className="badge safe">댓글</span>
                    </div>
                    <div className="photo-social-preview"><span>인정 · 댓글 보기</span></div>
                  </button>
                )) : <div className="empty">아직 이번 주 인증 사진이 없어요. 첫 사진 기다리는 중.</div>}
              </div>
            </div>

          </div>

          <aside className="panel ranking-card">
            <div className="section-title compact"><div><span>LEADERBOARD</span><h2>랭킹 & 비상</h2></div><p>날짜 수 기준</p></div>
            <div className="rank-list">
              {summary.members.map((member, index) => (
                <div className={`rank-row ${statusClass(member.status)}`} key={member.nickname}>
                  <div className="rank-index">{String(index + 1).padStart(2, '0')}</div>
                  <div className="avatar">{member.nickname[0]}</div>
                  <div className="rank-copy"><div className="rank-name">{member.nickname}</div><div className="rank-money">{member.expected_penalty ? `${member.expected_penalty.toLocaleString()}원 위험` : statusHelp(member)}</div></div>
                  <div className="rank-score"><strong>{member.approved_days}</strong><span>/{summary.required_days}</span></div>
                </div>
              ))}
            </div>
            <div className="note" id="share">
              <strong>BOARD RULE</strong>
              <p>모바일 웹에서 직접 찍어 올린 사진만 공식 출석으로 인정. 사진은 이번 주 출석판에만 보이고 월요일 00:00에 삭제.</p>
            </div>
          </aside>
        </section>


        {selectedPhoto && (
          <div className="detail-modal-backdrop" role="dialog" aria-modal="true" aria-label={`${selectedPhoto.nickname} 인증 사진 상세`}>
            <div className="detail-modal">
              <div className="detail-photo-stage">
                {photoVisual(selectedPhoto, true)}
              </div>
              <div className="detail-side">
                <div className="detail-head">
                  <div>
                    <span>PHOTO DETAIL</span>
                    <h2>{selectedPhoto.nickname}</h2>
                    <p>{formatWeekday(selectedPhoto.exercise_date)} {formatDay(selectedPhoto.exercise_date)}</p>
                  </div>
                  <button type="button" className="month-close" onClick={closeOverlay} aria-label="사진 상세 닫기">닫기</button>
                </div>

                <div className="reaction-row" aria-label="사진 반응">
                  {reactionLabels.map((label) => {
                    const base = starterReactionCounts(selectedPhoto)[label];
                    const count = reactionCounts[selectedPhotoKey]?.[label] ?? base;
                    return <button type="button" key={label} onClick={() => addReaction(label)} aria-label={`${label} 반응 ${count}개`}><span aria-hidden="true">{label}</span><strong>{count}</strong></button>;
                  })}
                </div>

                {detailError && <div className="detail-error">{detailError}</div>}

                <div className="comments-box">
                  <div className="comments-title"><span>COMMENTS</span><strong>{selectedComments.length}</strong></div>
                  {selectedComments.length ? selectedComments.map((comment, index) => (
                    <div className="comment-item" key={`${selectedPhotoKey}-${comment.author}-${index}`}>
                      <div className="comment-meta"><b>{comment.author}</b><time>{formatCommentTime(comment.created_at)}</time></div>
                      <p>{comment.text}</p>
                    </div>
                  )) : <div className="comment-empty">아직 댓글이 없어. 첫 인정 남겨봐.</div>}
                </div>

                <div className="comment-form" aria-label="댓글 작성">
                  <textarea ref={commentTextRef} onFocus={scrollCommentInputIntoView} onClick={scrollCommentInputIntoView} onTouchStart={scrollCommentInputIntoView} onInput={scrollCommentInputIntoView} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); addComment(); } }} placeholder="응원/인정 한마디" rows={3} />
                  <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={addComment}>등록</button>
                </div>
              </div>
            </div>
          </div>
        )}


        {selectedDay && (
          <div className="photo-modal-backdrop" role="dialog" aria-modal="true" aria-label={`${selectedDay.date} 인증 사진`}>
            <div className="photo-modal">
              <div className="month-modal-head">
                <div>
                  <span>DAY PHOTOS</span>
                  <h2>{formatWeekday(selectedDay.date)} {formatDay(selectedDay.date)}</h2>
                  <p>{selectedDay.photos.length}명이 올린 인증 사진이에요.</p>
                </div>
                <button type="button" className="month-close" onClick={closeOverlay} aria-label="날짜별 사진 닫기">닫기</button>
              </div>
              <div className="day-photo-grid">
                {selectedDay.photos.map((photo, index) => (
                  <button className="day-photo-card day-photo-button" type="button" key={`${selectedDay.date}-${photo.nickname}-${index}`} onClick={() => openPhotoDetail({ ...photo, exercise_date: selectedDay.date })} aria-label={`${photo.nickname} ${selectedDay.date} 인증 사진 상세 보기`}>
                    {photoVisual(photo)}
                    <div className="photo-meta">
                      <div><div className="photo-name">{photo.nickname}</div><div className="photo-type">{selectedDay.date}</div></div>
                      <span className="badge safe">상세</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}


        {isMonthOpen && (
          <div className="month-modal-backdrop" role="dialog" aria-modal="true" aria-label="월간 운동 캘린더">
            <div className="month-modal">
              <div className="month-modal-head">
                <div>
                  <span>MONTH CALENDAR</span>
                  <h2>{monthTitle}</h2>
                  <p>한 달 동안 누가 운동했는지 날짜별로 확인해요.</p>
                </div>
                <button type="button" className="month-close" onClick={closeOverlay} aria-label="월간 캘린더 닫기">닫기</button>
              </div>

              <div className="month-summary-strip">
                <div><span>총 출석</span><strong>{monthTotalChecks}</strong></div>
                <div><span>이번 주 목표</span><strong>{summary.required_days}일</strong></div>
                <div><span>벌금 룰</span><strong>{summary.penalty_amount_krw.toLocaleString()}원</strong></div>
              </div>

              <div className="month-weekdays" aria-hidden="true">
                {weekdayLabels.map((label) => <span key={label}>{label}</span>)}
              </div>
              <div className="month-calendar-grid" aria-label={`${monthTitle} 운동 출석 현황`}>
                {Array.from({ length: monthBlankCount }).map((_, index) => <div className="month-day blank" key={`blank-${index}`} />)}
                {monthDays.map((day) => (
                  <div className={`month-day ${day.members.length ? 'done' : ''}`} key={day.date}>
                    <div className="month-day-top">
                      <strong>{formatDay(day.date)}</strong>
                      <em>{day.members.length ? `${day.members.length}명` : 'REST'}</em>
                    </div>
                    {day.members.length ? (
                      <div className="month-member-list" aria-label={`${day.date} 인증자`}>
                        {day.members.map((member) => <b title={member} key={`${day.date}-${member}`}>{initials(member)}</b>)}
                      </div>
                    ) : <span className="month-rest">-</span>}
                    {day.members.length > 0 && <p>{day.members.join(', ')}</p>}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
