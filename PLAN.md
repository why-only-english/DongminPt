# 동민PT 기획안

- 레포지토리: https://github.com/why-only-english/DongminPt
- 배포 URL: https://why-only-english.github.io/DongminPt/
- 배포: GitHub Pages (GitHub Actions → `docs/` 폴더)
- 작성일: 2026-06-08
- 최종 수정: 2026-06-08

---

## 서비스 개요

PT(퍼스널 트레이닝) 회원들이 **주차별로 운동 사진을 올리고 댓글로 서로 응원**하는 공유 게시판.

별도 서버·DB 없이 **GitHub 레포지토리를 스토리지**로 사용하며, GitHub Pages로 정적 웹사이트를 무료 배포한다.

---

## 핵심 기능

| 번호 | 기능 | 설명 |
|------|------|------|
| 1 | **비밀번호 보호** | SHA-256 해시 비교, 탭 세션 동안 인증 유지 |
| 2 | **주차 목록 (메인)** | 등록된 모든 주차를 컬러 카드 형태로 표시 |
| 3 | **주차 추가** | 메인 화면 FAB 버튼에서 새 주차 이름 입력 후 추가 |
| 4 | **사진 업로드** | 커스텀 파일 선택 UI, 이름 + 사진 + 한마디 입력 |
| 5 | **댓글** | 각 사진에 이름 + 텍스트로 응원 메시지 |
| 6 | **이미지 압축** | 업로드 전 클라이언트에서 최대 1200px / JPEG 85%로 자동 압축 |

---

## 화면 구성

### 비밀번호 화면 (공통)

접속 시 항상 표시. 올바른 비밀번호 입력 시 `sessionStorage`에 인증 상태 저장.

### 메인 화면 (`index.html`)

```
[🏋️ 동민PT]                              [⚙️]
─────────────────────────────────────────────
  ┌──────────┐  ┌──────────┐  ┌──────────┐
  │ 1주차    │  │ 2주차    │  │ 3주차    │
  │ 6월 1주  │  │ 6월 2주  │  │ 6월 3주  │
  │ 2026.06.01│  │ 2026.06.08│  │ 2026.06.15│
  └──────────┘  └──────────┘  └──────────┘

                              ┌──────────────┐
                              │  + 주차 추가  │  ← FAB
                              └──────────────┘
```

### 주차별 화면 (`week.html?id=N`)

```
[← 목록]       [1주차 · 6월 2주차(OT)]
─────────────────────────────────────────────
  ┌──────┐  ┌──────┐  ┌──────┐
  │      │  │      │  │      │
  │ 사진 │  │ 사진 │  │ 사진 │
  │      │  │      │  │      │
  │ 홍길동│  │ 김철수│  │ 이영희│
  │ 오늘도│  │ 열심히│  │ ...  │
  │💬 댓글2│  │💬 댓글0│  │💬 댓글1│
  └──────┘  └──────┘  └──────┘

                         ┌──────────────┐
                         │ + 사진 올리기 │  ← FAB
                         └──────────────┘
```

### 사진 올리기 모달

- 이름 입력
- 커스텀 파일 드롭존 (📷 → 선택 후 ✅ + 파일명 표시)
- 이미지 미리보기
- 한마디 입력 (선택)

### 설정 모달 (⚙️)

- GitHub 사용자명 (owner)
- 레포지토리 이름 (repo)
- Personal Access Token (PAT)
- 입력값은 `localStorage`에 저장됨

---

## 기술 스택

| 항목 | 선택 | 이유 |
|------|------|------|
| 프론트엔드 | HTML + CSS + Vanilla JS | 빌드 불필요, 배포 단순 |
| 데이터 저장소 | GitHub Contents API | DB 없이 JSON 파일로 관리 |
| 이미지 저장 | GitHub Contents API (base64) | 동일 레포에 이미지 커밋 |
| 인증 | SHA-256 해시 + GitHub Secret | 소스코드에 비밀번호 미포함 |
| 데이터 암호화 | AES-256-GCM (PBKDF2 키 유도) | 레포에 암호화된 데이터만 저장 |
| 배포 | GitHub Pages + GitHub Actions | 무료, push 시 자동 배포 |
| 이미지 표시 | raw.githubusercontent.com | 커밋 즉시 접근 가능 |

---

## 데이터 구조

### `docs/data/weeks.json`
전체 주차 목록. 주차 추가 시 앱이 직접 커밋하여 업데이트.

```json
[
  { "id": 1, "title": "6월 2주차(OT)", "createdAt": "2026-06-08T08:44:39.644Z" }
]
```

### `docs/data/week-{id}.json`
해당 주차의 사진 게시물 목록. 사진 업로드·댓글 등록 시 업데이트.

```json
[
  {
    "id": "lk3f2abc1",
    "author": "홍길동",
    "caption": "오늘 3대 측정 신기록!",
    "imagePath": "docs/images/week-1/lk3f2abc1.jpg",
    "createdAt": "2026-06-08T12:30:00.000Z",
    "comments": [
      {
        "id": "lk3f5xyz9",
        "author": "동민",
        "text": "수고했어요! 🔥",
        "createdAt": "2026-06-08T14:00:00.000Z"
      }
    ]
  }
]
```

### 이미지 파일
`docs/images/week-{id}/{postId}.jpg` 경로로 레포에 커밋.  
표시 URL: `https://raw.githubusercontent.com/why-only-english/DongminPt/main/docs/images/...`

---

## 배포 방법

### 1. GitHub Actions 설정 ✅ 완료

`Settings → Pages → Source: GitHub Actions`

### 2. 배포 흐름

```
main 브랜치에 push
        ↓
GitHub Actions: deploy.yml
  - auth.js의 __PASSWORD_HASH__ 플레이스홀더를 Secret 값으로 치환
  - docs/ 폴더를 GitHub Pages에 배포
        ↓
https://why-only-english.github.io/DongminPt/ 갱신
```

### 3. 비밀번호 해시 설정 (GitHub Secret) ✅ 완료

- `Settings → Secrets and variables → Actions → PASSWORD_HASH`
- Value: 비밀번호의 SHA-256 해시 (64자리 hex)
- 비밀번호 변경 시 Secret 값만 업데이트 후 Actions 재실행

비밀번호 해시 생성 방법 (브라우저 콘솔):
```javascript
crypto.subtle.digest('SHA-256', new TextEncoder().encode('비밀번호')).then(b => console.log([...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('')))
```

### 4. Personal Access Token (PAT) 발급

1. `GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)`
2. `repo` 권한 체크 후 생성
3. 사이트의 ⚙️ 설정에서 입력 (localStorage에만 저장됨)

> **주의**: PAT를 코드에 직접 작성 금지. 설정 모달에서 입력하면 브라우저 localStorage에만 저장된다.

---

## 파일 구조

```
DongminPt/
├── .github/workflows/
│   └── deploy.yml                 # Actions: 해시 주입 + Pages 배포
├── docs/                          # GitHub Pages 배포 폴더
│   ├── index.html                 # 메인 페이지 (주차 목록)
│   ├── week.html                  # 주차별 사진 게시판
│   ├── style.css                  # 전체 스타일
│   ├── auth.js                    # 비밀번호 인증 (플레이스홀더 → Actions에서 해시 주입)
│   ├── github-api.js              # GitHub API 래퍼 (getJSON / putJSON / putImage)
│   ├── app.js                     # 메인 페이지 로직
│   ├── week-app.js                # 주차 페이지 로직
│   └── data/
│       ├── weeks.json             # 주차 목록 (앱이 직접 업데이트)
│       └── week-{id}.json         # 주차별 게시물 (업로드 시 생성)
├── .gitignore
├── README.md
└── PLAN.md                        # 이 파일
```

---

## 주요 제약 및 유의사항

| 항목 | 내용 |
|------|------|
| **레포 공개 여부** | **반드시 Public 유지** — Private 전환 시 GitHub Free 플랜 Pages 불가, raw.githubusercontent.com 이미지 인증 없이 로드 불가 |
| **동시 쓰기 충돌** | 두 명이 동시에 업로드하면 409 에러 발생 (소규모 서비스라 허용 범위) |
| **이미지 딜레이** | 업로드 직후 raw URL 접근까지 수 초 지연될 수 있음 |
| **토큰 보안** | PAT는 localStorage에만 저장, 절대 코드/커밋에 포함 금지 |
| **용량 제한** | GitHub 레포 권장 1GB / 단일 파일 100MB 이하 |

---

## 향후 개선 아이디어

- [ ] 주차별 커버 이미지 (최근 업로드 사진 자동 설정)
- [ ] 사진 삭제 기능
- [ ] 운동 기록 입력 (3대 무게, 체중 등)
- [ ] 참가자 목록 고정 (매번 이름 입력 없이 선택)
- [ ] 이미지 라이트박스 (클릭 시 전체화면)
- [ ] 주차별 통계 (참여 인원, 업로드 수)
