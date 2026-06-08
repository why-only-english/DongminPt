# 🏋️ 동민PT

> PT 회원들이 **주차별 운동 사진을 올리고 서로 응원**하는 공유 게시판

[![GitHub Pages](https://img.shields.io/badge/GitHub%20Pages-배포중-brightgreen?logo=github)](https://why-only-english.github.io/DongminPt/)

---

## 🔗 바로가기

**[👉 동민PT 열기](https://why-only-english.github.io/DongminPt/)**

> 비밀번호는 동민에게 문의하세요

---

## ✨ 주요 기능

| 기능 | 설명 |
|------|------|
| 🔒 **비밀번호 보호** | 입장 시 비밀번호 인증, 탭 세션 동안 유지 |
| 📅 **주차 관리** | 메인 화면에서 주차 추가 및 목록 확인 |
| 📸 **사진 업로드** | 커스텀 파일 선택 UI, 이름 + 사진 + 한마디 입력 |
| 💬 **댓글** | 각 사진에 응원 댓글 남기기 |
| 🗜️ **이미지 자동 압축** | 업로드 전 최대 1200px / JPEG 85%로 클라이언트 압축 |
| 🗄️ **DB 없음** | 모든 데이터·이미지를 GitHub 레포에 직접 저장 |

---

## 🖥️ 화면 구성

### 비밀번호 화면
```
┌─────────────────────────┐
│      🏋️ 동민PT          │
│   비밀번호를 입력하세요   │
│  ┌─────────────────┐    │
│  │   ••••••••      │    │
│  └─────────────────┘    │
│       [ 입장 ]          │
└─────────────────────────┘
```

### 메인 화면
주차별 카드 목록 + **주차 추가** FAB 버튼

```
[🏋️ 동민PT]                              [⚙️]
─────────────────────────────────────────────
  ┌──────────┐  ┌──────────┐  ┌──────────┐
  │  1주차   │  │  2주차   │  │  3주차   │
  │ 6월 1주  │  │ 6월 2주  │  │ 6월 3주  │
  └──────────┘  └──────────┘  └──────────┘
                                  + 주차 추가
```

### 주차 화면
사진 그리드 + **사진 올리기** FAB 버튼

```
[← 목록]    [1주차 · 6월 2주차(OT)]
─────────────────────────────────
  ┌──────┐  ┌──────┐  ┌──────┐
  │ 사진 │  │ 사진 │  │ 사진 │
  │ 홍길동│  │ 김철수│  │ 이영희│
  │💬 2  │  │💬 0  │  │💬 1  │
  └──────┘  └──────┘  └──────┘
                    + 사진 올리기
```

---

## ⚙️ 최초 설정 (관리자용)

사이트 접속 후 우측 상단 **⚙️** 버튼을 눌러 GitHub 연결 정보를 입력합니다.

| 항목 | 값 |
|------|-----|
| GitHub 사용자명 | `why-only-english` |
| 레포지토리 이름 | `DongminPt` |
| Personal Access Token | `repo` 권한이 있는 PAT |

> PAT는 브라우저 `localStorage`에만 저장되며 GitHub에 올라가지 않습니다.

---

## 🏗️ 기술 구조

```
사용자 브라우저
    │
    ├── 비밀번호 입력 → SHA-256 해시 비교 (Secret에서 Actions가 주입한 값)
    │
    ├── 데이터 읽기 ──▶ GitHub Contents API (JSON)
    │                ──▶ raw.githubusercontent.com (이미지)
    │
    └── 데이터 쓰기 ──▶ GitHub Contents API (PAT 인증)
                            ├── weeks.json 업데이트
                            ├── week-N.json 업데이트
                            └── 이미지 파일 커밋
```

**배포 흐름:**
```
main 브랜치 push
    ↓
GitHub Actions (deploy.yml)
    ├── PASSWORD_HASH Secret → auth.js 플레이스홀더에 주입
    └── docs/ 폴더 → GitHub Pages 배포
    ↓
https://why-only-english.github.io/DongminPt/
```

---

## 📁 파일 구조

```
DongminPt/
├── .github/workflows/
│   └── deploy.yml          # Actions: 해시 주입 + Pages 배포
├── docs/                   # GitHub Pages 서빙 폴더
│   ├── index.html          # 메인 (주차 목록)
│   ├── week.html           # 주차별 게시판
│   ├── auth.js             # 비밀번호 인증 (플레이스홀더 → Actions 주입)
│   ├── github-api.js       # GitHub API 래퍼
│   ├── app.js              # 메인 로직
│   ├── week-app.js         # 주차 페이지 로직
│   ├── style.css           # 스타일
│   └── data/
│       └── weeks.json      # 주차 목록
├── PLAN.md                 # 기획 및 설계 문서
└── README.md               # 이 파일
```

---

## 🔐 보안 구조

| 항목 | 방식 |
|------|------|
| 비밀번호 | SHA-256 해시만 배포 파일에 포함 (평문 없음) |
| 해시 보관 | GitHub Secret에 저장, 소스코드에 없음 |
| PAT | 브라우저 localStorage에만 저장, 레포 미포함 |
| 레포 | Public이지만 사이트 접근은 비밀번호로 제한 |

---

## 📝 데이터 구조

```json
// docs/data/weeks.json
[{ "id": 1, "title": "6월 2주차(OT)", "createdAt": "..." }]

// docs/data/week-1.json
[{
  "id": "abc123",
  "author": "홍길동",
  "caption": "오늘 3대 신기록!",
  "imagePath": "docs/images/week-1/abc123.jpg",
  "createdAt": "...",
  "comments": [{ "author": "동민", "text": "수고했어요 🔥", "createdAt": "..." }]
}]
```
