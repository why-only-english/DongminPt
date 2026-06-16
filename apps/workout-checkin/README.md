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


## 사진 댓글/반응

운동 인증 사진 상세 팝업에서 친구들이 댓글과 이모지 반응을 남길 수 있습니다.

- 댓글 작성자는 로그인한 세션의 닉네임을 사용합니다. 댓글 입력 시 닉네임을 다시 입력하지 않습니다.
- 댓글에는 작성 시간이 함께 표시됩니다.
- 실제 API 운영 모드에서는 서버에 저장된 댓글만 보여줍니다.
- `starterComments()`와 `starterReactionCounts()`는 로컬 mock 화면 전용입니다. 운영 모드에서 mock 댓글이 먼저 보였다가 실제 댓글로 교체되는 깜빡임이 생기지 않도록 분리되어 있습니다.
- 사진 상세를 열자마자 댓글을 달아도, 늦게 도착한 댓글 조회 응답이 방금 작성한 댓글을 덮어쓰지 않도록 기존 댓글과 서버 댓글을 병합합니다.

## 증바람 월간보기

운동 출석 기능과 별도로 친구들끼리 하는 증바람 게임 기록을 저장합니다.

- DB: `jeungbaram_records` 테이블, 그룹+날짜당 여러 회차 기록 가능
- 입력: 달력 날짜 선택 → `새 기록`으로 회차 추가 → 승/패 숫자 입력 → 고정 참석자 8명 중 최대 5명 버튼 선택
- 계산: 총 판수와 승률은 승/패 숫자로 자동 계산
- 수정: 회차 목록에서 특정 기록을 선택해 해당 회차만 수정
- 삭제: 잘못 입력한 회차는 상세 카드의 `이 기록 삭제` 버튼으로 개별 삭제
- 통계: 월별 달력에는 날짜별 기록, 상단에는 전체 기간 누적 총판수/승률 표시
- 개인별 참여 랭킹: 각 회차의 `승+패` 총 판수를 참석자별로 누적해 “누가 몇 판 참여했는지” 순위를 표시
- 랭킹 UI: 메인 증바람 카드에는 TOP 4, 증바람 월간보기 모달에는 고정 참석자 8명 전체 랭킹 표시
- UI: 승률 `50% 초과 = 초록`, `50% 미만 = 빨강`, `50% = 회색`으로 표시
- 모바일 UI: 작은 달력 칸에는 날짜/합산 판수/합산 승률만 표시하고, 날짜를 누르면 상세 카드에서 회차별 승/패/참석자/삭제를 확인
- 분리: 운동 출석, 벌금, 사진 기록에는 영향을 주지 않음
- 참석자 목록: API 상수와 DB constraint가 같은 8명 목록을 의도적으로 고정합니다. 목록 변경 시 코드와 migration을 함께 변경해야 합니다.

관련 API는 `dashboard-api` 안에 있습니다.

```txt
GET    /groups/:slug/jeungbaram/monthly?month=YYYY-MM
GET    /groups/:slug/jeungbaram/stats
GET    /groups/:slug/jeungbaram/participants
GET    /groups/:slug/jeungbaram/player-ranking
POST   /groups/:slug/jeungbaram/records/:date
PUT    /groups/:slug/jeungbaram/records/:date/:recordId
DELETE /groups/:slug/jeungbaram/records/:date/:recordId
```
