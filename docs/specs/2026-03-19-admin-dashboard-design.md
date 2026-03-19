# More Munch 관리자 대시보드 설계

## 개요

기존 NestJS 서버에 내장하는 경량 관리자 페이지.
식당 데이터 조회/편집, 방문 기록 확인, 통계, 수집 관리를 위한 운영 대시보드.

## 기술 스택

| 구분 | 선택 | 이유 |
|------|------|------|
| 렌더링 | NestJS + EJS 템플릿 | 별도 프론트엔드 앱 없이 서버에서 바로 렌더링 |
| 동적 UI | HTMX | 페이지 새로고침 없이 부분 업데이트. JS 프레임워크 불필요 |
| CSS | Tailwind CSS + DaisyUI | 기성 컴포넌트(테이블, 카드, 모달, 폼 등) 바로 사용 |
| 차트 | 없음 (DaisyUI progress bar로 대체) | MVP에 차트 라이브러리는 과함 |

## 라우트 구조

```
/admin                 → 대시보드 (홈)
/admin/restaurants     → 식당 관리
/admin/visits          → 방문 기록
/admin/stats           → 통계
/admin/settings        → 설정 & 수집
/admin/login           → 로그인
```

## 인증

- `/admin/login`에서 API Key 입력
- 서버에서 기존 User 테이블의 apiKey로 검증
- 검증 성공 시 세션 쿠키 발급
- 관리자 페이지의 모든 라우트는 세션 쿠키로 인증

## 페이지별 상세

### 대시보드 (`/admin`)

요약 정보를 한눈에 보는 홈 화면.

- **요약 카드** (DaisyUI stat 컴포넌트)
  - 총 식당 수
  - 이번 주 방문 수
  - 마지막 수집 시간
- **최근 추천 이력** — 테이블 5건 (식당명, 점수, 추천일시)
- **최근 방문 기록** — 테이블 5건 (식당명, 평점, 날짜)

### 식당 관리 (`/admin/restaurants`)

식당 목록 조회 및 편집.

- **검색/필터 바** (HTMX로 실시간 필터링)
  - 이름 검색 (텍스트 입력)
  - 카테고리 필터 (드롭다운)
  - 활성 상태 필터 (전체/활성/비활성)
- **테이블** (DaisyUI table 컴포넌트)
  - 컬럼: 이름, 카테고리, 주소, 평점, 메뉴 수, 활성 여부
  - 커서 기반 페이지네이션
- **상세/편집 모달** (행 클릭 시 HTMX로 로드)
  - 식당 정보 수정 (이름, 카테고리, 주소, 활성 상태)
  - 메뉴 목록 — 추가/삭제 가능
  - 카카오/네이버 연동 정보 (읽기 전용)

### 방문 기록 (`/admin/visits`)

유저의 방문 이력 조회.

- **필터 바**
  - 기간 필터 (최근 1주/1개월/전체)
  - 평점 필터 (드롭다운)
  - 식당명 검색
- **테이블**
  - 컬럼: 날짜, 식당명, 메뉴, 평점, 코멘트
  - 커서 기반 페이지네이션

### 통계 (`/admin/stats`)

방문 데이터 기반 통계.

- **카테고리별 방문 비율** — DaisyUI progress bar로 시각화
- **자주 가는 식당 TOP 5** — 테이블 (식당명, 방문 횟수, 평균 평점)
- **평점 분포** — AMAZING/GOOD/OKAY/BAD/NEVER별 개수 및 비율 바

### 설정 & 수집 (`/admin/settings`)

유저 설정 편집 및 데이터 수집 관리.

- **설정 편집 폼** (HTMX로 제출)
  - 위도/경도
  - 도보 거리 (분)
  - 최소 평점
  - 제외 일수
- **수집 상태**
  - 마지막 수집 시간
  - 수집된 식당 수 (활성/비활성)
- **수동 수집 트리거** — 버튼 클릭 시 `POST /collector/run` 호출, 진행 상태 표시

## 레이아웃

```
+--sidebar--+--------content---------+
|           |                        |
| 대시보드   |   (페이지별 콘텐츠)      |
| 식당 관리  |                        |
| 방문 기록  |                        |
| 통계      |                        |
| 설정&수집  |                        |
|           |                        |
+-----------+------------------------+
```

- DaisyUI drawer 컴포넌트로 사이드바 구현
- 모바일에서는 햄버거 메뉴로 접힘

## 파일 구조

```
apps/server/
├── src/
│   └── admin/
│       ├── admin.module.ts
│       ├── admin.controller.ts      ← 페이지 렌더링
│       └── admin.guard.ts           ← 세션 인증 가드
├── views/
│   ├── layouts/
│   │   └── admin.ejs                ← 공통 레이아웃 (사이드바, head, scripts)
│   ├── admin/
│   │   ├── dashboard.ejs
│   │   ├── restaurants.ejs
│   │   ├── restaurant-detail.ejs    ← 모달용 partial
│   │   ├── visits.ejs
│   │   ├── stats.ejs
│   │   ├── settings.ejs
│   │   └── login.ejs
│   └── partials/
│       ├── restaurant-table.ejs     ← HTMX 부분 업데이트용
│       └── visit-table.ejs
└── public/
    └── css/                         ← Tailwind 빌드 결과물 (또는 CDN)
```

## 의존성 추가

```
# EJS 템플릿 엔진
pnpm add ejs

# 세션 관리
pnpm add express-session
pnpm add -D @types/express-session

# HTMX, Tailwind, DaisyUI는 CDN으로 로드 (설치 불필요)
```

## CDN 리소스

```html
<!-- HTMX -->
<script src="https://unpkg.com/htmx.org@2"></script>

<!-- Tailwind CSS + DaisyUI -->
<link href="https://cdn.jsdelivr.net/npm/daisyui@4/dist/full.min.css" rel="stylesheet">
<script src="https://cdn.tailwindcss.com"></script>
```
