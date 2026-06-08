# 동민PT 기획안

- 레포지토리: https://github.com/why-only-english/DongminPt
- 배포 URL: https://why-only-english.github.io/DongminPt/
- 배포: GitHub Pages (`docs/` 폴더 기준)
- 작성일: 2026-06-08

---

## 서비스 개요

PT(퍼스널 트레이닝) 회원들이 **주차별로 운동 사진을 올리고 댓글로 서로 응원**하는 공유 게시판.

별도 서버·DB 없이 **GitHub 레포지토리를 스토리지**로 사용하며, GitHub Pages로 정적 웹사이트를 무료 배포한다.

---

## 핵심 기능

| 번호 | 기능 | 설명 |
|------|------|------|
| 1 | **주차 목록 (메인)** | 등록된 모든 주차를 카드 형태로 표시 |
| 2 | **주차 추가** | 메인 화면에서 새 주차 이름 입력 후 추가 |
| 3 | **사진 업로드** | 이름 + 사진 + 한마디를 입력하여 해당 주차에 사진 업로드 |
| 4 | **댓글** | 각 사진에 이름 + 댓글 텍스트로 응원 메시지 남기기 |
| 5 | **이미지 압축** | 업로드 전 클라이언트에서 최대 1200px / JPEG 85%로 자동 압축 |

---

## 화면 구성

### 메인 화면 (`index.html`)

```
[🏋️ 동민PT]                              [⚙️]
─────────────────────────────────────────────
  ┌──────────┐  ┌──────────┐  ┌──────────┐
  │ 1주차    │  │ 2주차    │  │ 3주차    │
  │ 3월 1주  │  │ 3월 2주  │  │ 3월 3주  │
  │ 2026.03.01│  │ 2026.03.08│  │ 2026.03.15│
  └──────────┘  └──────────┘  └──────────┘

                              ┌──────────────┐
                              │  + 주차 추가  │  ← FAB
                              └──────────────┘
```

### 주차별 화면 (`week.html?id=N`)

```
[← 목록]       [1주차 · 3월 1주]
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

### 설정 모달 (GitHub 연결)

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
| 배포 | GitHub Pages (`docs/` 폴더) | 무료, 자동 배포 |
| 이미지 표시 | raw.githubusercontent.com | 커밋 즉시 접근 가능 |

---

## 데이터 구조

### `docs/data/weeks.json`
전체 주차 목록. 주차 추가 시 업데이트된다.

```json
[
  { "id": 1, "title": "3월 1주차", "createdAt": "2026-03-01T09:00:00.000Z" },
  { "id": 2, "title": "3월 2주차", "createdAt": "2026-03-08T09:00:00.000Z" }
]
```

### `docs/data/week-{id}.json`
해당 주차의 사진 게시물 목록. 사진 업로드·댓글 등록 시 업데이트된다.

```json
[
  {
    "id": "lk3f2abc1",
    "author": "홍길동",
    "caption": "오늘 3대 측정 신기록!",
    "imagePath": "docs/images/week-1/lk3f2abc1.jpg",
    "createdAt": "2026-03-01T12:30:00.000Z",
    "comments": [
      {
        "id": "lk3f5xyz9",
        "author": "동민",
        "text": "수고했어요! 🔥",
        "createdAt": "2026-03-01T14:00:00.000Z"
      }
    ]
  }
]
```

### 이미지 파일
`docs/images/week-{id}/{postId}.jpg` 경로로 레포에 커밋된다.

---

## 배포 방법

### 1. GitHub 레포 생성

1. GitHub에서 새 **Public** 레포 생성 (이름 예: `DongminPt`)
2. `Settings → Pages → Source: Deploy from a branch → Branch: main / docs`
3. 배포 URL: `https://{username}.github.io/DongminPt/`

### 2. GitHub Actions (자동 배포)

별도 워크플로우 파일 없음. GitHub Pages의 내장 `pages-build-deployment` 워크플로우가 main 브랜치 push 시 자동으로 `docs/` 폴더를 배포한다.

```
main 브랜치에 push
        ↓
GitHub Actions: pages-build-deployment (자동)
        ↓
https://{username}.github.io/DongminPt/ 갱신
```

### 3. Personal Access Token (PAT) 발급

1. GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)
2. `repo` 권한 체크 후 생성
3. 앱의 ⚙️ 설정에서 입력 (localStorage에 저장됨, GitHub에는 올라가지 않음)

> **주의**: 토큰을 코드에 직접 작성하지 말 것. 설정 모달에서 입력하면 브라우저 localStorage에만 저장된다.

---

## 파일 구조

```
DongminPt/
├── docs/                          # GitHub Pages 배포 폴더
│   ├── index.html                 # 메인 페이지 (주차 목록)
│   ├── week.html                  # 주차별 사진 게시판
│   ├── style.css                  # 전체 스타일
│   ├── github-api.js              # GitHub API 래퍼 (getJSON / putJSON / putImage)
│   ├── app.js                     # 메인 페이지 로직
│   ├── week-app.js                # 주차 페이지 로직
│   └── data/
│       ├── weeks.json             # 주차 목록 (앱이 직접 업데이트)
│       └── week-{id}.json         # 주차별 게시물 (업로드 시 생성)
├── .gitignore
└── PLAN.md                        # 이 파일
```

---

## 주요 제약 및 유의사항

| 항목 | 내용 |
|------|------|
| **레포 공개 여부** | Public 레포여야 이미지가 raw URL로 표시됨 |
| **동시 쓰기 충돌** | 두 명이 동시에 업로드하면 409 에러 발생 (소규모 개인 서비스라 허용 범위) |
| **이미지 딜레이** | 업로드 직후 raw URL 접근까지 수 초 지연될 수 있음 |
| **토큰 보안** | PAT는 localStorage에만 저장, 절대 코드/커밋에 포함하지 말 것 |
| **용량 제한** | GitHub 레포 권장 1GB / 단일 파일 100MB 이하 |

---

## 향후 개선 아이디어

- [ ] 주차별 커버 이미지 (최근 업로드 사진 자동 설정)
- [ ] 사진 삭제 기능
- [ ] 운동 기록 입력 (3대 무게, 체중 등)
- [ ] 참가자 목록 고정 (매번 이름 입력 없이 선택)
- [ ] 이미지 라이트박스 (클릭 시 전체화면)
- [ ] 주차별 통계 (참여 인원, 업로드 수)
