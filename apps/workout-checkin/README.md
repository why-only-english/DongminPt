# Workout Check-in Managed App

이 폴더는 동민PT 운동 출석판의 운영형 MVP입니다.

- Frontend: `frontend/` Next.js 모바일 웹앱
- Backend: `supabase/functions/` Supabase Edge Functions
- DB: `supabase/migrations/` PostgreSQL schema/RPC/index
- Storage: Supabase private bucket `workout-cert-images`

자세한 전체 설명은 레포 루트 `README.md`를 참고하세요.

## Quick Start

```bash
cd frontend
npm install
npm run typecheck
npm run build
npm run dev
```

## Deploy

```bash
supabase link --project-ref <PROJECT_REF>
supabase db push
supabase functions deploy dashboard-api --no-verify-jwt --use-api
supabase functions deploy cleanup-weekly-photos --no-verify-jwt --use-api
supabase functions deploy cleanup-social-content --no-verify-jwt --use-api
```

Vercel project root는 `apps/workout-checkin/frontend`로 설정합니다.

## Secrets

`.env.example`을 참고하되, service role key와 runtime secret은 절대 커밋하지 않습니다.
