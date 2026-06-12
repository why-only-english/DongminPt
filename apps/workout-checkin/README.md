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


## 증바람 월간보기

운동 출석 기능과 별도로 친구들끼리 하는 증바람 게임 기록을 저장합니다.

- DB: `jeungbaram_records` 테이블, 그룹+날짜당 1개 기록
- 입력: 달력 날짜 선택 → 승/패 숫자 입력 → 고정 참석자 8명 중 최대 5명 버튼 선택
- 계산: 총 판수와 승률은 승/패 숫자로 자동 계산
- 수정: 같은 날짜를 다시 저장하면 덮어쓰기
- 삭제: 날짜를 잘못 선택한 경우 해당 날짜 기록 삭제 가능
- 통계: 월별 달력에는 날짜별 기록, 상단에는 전체 기간 누적 총판수/승률 표시
- 분리: 운동 출석, 벌금, 사진 기록에는 영향을 주지 않음
- 참석자 목록: API 상수와 DB constraint가 같은 8명 목록을 의도적으로 고정합니다. 목록 변경 시 코드와 migration을 함께 변경해야 합니다.

관련 API는 `dashboard-api` 안에 있습니다.

```txt
GET    /groups/:slug/jeungbaram/monthly?month=YYYY-MM
GET    /groups/:slug/jeungbaram/stats
GET    /groups/:slug/jeungbaram/participants
PUT    /groups/:slug/jeungbaram/records/:date
DELETE /groups/:slug/jeungbaram/records/:date
```
